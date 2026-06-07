use axum::{
    extract::{Path, Query, State},
    http::StatusCode,
    response::IntoResponse,
    Json,
};
use serde::{Deserialize, Serialize};
use sqlx::FromRow;
use uuid::Uuid;

use crate::{
    error::AppError,
    http::{auth::AuthContext, ApiResponse},
    state::AppState,
    validation,
};

#[derive(Debug, Deserialize)]
pub struct PlanFilters {
    #[serde(rename = "branchId")]
    branch_id: Option<Uuid>,
    #[serde(rename = "planType")]
    plan_type: Option<String>,
    #[serde(rename = "activeOnly")]
    active_only: Option<bool>,
}

#[derive(Debug, Deserialize)]
pub struct CreatePlanRequest {
    name: String,
    code: String,
    #[serde(rename = "type")]
    plan_type: String,
    description: Option<String>,
    #[serde(rename = "durationMonths")]
    duration_months: Option<i32>,
    #[serde(rename = "classCounts")]
    class_counts: Option<i32>,
    price: f64,
    #[serde(rename = "allowPause", default)]
    allow_pause: bool,
    #[serde(rename = "maxPauseDays")]
    max_pause_days: Option<i32>,
    #[serde(rename = "allowTransfer", default)]
    allow_transfer: bool,
    #[serde(rename = "isActive", default = "default_true")]
    is_active: bool,
    sort: Option<i32>,
    #[serde(rename = "branchId")]
    branch_id: Option<Uuid>,
}

#[derive(Debug, Deserialize)]
pub struct UpdatePlanRequest {
    name: Option<String>,
    code: Option<String>,
    #[serde(rename = "type")]
    plan_type: Option<String>,
    description: Option<String>,
    #[serde(rename = "durationMonths")]
    duration_months: Option<i32>,
    #[serde(rename = "classCounts")]
    class_counts: Option<i32>,
    price: Option<f64>,
    #[serde(rename = "allowPause")]
    allow_pause: Option<bool>,
    #[serde(rename = "maxPauseDays")]
    max_pause_days: Option<i32>,
    #[serde(rename = "allowTransfer")]
    allow_transfer: Option<bool>,
    #[serde(rename = "isActive")]
    is_active: Option<bool>,
    sort: Option<i32>,
    #[serde(rename = "branchId")]
    branch_id: Option<Uuid>,
}

#[derive(Debug, Serialize, FromRow)]
pub struct MembershipPlan {
    id: Uuid,
    name: String,
    code: String,
    #[serde(rename = "type")]
    plan_type: String,
    description: Option<String>,
    #[serde(rename = "durationMonths")]
    duration_months: Option<i32>,
    #[serde(rename = "classCounts")]
    class_counts: Option<i32>,
    price: f64,
    #[serde(rename = "allowPause")]
    allow_pause: bool,
    #[serde(rename = "maxPauseDays")]
    max_pause_days: Option<i32>,
    #[serde(rename = "allowTransfer")]
    allow_transfer: bool,
    #[serde(rename = "isActive")]
    is_active: bool,
    sort: Option<i32>,
    #[serde(rename = "tenantId")]
    tenant_id: Option<Uuid>,
    #[serde(rename = "branchId")]
    branch_id: Option<Uuid>,
}

fn default_true() -> bool {
    true
}

pub async fn list(
    auth: AuthContext,
    State(state): State<AppState>,
    Query(filters): Query<PlanFilters>,
) -> Result<impl IntoResponse, AppError> {
    let tenant_id = require_tenant(&auth)?;
    let plans = sqlx::query_as::<_, MembershipPlan>(
        r#"
        select
            id, name, code, type as plan_type, description, duration_months, class_counts,
            price::float8 as price, allow_pause, max_pause_days, allow_transfer, is_active,
            sort, tenant_id, branch_id
        from membership_plans
        where tenant_id = $1
          and ($2::uuid is null or branch_id = $2)
          and ($3::text is null or type = $3)
          and ($4::bool is not true or is_active = true)
        order by sort nulls last, created_at desc
        "#,
    )
    .bind(tenant_id)
    .bind(filters.branch_id)
    .bind(filters.plan_type)
    .bind(filters.active_only.unwrap_or(false))
    .fetch_all(&state.db)
    .await?;

    Ok((StatusCode::OK, Json(ApiResponse { success: true, data: plans })))
}

pub async fn get(
    auth: AuthContext,
    State(state): State<AppState>,
    Path(id): Path<Uuid>,
) -> Result<impl IntoResponse, AppError> {
    let tenant_id = require_tenant(&auth)?;
    let plan = fetch_plan(&state, tenant_id, id).await?;

    Ok((StatusCode::OK, Json(ApiResponse { success: true, data: plan })))
}

pub async fn create(
    auth: AuthContext,
    State(state): State<AppState>,
    Json(payload): Json<CreatePlanRequest>,
) -> Result<impl IntoResponse, AppError> {
    let tenant_id = require_tenant(&auth)?;
    validate_create(&payload)?;
    ensure_branch_scope(&state, tenant_id, payload.branch_id).await?;

    let plan = sqlx::query_as::<_, MembershipPlan>(
        r#"
        insert into membership_plans (
            id, name, code, type, description, duration_months, class_counts, price,
            allow_pause, max_pause_days, allow_transfer, is_active, sort, tenant_id, branch_id
        )
        values (
            gen_random_uuid(), $1, $2, $3, $4, $5, $6, ($7::double precision)::numeric,
            $8, $9, $10, $11, $12, $13, $14
        )
        returning
            id, name, code, type as plan_type, description, duration_months, class_counts,
            price::float8 as price, allow_pause, max_pause_days, allow_transfer, is_active,
            sort, tenant_id, branch_id
        "#,
    )
    .bind(payload.name.trim())
    .bind(payload.code.trim())
    .bind(payload.plan_type.trim())
    .bind(payload.description)
    .bind(payload.duration_months)
    .bind(payload.class_counts)
    .bind(payload.price)
    .bind(payload.allow_pause)
    .bind(payload.max_pause_days)
    .bind(payload.allow_transfer)
    .bind(payload.is_active)
    .bind(payload.sort)
    .bind(tenant_id)
    .bind(payload.branch_id)
    .fetch_one(&state.db)
    .await?;

    Ok((StatusCode::CREATED, Json(ApiResponse { success: true, data: plan })))
}

pub async fn update(
    auth: AuthContext,
    State(state): State<AppState>,
    Path(id): Path<Uuid>,
    Json(payload): Json<UpdatePlanRequest>,
) -> Result<impl IntoResponse, AppError> {
    let tenant_id = require_tenant(&auth)?;
    validate_update(&payload)?;
    ensure_branch_scope(&state, tenant_id, payload.branch_id).await?;

    let plan = sqlx::query_as::<_, MembershipPlan>(
        r#"
        update membership_plans
        set
            name = coalesce($3, name),
            code = coalesce($4, code),
            type = coalesce($5, type),
            description = coalesce($6, description),
            duration_months = coalesce($7, duration_months),
            class_counts = coalesce($8, class_counts),
            price = coalesce(($9::double precision)::numeric, price),
            allow_pause = coalesce($10, allow_pause),
            max_pause_days = coalesce($11, max_pause_days),
            allow_transfer = coalesce($12, allow_transfer),
            is_active = coalesce($13, is_active),
            sort = coalesce($14, sort),
            branch_id = coalesce($15, branch_id),
            updated_at = now()
        where id = $1 and tenant_id = $2
        returning
            id, name, code, type as plan_type, description, duration_months, class_counts,
            price::float8 as price, allow_pause, max_pause_days, allow_transfer, is_active,
            sort, tenant_id, branch_id
        "#,
    )
    .bind(id)
    .bind(tenant_id)
    .bind(payload.name.as_deref().map(str::trim))
    .bind(payload.code.as_deref().map(str::trim))
    .bind(payload.plan_type.as_deref().map(str::trim))
    .bind(payload.description)
    .bind(payload.duration_months)
    .bind(payload.class_counts)
    .bind(payload.price)
    .bind(payload.allow_pause)
    .bind(payload.max_pause_days)
    .bind(payload.allow_transfer)
    .bind(payload.is_active)
    .bind(payload.sort)
    .bind(payload.branch_id)
    .fetch_optional(&state.db)
    .await?
    .ok_or(AppError::NotFound)?;

    Ok((StatusCode::OK, Json(ApiResponse { success: true, data: plan })))
}

pub async fn delete(
    auth: AuthContext,
    State(state): State<AppState>,
    Path(id): Path<Uuid>,
) -> Result<impl IntoResponse, AppError> {
    let tenant_id = require_tenant(&auth)?;
    let plan = sqlx::query_as::<_, MembershipPlan>(
        r#"
        update membership_plans
        set is_active = false, updated_at = now()
        where id = $1 and tenant_id = $2
        returning
            id, name, code, type as plan_type, description, duration_months, class_counts,
            price::float8 as price, allow_pause, max_pause_days, allow_transfer, is_active,
            sort, tenant_id, branch_id
        "#,
    )
    .bind(id)
    .bind(tenant_id)
    .fetch_optional(&state.db)
    .await?
    .ok_or(AppError::NotFound)?;

    Ok((StatusCode::OK, Json(ApiResponse { success: true, data: plan })))
}

async fn fetch_plan(state: &AppState, tenant_id: Uuid, id: Uuid) -> Result<MembershipPlan, AppError> {
    sqlx::query_as::<_, MembershipPlan>(
        r#"
        select
            id, name, code, type as plan_type, description, duration_months, class_counts,
            price::float8 as price, allow_pause, max_pause_days, allow_transfer, is_active,
            sort, tenant_id, branch_id
        from membership_plans
        where id = $1 and tenant_id = $2
        "#,
    )
    .bind(id)
    .bind(tenant_id)
    .fetch_optional(&state.db)
    .await?
    .ok_or(AppError::NotFound)
}

fn require_tenant(auth: &AuthContext) -> Result<Uuid, AppError> {
    auth.user.tenant_id.ok_or(AppError::Unauthorized)
}

fn validate_create(payload: &CreatePlanRequest) -> Result<(), AppError> {
    validation::required_text("name", &payload.name)?;
    validation::required_text("code", &payload.code)?;
    validate_plan_type(&payload.plan_type)?;
    validate_price(payload.price)?;
    validate_type_requirements(&payload.plan_type, payload.duration_months, payload.class_counts)
}

fn validate_update(payload: &UpdatePlanRequest) -> Result<(), AppError> {
    if let Some(name) = &payload.name {
        validation::required_text("name", name)?;
    }
    if let Some(code) = &payload.code {
        validation::required_text("code", code)?;
    }
    if let Some(plan_type) = &payload.plan_type {
        validate_plan_type(plan_type)?;
        validate_type_requirements(plan_type, payload.duration_months, payload.class_counts)?;
    }
    if let Some(price) = payload.price {
        validate_price(price)?;
    }

    Ok(())
}

fn validate_plan_type(plan_type: &str) -> Result<(), AppError> {
    match plan_type {
        "TIME_BASED" | "COUNT_BASED" => Ok(()),
        _ => Err(AppError::Validation("type must be TIME_BASED or COUNT_BASED".into())),
    }
}

fn validate_price(price: f64) -> Result<(), AppError> {
    if price < 0.0 {
        return Err(AppError::Validation("price must not be negative".into()));
    }

    Ok(())
}

fn validate_type_requirements(
    plan_type: &str,
    duration_months: Option<i32>,
    class_counts: Option<i32>,
) -> Result<(), AppError> {
    if plan_type == "TIME_BASED" && duration_months.unwrap_or(0) <= 0 {
        return Err(AppError::Validation(
            "durationMonths is required for TIME_BASED plans".into(),
        ));
    }

    if plan_type == "COUNT_BASED" && class_counts.unwrap_or(0) <= 0 {
        return Err(AppError::Validation(
            "classCounts is required for COUNT_BASED plans".into(),
        ));
    }

    Ok(())
}

async fn ensure_branch_scope(
    state: &AppState,
    tenant_id: Uuid,
    branch_id: Option<Uuid>,
) -> Result<(), AppError> {
    let Some(branch_id) = branch_id else {
        return Ok(());
    };

    let exists = sqlx::query_scalar::<_, bool>(
        "select exists(select 1 from branches where id = $1 and tenant_id = $2)",
    )
    .bind(branch_id)
    .bind(tenant_id)
    .fetch_one(&state.db)
    .await?;

    if exists {
        Ok(())
    } else {
        Err(AppError::Validation("branchId is invalid for this tenant".into()))
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn time_based_plan_requires_duration_months() {
        let payload = CreatePlanRequest {
            name: "Monthly".into(),
            code: "M1".into(),
            plan_type: "TIME_BASED".into(),
            description: None,
            duration_months: None,
            class_counts: None,
            price: 1000.0,
            allow_pause: false,
            max_pause_days: None,
            allow_transfer: false,
            is_active: true,
            sort: None,
            branch_id: None,
        };

        assert!(validate_create(&payload).is_err());
    }

    #[test]
    fn count_based_plan_requires_class_counts() {
        let payload = CreatePlanRequest {
            name: "Classes".into(),
            code: "C10".into(),
            plan_type: "COUNT_BASED".into(),
            description: None,
            duration_months: None,
            class_counts: None,
            price: 1000.0,
            allow_pause: false,
            max_pause_days: None,
            allow_transfer: false,
            is_active: true,
            sort: None,
            branch_id: None,
        };

        assert!(validate_create(&payload).is_err());
    }
}
