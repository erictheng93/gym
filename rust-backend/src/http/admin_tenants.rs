use axum::{
    extract::{Path, State},
    http::StatusCode,
    response::IntoResponse,
    Json,
};
use chrono::{DateTime, Duration, Utc};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use sqlx::FromRow;
use uuid::Uuid;

use crate::{
    error::AppError,
    http::auth::AuthContext,
    state::AppState,
    validation,
};

#[derive(Debug, Serialize)]
struct AdminTenantListResponse {
    success: bool,
    stats: TenantStats,
    tenants: Vec<TenantListItem>,
}

#[derive(Debug, Serialize)]
struct AdminTenantDetailResponse {
    success: bool,
    tenant: TenantDetail,
}

#[derive(Debug, Serialize)]
struct AdminTenantMutationResponse {
    success: bool,
    message: &'static str,
    tenant: TenantDetail,
}

#[derive(Debug, Serialize)]
struct TenantStats {
    #[serde(rename = "totalTenants")]
    total_tenants: i64,
    #[serde(rename = "activeTenants")]
    active_tenants: i64,
    #[serde(rename = "trialTenants")]
    trial_tenants: i64,
    #[serde(rename = "suspendedTenants")]
    suspended_tenants: i64,
    #[serde(rename = "tenantsAtRisk")]
    tenants_at_risk: i64,
    #[serde(rename = "totalMembers")]
    total_members: i64,
    #[serde(rename = "totalEmployees")]
    total_employees: i64,
    #[serde(rename = "totalBranches")]
    total_branches: i64,
}

#[derive(Debug, Serialize, FromRow)]
struct TenantListRow {
    id: Uuid,
    name: String,
    slug: String,
    email: String,
    phone: Option<String>,
    plan_type: String,
    tenant_status: String,
    max_members: i32,
    max_employees: i32,
    max_branches: i32,
    current_members: i64,
    current_employees: i64,
    current_branches: i64,
    active_contracts: i64,
    trial_ends_at: Option<DateTime<Utc>>,
    date_created: DateTime<Utc>,
    billing_cycle: String,
    next_billing_date: Option<chrono::NaiveDate>,
    settings: Value,
}

#[derive(Debug, Serialize)]
struct TenantListItem {
    id: Uuid,
    name: String,
    slug: String,
    email: String,
    phone: Option<String>,
    plan_type: String,
    tenant_status: String,
    max_members: i32,
    max_employees: i32,
    max_branches: i32,
    current_members: i64,
    current_employees: i64,
    current_branches: i64,
    members_usage_percent: i64,
    employees_usage_percent: i64,
    branches_usage_percent: i64,
    active_contracts: i64,
    trial_ends_at: Option<DateTime<Utc>>,
    date_created: DateTime<Utc>,
    billing_cycle: String,
    next_billing_date: Option<chrono::NaiveDate>,
    settings: Value,
}

#[derive(Debug, Serialize)]
struct TenantDetail {
    #[serde(flatten)]
    tenant: TenantListItem,
    usage: TenantUsage,
    branches: Vec<TenantBranch>,
    #[serde(rename = "recentActivity")]
    recent_activity: Vec<TenantRecentActivity>,
}

#[derive(Debug, Serialize)]
struct TenantUsage {
    members: UsageItem,
    employees: UsageItem,
    branches: UsageItem,
    #[serde(rename = "activeContracts")]
    active_contracts: i64,
}

#[derive(Debug, Serialize)]
struct UsageItem {
    current: i64,
    limit: i32,
    percent: i64,
}

#[derive(Debug, Serialize, FromRow)]
struct TenantBranch {
    id: Uuid,
    name: String,
    address: Option<String>,
    status: String,
    date_created: DateTime<Utc>,
}

#[derive(Debug, Serialize, FromRow)]
struct TenantRecentActivity {
    id: Uuid,
    full_name: String,
    member_code: String,
    branch_name: Option<String>,
    date_created: DateTime<Utc>,
}

#[derive(Debug, Deserialize)]
pub struct CreateTenantRequest {
    name: String,
    slug: String,
    email: String,
    phone: Option<String>,
    plan_type: String,
    billing_cycle: String,
    max_members: i32,
    max_employees: i32,
    max_branches: i32,
    trial_days: Option<i64>,
}

#[derive(Debug, Deserialize)]
pub struct UpdateTenantRequest {
    name: Option<String>,
    email: Option<String>,
    phone: Option<String>,
    billing_cycle: Option<String>,
    max_members: Option<i32>,
    max_employees: Option<i32>,
    max_branches: Option<i32>,
}

#[derive(Debug, Deserialize)]
pub struct UpdateTenantStatusRequest {
    status: String,
}

pub async fn list(
    auth: AuthContext,
    State(state): State<AppState>,
) -> Result<impl IntoResponse, AppError> {
    require_admin(&auth)?;
    let rows = fetch_tenant_rows(&state).await?;
    let tenants: Vec<TenantListItem> = rows.into_iter().map(TenantListItem::from).collect();
    let stats = tenant_stats(&tenants);
    Ok((StatusCode::OK, Json(AdminTenantListResponse { success: true, stats, tenants })))
}

pub async fn create(
    auth: AuthContext,
    State(state): State<AppState>,
    Json(payload): Json<CreateTenantRequest>,
) -> Result<impl IntoResponse, AppError> {
    require_admin(&auth)?;
    validate_create(&payload)?;
    let plan_type = normalize_plan(&payload.plan_type)?;
    let billing_cycle = normalize_billing_cycle(&payload.billing_cycle)?;
    let slug = payload.slug.trim().to_lowercase();
    let status = if payload.trial_days.unwrap_or(0) > 0 { "trial" } else { "active" };
    ensure_slug_available(&state, &slug).await?;

    let trial_ends_at = payload
        .trial_days
        .filter(|days| *days > 0)
        .map(|days| Utc::now() + Duration::days(days));

    let tenant_id = sqlx::query_scalar::<_, Uuid>(
        r#"
        insert into tenants (
            name, slug, email, phone, plan_type, billing_cycle,
            max_members, max_employees, max_branches, max_storage_mb,
            status, tenant_status, trial_ends_at, settings, created_by
        )
        values (
            $1, $2, lower($3), $4, $5, $6,
            $7, $8, $9, 1024,
            $10, $11, $12, '{}'::jsonb, $13
        )
        returning id
        "#,
    )
    .bind(payload.name.trim())
    .bind(&slug)
    .bind(payload.email.trim())
    .bind(payload.phone.as_deref().map(str::trim).filter(|value| !value.is_empty()))
    .bind(&plan_type)
    .bind(&billing_cycle)
    .bind(payload.max_members)
    .bind(payload.max_employees)
    .bind(payload.max_branches)
    .bind(status.to_uppercase())
    .bind(status)
    .bind(trial_ends_at)
    .bind(auth.user.id)
    .fetch_one(&state.db)
    .await?;

    let tenant = fetch_tenant_detail(&state, tenant_id).await?;
    Ok((StatusCode::CREATED, Json(AdminTenantMutationResponse { success: true, message: "租戶創建成功", tenant })))
}

pub async fn get(
    auth: AuthContext,
    State(state): State<AppState>,
    Path(tenant_id): Path<Uuid>,
) -> Result<impl IntoResponse, AppError> {
    require_admin(&auth)?;
    let tenant = fetch_tenant_detail(&state, tenant_id).await?;
    Ok((StatusCode::OK, Json(AdminTenantDetailResponse { success: true, tenant })))
}

pub async fn update(
    auth: AuthContext,
    State(state): State<AppState>,
    Path(tenant_id): Path<Uuid>,
    Json(payload): Json<UpdateTenantRequest>,
) -> Result<impl IntoResponse, AppError> {
    require_admin(&auth)?;
    validate_update(&payload)?;
    let billing_cycle = payload
        .billing_cycle
        .as_deref()
        .map(normalize_billing_cycle)
        .transpose()?;

    sqlx::query(
        r#"
        update tenants
        set
            name = coalesce($2, name),
            email = coalesce(lower($3), email),
            phone = coalesce($4, phone),
            billing_cycle = coalesce($5, billing_cycle),
            max_members = coalesce($6, max_members),
            max_employees = coalesce($7, max_employees),
            max_branches = coalesce($8, max_branches),
            updated_at = now()
        where id = $1
        "#,
    )
    .bind(tenant_id)
    .bind(payload.name.as_deref().map(str::trim))
    .bind(payload.email.as_deref().map(str::trim))
    .bind(payload.phone.as_deref().map(str::trim))
    .bind(billing_cycle)
    .bind(payload.max_members)
    .bind(payload.max_employees)
    .bind(payload.max_branches)
    .execute(&state.db)
    .await?;

    let tenant = fetch_tenant_detail(&state, tenant_id).await?;
    Ok((StatusCode::OK, Json(AdminTenantMutationResponse { success: true, message: "租戶信息已更新", tenant })))
}

pub async fn update_status(
    auth: AuthContext,
    State(state): State<AppState>,
    Path(tenant_id): Path<Uuid>,
    Json(payload): Json<UpdateTenantStatusRequest>,
) -> Result<impl IntoResponse, AppError> {
    require_admin(&auth)?;
    let status = normalize_status(&payload.status)?;
    let result = sqlx::query(
        "update tenants set status = $2, tenant_status = $3, updated_at = now() where id = $1",
    )
    .bind(tenant_id)
    .bind(status.to_uppercase())
    .bind(&status)
    .execute(&state.db)
    .await?;
    if result.rows_affected() == 0 {
        return Err(AppError::NotFound);
    }

    let tenant = fetch_tenant_detail(&state, tenant_id).await?;
    Ok((StatusCode::OK, Json(AdminTenantMutationResponse { success: true, message: "租戶狀態已更新", tenant })))
}

async fn fetch_tenant_rows(state: &AppState) -> Result<Vec<TenantListRow>, AppError> {
    let rows = sqlx::query_as::<_, TenantListRow>(
        r#"
        select
            tenants.id,
            tenants.name,
            tenants.slug,
            tenants.email,
            tenants.phone,
            lower(coalesce(tenants.plan_type, 'starter')) as plan_type,
            case
                when lower(coalesce(tenants.tenant_status, tenants.status, 'active')) in ('trial') then 'trial'
                when lower(coalesce(tenants.tenant_status, tenants.status, 'active')) in ('suspended', 'paused') then 'suspended'
                when lower(coalesce(tenants.tenant_status, tenants.status, 'active')) in ('cancelled', 'canceled', 'inactive') then 'cancelled'
                else 'active'
            end as tenant_status,
            coalesce(tenants.max_members, 1000) as max_members,
            coalesce(tenants.max_employees, 100) as max_employees,
            coalesce(tenants.max_branches, 10) as max_branches,
            (select count(*) from members where members.tenant_id = tenants.id) as current_members,
            (select count(*) from employees where employees.tenant_id = tenants.id) as current_employees,
            (select count(*) from branches where branches.tenant_id = tenants.id) as current_branches,
            (select count(*) from contracts where contracts.tenant_id = tenants.id and upper(coalesce(contracts.status, 'ACTIVE')) = 'ACTIVE') as active_contracts,
            tenants.trial_ends_at,
            tenants.created_at as date_created,
            lower(coalesce(tenants.billing_cycle, 'monthly')) as billing_cycle,
            tenants.next_billing_date,
            coalesce(tenants.settings, '{}'::jsonb) as settings
        from tenants
        order by tenants.created_at desc
        "#,
    )
    .fetch_all(&state.db)
    .await?;
    Ok(rows)
}

async fn fetch_tenant_detail(state: &AppState, tenant_id: Uuid) -> Result<TenantDetail, AppError> {
    let row = fetch_tenant_rows(state)
        .await?
        .into_iter()
        .find(|tenant| tenant.id == tenant_id)
        .ok_or(AppError::NotFound)?;
    let tenant = TenantListItem::from(row);
    let branches = sqlx::query_as::<_, TenantBranch>(
        r#"
        select
            id,
            name,
            address,
            lower(coalesce(status, 'active')) as status,
            created_at as date_created
        from branches
        where tenant_id = $1
        order by created_at desc
        "#,
    )
    .bind(tenant_id)
    .fetch_all(&state.db)
    .await?;
    let recent_activity = sqlx::query_as::<_, TenantRecentActivity>(
        r#"
        select
            members.id,
            members.full_name,
            members.member_code,
            branches.name as branch_name,
            members.created_at as date_created
        from members
        left join branches on branches.id = members.branch_id
        where members.tenant_id = $1
        order by members.created_at desc
        limit 10
        "#,
    )
    .bind(tenant_id)
    .fetch_all(&state.db)
    .await?;
    let usage = TenantUsage {
        members: UsageItem::new(tenant.current_members, tenant.max_members),
        employees: UsageItem::new(tenant.current_employees, tenant.max_employees),
        branches: UsageItem::new(tenant.current_branches, tenant.max_branches),
        active_contracts: tenant.active_contracts,
    };
    Ok(TenantDetail { tenant, usage, branches, recent_activity })
}

async fn ensure_slug_available(state: &AppState, slug: &str) -> Result<(), AppError> {
    let exists = sqlx::query_scalar::<_, bool>("select exists(select 1 from tenants where slug = $1)")
        .bind(slug)
        .fetch_one(&state.db)
        .await?;
    if exists {
        return Err(AppError::Validation("slug 已被使用".into()));
    }
    Ok(())
}

impl From<TenantListRow> for TenantListItem {
    fn from(row: TenantListRow) -> Self {
        Self {
            id: row.id,
            name: row.name,
            slug: row.slug,
            email: row.email,
            phone: row.phone,
            plan_type: row.plan_type,
            tenant_status: row.tenant_status,
            max_members: row.max_members,
            max_employees: row.max_employees,
            max_branches: row.max_branches,
            current_members: row.current_members,
            current_employees: row.current_employees,
            current_branches: row.current_branches,
            members_usage_percent: percent(row.current_members, row.max_members),
            employees_usage_percent: percent(row.current_employees, row.max_employees),
            branches_usage_percent: percent(row.current_branches, row.max_branches),
            active_contracts: row.active_contracts,
            trial_ends_at: row.trial_ends_at,
            date_created: row.date_created,
            billing_cycle: row.billing_cycle,
            next_billing_date: row.next_billing_date,
            settings: row.settings,
        }
    }
}

impl UsageItem {
    fn new(current: i64, limit: i32) -> Self {
        Self {
            current,
            limit,
            percent: percent(current, limit),
        }
    }
}

fn tenant_stats(tenants: &[TenantListItem]) -> TenantStats {
    TenantStats {
        total_tenants: tenants.len() as i64,
        active_tenants: tenants.iter().filter(|tenant| tenant.tenant_status == "active").count() as i64,
        trial_tenants: tenants.iter().filter(|tenant| tenant.tenant_status == "trial").count() as i64,
        suspended_tenants: tenants.iter().filter(|tenant| tenant.tenant_status == "suspended").count() as i64,
        tenants_at_risk: tenants
            .iter()
            .filter(|tenant| {
                tenant.members_usage_percent >= 90
                    || tenant.employees_usage_percent >= 90
                    || tenant.branches_usage_percent >= 90
            })
            .count() as i64,
        total_members: tenants.iter().map(|tenant| tenant.current_members).sum(),
        total_employees: tenants.iter().map(|tenant| tenant.current_employees).sum(),
        total_branches: tenants.iter().map(|tenant| tenant.current_branches).sum(),
    }
}

fn validate_create(payload: &CreateTenantRequest) -> Result<(), AppError> {
    validation::required_text("name", &payload.name)?;
    validation::required_text("slug", &payload.slug)?;
    validation::required_text("email", &payload.email)?;
    normalize_plan(&payload.plan_type)?;
    normalize_billing_cycle(&payload.billing_cycle)?;
    validate_slug(&payload.slug)?;
    validate_quota(payload.max_members, "max_members")?;
    validate_quota(payload.max_employees, "max_employees")?;
    validate_quota(payload.max_branches, "max_branches")?;
    Ok(())
}

fn validate_update(payload: &UpdateTenantRequest) -> Result<(), AppError> {
    if let Some(name) = &payload.name {
        validation::required_text("name", name)?;
    }
    if let Some(email) = &payload.email {
        validation::required_text("email", email)?;
    }
    if let Some(value) = payload.max_members {
        validate_quota(value, "max_members")?;
    }
    if let Some(value) = payload.max_employees {
        validate_quota(value, "max_employees")?;
    }
    if let Some(value) = payload.max_branches {
        validate_quota(value, "max_branches")?;
    }
    Ok(())
}

fn validate_slug(slug: &str) -> Result<(), AppError> {
    let valid = slug
        .chars()
        .all(|ch| ch.is_ascii_lowercase() || ch.is_ascii_digit() || ch == '-');
    if !valid {
        return Err(AppError::Validation("slug 只能包含小寫字母、數字與連字符".into()));
    }
    Ok(())
}

fn validate_quota(value: i32, field: &str) -> Result<(), AppError> {
    if value <= 0 {
        return Err(AppError::Validation(format!("{field} 必須大於 0")));
    }
    Ok(())
}

fn normalize_plan(value: &str) -> Result<String, AppError> {
    let value = value.trim().to_lowercase();
    match value.as_str() {
        "starter" | "professional" | "enterprise" | "custom" => Ok(value),
        _ => Err(AppError::Validation("不支援的租戶方案".into())),
    }
}

fn normalize_billing_cycle(value: &str) -> Result<String, AppError> {
    let value = value.trim().to_lowercase();
    match value.as_str() {
        "monthly" | "yearly" => Ok(value),
        _ => Err(AppError::Validation("不支援的計費週期".into())),
    }
}

fn normalize_status(value: &str) -> Result<String, AppError> {
    let value = value.trim().to_lowercase();
    match value.as_str() {
        "active" | "trial" | "suspended" | "cancelled" | "canceled" => {
            Ok(if value == "canceled" { "cancelled".into() } else { value })
        }
        _ => Err(AppError::Validation("不支援的租戶狀態".into())),
    }
}

fn percent(current: i64, limit: i32) -> i64 {
    if limit <= 0 {
        return 0;
    }
    ((current as f64 / limit as f64) * 100.0).round() as i64
}

fn require_admin(auth: &AuthContext) -> Result<(), AppError> {
    if auth.user.role.eq_ignore_ascii_case("ADMIN") {
        return Ok(());
    }
    Err(AppError::Unauthorized)
}
