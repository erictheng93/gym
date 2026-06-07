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
pub struct ShiftScheduleFilters {
    branch_id: Option<Uuid>,
    status: Option<String>,
    page: Option<i64>,
    limit: Option<i64>,
}

#[derive(Debug, Deserialize)]
pub struct CreateShiftSchedule {
    branch_id: Uuid,
    name: String,
    start_time: NaiveTime,
    end_time: NaiveTime,
    break_start: Option<NaiveTime>,
    break_end: Option<NaiveTime>,
    grace_period_minutes: Option<i32>,
    early_leave_minutes: Option<i32>,
    overtime_start_after: Option<NaiveTime>,
    #[serde(default)]
    is_default: bool,
    applicable_days: Option<Value>,
    status: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct UpdateShiftSchedule {
    branch_id: Option<Uuid>,
    name: Option<String>,
    start_time: Option<NaiveTime>,
    end_time: Option<NaiveTime>,
    break_start: Option<NaiveTime>,
    break_end: Option<NaiveTime>,
    grace_period_minutes: Option<i32>,
    early_leave_minutes: Option<i32>,
    overtime_start_after: Option<NaiveTime>,
    is_default: Option<bool>,
    applicable_days: Option<Value>,
    status: Option<String>,
}

#[derive(Debug, Serialize, FromRow)]
pub struct ShiftScheduleRow {
    id: Uuid,
    status: Option<String>,
    date_created: Option<DateTime<Utc>>,
    date_updated: Option<DateTime<Utc>>,
    branch_id: Uuid,
    name: String,
    start_time: NaiveTime,
    end_time: NaiveTime,
    break_start: Option<NaiveTime>,
    break_end: Option<NaiveTime>,
    grace_period_minutes: i32,
    early_leave_minutes: i32,
    overtime_start_after: Option<NaiveTime>,
    is_default: bool,
    applicable_days: Value,
    branch: Value,
}

#[derive(Debug, Deserialize)]
pub struct EmployeeShiftFilters {
    employee_id: Option<Uuid>,
    shift_schedule_id: Option<Uuid>,
    effective_date_lte: Option<NaiveDate>,
    effective_date_gte: Option<NaiveDate>,
    page: Option<i64>,
    limit: Option<i64>,
}

#[derive(Debug, Deserialize)]
pub struct CreateEmployeeShift {
    employee_id: Uuid,
    shift_schedule_id: Uuid,
    effective_date: NaiveDate,
    end_date: Option<NaiveDate>,
}

#[derive(Debug, Deserialize)]
pub struct UpdateEmployeeShift {
    effective_date: Option<NaiveDate>,
    end_date: Option<NaiveDate>,
}

#[derive(Debug, Serialize, FromRow)]
pub struct EmployeeShiftRow {
    id: Uuid,
    date_created: Option<DateTime<Utc>>,
    employee_id: Uuid,
    shift_schedule_id: Uuid,
    effective_date: NaiveDate,
    end_date: Option<NaiveDate>,
    employee: Value,
    shift_schedule: Value,
}

pub async fn list_schedules(
    auth: AuthContext,
    State(state): State<AppState>,
    Query(filters): Query<ShiftScheduleFilters>,
) -> Result<impl IntoResponse, AppError> {
    let tenant_id = require_tenant(&auth)?;
    let rows = sqlx::query_as::<_, ShiftScheduleRow>(SHIFT_SCHEDULE_SELECT)
        .bind(tenant_id)
        .bind(None::<Uuid>)
        .bind(filters.branch_id)
        .bind(filters.status)
        .fetch_all(&state.db)
        .await?;
    Ok((StatusCode::OK, Json(paginated(rows, filters.page, filters.limit))))
}

pub async fn get_schedule(
    auth: AuthContext,
    State(state): State<AppState>,
    Path(id): Path<Uuid>,
) -> Result<impl IntoResponse, AppError> {
    let tenant_id = require_tenant(&auth)?;
    let row = fetch_schedule(&state, tenant_id, id).await?;
    Ok((StatusCode::OK, Json(ApiResponse { success: true, data: row })))
}

pub async fn create_schedule(
    auth: AuthContext,
    State(state): State<AppState>,
    Json(payload): Json<CreateShiftSchedule>,
) -> Result<impl IntoResponse, AppError> {
    let tenant_id = require_tenant(&auth)?;
    ensure_branch_scope(&state, tenant_id, payload.branch_id).await?;
    validate_time_range(payload.start_time, payload.end_time)?;
    let id = sqlx::query_scalar::<_, Uuid>(
        r#"
        insert into shift_schedules (
            id, status, branch_id, name, start_time, end_time, break_start, break_end,
            grace_period_minutes, early_leave_minutes, overtime_start_after, is_default,
            applicable_days, tenant_id
        ) values (
            gen_random_uuid(), $1, $2, $3, $4, $5, $6, $7,
            $8, $9, $10, $11, coalesce($12, '["MON","TUE","WED","THU","FRI"]'::jsonb), $13
        ) returning id
        "#,
    )
    .bind(payload.status.unwrap_or_else(|| "published".into()))
    .bind(payload.branch_id)
    .bind(payload.name)
    .bind(payload.start_time)
    .bind(payload.end_time)
    .bind(payload.break_start)
    .bind(payload.break_end)
    .bind(payload.grace_period_minutes.unwrap_or(15))
    .bind(payload.early_leave_minutes.unwrap_or(15))
    .bind(payload.overtime_start_after)
    .bind(payload.is_default)
    .bind(payload.applicable_days)
    .bind(tenant_id)
    .fetch_one(&state.db)
    .await?;
    let row = fetch_schedule(&state, tenant_id, id).await?;
    Ok((StatusCode::CREATED, Json(ApiResponse { success: true, data: row })))
}

pub async fn update_schedule(
    auth: AuthContext,
    State(state): State<AppState>,
    Path(id): Path<Uuid>,
    Json(payload): Json<UpdateShiftSchedule>,
) -> Result<impl IntoResponse, AppError> {
    let tenant_id = require_tenant(&auth)?;
    if let Some(branch_id) = payload.branch_id {
        ensure_branch_scope(&state, tenant_id, branch_id).await?;
    }
    if let (Some(start), Some(end)) = (payload.start_time, payload.end_time) {
        validate_time_range(start, end)?;
    }
    let updated_id = sqlx::query_scalar::<_, Uuid>(
        r#"
        update shift_schedules set
            status = coalesce($3, status),
            branch_id = coalesce($4, branch_id),
            name = coalesce($5, name),
            start_time = coalesce($6, start_time),
            end_time = coalesce($7, end_time),
            break_start = coalesce($8, break_start),
            break_end = coalesce($9, break_end),
            grace_period_minutes = coalesce($10, grace_period_minutes),
            early_leave_minutes = coalesce($11, early_leave_minutes),
            overtime_start_after = coalesce($12, overtime_start_after),
            is_default = coalesce($13, is_default),
            applicable_days = coalesce($14, applicable_days),
            updated_at = now()
        where id = $1 and tenant_id = $2
        returning id
        "#,
    )
    .bind(id)
    .bind(tenant_id)
    .bind(payload.status)
    .bind(payload.branch_id)
    .bind(payload.name)
    .bind(payload.start_time)
    .bind(payload.end_time)
    .bind(payload.break_start)
    .bind(payload.break_end)
    .bind(payload.grace_period_minutes)
    .bind(payload.early_leave_minutes)
    .bind(payload.overtime_start_after)
    .bind(payload.is_default)
    .bind(payload.applicable_days)
    .fetch_optional(&state.db)
    .await?
    .ok_or(AppError::NotFound)?;
    let row = fetch_schedule(&state, tenant_id, updated_id).await?;
    Ok((StatusCode::OK, Json(ApiResponse { success: true, data: row })))
}

pub async fn list_employee_shifts(
    auth: AuthContext,
    State(state): State<AppState>,
    Query(filters): Query<EmployeeShiftFilters>,
) -> Result<impl IntoResponse, AppError> {
    let tenant_id = require_tenant(&auth)?;
    let rows = sqlx::query_as::<_, EmployeeShiftRow>(EMPLOYEE_SHIFT_SELECT)
        .bind(tenant_id)
        .bind(None::<Uuid>)
        .bind(filters.employee_id)
        .bind(filters.shift_schedule_id)
        .bind(filters.effective_date_lte)
        .bind(filters.effective_date_gte)
        .fetch_all(&state.db)
        .await?;
    Ok((StatusCode::OK, Json(paginated(rows, filters.page, filters.limit))))
}

pub async fn get_employee_shift(
    auth: AuthContext,
    State(state): State<AppState>,
    Path(id): Path<Uuid>,
) -> Result<impl IntoResponse, AppError> {
    let tenant_id = require_tenant(&auth)?;
    let row = fetch_employee_shift(&state, tenant_id, id).await?;
    Ok((StatusCode::OK, Json(ApiResponse { success: true, data: row })))
}

pub async fn create_employee_shift(
    auth: AuthContext,
    State(state): State<AppState>,
    Json(payload): Json<CreateEmployeeShift>,
) -> Result<impl IntoResponse, AppError> {
    let tenant_id = require_tenant(&auth)?;
    ensure_employee_scope(&state, tenant_id, payload.employee_id).await?;
    ensure_schedule_scope(&state, tenant_id, payload.shift_schedule_id).await?;
    let id = sqlx::query_scalar::<_, Uuid>(
        r#"
        insert into employee_shifts (
            id, employee_id, shift_schedule_id, effective_date, end_date, tenant_id
        ) values (gen_random_uuid(), $1, $2, $3, $4, $5)
        returning id
        "#,
    )
    .bind(payload.employee_id)
    .bind(payload.shift_schedule_id)
    .bind(payload.effective_date)
    .bind(payload.end_date)
    .bind(tenant_id)
    .fetch_one(&state.db)
    .await?;
    let row = fetch_employee_shift(&state, tenant_id, id).await?;
    Ok((StatusCode::CREATED, Json(ApiResponse { success: true, data: row })))
}

pub async fn update_employee_shift(
    auth: AuthContext,
    State(state): State<AppState>,
    Path(id): Path<Uuid>,
    Json(payload): Json<UpdateEmployeeShift>,
) -> Result<impl IntoResponse, AppError> {
    let tenant_id = require_tenant(&auth)?;
    let updated_id = sqlx::query_scalar::<_, Uuid>(
        r#"
        update employee_shifts set
            effective_date = coalesce($3, effective_date),
            end_date = coalesce($4, end_date),
            updated_at = now()
        where id = $1 and tenant_id = $2
        returning id
        "#,
    )
    .bind(id)
    .bind(tenant_id)
    .bind(payload.effective_date)
    .bind(payload.end_date)
    .fetch_optional(&state.db)
    .await?
    .ok_or(AppError::NotFound)?;
    let row = fetch_employee_shift(&state, tenant_id, updated_id).await?;
    Ok((StatusCode::OK, Json(ApiResponse { success: true, data: row })))
}

async fn fetch_schedule(state: &AppState, tenant_id: Uuid, id: Uuid) -> Result<ShiftScheduleRow, AppError> {
    sqlx::query_as::<_, ShiftScheduleRow>(SHIFT_SCHEDULE_SELECT)
        .bind(tenant_id)
        .bind(id)
        .bind(None::<Uuid>)
        .bind(None::<String>)
        .fetch_optional(&state.db)
        .await?
        .ok_or(AppError::NotFound)
}

async fn fetch_employee_shift(state: &AppState, tenant_id: Uuid, id: Uuid) -> Result<EmployeeShiftRow, AppError> {
    sqlx::query_as::<_, EmployeeShiftRow>(EMPLOYEE_SHIFT_SELECT)
        .bind(tenant_id)
        .bind(id)
        .bind(None::<Uuid>)
        .bind(None::<Uuid>)
        .bind(None::<NaiveDate>)
        .bind(None::<NaiveDate>)
        .fetch_optional(&state.db)
        .await?
        .ok_or(AppError::NotFound)
}

async fn ensure_branch_scope(state: &AppState, tenant_id: Uuid, branch_id: Uuid) -> Result<(), AppError> {
    let exists = sqlx::query_scalar::<_, bool>("select exists(select 1 from branches where id = $1 and tenant_id = $2)")
        .bind(branch_id)
        .bind(tenant_id)
        .fetch_one(&state.db)
        .await?;
    if exists { Ok(()) } else { Err(AppError::Validation("branch_id is invalid for this tenant".into())) }
}

async fn ensure_employee_scope(state: &AppState, tenant_id: Uuid, employee_id: Uuid) -> Result<(), AppError> {
    let exists = sqlx::query_scalar::<_, bool>("select exists(select 1 from employees where id = $1 and tenant_id = $2)")
        .bind(employee_id)
        .bind(tenant_id)
        .fetch_one(&state.db)
        .await?;
    if exists { Ok(()) } else { Err(AppError::Validation("employee_id is invalid for this tenant".into())) }
}

async fn ensure_schedule_scope(state: &AppState, tenant_id: Uuid, schedule_id: Uuid) -> Result<(), AppError> {
    let exists = sqlx::query_scalar::<_, bool>("select exists(select 1 from shift_schedules where id = $1 and tenant_id = $2)")
        .bind(schedule_id)
        .bind(tenant_id)
        .fetch_one(&state.db)
        .await?;
    if exists { Ok(()) } else { Err(AppError::Validation("shift_schedule_id is invalid for this tenant".into())) }
}

fn validate_time_range(start: NaiveTime, end: NaiveTime) -> Result<(), AppError> {
    if end <= start {
        return Err(AppError::Validation("end_time must be after start_time".into()));
    }
    Ok(())
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

const SHIFT_SCHEDULE_SELECT: &str = r#"
    select shift_schedules.id, shift_schedules.status, shift_schedules.created_at as date_created,
        shift_schedules.updated_at as date_updated, shift_schedules.branch_id,
        shift_schedules.name, shift_schedules.start_time, shift_schedules.end_time,
        shift_schedules.break_start, shift_schedules.break_end,
        coalesce(shift_schedules.grace_period_minutes, 0) as grace_period_minutes,
        coalesce(shift_schedules.early_leave_minutes, 0) as early_leave_minutes,
        shift_schedules.overtime_start_after,
        coalesce(shift_schedules.is_default, false) as is_default,
        coalesce(shift_schedules.applicable_days, '[]'::jsonb) as applicable_days,
        json_build_object('id', branches.id, 'name', branches.name, 'code', branches.code) as branch
    from shift_schedules
    join branches on branches.id = shift_schedules.branch_id
    where branches.tenant_id = $1
      and ($2::uuid is null or shift_schedules.id = $2)
      and ($3::uuid is null or shift_schedules.branch_id = $3)
      and ($4::text is null or shift_schedules.status = $4)
    order by shift_schedules.start_time, shift_schedules.name
"#;

const EMPLOYEE_SHIFT_SELECT: &str = r#"
    select employee_shifts.id, employee_shifts.created_at as date_created,
        employee_shifts.employee_id, employee_shifts.shift_schedule_id,
        employee_shifts.effective_date, employee_shifts.end_date,
        json_build_object(
            'id', employees.id,
            'employee_code', employees.employee_code,
            'full_name', employees.full_name,
            'branch_id', employees.branch_id,
            'employment_status', employees.status
        ) as employee,
        json_build_object(
            'id', shift_schedules.id,
            'name', shift_schedules.name,
            'branch_id', shift_schedules.branch_id,
            'start_time', shift_schedules.start_time,
            'end_time', shift_schedules.end_time
        ) as shift_schedule
    from employee_shifts
    join employees on employees.id = employee_shifts.employee_id
    join shift_schedules on shift_schedules.id = employee_shifts.shift_schedule_id
    where employee_shifts.tenant_id = $1
      and ($2::uuid is null or employee_shifts.id = $2)
      and ($3::uuid is null or employee_shifts.employee_id = $3)
      and ($4::uuid is null or employee_shifts.shift_schedule_id = $4)
      and ($5::date is null or employee_shifts.effective_date <= $5)
      and ($6::date is null or employee_shifts.effective_date >= $6)
    order by employee_shifts.created_at desc
"#;

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn rejects_shift_end_before_start() {
        let start = NaiveTime::from_hms_opt(18, 0, 0).unwrap();
        let end = NaiveTime::from_hms_opt(9, 0, 0).unwrap();
        assert!(validate_time_range(start, end).is_err());
    }
}
