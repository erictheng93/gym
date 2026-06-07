use axum::{
    extract::{Path, Query, State},
    http::StatusCode,
    response::IntoResponse,
    Json,
};
use chrono::{DateTime, NaiveDate, NaiveTime, Utc};
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
pub struct MakeupRequestFilters {
    id: Option<Uuid>,
    #[serde(alias = "employeeId")]
    employee_id: Option<Uuid>,
    #[serde(alias = "branchId")]
    branch_id: Option<Uuid>,
    #[serde(alias = "requestStatus", alias = "status")]
    request_status: Option<String>,
    #[serde(alias = "targetDate")]
    target_date: Option<NaiveDate>,
    #[serde(alias = "targetDateFrom")]
    target_date_gte: Option<NaiveDate>,
    #[serde(alias = "targetDateTo")]
    target_date_lte: Option<NaiveDate>,
    page: Option<i64>,
    limit: Option<i64>,
}

#[derive(Debug, Deserialize)]
pub struct CreateMakeupRequest {
    #[serde(alias = "employeeId")]
    employee_id: Uuid,
    #[serde(alias = "branchId")]
    branch_id: Uuid,
    #[serde(alias = "targetDate")]
    target_date: NaiveDate,
    #[serde(alias = "makeupType")]
    makeup_type: String,
    #[serde(alias = "requestedCheckIn")]
    requested_check_in: Option<NaiveTime>,
    #[serde(alias = "requestedCheckOut")]
    requested_check_out: Option<NaiveTime>,
    reason: String,
    #[serde(alias = "documentUrl")]
    document_url: Option<String>,
    #[serde(alias = "requestStatus")]
    request_status: Option<String>,
    #[serde(alias = "approverId")]
    approver_id: Option<Uuid>,
    #[serde(alias = "approvedAt")]
    approved_at: Option<DateTime<Utc>>,
    #[serde(alias = "approvalNotes")]
    approval_notes: Option<String>,
    #[serde(alias = "submittedAt")]
    submitted_at: Option<DateTime<Utc>>,
}

#[derive(Debug, Deserialize)]
pub struct UpdateMakeupRequest {
    #[serde(alias = "requestStatus")]
    request_status: Option<String>,
    #[serde(alias = "approverId")]
    approver_id: Option<Uuid>,
    #[serde(alias = "approvedAt")]
    approved_at: Option<DateTime<Utc>>,
    #[serde(alias = "approvalNotes")]
    approval_notes: Option<String>,
    reason: Option<String>,
    #[serde(alias = "requestedCheckIn")]
    requested_check_in: Option<NaiveTime>,
    #[serde(alias = "requestedCheckOut")]
    requested_check_out: Option<NaiveTime>,
    #[serde(alias = "documentUrl")]
    document_url: Option<String>,
}

#[derive(Debug, Serialize, FromRow)]
pub struct MakeupRequestRow {
    id: Uuid,
    status: Option<String>,
    date_created: Option<DateTime<Utc>>,
    date_updated: Option<DateTime<Utc>>,
    employee_id: Uuid,
    branch_id: Uuid,
    target_date: NaiveDate,
    makeup_type: String,
    requested_check_in: Option<NaiveTime>,
    requested_check_out: Option<NaiveTime>,
    reason: String,
    document_url: Option<String>,
    request_status: String,
    approver_id: Option<Uuid>,
    approved_at: Option<DateTime<Utc>>,
    approval_notes: Option<String>,
    submitted_at: Option<DateTime<Utc>>,
    employee: Value,
    branch: Value,
    approver: Option<Value>,
}

#[derive(Debug, Deserialize)]
pub struct MakeupApprovalLogFilters {
    makeup_request_id: Option<Uuid>,
    page: Option<i64>,
    limit: Option<i64>,
}

#[derive(Debug, Deserialize)]
pub struct CreateMakeupApprovalLog {
    makeup_request_id: Uuid,
    action_by: Uuid,
    action: String,
    previous_status: Option<String>,
    new_status: Option<String>,
    notes: Option<String>,
}

#[derive(Debug, Serialize, FromRow)]
pub struct MakeupApprovalLogRow {
    id: Uuid,
    date_created: Option<DateTime<Utc>>,
    makeup_request_id: Uuid,
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
    Query(filters): Query<MakeupRequestFilters>,
) -> Result<impl IntoResponse, AppError> {
    let tenant_id = require_tenant(&auth)?;
    let rows = sqlx::query_as::<_, MakeupRequestRow>(MAKEUP_REQUEST_SELECT)
        .bind(tenant_id)
        .bind(filters.id)
        .bind(filters.employee_id)
        .bind(filters.branch_id)
        .bind(filters.request_status)
        .bind(filters.target_date)
        .bind(filters.target_date_gte)
        .bind(filters.target_date_lte)
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
    let row = fetch_request(&state, tenant_id, id).await?;
    Ok((StatusCode::OK, Json(ApiResponse { success: true, data: row })))
}

pub async fn create_request(
    auth: AuthContext,
    State(state): State<AppState>,
    Json(payload): Json<CreateMakeupRequest>,
) -> Result<impl IntoResponse, AppError> {
    let tenant_id = require_tenant(&auth)?;
    ensure_employee_scope(&state, tenant_id, payload.employee_id).await?;
    ensure_employee_scope_optional(&state, tenant_id, payload.approver_id).await?;
    ensure_branch_scope(&state, tenant_id, payload.branch_id).await?;
    let id = sqlx::query_scalar::<_, Uuid>(
        r#"
        insert into makeup_requests (
            id, employee_id, branch_id, target_date, makeup_type, requested_check_in,
            requested_check_out, reason, document_url, request_status, approver_id,
            approved_at, approval_notes, submitted_at, status
        ) values (
            gen_random_uuid(), $1, $2, $3, $4, $5, $6, $7, $8,
            $9, $10, $11, $12, coalesce($13, now()), 'ACTIVE'
        ) returning id
        "#,
    )
    .bind(payload.employee_id)
    .bind(payload.branch_id)
    .bind(payload.target_date)
    .bind(payload.makeup_type)
    .bind(payload.requested_check_in)
    .bind(payload.requested_check_out)
    .bind(payload.reason)
    .bind(payload.document_url)
    .bind(payload.request_status.unwrap_or_else(|| "PENDING".into()))
    .bind(payload.approver_id)
    .bind(payload.approved_at)
    .bind(payload.approval_notes)
    .bind(payload.submitted_at)
    .fetch_one(&state.db)
    .await?;
    let row = fetch_request(&state, tenant_id, id).await?;
    Ok((StatusCode::CREATED, Json(ApiResponse { success: true, data: row })))
}

pub async fn update_request(
    auth: AuthContext,
    State(state): State<AppState>,
    Path(id): Path<Uuid>,
    Json(payload): Json<UpdateMakeupRequest>,
) -> Result<impl IntoResponse, AppError> {
    let tenant_id = require_tenant(&auth)?;
    ensure_employee_scope_optional(&state, tenant_id, payload.approver_id).await?;
    let updated_id = sqlx::query_scalar::<_, Uuid>(
        r#"
        update makeup_requests set
            request_status = coalesce($3, request_status),
            approver_id = coalesce($4, approver_id),
            approved_at = coalesce($5, approved_at),
            approval_notes = coalesce($6, approval_notes),
            reason = coalesce($7, reason),
            requested_check_in = coalesce($8, requested_check_in),
            requested_check_out = coalesce($9, requested_check_out),
            document_url = coalesce($10, document_url),
            updated_at = now()
        from employees
        where makeup_requests.id = $1 and makeup_requests.employee_id = employees.id and employees.tenant_id = $2
        returning makeup_requests.id
        "#,
    )
    .bind(id)
    .bind(tenant_id)
    .bind(payload.request_status)
    .bind(payload.approver_id)
    .bind(payload.approved_at)
    .bind(payload.approval_notes)
    .bind(payload.reason)
    .bind(payload.requested_check_in)
    .bind(payload.requested_check_out)
    .bind(payload.document_url)
    .fetch_optional(&state.db)
    .await?
    .ok_or(AppError::NotFound)?;
    let row = fetch_request(&state, tenant_id, updated_id).await?;
    Ok((StatusCode::OK, Json(ApiResponse { success: true, data: row })))
}

pub async fn list_logs(
    auth: AuthContext,
    State(state): State<AppState>,
    Query(filters): Query<MakeupApprovalLogFilters>,
) -> Result<impl IntoResponse, AppError> {
    let tenant_id = require_tenant(&auth)?;
    let rows = sqlx::query_as::<_, MakeupApprovalLogRow>(LOG_SELECT)
        .bind(tenant_id)
        .bind(filters.makeup_request_id)
        .fetch_all(&state.db)
        .await?;
    Ok((StatusCode::OK, Json(paginated(rows, filters.page, filters.limit))))
}

pub async fn create_log(
    auth: AuthContext,
    State(state): State<AppState>,
    Json(payload): Json<CreateMakeupApprovalLog>,
) -> Result<impl IntoResponse, AppError> {
    let tenant_id = require_tenant(&auth)?;
    ensure_employee_scope(&state, tenant_id, payload.action_by).await?;
    ensure_request_scope(&state, tenant_id, payload.makeup_request_id).await?;
    let id = sqlx::query_scalar::<_, Uuid>(
        r#"
        insert into makeup_approval_logs (
            id, makeup_request_id, action_by, action, previous_status, new_status, notes
        ) values (gen_random_uuid(), $1, $2, $3, $4, $5, $6)
        returning id
        "#,
    )
    .bind(payload.makeup_request_id)
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

async fn fetch_request(state: &AppState, tenant_id: Uuid, id: Uuid) -> Result<MakeupRequestRow, AppError> {
    sqlx::query_as::<_, MakeupRequestRow>(MAKEUP_REQUEST_SELECT)
        .bind(tenant_id)
        .bind(id)
        .bind(None::<Uuid>)
        .bind(None::<Uuid>)
        .bind(None::<String>)
        .bind(None::<NaiveDate>)
        .bind(None::<NaiveDate>)
        .bind(None::<NaiveDate>)
        .fetch_optional(&state.db)
        .await?
        .ok_or(AppError::NotFound)
}

async fn fetch_log(state: &AppState, tenant_id: Uuid, id: Uuid) -> Result<MakeupApprovalLogRow, AppError> {
    sqlx::query_as::<_, MakeupApprovalLogRow>(&format!("{LOG_SELECT} and makeup_approval_logs.id = $3"))
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

async fn ensure_branch_scope(state: &AppState, tenant_id: Uuid, branch_id: Uuid) -> Result<(), AppError> {
    let exists = sqlx::query_scalar::<_, bool>("select exists(select 1 from branches where id = $1 and tenant_id = $2)")
        .bind(branch_id)
        .bind(tenant_id)
        .fetch_one(&state.db)
        .await?;
    if exists { Ok(()) } else { Err(AppError::Validation("branch_id is invalid for this tenant".into())) }
}

async fn ensure_request_scope(state: &AppState, tenant_id: Uuid, request_id: Uuid) -> Result<(), AppError> {
    let exists = sqlx::query_scalar::<_, bool>(
        "select exists(select 1 from makeup_requests join employees on employees.id = makeup_requests.employee_id where makeup_requests.id = $1 and employees.tenant_id = $2)",
    )
    .bind(request_id)
    .bind(tenant_id)
    .fetch_one(&state.db)
    .await?;
    if exists { Ok(()) } else { Err(AppError::Validation("makeup_request_id is invalid for this tenant".into())) }
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

const MAKEUP_REQUEST_SELECT: &str = r#"
    select makeup_requests.id, makeup_requests.status, makeup_requests.created_at as date_created,
        makeup_requests.updated_at as date_updated, makeup_requests.employee_id, makeup_requests.branch_id,
        makeup_requests.target_date, makeup_requests.makeup_type, makeup_requests.requested_check_in,
        makeup_requests.requested_check_out, makeup_requests.reason, makeup_requests.document_url,
        makeup_requests.request_status, makeup_requests.approver_id, makeup_requests.approved_at,
        makeup_requests.approval_notes, makeup_requests.submitted_at,
        json_build_object('id', employees.id, 'employee_code', employees.employee_code, 'full_name', employees.full_name, 'branch_id', employees.branch_id, 'employment_status', employees.status) as employee,
        json_build_object('id', branches.id, 'name', branches.name, 'code', branches.code) as branch,
        case when approvers.id is null then null else json_build_object('id', approvers.id, 'employee_code', approvers.employee_code, 'full_name', approvers.full_name, 'branch_id', approvers.branch_id, 'employment_status', approvers.status) end as approver
    from makeup_requests
    join employees on employees.id = makeup_requests.employee_id
    join branches on branches.id = makeup_requests.branch_id
    left join employees approvers on approvers.id = makeup_requests.approver_id
    where employees.tenant_id = $1
      and ($2::uuid is null or makeup_requests.id = $2)
      and ($3::uuid is null or makeup_requests.employee_id = $3)
      and ($4::uuid is null or makeup_requests.branch_id = $4)
      and ($5::text is null or makeup_requests.request_status = $5)
      and ($6::date is null or makeup_requests.target_date = $6)
      and ($7::date is null or makeup_requests.target_date >= $7)
      and ($8::date is null or makeup_requests.target_date <= $8)
    order by makeup_requests.created_at desc
"#;

const LOG_SELECT: &str = r#"
    select makeup_approval_logs.id, makeup_approval_logs.created_at as date_created,
        makeup_approval_logs.makeup_request_id, makeup_approval_logs.action_by,
        makeup_approval_logs.action, makeup_approval_logs.previous_status,
        makeup_approval_logs.new_status, makeup_approval_logs.notes,
        json_build_object('id', employees.id, 'employee_code', employees.employee_code, 'full_name', employees.full_name, 'branch_id', employees.branch_id, 'employment_status', employees.status) as actor
    from makeup_approval_logs
    join employees on employees.id = makeup_approval_logs.action_by
    join makeup_requests on makeup_requests.id = makeup_approval_logs.makeup_request_id
    join employees request_employees on request_employees.id = makeup_requests.employee_id
    where request_employees.tenant_id = $1
      and ($2::uuid is null or makeup_approval_logs.makeup_request_id = $2)
"#;
