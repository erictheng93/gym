use axum::{
    extract::{Path, Query, State},
    http::StatusCode,
    response::IntoResponse,
    Json,
};
use chrono::{NaiveDate, NaiveTime};
use serde::{Deserialize, Serialize};
use sqlx::{FromRow, PgPool, Postgres, Transaction};
use uuid::Uuid;

use crate::{
    error::AppError,
    http::{auth::AuthContext, ApiResponse, PaginatedResponse, Pagination},
    state::AppState,
};

#[derive(Debug, Deserialize)]
pub struct ScheduleFilters {
    #[serde(rename = "classId")]
    class_id: Option<Uuid>,
    #[serde(rename = "branchId")]
    branch_id: Option<Uuid>,
    #[serde(rename = "activeOnly")]
    active_only: Option<bool>,
}

#[derive(Debug, Deserialize)]
pub struct CreateScheduleRequest {
    #[serde(rename = "classId")]
    class_id: Uuid,
    #[serde(rename = "branchId")]
    branch_id: Uuid,
    #[serde(rename = "instructorId")]
    instructor_id: Option<Uuid>,
    #[serde(rename = "dayOfWeek")]
    day_of_week: i32,
    #[serde(rename = "startTime")]
    start_time: NaiveTime,
    #[serde(rename = "endTime")]
    end_time: NaiveTime,
    room: Option<String>,
    #[serde(rename = "maxCapacity", default = "default_capacity")]
    max_capacity: i32,
    #[serde(rename = "isRecurring", default = "default_true")]
    is_recurring: bool,
    #[serde(rename = "validFrom")]
    valid_from: Option<NaiveDate>,
    #[serde(rename = "validUntil")]
    valid_until: Option<NaiveDate>,
}

#[derive(Debug, Serialize, FromRow)]
pub struct ClassSchedule {
    id: Uuid,
    status: Option<String>,
    #[serde(rename = "classId")]
    class_id: Uuid,
    #[serde(rename = "branchId")]
    branch_id: Uuid,
    #[serde(rename = "instructorId")]
    instructor_id: Option<Uuid>,
    #[serde(rename = "dayOfWeek")]
    day_of_week: i32,
    #[serde(rename = "startTime")]
    start_time: NaiveTime,
    #[serde(rename = "endTime")]
    end_time: NaiveTime,
    room: Option<String>,
    #[serde(rename = "maxCapacity")]
    max_capacity: Option<i32>,
    #[serde(rename = "isRecurring")]
    is_recurring: Option<bool>,
    #[serde(rename = "validFrom")]
    valid_from: Option<NaiveDate>,
    #[serde(rename = "validUntil")]
    valid_until: Option<NaiveDate>,
}

#[derive(Debug, Deserialize)]
pub struct SessionFilters {
    #[serde(rename = "classId")]
    class_id: Option<Uuid>,
    #[serde(rename = "branchId")]
    branch_id: Option<Uuid>,
    date: Option<NaiveDate>,
}

#[derive(Debug, Deserialize)]
pub struct CreateSessionRequest {
    #[serde(rename = "scheduleId")]
    schedule_id: Option<Uuid>,
    #[serde(rename = "classId")]
    class_id: Uuid,
    #[serde(rename = "branchId")]
    branch_id: Uuid,
    #[serde(rename = "instructorId")]
    instructor_id: Option<Uuid>,
    #[serde(rename = "sessionDate")]
    session_date: NaiveDate,
    #[serde(rename = "startTime")]
    start_time: NaiveTime,
    #[serde(rename = "endTime")]
    end_time: NaiveTime,
    room: Option<String>,
    #[serde(rename = "maxCapacity")]
    max_capacity: i32,
}

#[derive(Debug, Serialize, FromRow)]
pub struct ClassSession {
    id: Uuid,
    status: Option<String>,
    #[serde(rename = "scheduleId")]
    schedule_id: Option<Uuid>,
    #[serde(rename = "classId")]
    class_id: Uuid,
    #[serde(rename = "branchId")]
    branch_id: Uuid,
    #[serde(rename = "instructorId")]
    instructor_id: Option<Uuid>,
    #[serde(rename = "sessionDate")]
    session_date: NaiveDate,
    #[serde(rename = "startTime")]
    start_time: NaiveTime,
    #[serde(rename = "endTime")]
    end_time: NaiveTime,
    room: Option<String>,
    #[serde(rename = "maxCapacity")]
    max_capacity: i32,
    #[serde(rename = "currentCount")]
    current_count: Option<i32>,
    #[serde(rename = "waitlistCount")]
    waitlist_count: Option<i32>,
    #[serde(rename = "sessionStatus")]
    session_status: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct BookingFilters {
    #[serde(rename = "sessionId")]
    session_id: Option<Uuid>,
    #[serde(rename = "memberId")]
    member_id: Option<Uuid>,
    status: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct CreateBookingRequest {
    #[serde(rename = "sessionId")]
    session_id: Uuid,
    #[serde(rename = "memberId")]
    member_id: Uuid,
    #[serde(rename = "contractId")]
    contract_id: Option<Uuid>,
}

#[derive(Debug, Serialize, FromRow)]
pub struct Booking {
    id: Uuid,
    status: Option<String>,
    #[serde(rename = "sessionId")]
    session_id: Uuid,
    #[serde(rename = "memberId")]
    member_id: Uuid,
    #[serde(rename = "contractId")]
    contract_id: Option<Uuid>,
    #[serde(rename = "bookingStatus")]
    booking_status: Option<String>,
    #[serde(rename = "waitlistPosition")]
    waitlist_position: Option<i32>,
    #[serde(rename = "countDeducted")]
    count_deducted: Option<bool>,
}

#[derive(Debug, FromRow)]
struct SessionContext {
    branch_id: Uuid,
    max_capacity: i32,
    current_count: Option<i32>,
}

fn default_capacity() -> i32 {
    20
}

fn default_true() -> bool {
    true
}

pub async fn list_schedules(
    auth: AuthContext,
    State(state): State<AppState>,
    Query(filters): Query<ScheduleFilters>,
) -> Result<impl IntoResponse, AppError> {
    let tenant_id = require_tenant(&auth)?;
    let schedules = sqlx::query_as::<_, ClassSchedule>(
        r#"
        select class_schedules.*
        from class_schedules
        join branches on branches.id = class_schedules.branch_id
        where branches.tenant_id = $1
          and ($2::uuid is null or class_schedules.class_id = $2)
          and ($3::uuid is null or class_schedules.branch_id = $3)
          and ($4::bool is not true or class_schedules.status = 'ACTIVE')
        order by day_of_week, start_time
        "#,
    )
    .bind(tenant_id)
    .bind(filters.class_id)
    .bind(filters.branch_id)
    .bind(filters.active_only.unwrap_or(false))
    .fetch_all(&state.db)
    .await?;

    Ok((StatusCode::OK, Json(paginated(schedules))))
}

pub async fn create_schedule(
    auth: AuthContext,
    State(state): State<AppState>,
    Json(payload): Json<CreateScheduleRequest>,
) -> Result<impl IntoResponse, AppError> {
    let tenant_id = require_tenant(&auth)?;
    validate_times(payload.start_time, payload.end_time)?;
    validate_positive("maxCapacity", payload.max_capacity)?;
    ensure_class_scope(&state.db, tenant_id, payload.class_id).await?;
    ensure_branch_scope(&state.db, tenant_id, payload.branch_id).await?;
    ensure_employee_scope(&state.db, tenant_id, payload.instructor_id).await?;

    let schedule = sqlx::query_as::<_, ClassSchedule>(
        r#"
        insert into class_schedules (
            id, class_id, branch_id, instructor_id, day_of_week, start_time, end_time,
            room, max_capacity, is_recurring, valid_from, valid_until
        )
        values (gen_random_uuid(), $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
        returning *
        "#,
    )
    .bind(payload.class_id)
    .bind(payload.branch_id)
    .bind(payload.instructor_id)
    .bind(payload.day_of_week)
    .bind(payload.start_time)
    .bind(payload.end_time)
    .bind(payload.room)
    .bind(payload.max_capacity)
    .bind(payload.is_recurring)
    .bind(payload.valid_from)
    .bind(payload.valid_until)
    .fetch_one(&state.db)
    .await?;

    Ok((StatusCode::CREATED, Json(ApiResponse { success: true, data: schedule })))
}

pub async fn list_sessions(
    auth: AuthContext,
    State(state): State<AppState>,
    Query(filters): Query<SessionFilters>,
) -> Result<impl IntoResponse, AppError> {
    let tenant_id = require_tenant(&auth)?;
    let sessions = sqlx::query_as::<_, ClassSession>(
        r#"
        select class_sessions.*
        from class_sessions
        join branches on branches.id = class_sessions.branch_id
        where branches.tenant_id = $1
          and ($2::uuid is null or class_sessions.class_id = $2)
          and ($3::uuid is null or class_sessions.branch_id = $3)
          and ($4::date is null or class_sessions.session_date = $4)
        order by session_date, start_time
        "#,
    )
    .bind(tenant_id)
    .bind(filters.class_id)
    .bind(filters.branch_id)
    .bind(filters.date)
    .fetch_all(&state.db)
    .await?;

    Ok((StatusCode::OK, Json(paginated(sessions))))
}

pub async fn create_session(
    auth: AuthContext,
    State(state): State<AppState>,
    Json(payload): Json<CreateSessionRequest>,
) -> Result<impl IntoResponse, AppError> {
    let tenant_id = require_tenant(&auth)?;
    validate_times(payload.start_time, payload.end_time)?;
    validate_positive("maxCapacity", payload.max_capacity)?;
    ensure_class_scope(&state.db, tenant_id, payload.class_id).await?;
    ensure_branch_scope(&state.db, tenant_id, payload.branch_id).await?;
    ensure_employee_scope(&state.db, tenant_id, payload.instructor_id).await?;

    let session = sqlx::query_as::<_, ClassSession>(
        r#"
        insert into class_sessions (
            id, schedule_id, class_id, branch_id, instructor_id, session_date,
            start_time, end_time, room, max_capacity
        )
        values (gen_random_uuid(), $1, $2, $3, $4, $5, $6, $7, $8, $9)
        returning *
        "#,
    )
    .bind(payload.schedule_id)
    .bind(payload.class_id)
    .bind(payload.branch_id)
    .bind(payload.instructor_id)
    .bind(payload.session_date)
    .bind(payload.start_time)
    .bind(payload.end_time)
    .bind(payload.room)
    .bind(payload.max_capacity)
    .fetch_one(&state.db)
    .await?;

    Ok((StatusCode::CREATED, Json(ApiResponse { success: true, data: session })))
}

pub async fn list_bookings(
    auth: AuthContext,
    State(state): State<AppState>,
    Query(filters): Query<BookingFilters>,
) -> Result<impl IntoResponse, AppError> {
    let tenant_id = require_tenant(&auth)?;
    let bookings = sqlx::query_as::<_, Booking>(
        r#"
        select bookings.id, bookings.status, bookings.session_id, bookings.member_id,
            bookings.contract_id, bookings.booking_status, bookings.waitlist_position,
            bookings.count_deducted
        from bookings
        join members on members.id = bookings.member_id
        where members.tenant_id = $1
          and ($2::uuid is null or bookings.session_id = $2)
          and ($3::uuid is null or bookings.member_id = $3)
          and ($4::text is null or bookings.booking_status = $4)
        order by bookings.created_at desc
        "#,
    )
    .bind(tenant_id)
    .bind(filters.session_id)
    .bind(filters.member_id)
    .bind(filters.status)
    .fetch_all(&state.db)
    .await?;

    Ok((StatusCode::OK, Json(paginated(bookings))))
}

pub async fn get_booking(
    auth: AuthContext,
    State(state): State<AppState>,
    Path(id): Path<Uuid>,
) -> Result<impl IntoResponse, AppError> {
    let tenant_id = require_tenant(&auth)?;
    let booking = fetch_booking(&state.db, tenant_id, id).await?;
    Ok((StatusCode::OK, Json(ApiResponse { success: true, data: booking })))
}

pub async fn create_booking(
    auth: AuthContext,
    State(state): State<AppState>,
    Json(payload): Json<CreateBookingRequest>,
) -> Result<impl IntoResponse, AppError> {
    let tenant_id = require_tenant(&auth)?;
    ensure_member_scope(&state.db, tenant_id, payload.member_id).await?;
    let session = fetch_session_context(&state.db, tenant_id, payload.session_id).await?;
    if session.current_count.unwrap_or(0) >= session.max_capacity {
        return Err(AppError::Validation("session is full".into()));
    }
    if let Some(contract_id) = payload.contract_id {
        ensure_contract_matches(&state.db, tenant_id, contract_id, payload.member_id, session.branch_id).await?;
    }

    let mut tx = state.db.begin().await?;
    let booking = sqlx::query_as::<_, Booking>(
        r#"
        insert into bookings (id, session_id, member_id, contract_id, booking_status)
        values (gen_random_uuid(), $1, $2, $3, 'CONFIRMED')
        returning id, status, session_id, member_id, contract_id, booking_status,
            waitlist_position, count_deducted
        "#,
    )
    .bind(payload.session_id)
    .bind(payload.member_id)
    .bind(payload.contract_id)
    .fetch_one(&mut *tx)
    .await?;
    increment_session_count(&mut tx, payload.session_id, 1).await?;
    tx.commit().await?;

    Ok((StatusCode::CREATED, Json(ApiResponse { success: true, data: booking })))
}

pub async fn cancel_booking(
    auth: AuthContext,
    State(state): State<AppState>,
    Path(id): Path<Uuid>,
) -> Result<impl IntoResponse, AppError> {
    let tenant_id = require_tenant(&auth)?;
    let existing = fetch_booking(&state.db, tenant_id, id).await?;

    let mut tx = state.db.begin().await?;
    let booking = sqlx::query_as::<_, Booking>(
        r#"
        update bookings
        set booking_status = 'CANCELLED', cancelled_at = now(), updated_at = now()
        where id = $1
        returning id, status, session_id, member_id, contract_id, booking_status,
            waitlist_position, count_deducted
        "#,
    )
    .bind(id)
    .fetch_one(&mut *tx)
    .await?;
    if existing.booking_status.as_deref() != Some("CANCELLED") {
        increment_session_count(&mut tx, existing.session_id, -1).await?;
    }
    tx.commit().await?;

    Ok((StatusCode::OK, Json(ApiResponse { success: true, data: booking })))
}

async fn fetch_booking(pool: &PgPool, tenant_id: Uuid, id: Uuid) -> Result<Booking, AppError> {
    sqlx::query_as::<_, Booking>(
        r#"
        select bookings.id, bookings.status, bookings.session_id, bookings.member_id,
            bookings.contract_id, bookings.booking_status, bookings.waitlist_position,
            bookings.count_deducted
        from bookings
        join members on members.id = bookings.member_id
        where bookings.id = $1 and members.tenant_id = $2
        "#,
    )
    .bind(id)
    .bind(tenant_id)
    .fetch_optional(pool)
    .await?
    .ok_or(AppError::NotFound)
}

async fn fetch_session_context(pool: &PgPool, tenant_id: Uuid, session_id: Uuid) -> Result<SessionContext, AppError> {
    sqlx::query_as::<_, SessionContext>(
        r#"
        select class_sessions.branch_id, class_sessions.max_capacity,
            class_sessions.current_count
        from class_sessions
        join branches on branches.id = class_sessions.branch_id
        where class_sessions.id = $1 and branches.tenant_id = $2
        "#,
    )
    .bind(session_id)
    .bind(tenant_id)
    .fetch_optional(pool)
    .await?
    .ok_or_else(|| AppError::Validation("sessionId is invalid for this tenant".into()))
}

async fn ensure_contract_matches(
    pool: &PgPool,
    tenant_id: Uuid,
    contract_id: Uuid,
    member_id: Uuid,
    branch_id: Uuid,
) -> Result<(), AppError> {
    let exists = sqlx::query_scalar::<_, bool>(
        "select exists(select 1 from contracts where id = $1 and tenant_id = $2 and member_id = $3 and branch_id = $4)",
    )
    .bind(contract_id)
    .bind(tenant_id)
    .bind(member_id)
    .bind(branch_id)
    .fetch_one(pool)
    .await?;
    if exists {
        Ok(())
    } else {
        Err(AppError::Validation("contractId does not match booking context".into()))
    }
}

async fn increment_session_count(
    tx: &mut Transaction<'_, Postgres>,
    session_id: Uuid,
    delta: i32,
) -> Result<(), AppError> {
    sqlx::query(
        "update class_sessions set current_count = greatest(coalesce(current_count, 0) + $2, 0), updated_at = now() where id = $1",
    )
    .bind(session_id)
    .bind(delta)
    .execute(&mut **tx)
    .await?;
    Ok(())
}

async fn ensure_class_scope(pool: &PgPool, tenant_id: Uuid, class_id: Uuid) -> Result<(), AppError> {
    let exists = sqlx::query_scalar::<_, bool>(
        "select exists(select 1 from classes join branches on branches.id = classes.branch_id where classes.id = $1 and branches.tenant_id = $2)",
    )
    .bind(class_id)
    .bind(tenant_id)
    .fetch_one(pool)
    .await?;
    if exists { Ok(()) } else { Err(AppError::Validation("classId is invalid for this tenant".into())) }
}

async fn ensure_branch_scope(pool: &PgPool, tenant_id: Uuid, branch_id: Uuid) -> Result<(), AppError> {
    ensure_exists(pool, "branches", tenant_id, branch_id, "branchId").await
}

async fn ensure_employee_scope(pool: &PgPool, tenant_id: Uuid, employee_id: Option<Uuid>) -> Result<(), AppError> {
    let Some(employee_id) = employee_id else { return Ok(()); };
    ensure_exists(pool, "employees", tenant_id, employee_id, "instructorId").await
}

async fn ensure_member_scope(pool: &PgPool, tenant_id: Uuid, member_id: Uuid) -> Result<(), AppError> {
    ensure_exists(pool, "members", tenant_id, member_id, "memberId").await
}

async fn ensure_exists(pool: &PgPool, table: &str, tenant_id: Uuid, id: Uuid, field: &str) -> Result<(), AppError> {
    let sql = format!("select exists(select 1 from {table} where id = $1 and tenant_id = $2)");
    let exists = sqlx::query_scalar::<_, bool>(&sql)
        .bind(id)
        .bind(tenant_id)
        .fetch_one(pool)
        .await?;
    if exists { Ok(()) } else { Err(AppError::Validation(format!("{field} is invalid for this tenant"))) }
}

fn validate_times(start_time: NaiveTime, end_time: NaiveTime) -> Result<(), AppError> {
    if end_time <= start_time {
        return Err(AppError::Validation("endTime must be after startTime".into()));
    }
    Ok(())
}

fn validate_positive(field: &str, value: i32) -> Result<(), AppError> {
    if value <= 0 {
        return Err(AppError::Validation(format!("{field} must be greater than zero")));
    }
    Ok(())
}

fn require_tenant(auth: &AuthContext) -> Result<Uuid, AppError> {
    auth.user.tenant_id.ok_or(AppError::Unauthorized)
}

fn paginated<T: Serialize>(data: Vec<T>) -> PaginatedResponse<Vec<T>> {
    let total = data.len() as i64;
    PaginatedResponse {
        success: true,
        data,
        pagination: Pagination {
            total,
            page: 1,
            limit: total.max(1),
            total_pages: 1,
        },
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn rejects_invalid_time_range() {
        let start = NaiveTime::from_hms_opt(10, 0, 0).unwrap();
        let end = NaiveTime::from_hms_opt(9, 0, 0).unwrap();
        assert!(validate_times(start, end).is_err());
    }
}
