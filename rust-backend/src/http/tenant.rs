use axum::{
    extract::{Query, State},
    http::StatusCode,
    response::IntoResponse,
    Json,
};
use chrono::{NaiveDate, Utc};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use sqlx::FromRow;
use uuid::Uuid;

use crate::{
    error::AppError,
    http::{auth::AuthContext, ApiResponse},
    state::AppState,
};

#[derive(Debug, Deserialize)]
pub struct PublicBrandingQuery {
    slug: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct UpdateTenantSettingsRequest {
    settings: Option<Value>,
    branding: Option<Value>,
}

#[derive(Debug, Serialize, FromRow)]
pub struct TenantInfo {
    id: Uuid,
    name: String,
    slug: String,
    #[serde(rename = "planType")]
    plan_type: String,
    status: String,
    #[serde(rename = "maxBranches")]
    max_branches: i32,
    #[serde(rename = "maxMembers")]
    max_members: i32,
    #[serde(rename = "maxEmployees")]
    max_employees: i32,
    #[serde(rename = "maxStorageMb")]
    max_storage_mb: i32,
    #[serde(rename = "trialEndsAt")]
    trial_ends_at: Option<chrono::DateTime<Utc>>,
    #[serde(rename = "billingCycle")]
    billing_cycle: String,
    #[serde(rename = "nextBillingDate")]
    next_billing_date: Option<NaiveDate>,
    settings: Value,
}

#[derive(Debug, Serialize)]
pub struct QuotaItem {
    current: i64,
    limit: i32,
    available: i64,
}

#[derive(Debug, Serialize)]
pub struct TenantQuota {
    members: QuotaItem,
    employees: QuotaItem,
    branches: QuotaItem,
    storage: QuotaItem,
}

#[derive(Debug, FromRow)]
struct TenantQuotaRow {
    max_members: Option<i32>,
    max_employees: Option<i32>,
    max_branches: Option<i32>,
    max_storage_mb: Option<i32>,
    member_count: i64,
    employee_count: i64,
    branch_count: i64,
}

pub async fn get_tenant(
    auth: AuthContext,
    State(state): State<AppState>,
) -> Result<impl IntoResponse, AppError> {
    let tenant_id = require_tenant(&auth)?;
    let tenant = fetch_tenant(&state, tenant_id).await?;
    Ok((StatusCode::OK, Json(ApiResponse { success: true, data: tenant })))
}

pub async fn get_quota(
    auth: AuthContext,
    State(state): State<AppState>,
) -> Result<impl IntoResponse, AppError> {
    let tenant_id = require_tenant(&auth)?;
    let row = sqlx::query_as::<_, TenantQuotaRow>(
        r#"
        select
            tenants.max_members,
            tenants.max_employees,
            tenants.max_branches,
            tenants.max_storage_mb,
            (select count(*) from members where tenant_id = tenants.id) as member_count,
            (select count(*) from employees where tenant_id = tenants.id) as employee_count,
            (select count(*) from branches where tenant_id = tenants.id) as branch_count
        from tenants
        where tenants.id = $1
        "#,
    )
    .bind(tenant_id)
    .fetch_optional(&state.db)
    .await?
    .ok_or(AppError::NotFound)?;

    let data = TenantQuota {
        members: quota_item(row.member_count, row.max_members.unwrap_or(1000)),
        employees: quota_item(row.employee_count, row.max_employees.unwrap_or(100)),
        branches: quota_item(row.branch_count, row.max_branches.unwrap_or(10)),
        storage: quota_item(0, row.max_storage_mb.unwrap_or(1024)),
    };
    Ok((StatusCode::OK, Json(ApiResponse { success: true, data })))
}

pub async fn get_branding(
    auth: AuthContext,
    State(state): State<AppState>,
) -> Result<impl IntoResponse, AppError> {
    let tenant_id = require_tenant(&auth)?;
    let branding = fetch_branding_by_tenant(&state, tenant_id).await?;
    Ok((StatusCode::OK, Json(ApiResponse { success: true, data: branding })))
}

pub async fn update_settings(
    auth: AuthContext,
    State(state): State<AppState>,
    Json(payload): Json<UpdateTenantSettingsRequest>,
) -> Result<impl IntoResponse, AppError> {
    let tenant_id = require_tenant(&auth)?;
    let current_settings = sqlx::query_scalar::<_, Value>(
        "select coalesce(settings, '{}'::jsonb) from tenants where id = $1",
    )
    .bind(tenant_id)
    .fetch_optional(&state.db)
    .await?
    .ok_or(AppError::NotFound)?;
    let settings = merge_settings(current_settings, payload.settings, payload.branding);
    let updated = sqlx::query_scalar::<_, Value>(
        "update tenants set settings = $2::jsonb, updated_at = now() where id = $1 returning settings",
    )
    .bind(tenant_id)
    .bind(settings.to_string())
    .fetch_one(&state.db)
    .await?;

    Ok((StatusCode::OK, Json(ApiResponse { success: true, data: updated })))
}

pub async fn public_branding(
    State(state): State<AppState>,
    Query(query): Query<PublicBrandingQuery>,
) -> Result<impl IntoResponse, AppError> {
    let branding = if let Some(slug) = query.slug.map(|value| value.trim().to_string()).filter(|value| !value.is_empty()) {
        sqlx::query_scalar::<_, Value>(
            "select coalesce(settings->'branding', '{}'::jsonb) from tenants where slug = $1",
        )
        .bind(slug)
        .fetch_optional(&state.db)
        .await?
        .unwrap_or_else(default_branding)
    } else {
        default_branding()
    };
    Ok((StatusCode::OK, Json(ApiResponse { success: true, data: with_branding_defaults(branding) })))
}

async fn fetch_tenant(state: &AppState, tenant_id: Uuid) -> Result<TenantInfo, AppError> {
    sqlx::query_as::<_, TenantInfo>(
        r#"
        select
            id,
            name,
            slug,
            lower(coalesce(plan_type, 'starter')) as plan_type,
            case
                when upper(coalesce(status, tenant_status, 'ACTIVE')) = 'TRIAL' then 'trial'
                when upper(coalesce(status, tenant_status, 'ACTIVE')) in ('SUSPENDED', 'PAUSED') then 'suspended'
                when upper(coalesce(status, tenant_status, 'ACTIVE')) in ('CANCELLED', 'CANCELED', 'INACTIVE') then 'cancelled'
                else 'active'
            end as status,
            coalesce(max_branches, 10) as max_branches,
            coalesce(max_members, 1000) as max_members,
            coalesce(max_employees, 100) as max_employees,
            coalesce(max_storage_mb, 1024) as max_storage_mb,
            trial_ends_at,
            lower(coalesce(billing_cycle, 'monthly')) as billing_cycle,
            next_billing_date,
            coalesce(settings, '{}'::jsonb) as settings
        from tenants
        where id = $1
        "#,
    )
    .bind(tenant_id)
    .fetch_optional(&state.db)
    .await?
    .ok_or(AppError::NotFound)
}

async fn fetch_branding_by_tenant(state: &AppState, tenant_id: Uuid) -> Result<Value, AppError> {
    let branding = sqlx::query_scalar::<_, Value>(
        "select coalesce(settings->'branding', '{}'::jsonb) from tenants where id = $1",
    )
    .bind(tenant_id)
    .fetch_optional(&state.db)
    .await?
    .ok_or(AppError::NotFound)?;
    Ok(with_branding_defaults(branding))
}

fn merge_settings(current: Value, settings: Option<Value>, branding: Option<Value>) -> Value {
    let mut merged = current.as_object().cloned().unwrap_or_default();
    if let Some(Value::Object(settings)) = settings {
        for (key, value) in settings {
            merged.insert(key, value);
        }
    }
    if let Some(branding) = branding {
        merged.insert("branding".into(), with_branding_defaults(branding));
    }
    Value::Object(merged)
}

fn quota_item(current: i64, limit: i32) -> QuotaItem {
    QuotaItem {
        current,
        limit,
        available: (limit as i64 - current).max(0),
    }
}

fn default_branding() -> Value {
    json!({})
}

fn with_branding_defaults(value: Value) -> Value {
    let defaults = json!({
        "brandName": "GymNexus",
        "appSuffix": { "admin": "", "member": "", "coach": "Coach" },
        "colors": {
            "admin": { "start": "#0a84ff", "end": "#5e5ce6" },
            "member": { "start": "#30d158", "end": "#34c759" },
            "coach": { "start": "#007AFF", "end": "#5856D6" }
        }
    });
    merge_json(defaults, value)
}

fn merge_json(mut base: Value, overlay: Value) -> Value {
    match (&mut base, overlay) {
        (Value::Object(base), Value::Object(overlay)) => {
            for (key, value) in overlay {
                let merged = base.remove(&key).map(|base_value| merge_json(base_value, value.clone())).unwrap_or(value);
                base.insert(key, merged);
            }
            Value::Object(base.clone())
        }
        (_, overlay) => overlay,
    }
}

fn require_tenant(auth: &AuthContext) -> Result<Uuid, AppError> {
    auth.user.tenant_id.ok_or(AppError::Unauthorized)
}
