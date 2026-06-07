use axum::{
    extract::{Path, Query, State},
    http::StatusCode,
    response::IntoResponse,
    Json,
};
use chrono::{DateTime, NaiveDate, Utc};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use sqlx::FromRow;
use uuid::Uuid;

use crate::{
    error::AppError,
    http::{auth::AuthContext, ApiResponse, PaginatedResponse, Pagination},
    state::AppState,
};

#[derive(Debug, Deserialize)]
pub struct LeaveRequestFilters {
    id: Option<Uuid>,
    #[serde(alias = "employeeId")]
    employee_id: Option<Uuid>,
    #[serde(alias = "leaveStatus", alias = "status")]
    leave_status: Option<String>,
    #[serde(alias = "leaveType")]
    leave_type: Option<String>,
    #[serde(alias = "startDateFrom")]
    start_date_gte: Option<NaiveDate>,
    #[serde(alias = "startDateTo")]
    start_date_lte: Option<NaiveDate>,
    #[serde(alias = "endDateFrom")]
    end_date_gte: Option<NaiveDate>,
    #[serde(alias = "endDateTo")]
    end_date_lte: Option<NaiveDate>,
    #[serde(rename = "startDate")]
    start_date: Option<NaiveDate>,
    #[serde(rename = "endDate")]
    end_date: Option<NaiveDate>,
    page: Option<i64>,
    limit: Option<i64>,
}

#[derive(Debug, Deserialize)]
pub struct CreateLeaveRequest {
    #[serde(alias = "employeeId")]
    employee_id: Uuid,
    #[serde(alias = "leaveType")]
    leave_type: String,
    #[serde(alias = "startDate")]
    start_date: NaiveDate,
    #[serde(alias = "endDate")]
    end_date: NaiveDate,
    #[serde(alias = "leaveStatus")]
    leave_status: Option<String>,
    #[serde(alias = "approverId")]
    approver_id: Option<Uuid>,
    reason: Option<String>,
    #[serde(alias = "hoursRequested")]
    hours_requested: Option<f64>,
    #[serde(alias = "daysRequested")]
    days_requested: Option<f64>,
    #[serde(alias = "submittedAt")]
    submitted_at: Option<DateTime<Utc>>,
    #[serde(alias = "approvedAt")]
    approved_at: Option<DateTime<Utc>>,
    #[serde(alias = "approvalNotes")]
    approval_notes: Option<String>,
    #[serde(alias = "documentUrl")]
    document_url: Option<String>,
    #[serde(default)]
    #[serde(alias = "isHalfDay")]
    is_half_day: bool,
    #[serde(alias = "halfDayType")]
    half_day_type: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct UpdateLeaveRequest {
    #[serde(alias = "leaveStatus")]
    leave_status: Option<String>,
    #[serde(alias = "approverId")]
    approver_id: Option<Uuid>,
    #[serde(alias = "approvedAt")]
    approved_at: Option<DateTime<Utc>>,
    #[serde(alias = "approvalNotes")]
    approval_notes: Option<String>,
    reason: Option<String>,
    #[serde(alias = "hoursRequested")]
    hours_requested: Option<f64>,
    #[serde(alias = "daysRequested")]
    days_requested: Option<f64>,
    #[serde(alias = "documentUrl")]
    document_url: Option<String>,
    #[serde(alias = "isHalfDay")]
    is_half_day: Option<bool>,
    #[serde(alias = "halfDayType")]
    half_day_type: Option<String>,
}

#[derive(Debug, Serialize, FromRow)]
pub struct LeaveRequestRow {
    id: Uuid,
    status: Option<String>,
    date_created: Option<DateTime<Utc>>,
    date_updated: Option<DateTime<Utc>>,
    employee_id: Uuid,
    leave_type: String,
    start_date: DateTime<Utc>,
    end_date: DateTime<Utc>,
    leave_status: String,
    approver_id: Option<Uuid>,
    reason: Option<String>,
    hours_requested: Option<f64>,
    days_requested: Option<f64>,
    submitted_at: Option<DateTime<Utc>>,
    approved_at: Option<DateTime<Utc>>,
    approval_notes: Option<String>,
    document_url: Option<String>,
    is_half_day: bool,
    half_day_type: Option<String>,
    employee: Value,
    approver: Option<Value>,
}

#[derive(Debug, Deserialize)]
pub struct LeaveBalanceFilters {
    employee_id: Option<Uuid>,
    leave_type: Option<String>,
    year: Option<i32>,
    page: Option<i64>,
    limit: Option<i64>,
}

#[derive(Debug, Deserialize)]
pub struct CreateLeaveBalance {
    employee_id: Uuid,
    leave_type: String,
    year: i32,
    total_days: f64,
    #[serde(default)]
    used_days: f64,
    #[serde(default)]
    pending_days: f64,
    #[serde(default)]
    carried_over_days: f64,
    expires_at: Option<DateTime<Utc>>,
}

#[derive(Debug, Deserialize)]
pub struct UpdateLeaveBalance {
    total_days: Option<f64>,
    used_days: Option<f64>,
    pending_days: Option<f64>,
    carried_over_days: Option<f64>,
    expires_at: Option<DateTime<Utc>>,
}

#[derive(Debug, Serialize, FromRow)]
pub struct LeaveBalanceRow {
    id: Uuid,
    status: Option<String>,
    date_created: Option<DateTime<Utc>>,
    date_updated: Option<DateTime<Utc>>,
    employee_id: Uuid,
    leave_type: String,
    year: i32,
    total_days: f64,
    used_days: f64,
    pending_days: f64,
    carried_over_days: f64,
    expires_at: Option<DateTime<Utc>>,
    employee: Value,
}

#[derive(Debug, Deserialize)]
pub struct LeaveApprovalLogFilters {
    leave_request_id: Option<Uuid>,
    page: Option<i64>,
    limit: Option<i64>,
}

#[derive(Debug, Deserialize)]
pub struct CreateLeaveApprovalLog {
    leave_request_id: Uuid,
    action_by: Uuid,
    action: String,
    previous_status: Option<String>,
    new_status: Option<String>,
    notes: Option<String>,
}

#[derive(Debug, Serialize, FromRow)]
pub struct LeaveApprovalLogRow {
    id: Uuid,
    date_created: Option<DateTime<Utc>>,
    leave_request_id: Uuid,
    action_by: Uuid,
    action: String,
    previous_status: Option<String>,
    new_status: Option<String>,
    notes: Option<String>,
    actor: Value,
}

pub async fn list_requests(
    auth: AuthContext,
    State(state): State<AppState>,
    Query(filters): Query<LeaveRequestFilters>,
) -> Result<impl IntoResponse, AppError> {
    let tenant_id = require_tenant(&auth)?;
    let start_date_gte = filters.start_date_gte.or(filters.start_date);
    let end_date_lte = filters.end_date_lte.or(filters.end_date);
    let rows = sqlx::query_as::<_, LeaveRequestRow>(LEAVE_REQUEST_SELECT)
        .bind(tenant_id)
        .bind(filters.id)
        .bind(filters.employee_id)
        .bind(filters.leave_status)
        .bind(filters.leave_type)
        .bind(start_date_gte)
        .bind(filters.start_date_lte)
        .bind(filters.end_date_gte)
        .bind(end_date_lte)
        .fetch_all(&state.db)
        .await?;
    Ok((StatusCode::OK, Json(paginated(rows, filters.page, filters.limit))))
}

pub async fn get_request(
    auth: AuthContext,
    State(state): State<AppState>,
    Path(id): Path<Uuid>,
) -> Result<impl IntoResponse, AppError> {
    let tenant_id = require_tenant(&auth)?;
    let row = fetch_leave_request(&state, tenant_id, id).await?;
    Ok((StatusCode::OK, Json(ApiResponse { success: true, data: row })))
}

pub async fn create_request(
    auth: AuthContext,
    State(state): State<AppState>,
    Json(payload): Json<CreateLeaveRequest>,
) -> Result<impl IntoResponse, AppError> {
    let tenant_id = require_tenant(&auth)?;
    ensure_employee_scope(&state, tenant_id, payload.employee_id).await?;
    ensure_employee_scope_optional(&state, tenant_id, payload.approver_id).await?;
    let id = sqlx::query_scalar::<_, Uuid>(
        r#"
        insert into leave_requests (
            id, employee_id, leave_type, start_date, end_date, leave_status, approver_id,
            reason, hours_requested, days_requested, submitted_at, approved_at,
            approval_notes, document_url, is_half_day, half_day_type, status
        ) values (
            gen_random_uuid(), $1, $2, $3::date::timestamptz, $4::date::timestamptz, $5, $6, $7,
            ($8::double precision)::numeric, ($9::double precision)::numeric, coalesce($10, now()),
            $11, $12, $13, $14, $15, 'ACTIVE'
        ) returning id
        "#,
    )
    .bind(payload.employee_id)
    .bind(payload.leave_type)
    .bind(payload.start_date)
    .bind(payload.end_date)
    .bind(payload.leave_status.unwrap_or_else(|| "PENDING".into()))
    .bind(payload.approver_id)
    .bind(payload.reason)
    .bind(payload.hours_requested)
    .bind(payload.days_requested)
    .bind(payload.submitted_at)
    .bind(payload.approved_at)
    .bind(payload.approval_notes)
    .bind(payload.document_url)
    .bind(payload.is_half_day)
    .bind(payload.half_day_type)
    .fetch_one(&state.db)
    .await?;
    let row = fetch_leave_request(&state, tenant_id, id).await?;
    Ok((StatusCode::CREATED, Json(ApiResponse { success: true, data: row })))
}

pub async fn update_request(
    auth: AuthContext,
    State(state): State<AppState>,
    Path(id): Path<Uuid>,
    Json(payload): Json<UpdateLeaveRequest>,
) -> Result<impl IntoResponse, AppError> {
    let tenant_id = require_tenant(&auth)?;
    ensure_employee_scope_optional(&state, tenant_id, payload.approver_id).await?;
    let updated_id = sqlx::query_scalar::<_, Uuid>(
        r#"
        update leave_requests set
            leave_status = coalesce($3, leave_status),
            approver_id = coalesce($4, approver_id),
            approved_at = coalesce($5, approved_at),
            approval_notes = coalesce($6, approval_notes),
            reason = coalesce($7, reason),
            hours_requested = coalesce(($8::double precision)::numeric, hours_requested),
            days_requested = coalesce(($9::double precision)::numeric, days_requested),
            document_url = coalesce($10, document_url),
            is_half_day = coalesce($11, is_half_day),
            half_day_type = coalesce($12, half_day_type),
            updated_at = now()
        from employees
        where leave_requests.id = $1 and leave_requests.employee_id = employees.id and employees.tenant_id = $2
        returning leave_requests.id
        "#,
    )
    .bind(id)
    .bind(tenant_id)
    .bind(payload.leave_status)
    .bind(payload.approver_id)
    .bind(payload.approved_at)
    .bind(payload.approval_notes)
    .bind(payload.reason)
    .bind(payload.hours_requested)
    .bind(payload.days_requested)
    .bind(payload.document_url)
    .bind(payload.is_half_day)
    .bind(payload.half_day_type)
    .fetch_optional(&state.db)
    .await?
    .ok_or(AppError::NotFound)?;
    let row = fetch_leave_request(&state, tenant_id, updated_id).await?;
    Ok((StatusCode::OK, Json(ApiResponse { success: true, data: row })))
}

pub async fn list_balances(
    auth: AuthContext,
    State(state): State<AppState>,
    Query(filters): Query<LeaveBalanceFilters>,
) -> Result<impl IntoResponse, AppError> {
    let tenant_id = require_tenant(&auth)?;
    let rows = sqlx::query_as::<_, LeaveBalanceRow>(
        r#"
        select leave_balances.id, leave_balances.status, leave_balances.created_at as date_created,
            leave_balances.updated_at as date_updated, leave_balances.employee_id, leave_balances.leave_type,
            leave_balances.year, leave_balances.total_days::float8 as total_days,
            leave_balances.used_days::float8 as used_days, leave_balances.pending_days::float8 as pending_days,
            leave_balances.carried_over_days::float8 as carried_over_days, leave_balances.expires_at,
            json_build_object('id', employees.id, 'employee_code', employees.employee_code, 'full_name', employees.full_name, 'branch_id', employees.branch_id, 'employment_status', employees.status) as employee
        from leave_balances
        join employees on employees.id = leave_balances.employee_id
        where employees.tenant_id = $1
          and ($2::uuid is null or leave_balances.employee_id = $2)
          and ($3::text is null or leave_balances.leave_type = $3)
          and ($4::int is null or leave_balances.year = $4)
        order by leave_balances.year desc, leave_balances.leave_type
        "#,
    )
    .bind(tenant_id)
    .bind(filters.employee_id)
    .bind(filters.leave_type)
    .bind(filters.year)
    .fetch_all(&state.db)
    .await?;
    Ok((StatusCode::OK, Json(paginated(rows, filters.page, filters.limit))))
}

pub async fn create_balance(
    auth: AuthContext,
    State(state): State<AppState>,
    Json(payload): Json<CreateLeaveBalance>,
) -> Result<impl IntoResponse, AppError> {
    let tenant_id = require_tenant(&auth)?;
    ensure_employee_scope(&state, tenant_id, payload.employee_id).await?;
    let id = sqlx::query_scalar::<_, Uuid>(
        r#"
        insert into leave_balances (
            id, employee_id, leave_type, year, total_days, used_days, pending_days,
            carried_over_days, expires_at, status
        ) values (
            gen_random_uuid(), $1, $2, $3, ($4::double precision)::numeric,
            ($5::double precision)::numeric, ($6::double precision)::numeric,
            ($7::double precision)::numeric, $8, 'ACTIVE'
        ) returning id
        "#,
    )
    .bind(payload.employee_id)
    .bind(payload.leave_type)
    .bind(payload.year)
    .bind(payload.total_days)
    .bind(payload.used_days)
    .bind(payload.pending_days)
    .bind(payload.carried_over_days)
    .bind(payload.expires_at)
    .fetch_one(&state.db)
    .await?;
    let row = fetch_leave_balance(&state, tenant_id, id).await?;
    Ok((StatusCode::CREATED, Json(ApiResponse { success: true, data: row })))
}

pub async fn update_balance(
    auth: AuthContext,
    State(state): State<AppState>,
    Path(id): Path<Uuid>,
    Json(payload): Json<UpdateLeaveBalance>,
) -> Result<impl IntoResponse, AppError> {
    let tenant_id = require_tenant(&auth)?;
    let updated_id = sqlx::query_scalar::<_, Uuid>(
        r#"
        update leave_balances set
            total_days = coalesce(($3::double precision)::numeric, total_days),
            used_days = coalesce(($4::double precision)::numeric, used_days),
            pending_days = coalesce(($5::double precision)::numeric, pending_days),
            carried_over_days = coalesce(($6::double precision)::numeric, carried_over_days),
            expires_at = coalesce($7, expires_at),
            updated_at = now()
        from employees
        where leave_balances.id = $1 and leave_balances.employee_id = employees.id and employees.tenant_id = $2
        returning leave_balances.id
        "#,
    )
    .bind(id)
    .bind(tenant_id)
    .bind(payload.total_days)
    .bind(payload.used_days)
    .bind(payload.pending_days)
    .bind(payload.carried_over_days)
    .bind(payload.expires_at)
    .fetch_optional(&state.db)
    .await?
    .ok_or(AppError::NotFound)?;
    let row = fetch_leave_balance(&state, tenant_id, updated_id).await?;
    Ok((StatusCode::OK, Json(ApiResponse { success: true, data: row })))
}

pub async fn list_logs(
    auth: AuthContext,
    State(state): State<AppState>,
    Query(filters): Query<LeaveApprovalLogFilters>,
) -> Result<impl IntoResponse, AppError> {
    let tenant_id = require_tenant(&auth)?;
    let rows = sqlx::query_as::<_, LeaveApprovalLogRow>(LOG_SELECT)
        .bind(tenant_id)
        .bind(filters.leave_request_id)
        .fetch_all(&state.db)
        .await?;
    Ok((StatusCode::OK, Json(paginated(rows, filters.page, filters.limit))))
}

pub async fn create_log(
    auth: AuthContext,
    State(state): State<AppState>,
    Json(payload): Json<CreateLeaveApprovalLog>,
) -> Result<impl IntoResponse, AppError> {
    let tenant_id = require_tenant(&auth)?;
    ensure_employee_scope(&state, tenant_id, payload.action_by).await?;
    ensure_leave_request_scope(&state, tenant_id, payload.leave_request_id).await?;
    let id = sqlx::query_scalar::<_, Uuid>(
        r#"
        insert into leave_approval_logs (
            id, leave_request_id, action_by, action, previous_status, new_status, notes
        ) values (gen_random_uuid(), $1, $2, $3, $4, $5, $6)
        returning id
        "#,
    )
    .bind(payload.leave_request_id)
    .bind(payload.action_by)
    .bind(payload.action)
    .bind(payload.previous_status)
    .bind(payload.new_status)
    .bind(payload.notes)
    .fetch_one(&state.db)
    .await?;
    let row = fetch_log(&state, tenant_id, id).await?;
    Ok((StatusCode::CREATED, Json(ApiResponse { success: true, data: row })))
}

async fn fetch_leave_request(state: &AppState, tenant_id: Uuid, id: Uuid) -> Result<LeaveRequestRow, AppError> {
    sqlx::query_as::<_, LeaveRequestRow>(LEAVE_REQUEST_SELECT)
        .bind(tenant_id)
        .bind(id)
        .bind(None::<Uuid>)
        .bind(None::<String>)
        .bind(None::<String>)
        .bind(None::<NaiveDate>)
        .bind(None::<NaiveDate>)
        .bind(None::<NaiveDate>)
        .bind(None::<NaiveDate>)
        .fetch_optional(&state.db)
        .await?
        .ok_or(AppError::NotFound)
}

async fn fetch_leave_balance(state: &AppState, tenant_id: Uuid, id: Uuid) -> Result<LeaveBalanceRow, AppError> {
    sqlx::query_as::<_, LeaveBalanceRow>(
        r#"
        select leave_balances.id, leave_balances.status, leave_balances.created_at as date_created,
            leave_balances.updated_at as date_updated, leave_balances.employee_id, leave_balances.leave_type,
            leave_balances.year, leave_balances.total_days::float8 as total_days,
            leave_balances.used_days::float8 as used_days, leave_balances.pending_days::float8 as pending_days,
            leave_balances.carried_over_days::float8 as carried_over_days, leave_balances.expires_at,
            json_build_object('id', employees.id, 'employee_code', employees.employee_code, 'full_name', employees.full_name, 'branch_id', employees.branch_id, 'employment_status', employees.status) as employee
        from leave_balances
        join employees on employees.id = leave_balances.employee_id
        where leave_balances.id = $1 and employees.tenant_id = $2
        "#,
    )
    .bind(id)
    .bind(tenant_id)
    .fetch_optional(&state.db)
    .await?
    .ok_or(AppError::NotFound)
}

async fn fetch_log(state: &AppState, tenant_id: Uuid, id: Uuid) -> Result<LeaveApprovalLogRow, AppError> {
    sqlx::query_as::<_, LeaveApprovalLogRow>(&format!("{LOG_SELECT} and leave_approval_logs.id = $3"))
        .bind(tenant_id)
        .bind(None::<Uuid>)
        .bind(id)
        .fetch_optional(&state.db)
        .await?
        .ok_or(AppError::NotFound)
}

async fn ensure_employee_scope(state: &AppState, tenant_id: Uuid, employee_id: Uuid) -> Result<(), AppError> {
    let exists = sqlx::query_scalar::<_, bool>("select exists(select 1 from employees where id = $1 and tenant_id = $2)")
        .bind(employee_id)
        .bind(tenant_id)
        .fetch_one(&state.db)
        .await?;
    if exists { Ok(()) } else { Err(AppError::Validation("employee_id is invalid for this tenant".into())) }
}

async fn ensure_employee_scope_optional(state: &AppState, tenant_id: Uuid, employee_id: Option<Uuid>) -> Result<(), AppError> {
    if let Some(employee_id) = employee_id {
        ensure_employee_scope(state, tenant_id, employee_id).await?;
    }
    Ok(())
}

async fn ensure_leave_request_scope(state: &AppState, tenant_id: Uuid, leave_request_id: Uuid) -> Result<(), AppError> {
    let exists = sqlx::query_scalar::<_, bool>(
        "select exists(select 1 from leave_requests join employees on employees.id = leave_requests.employee_id where leave_requests.id = $1 and employees.tenant_id = $2)",
    )
    .bind(leave_request_id)
    .bind(tenant_id)
    .fetch_one(&state.db)
    .await?;
    if exists { Ok(()) } else { Err(AppError::Validation("leave_request_id is invalid for this tenant".into())) }
}

fn paginated<T: Serialize>(data: Vec<T>, page: Option<i64>, limit: Option<i64>) -> PaginatedResponse<Vec<T>> {
    let total = data.len() as i64;
    let page = page.unwrap_or(1).max(1);
    let limit = limit.unwrap_or(total.max(1)).max(1);
    PaginatedResponse {
        success: true,
        data,
        pagination: Pagination { total, page, limit, total_pages: ((total + limit - 1) / limit).max(1) },
    }
}

fn require_tenant(auth: &AuthContext) -> Result<Uuid, AppError> {
    auth.user.tenant_id.ok_or(AppError::Unauthorized)
}

const LEAVE_REQUEST_SELECT: &str = r#"
    select leave_requests.id, leave_requests.status, leave_requests.created_at as date_created,
        leave_requests.updated_at as date_updated, leave_requests.employee_id, leave_requests.leave_type,
        leave_requests.start_date, leave_requests.end_date, leave_requests.leave_status,
        leave_requests.approver_id, leave_requests.reason,
        leave_requests.hours_requested::float8 as hours_requested,
        leave_requests.days_requested::float8 as days_requested,
        leave_requests.submitted_at, leave_requests.approved_at, leave_requests.approval_notes,
        leave_requests.document_url, coalesce(leave_requests.is_half_day, false) as is_half_day,
        leave_requests.half_day_type,
        json_build_object('id', employees.id, 'employee_code', employees.employee_code, 'full_name', employees.full_name, 'branch_id', employees.branch_id, 'employment_status', employees.status) as employee,
        case when approvers.id is null then null else json_build_object('id', approvers.id, 'employee_code', approvers.employee_code, 'full_name', approvers.full_name, 'branch_id', approvers.branch_id, 'employment_status', approvers.status) end as approver
    from leave_requests
    join employees on employees.id = leave_requests.employee_id
    left join employees approvers on approvers.id = leave_requests.approver_id
    where employees.tenant_id = $1
      and ($2::uuid is null or leave_requests.id = $2)
      and ($3::uuid is null or leave_requests.employee_id = $3)
      and ($4::text is null or leave_requests.leave_status = $4)
      and ($5::text is null or leave_requests.leave_type = $5)
      and ($6::date is null or leave_requests.start_date::date >= $6)
      and ($7::date is null or leave_requests.start_date::date <= $7)
      and ($8::date is null or leave_requests.end_date::date >= $8)
      and ($9::date is null or leave_requests.end_date::date <= $9)
    order by leave_requests.created_at desc
"#;

const LOG_SELECT: &str = r#"
    select leave_approval_logs.id, leave_approval_logs.created_at as date_created,
        leave_approval_logs.leave_request_id, leave_approval_logs.action_by,
        leave_approval_logs.action, leave_approval_logs.previous_status,
        leave_approval_logs.new_status, leave_approval_logs.notes,
        json_build_object('id', employees.id, 'employee_code', employees.employee_code, 'full_name', employees.full_name, 'branch_id', employees.branch_id, 'employment_status', employees.status) as actor
    from leave_approval_logs
    join employees on employees.id = leave_approval_logs.action_by
    join leave_requests on leave_requests.id = leave_approval_logs.leave_request_id
    join employees request_employees on request_employees.id = leave_requests.employee_id
    where request_employees.tenant_id = $1
      and ($2::uuid is null or leave_approval_logs.leave_request_id = $2)
"#;
