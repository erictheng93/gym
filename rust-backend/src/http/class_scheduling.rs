use axum::{
    extract::{Path, Query, State},
    http::StatusCode,
    response::IntoResponse,
    Json,
};
use chrono::{Datelike, Duration, NaiveDate, NaiveTime};
use serde::{Deserialize, Serialize};
use serde_json::json;
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
    #[serde(alias = "class_id")]
    class_id: Option<Uuid>,
    #[serde(rename = "branchId")]
    #[serde(alias = "branch_id")]
    branch_id: Option<Uuid>,
    #[serde(rename = "activeOnly")]
    #[serde(alias = "active_only")]
    active_only: Option<bool>,
}

#[derive(Debug, Deserialize)]
pub struct CreateScheduleRequest {
    #[serde(rename = "classId")]
    #[serde(alias = "class_id")]
    class_id: Uuid,
    #[serde(rename = "branchId")]
    #[serde(alias = "branch_id")]
    branch_id: Uuid,
    #[serde(rename = "instructorId")]
    #[serde(alias = "instructor_id")]
    instructor_id: Option<Uuid>,
    #[serde(rename = "dayOfWeek")]
    #[serde(alias = "day_of_week")]
    day_of_week: i32,
    #[serde(rename = "startTime")]
    #[serde(alias = "start_time")]
    start_time: NaiveTime,
    #[serde(rename = "endTime")]
    #[serde(alias = "end_time")]
    end_time: NaiveTime,
    room: Option<String>,
    #[serde(rename = "maxCapacity", default = "default_capacity")]
    #[serde(alias = "max_capacity")]
    max_capacity: i32,
    #[serde(rename = "isRecurring", default = "default_true")]
    #[serde(alias = "is_recurring")]
    is_recurring: bool,
    #[serde(rename = "validFrom")]
    #[serde(alias = "valid_from")]
    valid_from: Option<NaiveDate>,
    #[serde(rename = "validUntil")]
    #[serde(alias = "valid_until")]
    valid_until: Option<NaiveDate>,
}

#[derive(Debug, Deserialize)]
pub struct UpdateScheduleRequest {
    #[serde(rename = "classId")]
    #[serde(alias = "class_id")]
    class_id: Option<Uuid>,
    #[serde(rename = "branchId")]
    #[serde(alias = "branch_id")]
    branch_id: Option<Uuid>,
    #[serde(rename = "instructorId")]
    #[serde(alias = "instructor_id")]
    instructor_id: Option<Option<Uuid>>,
    #[serde(rename = "dayOfWeek")]
    #[serde(alias = "day_of_week")]
    day_of_week: Option<i32>,
    #[serde(rename = "startTime")]
    #[serde(alias = "start_time")]
    start_time: Option<NaiveTime>,
    #[serde(rename = "endTime")]
    #[serde(alias = "end_time")]
    end_time: Option<NaiveTime>,
    room: Option<Option<String>>,
    #[serde(rename = "maxCapacity")]
    #[serde(alias = "max_capacity")]
    max_capacity: Option<i32>,
    #[serde(rename = "isRecurring")]
    #[serde(alias = "is_recurring")]
    is_recurring: Option<bool>,
    #[serde(rename = "validFrom")]
    #[serde(alias = "valid_from")]
    valid_from: Option<Option<NaiveDate>>,
    #[serde(rename = "validUntil")]
    #[serde(alias = "valid_until")]
    valid_until: Option<Option<NaiveDate>>,
    status: Option<String>,
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
    #[serde(alias = "class_id")]
    class_id: Option<Uuid>,
    #[serde(rename = "branchId")]
    #[serde(alias = "branch_id")]
    branch_id: Option<Uuid>,
    date: Option<NaiveDate>,
}

#[derive(Debug, Deserialize)]
pub struct CreateSessionRequest {
    #[serde(rename = "scheduleId")]
    #[serde(alias = "schedule_id")]
    schedule_id: Option<Uuid>,
    #[serde(rename = "classId")]
    #[serde(alias = "class_id")]
    class_id: Uuid,
    #[serde(rename = "branchId")]
    #[serde(alias = "branch_id")]
    branch_id: Uuid,
    #[serde(rename = "instructorId")]
    #[serde(alias = "instructor_id")]
    instructor_id: Option<Uuid>,
    #[serde(rename = "sessionDate")]
    #[serde(alias = "session_date")]
    session_date: NaiveDate,
    #[serde(rename = "startTime")]
    #[serde(alias = "start_time")]
    start_time: NaiveTime,
    #[serde(rename = "endTime")]
    #[serde(alias = "end_time")]
    end_time: NaiveTime,
    room: Option<String>,
    #[serde(rename = "maxCapacity")]
    #[serde(alias = "max_capacity")]
    max_capacity: i32,
}

#[derive(Debug, Deserialize)]
pub struct UpdateSessionRequest {
    #[serde(rename = "scheduleId")]
    #[serde(alias = "schedule_id")]
    schedule_id: Option<Option<Uuid>>,
    #[serde(rename = "classId")]
    #[serde(alias = "class_id")]
    class_id: Option<Uuid>,
    #[serde(rename = "branchId")]
    #[serde(alias = "branch_id")]
    branch_id: Option<Uuid>,
    #[serde(rename = "instructorId")]
    #[serde(alias = "instructor_id")]
    instructor_id: Option<Option<Uuid>>,
    #[serde(rename = "sessionDate")]
    #[serde(alias = "session_date")]
    session_date: Option<NaiveDate>,
    #[serde(rename = "startTime")]
    #[serde(alias = "start_time")]
    start_time: Option<NaiveTime>,
    #[serde(rename = "endTime")]
    #[serde(alias = "end_time")]
    end_time: Option<NaiveTime>,
    room: Option<Option<String>>,
    #[serde(rename = "maxCapacity")]
    #[serde(alias = "max_capacity")]
    max_capacity: Option<i32>,
    #[serde(rename = "sessionStatus")]
    #[serde(alias = "session_status")]
    session_status: Option<String>,
    status: Option<String>,
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

#[derive(Debug, Deserialize)]
pub struct GenerateSessionsRequest {
    branch_id: Uuid,
    start_date: NaiveDate,
    end_date: NaiveDate,
}

#[derive(Debug, Deserialize)]
pub struct AdminBookRequest {
    session_id: Uuid,
    member_id: Uuid,
    contract_id: Option<Uuid>,
}

#[derive(Debug, Deserialize)]
pub struct AdminCancelBookingRequest {
    booking_id: Uuid,
    reason: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct AdminAttendRequest {
    booking_id: Uuid,
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

#[derive(Debug, FromRow)]
struct ScheduleGenerateRow {
    id: Uuid,
    class_id: Uuid,
    branch_id: Uuid,
    instructor_id: Option<Uuid>,
    day_of_week: i32,
    start_time: NaiveTime,
    end_time: NaiveTime,
    room: Option<String>,
    max_capacity: Option<i32>,
}

#[derive(Debug, FromRow)]
struct AttendContext {
    contract_id: Option<Uuid>,
    count_deducted: Option<bool>,
    contract_tenant_id: Option<Uuid>,
    plan_type: Option<String>,
    remaining_counts: Option<i32>,
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
          and ($4::bool is not true or upper(coalesce(class_schedules.status, 'ACTIVE')) = 'ACTIVE')
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

pub async fn get_schedule(
    auth: AuthContext,
    State(state): State<AppState>,
    Path(id): Path<Uuid>,
) -> Result<impl IntoResponse, AppError> {
    let tenant_id = require_tenant(&auth)?;
    let schedule = fetch_schedule(&state.db, tenant_id, id).await?;
    Ok((StatusCode::OK, Json(ApiResponse { success: true, data: schedule })))
}

pub async fn update_schedule(
    auth: AuthContext,
    State(state): State<AppState>,
    Path(id): Path<Uuid>,
    Json(payload): Json<UpdateScheduleRequest>,
) -> Result<impl IntoResponse, AppError> {
    let tenant_id = require_tenant(&auth)?;
    let current = fetch_schedule(&state.db, tenant_id, id).await?;
    let class_id = payload.class_id.unwrap_or(current.class_id);
    let branch_id = payload.branch_id.unwrap_or(current.branch_id);
    let start_time = payload.start_time.unwrap_or(current.start_time);
    let end_time = payload.end_time.unwrap_or(current.end_time);
    validate_times(start_time, end_time)?;
    if let Some(max_capacity) = payload.max_capacity {
        validate_positive("maxCapacity", max_capacity)?;
    }
    ensure_class_scope(&state.db, tenant_id, class_id).await?;
    ensure_branch_scope(&state.db, tenant_id, branch_id).await?;
    let instructor_id = payload.instructor_id.unwrap_or(current.instructor_id);
    ensure_employee_scope(&state.db, tenant_id, instructor_id).await?;
    let room = payload.room.unwrap_or(current.room);
    let valid_from = payload.valid_from.unwrap_or(current.valid_from);
    let valid_until = payload.valid_until.unwrap_or(current.valid_until);

    let schedule = sqlx::query_as::<_, ClassSchedule>(
        r#"
        update class_schedules set
            class_id = $3,
            branch_id = $4,
            instructor_id = $5,
            day_of_week = coalesce($6, day_of_week),
            start_time = $7,
            end_time = $8,
            room = $9,
            max_capacity = coalesce($10, max_capacity),
            is_recurring = coalesce($11, is_recurring),
            valid_from = $12,
            valid_until = $13,
            status = coalesce($14, status),
            updated_at = now()
        where id = $1
          and branch_id in (select id from branches where tenant_id = $2)
        returning *
        "#,
    )
    .bind(id)
    .bind(tenant_id)
    .bind(class_id)
    .bind(branch_id)
    .bind(instructor_id)
    .bind(payload.day_of_week)
    .bind(start_time)
    .bind(end_time)
    .bind(room)
    .bind(payload.max_capacity)
    .bind(payload.is_recurring)
    .bind(valid_from)
    .bind(valid_until)
    .bind(payload.status)
    .fetch_optional(&state.db)
    .await?
    .ok_or(AppError::NotFound)?;

    Ok((StatusCode::OK, Json(ApiResponse { success: true, data: schedule })))
}

pub async fn delete_schedule(
    auth: AuthContext,
    State(state): State<AppState>,
    Path(id): Path<Uuid>,
) -> Result<impl IntoResponse, AppError> {
    let tenant_id = require_tenant(&auth)?;
    let schedule = sqlx::query_as::<_, ClassSchedule>(
        r#"
        update class_schedules set status = 'INACTIVE', updated_at = now()
        where id = $1
          and branch_id in (select id from branches where tenant_id = $2)
        returning *
        "#,
    )
    .bind(id)
    .bind(tenant_id)
    .fetch_optional(&state.db)
    .await?
    .ok_or(AppError::NotFound)?;

    Ok((StatusCode::OK, Json(ApiResponse { success: true, data: schedule })))
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

pub async fn get_session(
    auth: AuthContext,
    State(state): State<AppState>,
    Path(id): Path<Uuid>,
) -> Result<impl IntoResponse, AppError> {
    let tenant_id = require_tenant(&auth)?;
    let session = fetch_session(&state.db, tenant_id, id).await?;
    Ok((StatusCode::OK, Json(ApiResponse { success: true, data: session })))
}

pub async fn update_session(
    auth: AuthContext,
    State(state): State<AppState>,
    Path(id): Path<Uuid>,
    Json(payload): Json<UpdateSessionRequest>,
) -> Result<impl IntoResponse, AppError> {
    let tenant_id = require_tenant(&auth)?;
    let current = fetch_session(&state.db, tenant_id, id).await?;
    let class_id = payload.class_id.unwrap_or(current.class_id);
    let branch_id = payload.branch_id.unwrap_or(current.branch_id);
    let start_time = payload.start_time.unwrap_or(current.start_time);
    let end_time = payload.end_time.unwrap_or(current.end_time);
    validate_times(start_time, end_time)?;
    if let Some(max_capacity) = payload.max_capacity {
        validate_positive("maxCapacity", max_capacity)?;
    }
    ensure_class_scope(&state.db, tenant_id, class_id).await?;
    ensure_branch_scope(&state.db, tenant_id, branch_id).await?;
    let instructor_id = payload.instructor_id.unwrap_or(current.instructor_id);
    ensure_employee_scope(&state.db, tenant_id, instructor_id).await?;
    let schedule_id = payload.schedule_id.unwrap_or(current.schedule_id);
    if let Some(schedule_id) = schedule_id {
        ensure_schedule_scope(&state.db, tenant_id, schedule_id).await?;
    }
    let room = payload.room.unwrap_or(current.room);

    let session = sqlx::query_as::<_, ClassSession>(
        r#"
        update class_sessions set
            schedule_id = $3,
            class_id = $4,
            branch_id = $5,
            instructor_id = $6,
            session_date = coalesce($7, session_date),
            start_time = $8,
            end_time = $9,
            room = $10,
            max_capacity = coalesce($11, max_capacity),
            session_status = coalesce($12, session_status),
            status = coalesce($13, status),
            updated_at = now()
        where id = $1
          and branch_id in (select id from branches where tenant_id = $2)
        returning *
        "#,
    )
    .bind(id)
    .bind(tenant_id)
    .bind(schedule_id)
    .bind(class_id)
    .bind(branch_id)
    .bind(instructor_id)
    .bind(payload.session_date)
    .bind(start_time)
    .bind(end_time)
    .bind(room)
    .bind(payload.max_capacity)
    .bind(payload.session_status)
    .bind(payload.status)
    .fetch_optional(&state.db)
    .await?
    .ok_or(AppError::NotFound)?;

    Ok((StatusCode::OK, Json(ApiResponse { success: true, data: session })))
}

pub async fn delete_session(
    auth: AuthContext,
    State(state): State<AppState>,
    Path(id): Path<Uuid>,
) -> Result<impl IntoResponse, AppError> {
    let tenant_id = require_tenant(&auth)?;
    let session = sqlx::query_as::<_, ClassSession>(
        r#"
        update class_sessions set session_status = 'CANCELLED', status = 'INACTIVE', updated_at = now()
        where id = $1
          and branch_id in (select id from branches where tenant_id = $2)
        returning *
        "#,
    )
    .bind(id)
    .bind(tenant_id)
    .fetch_optional(&state.db)
    .await?
    .ok_or(AppError::NotFound)?;

    Ok((StatusCode::OK, Json(ApiResponse { success: true, data: session })))
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

pub async fn generate_sessions(
    auth: AuthContext,
    State(state): State<AppState>,
    Json(payload): Json<GenerateSessionsRequest>,
) -> Result<impl IntoResponse, AppError> {
    let tenant_id = require_tenant(&auth)?;
    if payload.end_date < payload.start_date {
        return Err(AppError::Validation("end_date must be on or after start_date".into()));
    }
    ensure_branch_scope(&state.db, tenant_id, payload.branch_id).await?;
    let schedules = sqlx::query_as::<_, ScheduleGenerateRow>(
        r#"
        select id, class_id, branch_id, instructor_id, day_of_week, start_time, end_time, room, max_capacity
        from class_schedules
        where branch_id = $1
          and upper(coalesce(status, 'ACTIVE')) = 'ACTIVE'
          and coalesce(is_recurring, true) = true
          and (valid_from is null or valid_from <= $3)
          and (valid_until is null or valid_until >= $2)
        "#,
    )
    .bind(payload.branch_id)
    .bind(payload.start_date)
    .bind(payload.end_date)
    .fetch_all(&state.db)
    .await?;

    let mut created = 0;
    let mut date = payload.start_date;
    let mut tx = state.db.begin().await?;
    while date <= payload.end_date {
        let day_of_week = date.weekday().num_days_from_sunday() as i32;
        for schedule in schedules.iter().filter(|schedule| schedule.day_of_week == day_of_week) {
            let inserted = sqlx::query_scalar::<_, Option<Uuid>>(
                r#"
                insert into class_sessions (
                    id, schedule_id, class_id, branch_id, instructor_id, session_date,
                    start_time, end_time, room, max_capacity
                )
                select gen_random_uuid(), $1, $2, $3, $4, $5, $6, $7, $8, coalesce($9, 20)
                where not exists (
                    select 1 from class_sessions
                    where schedule_id = $1 and session_date = $5 and start_time = $6
                )
                returning id
                "#,
            )
            .bind(schedule.id)
            .bind(schedule.class_id)
            .bind(schedule.branch_id)
            .bind(schedule.instructor_id)
            .bind(date)
            .bind(schedule.start_time)
            .bind(schedule.end_time)
            .bind(&schedule.room)
            .bind(schedule.max_capacity)
            .fetch_optional(&mut *tx)
            .await?;
            if inserted.flatten().is_some() {
                created += 1;
            }
        }
        date += Duration::days(1);
    }
    tx.commit().await?;

    Ok((StatusCode::OK, Json(json!({ "created": created }))))
}

pub async fn admin_book(
    auth: AuthContext,
    State(state): State<AppState>,
    Json(payload): Json<AdminBookRequest>,
) -> Result<impl IntoResponse, AppError> {
    let tenant_id = require_tenant(&auth)?;
    ensure_member_scope(&state.db, tenant_id, payload.member_id).await?;
    let session = fetch_session_context(&state.db, tenant_id, payload.session_id).await?;
    if let Some(contract_id) = payload.contract_id {
        ensure_contract_matches(&state.db, tenant_id, contract_id, payload.member_id, session.branch_id).await?;
    }
    let booking_status = if session.current_count.unwrap_or(0) >= session.max_capacity {
        "WAITLIST"
    } else {
        "CONFIRMED"
    };
    let waitlist_position = if booking_status == "WAITLIST" {
        Some(next_waitlist_position(&state.db, payload.session_id).await?)
    } else {
        None
    };

    let mut tx = state.db.begin().await?;
    let booking = sqlx::query_as::<_, Booking>(
        r#"
        insert into bookings (id, session_id, member_id, contract_id, booking_status, waitlist_position)
        values (gen_random_uuid(), $1, $2, $3, $4, $5)
        returning id, status, session_id, member_id, contract_id, booking_status,
            waitlist_position, count_deducted
        "#,
    )
    .bind(payload.session_id)
    .bind(payload.member_id)
    .bind(payload.contract_id)
    .bind(booking_status)
    .bind(waitlist_position)
    .fetch_one(&mut *tx)
    .await?;
    if booking_status == "CONFIRMED" {
        increment_session_count(&mut tx, payload.session_id, 1).await?;
    }
    tx.commit().await?;

    Ok((StatusCode::OK, Json(json!({
        "success": true,
        "booking_id": booking.id,
        "booking_status": booking.booking_status,
        "waitlist_position": booking.waitlist_position,
        "message": if booking_status == "CONFIRMED" { "預約成功" } else { "已加入候補" }
    }))))
}

pub async fn admin_cancel_booking(
    auth: AuthContext,
    State(state): State<AppState>,
    Json(payload): Json<AdminCancelBookingRequest>,
) -> Result<impl IntoResponse, AppError> {
    let tenant_id = require_tenant(&auth)?;
    let existing = fetch_booking(&state.db, tenant_id, payload.booking_id).await?;
    let mut tx = state.db.begin().await?;
    sqlx::query(
        "update bookings set booking_status = 'CANCELLED', cancel_reason = $2, cancelled_at = now(), updated_at = now() where id = $1",
    )
    .bind(payload.booking_id)
    .bind(payload.reason)
    .execute(&mut *tx)
    .await?;
    if existing.booking_status.as_deref() == Some("CONFIRMED") {
        increment_session_count(&mut tx, existing.session_id, -1).await?;
    }
    tx.commit().await?;

    Ok((StatusCode::OK, Json(json!({
        "success": true,
        "promoted_booking_id": null,
        "promoted_member_id": null,
        "message": "取消預約成功"
    }))))
}

pub async fn admin_attend(
    auth: AuthContext,
    State(state): State<AppState>,
    Json(payload): Json<AdminAttendRequest>,
) -> Result<impl IntoResponse, AppError> {
    let tenant_id = require_tenant(&auth)?;
    let context = fetch_attend_context(&state.db, tenant_id, payload.booking_id).await?;
    let mut remaining_counts = context.remaining_counts;
    let mut tx = state.db.begin().await?;
    sqlx::query(
        "update bookings set booking_status = 'ATTENDED', attended_at = coalesce(attended_at, now()), updated_at = now() where id = $1",
    )
    .bind(payload.booking_id)
    .execute(&mut *tx)
    .await?;
    if context.plan_type.as_deref() == Some("COUNT_BASED") && context.count_deducted != Some(true) {
        let contract_id = context.contract_id.ok_or_else(|| AppError::Validation("booking has no contract".into()))?;
        let updated = sqlx::query_scalar::<_, Option<i32>>(
            r#"
            update contracts
            set remaining_counts = remaining_counts - 1, updated_at = now()
            where id = $1 and tenant_id = $2 and remaining_counts > 0
            returning remaining_counts
            "#,
        )
        .bind(contract_id)
        .bind(context.contract_tenant_id.unwrap_or(tenant_id))
        .fetch_optional(&mut *tx)
        .await?;
        remaining_counts = updated.flatten();
        sqlx::query("update bookings set count_deducted = true where id = $1")
            .bind(payload.booking_id)
            .execute(&mut *tx)
            .await?;
    }
    tx.commit().await?;

    Ok((StatusCode::OK, Json(json!({
        "success": true,
        "remaining_counts": remaining_counts,
        "message": "簽到成功"
    }))))
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

async fn next_waitlist_position(pool: &PgPool, session_id: Uuid) -> Result<i32, AppError> {
    Ok(sqlx::query_scalar::<_, i32>(
        "select coalesce(max(waitlist_position), 0) + 1 from bookings where session_id = $1 and booking_status = 'WAITLIST'",
    )
    .bind(session_id)
    .fetch_one(pool)
    .await?)
}

async fn fetch_attend_context(pool: &PgPool, tenant_id: Uuid, booking_id: Uuid) -> Result<AttendContext, AppError> {
    sqlx::query_as::<_, AttendContext>(
        r#"
        select
            bookings.contract_id,
            bookings.count_deducted,
            contracts.tenant_id as contract_tenant_id,
            membership_plans.type as plan_type,
            contracts.remaining_counts
        from bookings
        join members on members.id = bookings.member_id
        left join contracts on contracts.id = bookings.contract_id
        left join membership_plans on membership_plans.id = contracts.plan_id
        where bookings.id = $1 and members.tenant_id = $2
        "#,
    )
    .bind(booking_id)
    .bind(tenant_id)
    .fetch_optional(pool)
    .await?
    .ok_or(AppError::NotFound)
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

async fn ensure_schedule_scope(pool: &PgPool, tenant_id: Uuid, schedule_id: Uuid) -> Result<(), AppError> {
    let exists = sqlx::query_scalar::<_, bool>(
        r#"
        select exists(
            select 1
            from class_schedules
            join branches on branches.id = class_schedules.branch_id
            where class_schedules.id = $1 and branches.tenant_id = $2
        )
        "#,
    )
    .bind(schedule_id)
    .bind(tenant_id)
    .fetch_one(pool)
    .await?;
    if !exists {
        return Err(AppError::Validation("scheduleId is invalid for this tenant".into()));
    }
    Ok(())
}

async fn fetch_schedule(pool: &PgPool, tenant_id: Uuid, id: Uuid) -> Result<ClassSchedule, AppError> {
    sqlx::query_as::<_, ClassSchedule>(
        r#"
        select class_schedules.*
        from class_schedules
        join branches on branches.id = class_schedules.branch_id
        where class_schedules.id = $1 and branches.tenant_id = $2
        "#,
    )
    .bind(id)
    .bind(tenant_id)
    .fetch_optional(pool)
    .await?
    .ok_or(AppError::NotFound)
}

async fn fetch_session(pool: &PgPool, tenant_id: Uuid, id: Uuid) -> Result<ClassSession, AppError> {
    sqlx::query_as::<_, ClassSession>(
        r#"
        select class_sessions.*
        from class_sessions
        join branches on branches.id = class_sessions.branch_id
        where class_sessions.id = $1 and branches.tenant_id = $2
        "#,
    )
    .bind(id)
    .bind(tenant_id)
    .fetch_optional(pool)
    .await?
    .ok_or(AppError::NotFound)
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
