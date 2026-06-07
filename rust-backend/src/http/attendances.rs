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
pub struct AttendanceFilters {
    id: Option<Uuid>,
    employee_id: Option<Uuid>,
    #[serde(rename = "employeeId")]
    employee_id_camel: Option<Uuid>,
    branch_id: Option<Uuid>,
    #[serde(rename = "branchId")]
    branch_id_camel: Option<Uuid>,
    attendance_date: Option<NaiveDate>,
    attendance_date_gte: Option<NaiveDate>,
    attendance_date_lte: Option<NaiveDate>,
    #[serde(rename = "startDate")]
    start_date: Option<NaiveDate>,
    #[serde(rename = "endDate")]
    end_date: Option<NaiveDate>,
    page: Option<i64>,
    limit: Option<i64>,
}

#[derive(Debug, Deserialize)]
pub struct CreateAttendanceRequest {
    employee_id: Option<Uuid>,
    #[serde(rename = "employeeId")]
    employee_id_camel: Option<Uuid>,
    branch_id: Option<Uuid>,
    #[serde(rename = "branchId")]
    branch_id_camel: Option<Uuid>,
    attendance_date: Option<NaiveDate>,
    #[serde(rename = "attendanceDate")]
    attendance_date_camel: Option<NaiveDate>,
    check_in: Option<DateTime<Utc>>,
    #[serde(rename = "checkIn")]
    check_in_camel: Option<DateTime<Utc>>,
    check_out: Option<DateTime<Utc>>,
    #[serde(rename = "checkOut")]
    check_out_camel: Option<DateTime<Utc>>,
    check_type: Option<String>,
    #[serde(rename = "checkType")]
    check_type_camel: Option<String>,
    attendance_status: Option<String>,
    #[serde(rename = "attendanceStatus")]
    attendance_status_camel: Option<String>,
    late_minutes: Option<i32>,
    #[serde(rename = "lateMinutes")]
    late_minutes_camel: Option<i32>,
    early_leave_minutes: Option<i32>,
    #[serde(rename = "earlyLeaveMinutes")]
    early_leave_minutes_camel: Option<i32>,
    work_hours: Option<f64>,
    #[serde(rename = "workHours")]
    work_hours_camel: Option<f64>,
    overtime_hours: Option<f64>,
    #[serde(rename = "overtimeHours")]
    overtime_hours_camel: Option<f64>,
    notes: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct UpdateAttendanceRequest {
    check_in: Option<DateTime<Utc>>,
    #[serde(rename = "checkIn")]
    check_in_camel: Option<DateTime<Utc>>,
    check_out: Option<DateTime<Utc>>,
    #[serde(rename = "checkOut")]
    check_out_camel: Option<DateTime<Utc>>,
    check_type: Option<String>,
    #[serde(rename = "checkType")]
    check_type_camel: Option<String>,
    attendance_status: Option<String>,
    #[serde(rename = "attendanceStatus")]
    attendance_status_camel: Option<String>,
    late_minutes: Option<i32>,
    #[serde(rename = "lateMinutes")]
    late_minutes_camel: Option<i32>,
    early_leave_minutes: Option<i32>,
    #[serde(rename = "earlyLeaveMinutes")]
    early_leave_minutes_camel: Option<i32>,
    work_hours: Option<f64>,
    #[serde(rename = "workHours")]
    work_hours_camel: Option<f64>,
    overtime_hours: Option<f64>,
    #[serde(rename = "overtimeHours")]
    overtime_hours_camel: Option<f64>,
    notes: Option<String>,
}

#[derive(Debug, Serialize, FromRow)]
pub struct Attendance {
    id: Uuid,
    employee_id: Uuid,
    branch_id: Option<Uuid>,
    attendance_date: Option<NaiveDate>,
    check_in: Option<DateTime<Utc>>,
    check_out: Option<DateTime<Utc>>,
    check_type: Option<String>,
    attendance_status: Option<String>,
    late_minutes: Option<i32>,
    early_leave_minutes: Option<i32>,
    work_hours: Option<f64>,
    overtime_hours: Option<f64>,
    notes: Option<String>,
    date_created: Option<DateTime<Utc>>,
    employee: Value,
}

#[derive(Debug, FromRow)]
struct EmployeeContext {
    branch_id: Uuid,
}

pub async fn list(
    auth: AuthContext,
    State(state): State<AppState>,
    Query(filters): Query<AttendanceFilters>,
) -> Result<impl IntoResponse, AppError> {
    let tenant_id = require_tenant(&auth)?;
    let employee_id = filters.employee_id.or(filters.employee_id_camel);
    let branch_id = filters.branch_id.or(filters.branch_id_camel);
    let attendance_date_gte = filters.attendance_date_gte.or(filters.start_date);
    let attendance_date_lte = filters.attendance_date_lte.or(filters.end_date);
    let attendances = sqlx::query_as::<_, Attendance>(
        r#"
        select
            attendances.id, attendances.employee_id, attendances.branch_id,
            attendances.attendance_date, attendances.check_in, attendances.check_out,
            attendances.check_type, attendances.attendance_status, attendances.late_minutes,
            attendances.early_leave_minutes, attendances.work_hours::float8 as work_hours,
            attendances.overtime_hours::float8 as overtime_hours, attendances.notes,
            attendances.created_at as date_created,
            json_build_object(
                'id', employees.id,
                'employee_code', employees.employee_code,
                'full_name', employees.full_name,
                'branch_id', employees.branch_id,
                'employment_status', employees.status
            ) as employee
        from attendances
        join employees on employees.id = attendances.employee_id
        where employees.tenant_id = $1
          and ($2::uuid is null or attendances.id = $2)
          and ($3::uuid is null or attendances.employee_id = $3)
          and ($4::uuid is null or attendances.branch_id = $4)
          and ($5::date is null or attendances.attendance_date = $5)
          and ($6::date is null or attendances.attendance_date >= $6)
          and ($7::date is null or attendances.attendance_date <= $7)
        order by attendances.attendance_date desc, attendances.check_in desc nulls last
        "#,
    )
    .bind(tenant_id)
    .bind(filters.id)
    .bind(employee_id)
    .bind(branch_id)
    .bind(filters.attendance_date)
    .bind(attendance_date_gte)
    .bind(attendance_date_lte)
    .fetch_all(&state.db)
    .await?;

    let total = attendances.len() as i64;
    let page = filters.page.unwrap_or(1).max(1);
    let limit = filters.limit.unwrap_or(total.max(1)).max(1);
    Ok((StatusCode::OK, Json(PaginatedResponse {
        success: true,
        data: attendances,
        pagination: Pagination { total, page, limit, total_pages: ((total + limit - 1) / limit).max(1) },
    })))
}

pub async fn get(
    auth: AuthContext,
    State(state): State<AppState>,
    Path(id): Path<Uuid>,
) -> Result<impl IntoResponse, AppError> {
    let tenant_id = require_tenant(&auth)?;
    let attendance = fetch_attendance(&state, tenant_id, id).await?;
    Ok((StatusCode::OK, Json(ApiResponse { success: true, data: attendance })))
}

pub async fn create(
    auth: AuthContext,
    State(state): State<AppState>,
    Json(payload): Json<CreateAttendanceRequest>,
) -> Result<impl IntoResponse, AppError> {
    let tenant_id = require_tenant(&auth)?;
    let employee_id = payload.employee_id_camel.or(payload.employee_id).ok_or_else(|| AppError::Validation("employee_id is required".into()))?;
    let employee = fetch_employee_context(&state, tenant_id, employee_id).await?;
    let branch_id = payload.branch_id.or(payload.branch_id_camel).unwrap_or(employee.branch_id);
    ensure_branch_scope(&state, tenant_id, branch_id).await?;
    let check_in = payload.check_in.or(payload.check_in_camel).unwrap_or_else(Utc::now);
    let attendance_date = payload.attendance_date.or(payload.attendance_date_camel).unwrap_or_else(|| check_in.date_naive());

    let attendance_id = sqlx::query_scalar::<_, Uuid>(
        r#"
        insert into attendances (
            id, employee_id, branch_id, attendance_date, check_in, check_out, check_type,
            attendance_status, late_minutes, early_leave_minutes, work_hours, overtime_hours, notes
        ) values (
            gen_random_uuid(), $1, $2, $3, $4, $5, $6, $7, $8, $9,
            ($10::double precision)::numeric, ($11::double precision)::numeric, $12
        )
        returning id
        "#,
    )
    .bind(employee_id)
    .bind(branch_id)
    .bind(attendance_date)
    .bind(check_in)
    .bind(payload.check_out.or(payload.check_out_camel))
    .bind(payload.check_type.or(payload.check_type_camel).unwrap_or_else(|| "REGULAR".into()))
    .bind(payload.attendance_status.or(payload.attendance_status_camel).unwrap_or_else(|| "PRESENT".into()))
    .bind(payload.late_minutes.or(payload.late_minutes_camel).unwrap_or(0))
    .bind(payload.early_leave_minutes.or(payload.early_leave_minutes_camel).unwrap_or(0))
    .bind(payload.work_hours.or(payload.work_hours_camel))
    .bind(payload.overtime_hours.or(payload.overtime_hours_camel).unwrap_or(0.0))
    .bind(payload.notes)
    .fetch_one(&state.db)
    .await?;

    let attendance = fetch_attendance(&state, tenant_id, attendance_id).await?;
    Ok((StatusCode::CREATED, Json(ApiResponse { success: true, data: attendance })))
}

pub async fn update(
    auth: AuthContext,
    State(state): State<AppState>,
    Path(id): Path<Uuid>,
    Json(payload): Json<UpdateAttendanceRequest>,
) -> Result<impl IntoResponse, AppError> {
    let tenant_id = require_tenant(&auth)?;
    let existing = fetch_attendance(&state, tenant_id, id).await?;
    let check_out = payload.check_out.or(payload.check_out_camel);
    let work_hours = payload.work_hours.or(payload.work_hours_camel);
    let work_hours = work_hours.or_else(|| {
        check_out.and_then(|out| existing.check_in.map(|input| ((out - input).num_minutes() as f64 / 60.0).max(0.0)))
    });

    let updated_id = sqlx::query_scalar::<_, Uuid>(
        r#"
        update attendances set
            check_in = coalesce($3, check_in),
            check_out = coalesce($4, check_out),
            check_type = coalesce($5, check_type),
            attendance_status = coalesce($6, attendance_status),
            late_minutes = coalesce($7, late_minutes),
            early_leave_minutes = coalesce($8, early_leave_minutes),
            work_hours = coalesce(($9::double precision)::numeric, work_hours),
            overtime_hours = coalesce(($10::double precision)::numeric, overtime_hours),
            notes = coalesce($11, notes)
        from employees
        where attendances.id = $1 and attendances.employee_id = employees.id and employees.tenant_id = $2
        returning attendances.id
        "#,
    )
    .bind(id)
    .bind(tenant_id)
    .bind(payload.check_in.or(payload.check_in_camel))
    .bind(check_out)
    .bind(payload.check_type.or(payload.check_type_camel))
    .bind(payload.attendance_status.or(payload.attendance_status_camel))
    .bind(payload.late_minutes.or(payload.late_minutes_camel))
    .bind(payload.early_leave_minutes.or(payload.early_leave_minutes_camel))
    .bind(work_hours)
    .bind(payload.overtime_hours.or(payload.overtime_hours_camel))
    .bind(payload.notes)
    .fetch_optional(&state.db)
    .await?
    .ok_or(AppError::NotFound)?;

    let attendance = fetch_attendance(&state, tenant_id, updated_id).await?;
    Ok((StatusCode::OK, Json(ApiResponse { success: true, data: attendance })))
}

async fn fetch_attendance(state: &AppState, tenant_id: Uuid, id: Uuid) -> Result<Attendance, AppError> {
    sqlx::query_as::<_, Attendance>(
        r#"
        select
            attendances.id, attendances.employee_id, attendances.branch_id,
            attendances.attendance_date, attendances.check_in, attendances.check_out,
            attendances.check_type, attendances.attendance_status, attendances.late_minutes,
            attendances.early_leave_minutes, attendances.work_hours::float8 as work_hours,
            attendances.overtime_hours::float8 as overtime_hours, attendances.notes,
            attendances.created_at as date_created,
            json_build_object(
                'id', employees.id,
                'employee_code', employees.employee_code,
                'full_name', employees.full_name,
                'branch_id', employees.branch_id,
                'employment_status', employees.status
            ) as employee
        from attendances
        join employees on employees.id = attendances.employee_id
        where attendances.id = $1 and employees.tenant_id = $2
        "#,
    )
    .bind(id)
    .bind(tenant_id)
    .fetch_optional(&state.db)
    .await?
    .ok_or(AppError::NotFound)
}

async fn fetch_employee_context(state: &AppState, tenant_id: Uuid, employee_id: Uuid) -> Result<EmployeeContext, AppError> {
    sqlx::query_as::<_, EmployeeContext>(
        "select branch_id from employees where id = $1 and tenant_id = $2",
    )
    .bind(employee_id)
    .bind(tenant_id)
    .fetch_optional(&state.db)
    .await?
    .ok_or_else(|| AppError::Validation("employee_id is invalid for this tenant".into()))
}

async fn ensure_branch_scope(state: &AppState, tenant_id: Uuid, branch_id: Uuid) -> Result<(), AppError> {
    let exists = sqlx::query_scalar::<_, bool>(
        "select exists(select 1 from branches where id = $1 and tenant_id = $2)",
    )
    .bind(branch_id)
    .bind(tenant_id)
    .fetch_one(&state.db)
    .await?;
    if exists { Ok(()) } else { Err(AppError::Validation("branch_id is invalid for this tenant".into())) }
}

fn require_tenant(auth: &AuthContext) -> Result<Uuid, AppError> {
    auth.user.tenant_id.ok_or(AppError::Unauthorized)
}
