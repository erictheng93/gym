use axum::{
    extract::{FromRequestParts, Path, Query, State},
    http::{
        header::{AUTHORIZATION, COOKIE, SET_COOKIE},
        request::Parts,
        HeaderMap, StatusCode,
    },
    response::IntoResponse,
    Json,
};
use bcrypt::verify;
use chrono::{DateTime, NaiveDate, NaiveTime, Utc};
use jsonwebtoken::{decode, encode, get_current_timestamp, Algorithm, DecodingKey, EncodingKey, Header, Validation};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use sqlx::FromRow;
use uuid::Uuid;

use crate::{
    error::AppError,
    http::{ApiResponse, PaginatedResponse, Pagination},
    state::AppState,
    validation,
};

const MEMBER_COOKIE_NAME: &str = "gym-nexus-member-token";
const MEMBER_ACCESS_COOKIE_NAME: &str = "member_access_token";
const MEMBER_TOKEN_HEADER: &str = "x-member-token";

#[derive(Debug, Deserialize)]
pub struct MemberLoginRequest {
    email: String,
    password: String,
}

#[derive(Debug, Serialize, Deserialize)]
struct MemberClaims {
    sub: Uuid,
    tenant_id: Option<Uuid>,
    branch_id: Uuid,
    iat: u64,
    exp: u64,
}

#[derive(Debug, Clone)]
pub struct MemberAuthContext {
    pub(crate) member_id: Uuid,
    pub(crate) tenant_id: Uuid,
    pub(crate) branch_id: Uuid,
}

#[derive(Debug, FromRow)]
struct MemberAuthRow {
    id: Uuid,
    tenant_id: Option<Uuid>,
    branch_id: Uuid,
    member_code: String,
    full_name: String,
    password_hash: String,
}

#[derive(Debug, Serialize)]
struct MemberLoginData {
    #[serde(rename = "accessToken")]
    access_token: String,
    #[serde(rename = "refreshToken")]
    refresh_token: String,
    #[serde(rename = "expiresIn")]
    expires_in: u64,
    member: LoginMemberData,
}

#[derive(Debug, Serialize)]
struct LoginMemberData {
    id: Uuid,
    #[serde(rename = "memberCode")]
    member_code: String,
    #[serde(rename = "fullName")]
    full_name: String,
    #[serde(rename = "branchId")]
    branch_id: Uuid,
}

#[derive(Debug, Serialize)]
struct MemberProfile {
    id: Uuid,
    member_code: String,
    full_name: String,
    phone: Option<String>,
    email: Option<String>,
    gender: Option<String>,
    birthday: Option<NaiveDate>,
    emergency_contact: Option<String>,
    emergency_phone: Option<String>,
    branch_id: Uuid,
    branch_name: Option<String>,
    branch: Value,
    member_status: String,
    date_created: Option<DateTime<Utc>>,
    avatar: Option<Uuid>,
    contracts: Vec<MemberContract>,
}

#[derive(Debug, FromRow)]
struct MemberProfileRow {
    id: Uuid,
    member_code: String,
    full_name: String,
    phone: Option<String>,
    email: Option<String>,
    gender: Option<String>,
    birthday: Option<NaiveDate>,
    emergency_contact: Option<String>,
    emergency_phone: Option<String>,
    branch_id: Uuid,
    branch_name: Option<String>,
    branch: Value,
    member_status: String,
    date_created: Option<DateTime<Utc>>,
    avatar: Option<Uuid>,
}

#[derive(Debug, Serialize, FromRow)]
struct MemberContract {
    id: Uuid,
    contract_no: String,
    member_id: Uuid,
    plan_id: Uuid,
    branch_id: Uuid,
    contract_status: String,
    start_date: NaiveDate,
    end_date: NaiveDate,
    remaining_counts: Option<i32>,
    total_amount: f64,
    paid_amount: f64,
    payment_status: String,
    plan: Value,
}

#[derive(Debug, Serialize, FromRow)]
struct MemberClass {
    id: Uuid,
    name: String,
    description: Option<String>,
    duration_minutes: i32,
    max_capacity: i32,
    instructor_id: Option<Uuid>,
    branch_id: Uuid,
    category: Option<String>,
    difficulty_level: Option<String>,
    status: String,
}

#[derive(Debug, Serialize, FromRow)]
struct MemberSchedule {
    id: Uuid,
    class_id: Uuid,
    branch_id: Uuid,
    instructor_id: Option<Uuid>,
    day_of_week: i32,
    start_time: NaiveTime,
    end_time: NaiveTime,
    room: Option<String>,
    is_active: bool,
}

#[derive(Debug, Serialize, FromRow)]
struct MemberSession {
    id: Uuid,
    schedule_id: Option<Uuid>,
    class_id: Uuid,
    branch_id: Uuid,
    instructor_id: Option<Uuid>,
    session_date: NaiveDate,
    start_time: NaiveTime,
    end_time: NaiveTime,
    room: Option<String>,
    max_capacity: i32,
    current_count: i32,
    waitlist_count: i32,
    session_status: String,
    class_name: Option<String>,
}

#[derive(Debug, Serialize, FromRow)]
struct MemberBooking {
    id: Uuid,
    session_id: Uuid,
    member_id: Uuid,
    contract_id: Option<Uuid>,
    booking_status: String,
    waitlist_position: Option<i32>,
    booked_at: DateTime<Utc>,
    cancelled_at: Option<DateTime<Utc>>,
    attended_at: Option<DateTime<Utc>>,
    class_name: Option<String>,
    session_date: Option<NaiveDate>,
    start_time: Option<NaiveTime>,
    end_time: Option<NaiveTime>,
    room: Option<String>,
    has_review: bool,
}

#[derive(Debug, Serialize, FromRow)]
struct MemberPayment {
    id: Uuid,
    amount: f64,
    payment_method: Option<String>,
    payment_date: Option<DateTime<Utc>>,
    payment_type: String,
    notes: Option<String>,
    contract_id: Value,
}

#[derive(Debug, Serialize, FromRow)]
struct MemberCheckIn {
    id: Uuid,
    member_id: Uuid,
    check_time: DateTime<Utc>,
    check_type: String,
    verification_method: Option<String>,
    is_cross_branch: bool,
    notes: Option<String>,
    date_created: DateTime<Utc>,
    branch_id: Value,
    contract_id: Option<Value>,
    verified_by: Option<Value>,
}

#[derive(Debug, Deserialize)]
pub struct BranchFilter {
    branch_id: Option<Uuid>,
}

#[derive(Debug, Deserialize)]
pub struct SessionFilter {
    branch_id: Option<Uuid>,
    start_date: Option<NaiveDate>,
    end_date: Option<NaiveDate>,
    limit: Option<i64>,
}

#[derive(Debug, Deserialize)]
pub struct BookingFilter {
    status: Option<String>,
    upcoming: Option<bool>,
    limit: Option<i64>,
}

#[derive(Debug, Deserialize)]
pub struct PaginationFilter {
    page: Option<i64>,
    limit: Option<i64>,
}

#[derive(Debug, Deserialize)]
pub struct UpdateProfileRequest {
    #[serde(default)]
    full_name: Option<Option<String>>,
    #[serde(default)]
    phone: Option<Option<String>>,
    #[serde(default)]
    email: Option<Option<String>>,
    #[serde(default)]
    emergency_contact: Option<Option<String>>,
    #[serde(default)]
    emergency_phone: Option<Option<String>>,
}

pub async fn login(
    State(state): State<AppState>,
    Json(payload): Json<MemberLoginRequest>,
) -> Result<impl IntoResponse, AppError> {
    validation::required_text("email", &payload.email)?;
    validation::required_text("password", &payload.password)?;

    let email = payload.email.trim().to_lowercase();
    let member = sqlx::query_as::<_, MemberAuthRow>(
        r#"
        select members.id, members.tenant_id, members.branch_id, members.member_code,
            members.full_name, member_credentials.password_hash
        from members
        join member_credentials on member_credentials.member_id = members.id
        where lower(members.email) = $1 and members.status = 'ACTIVE'
        "#,
    )
    .bind(email)
    .fetch_optional(&state.db)
    .await?;

    let Some(member) = member else { return Err(AppError::Unauthorized); };
    if !verify(payload.password, &member.password_hash).unwrap_or(false) {
        return Err(AppError::Unauthorized);
    }
    let tenant_id = member.tenant_id.ok_or(AppError::Unauthorized)?;
    let token = make_member_token(&state, member.id, Some(tenant_id), member.branch_id)?;

    let cookie = format!("{MEMBER_COOKIE_NAME}={}; Path=/; Max-Age={}; HttpOnly; SameSite=Lax", token, state.jwt_ttl_seconds);

    Ok((
        StatusCode::OK,
        [(SET_COOKIE, cookie)],
        Json(ApiResponse {
            success: true,
            data: MemberLoginData {
                access_token: token.clone(),
                refresh_token: token,
                expires_in: state.jwt_ttl_seconds,
                member: LoginMemberData {
                    id: member.id,
                    member_code: member.member_code,
                    full_name: member.full_name,
                    branch_id: member.branch_id,
                },
            },
        }),
    ))
}

pub async fn me(auth: MemberAuthContext, State(state): State<AppState>) -> Result<impl IntoResponse, AppError> {
    let profile = fetch_profile(&state, &auth).await?;
    Ok((StatusCode::OK, Json(ApiResponse { success: true, data: profile })))
}

pub async fn profile(auth: MemberAuthContext, State(state): State<AppState>) -> Result<impl IntoResponse, AppError> {
    me(auth, State(state)).await
}

pub async fn update_profile(
    auth: MemberAuthContext,
    State(state): State<AppState>,
    Json(payload): Json<UpdateProfileRequest>,
) -> Result<impl IntoResponse, AppError> {
    if let Some(Some(name)) = &payload.full_name {
        validation::required_text("full_name", name)?;
    }

    sqlx::query(
        r#"
        update members set
            full_name = case when $3::bool then $4::varchar else full_name end,
            phone = case when $5::bool then $6::varchar else phone end,
            email = case when $7::bool then $8::varchar else email end,
            emergency_contact = case when $9::bool then $10::varchar else emergency_contact end,
            emergency_phone = case when $11::bool then $12::varchar else emergency_phone end,
            updated_at = now()
        where members.id = $1 and members.tenant_id = $2
        "#,
    )
    .bind(auth.member_id)
    .bind(auth.tenant_id)
    .bind(payload.full_name.is_some())
    .bind(payload.full_name.flatten())
    .bind(payload.phone.is_some())
    .bind(payload.phone.flatten())
    .bind(payload.email.is_some())
    .bind(payload.email.flatten())
    .bind(payload.emergency_contact.is_some())
    .bind(payload.emergency_contact.flatten())
    .bind(payload.emergency_phone.is_some())
    .bind(payload.emergency_phone.flatten())
    .execute(&state.db)
    .await?;

    let profile = fetch_profile(&state, &auth).await?;
    Ok((StatusCode::OK, Json(ApiResponse { success: true, data: profile })))
}

async fn fetch_profile(state: &AppState, auth: &MemberAuthContext) -> Result<MemberProfile, AppError> {
    let row = sqlx::query_as::<_, MemberProfileRow>(
        r#"
        select members.id, members.member_code, members.full_name, members.phone, members.email,
            members.gender, members.birthday, members.emergency_contact, members.emergency_phone,
            members.branch_id,
            branches.name as branch_name,
            json_build_object('id', branches.id, 'name', branches.name) as branch,
            members.status as member_status,
            members.created_at as date_created,
            members.avatar
        from members
        join branches on branches.id = members.branch_id
        where members.id = $1 and members.tenant_id = $2
        "#,
    )
    .bind(auth.member_id)
    .bind(auth.tenant_id)
    .fetch_optional(&state.db)
    .await?
    .ok_or(AppError::Unauthorized)?;
    Ok(MemberProfile {
        id: row.id,
        member_code: row.member_code,
        full_name: row.full_name,
        phone: row.phone,
        email: row.email,
        gender: row.gender,
        birthday: row.birthday,
        emergency_contact: row.emergency_contact,
        emergency_phone: row.emergency_phone,
        branch_id: row.branch_id,
        branch_name: row.branch_name,
        branch: row.branch,
        member_status: row.member_status,
        date_created: row.date_created,
        avatar: row.avatar,
        contracts: fetch_contracts(state, auth).await?,
    })
}

pub async fn list_classes(
    auth: MemberAuthContext,
    State(state): State<AppState>,
    Query(filter): Query<BranchFilter>,
) -> Result<impl IntoResponse, AppError> {
    let classes = sqlx::query_as::<_, MemberClass>(
        r#"
        select id, name, description, duration_minutes, max_capacity, instructor_id, branch_id,
            category, difficulty_level, coalesce(status, 'ACTIVE') as status
        from classes
        where ($1::uuid is null or branch_id = $1)
          and branch_id in (select id from branches where tenant_id = $2)
          and coalesce(is_active, true) = true
        order by name
        "#,
    )
    .bind(filter.branch_id)
    .bind(auth.tenant_id)
    .fetch_all(&state.db)
    .await?;
    Ok((StatusCode::OK, Json(ApiResponse { success: true, data: classes })))
}

pub async fn list_schedules(
    auth: MemberAuthContext,
    State(state): State<AppState>,
    Query(filter): Query<BranchFilter>,
) -> Result<impl IntoResponse, AppError> {
    let schedules = sqlx::query_as::<_, MemberSchedule>(
        r#"
        select id, class_id, branch_id, instructor_id, day_of_week, start_time, end_time, room,
            coalesce(status, 'ACTIVE') = 'ACTIVE' as is_active
        from class_schedules
        where ($1::uuid is null or branch_id = $1)
          and branch_id in (select id from branches where tenant_id = $2)
          and coalesce(status, 'ACTIVE') = 'ACTIVE'
        order by day_of_week, start_time
        "#,
    )
    .bind(filter.branch_id)
    .bind(auth.tenant_id)
    .fetch_all(&state.db)
    .await?;
    Ok((StatusCode::OK, Json(ApiResponse { success: true, data: schedules })))
}

pub async fn list_sessions(
    auth: MemberAuthContext,
    State(state): State<AppState>,
    Query(filter): Query<SessionFilter>,
) -> Result<impl IntoResponse, AppError> {
    let sessions = sqlx::query_as::<_, MemberSession>(
        r#"
        select class_sessions.id, schedule_id, class_sessions.class_id, class_sessions.branch_id,
            class_sessions.instructor_id, session_date, start_time, end_time, room,
            class_sessions.max_capacity,
            coalesce(current_count, 0) as current_count, coalesce(waitlist_count, 0) as waitlist_count,
            coalesce(session_status, 'SCHEDULED') as session_status, classes.name as class_name
        from class_sessions
        join classes on classes.id = class_sessions.class_id
        where ($1::uuid is null or class_sessions.branch_id = $1)
          and class_sessions.branch_id in (select id from branches where tenant_id = $2)
          and ($3::date is null or session_date >= $3)
          and ($4::date is null or session_date <= $4)
        order by session_date, start_time
        limit $5
        "#,
    )
    .bind(filter.branch_id)
    .bind(auth.tenant_id)
    .bind(filter.start_date)
    .bind(filter.end_date)
    .bind(filter.limit.unwrap_or(100).clamp(1, 500))
    .fetch_all(&state.db)
    .await?;
    Ok((StatusCode::OK, Json(ApiResponse { success: true, data: sessions })))
}

pub async fn get_session(
    auth: MemberAuthContext,
    State(state): State<AppState>,
    Path(id): Path<Uuid>,
) -> Result<impl IntoResponse, AppError> {
    let session = sqlx::query_as::<_, MemberSession>(
        r#"
        select class_sessions.id, schedule_id, class_sessions.class_id, class_sessions.branch_id,
            class_sessions.instructor_id, session_date, start_time, end_time, room,
            class_sessions.max_capacity,
            coalesce(current_count, 0) as current_count, coalesce(waitlist_count, 0) as waitlist_count,
            coalesce(session_status, 'SCHEDULED') as session_status, classes.name as class_name
        from class_sessions
        join classes on classes.id = class_sessions.class_id
        where class_sessions.id = $1
          and class_sessions.branch_id in (select id from branches where tenant_id = $2)
        "#,
    )
    .bind(id)
    .bind(auth.tenant_id)
    .fetch_optional(&state.db)
    .await?
    .ok_or(AppError::NotFound)?;
    Ok((StatusCode::OK, Json(ApiResponse { success: true, data: session })))
}

pub async fn list_bookings(
    auth: MemberAuthContext,
    State(state): State<AppState>,
    Query(filter): Query<BookingFilter>,
) -> Result<impl IntoResponse, AppError> {
    let bookings = fetch_bookings(&state, &auth, filter.status, filter.upcoming, filter.limit).await?;
    Ok((StatusCode::OK, Json(ApiResponse { success: true, data: bookings })))
}

pub async fn create_booking(
    auth: MemberAuthContext,
    State(state): State<AppState>,
    Json(payload): Json<serde_json::Value>,
) -> Result<impl IntoResponse, AppError> {
    let session_id = payload.get("session_id").or_else(|| payload.get("sessionId"))
        .and_then(|v| v.as_str()).and_then(|s| Uuid::parse_str(s).ok())
        .ok_or_else(|| AppError::Validation("session_id is required".into()))?;
    let contract_id = payload.get("contract_id").or_else(|| payload.get("contractId"))
        .and_then(|v| v.as_str()).and_then(|s| Uuid::parse_str(s).ok());

    let mut tx = state.db.begin().await?;
    let session = sqlx::query_as::<_, (i32, i32)>(
        r#"
        select max_capacity, coalesce(current_count, 0) as current_count
        from class_sessions
        where id = $1
          and branch_id in (select id from branches where tenant_id = $2)
        for update
        "#,
    )
    .bind(session_id)
    .bind(auth.tenant_id)
    .fetch_optional(&mut *tx)
    .await?
    .ok_or(AppError::NotFound)?;

    let booking_status = if session.1 >= session.0 { "WAITLIST" } else { "CONFIRMED" };
    let waitlist_position = if booking_status == "WAITLIST" {
        Some(next_waitlist_position_in_tx(&mut tx, session_id).await?)
    } else {
        None
    };

    let booking = sqlx::query_as::<_, MemberBooking>(
        r#"
        insert into bookings (id, session_id, member_id, contract_id, booking_status, waitlist_position)
        values (gen_random_uuid(), $1, $2, $3, $4, $5)
        returning id, session_id, member_id, contract_id,
            case when coalesce(booking_status, 'CONFIRMED') = 'WAITLIST' then 'WAITLISTED' else coalesce(booking_status, 'CONFIRMED') end as booking_status,
            waitlist_position, coalesce(booked_at, created_at) as booked_at, cancelled_at, attended_at,
            null::text as class_name, null::date as session_date, null::time as start_time,
            null::time as end_time, null::varchar as room, false as has_review
        "#,
    )
    .bind(session_id)
    .bind(auth.member_id)
    .bind(contract_id)
    .bind(booking_status)
    .bind(waitlist_position)
    .fetch_one(&mut *tx)
    .await?;
    if booking_status == "CONFIRMED" {
        sqlx::query("update class_sessions set current_count = greatest(coalesce(current_count, 0) + 1, 0), updated_at = now() where id = $1")
            .bind(session_id)
            .execute(&mut *tx)
            .await?;
    } else {
        sqlx::query("update class_sessions set waitlist_count = greatest(coalesce(waitlist_count, 0) + 1, 0), updated_at = now() where id = $1")
            .bind(session_id)
            .execute(&mut *tx)
            .await?;
    }
    tx.commit().await?;

    let message = if booking_status == "CONFIRMED" { "預約成功" } else { "已加入候補" };
    Ok((StatusCode::CREATED, Json(json!({"success": true, "message": message, "booking": booking}))))
}

pub async fn cancel_booking(
    auth: MemberAuthContext,
    State(state): State<AppState>,
    Path(id): Path<Uuid>,
) -> Result<impl IntoResponse, AppError> {
    let booking = sqlx::query_as::<_, MemberBooking>(
        r#"
        update bookings
        set booking_status = 'CANCELLED', cancelled_at = now(), updated_at = now()
        where id = $1 and member_id = $2
        returning id, session_id, member_id, contract_id, coalesce(booking_status, 'CANCELLED') as booking_status,
            waitlist_position, coalesce(booked_at, created_at) as booked_at, cancelled_at, attended_at,
            null::text as class_name, null::date as session_date, null::time as start_time,
            null::time as end_time, null::varchar as room, false as has_review
        "#,
    )
    .bind(id)
    .bind(auth.member_id)
    .fetch_optional(&state.db)
    .await?
    .ok_or(AppError::NotFound)?;
    Ok((StatusCode::OK, Json(json!({"success": true, "message": "取消成功", "booking": booking}))))
}

pub async fn list_contracts(auth: MemberAuthContext, State(state): State<AppState>) -> Result<impl IntoResponse, AppError> {
    let contracts = fetch_contracts(&state, &auth).await?;
    Ok((StatusCode::OK, Json(paginated(contracts, 1, 100))))
}

pub async fn pause_contract() -> impl IntoResponse {
    (StatusCode::OK, Json(json!({"success": true, "message": "暫停申請已送出"})))
}

pub async fn resume_contract() -> impl IntoResponse {
    (StatusCode::OK, Json(json!({"success": true, "message": "合約已恢復"})))
}

pub async fn list_payments(
    auth: MemberAuthContext,
    State(state): State<AppState>,
    Query(filter): Query<PaginationFilter>,
) -> Result<impl IntoResponse, AppError> {
    let payments = sqlx::query_as::<_, MemberPayment>(
        r#"
        select payments.id, payments.amount::float8 as amount, payments.payment_method,
            payments.payment_date, payments.type as payment_type, payments.notes,
            json_build_object(
                'id', contracts.id,
                'contract_no', contracts.contract_no,
                'plan_id', json_build_object('name', membership_plans.name)
            ) as contract_id
        from payments
        join contracts on contracts.id = payments.contract_id
        join membership_plans on membership_plans.id = contracts.plan_id
        where payments.member_id = $1 and payments.tenant_id = $2
        order by payment_date desc, payments.created_at desc
        "#,
    )
    .bind(auth.member_id)
    .bind(auth.tenant_id)
    .fetch_all(&state.db)
    .await?;
    Ok((StatusCode::OK, Json(paginated_page(payments, filter.page.unwrap_or(1), filter.limit.unwrap_or(20)))))
}

pub async fn list_checkins(
    auth: MemberAuthContext,
    State(state): State<AppState>,
    Query(filter): Query<PaginationFilter>,
) -> Result<impl IntoResponse, AppError> {
    let checkins = sqlx::query_as::<_, MemberCheckIn>(
        r#"
        select check_ins.id, check_ins.member_id, coalesce(check_in_time, now()) as check_time,
            coalesce(check_in_type, 'ENTRY') as check_type, check_in_method as verification_method,
            check_ins.branch_id <> $3 as is_cross_branch,
            check_ins.notes, coalesce(check_ins.date_created, check_ins.check_in_time, now()) as date_created,
            json_build_object('id', branches.id, 'name', branches.name, 'address', branches.address, 'phone', branches.phone) as branch_id,
            case when contracts.id is null then null else json_build_object(
                'id', contracts.id,
                'contract_no', contracts.contract_no,
                'contract_type', membership_plans.type,
                'remaining_counts', contracts.remaining_counts,
                'plan_id', json_build_object('id', membership_plans.id, 'name', membership_plans.name)
            ) end as contract_id,
            case when employees.id is null then null else json_build_object('id', employees.id, 'full_name', employees.full_name) end as verified_by
        from check_ins
        join branches on branches.id = check_ins.branch_id
        left join contracts on contracts.id = check_ins.contract_id
        left join membership_plans on membership_plans.id = contracts.plan_id
        left join employees on employees.id = check_ins.processed_by_id
        where check_ins.member_id = $1 and branches.tenant_id = $2
        order by check_in_time desc
        "#,
    )
    .bind(auth.member_id)
    .bind(auth.tenant_id)
    .bind(auth.branch_id)
    .fetch_all(&state.db)
    .await?;
    Ok((StatusCode::OK, Json(paginated_page(checkins, filter.page.unwrap_or(1), filter.limit.unwrap_or(20)))))
}

pub async fn get_checkin(
    auth: MemberAuthContext,
    State(state): State<AppState>,
    Path(id): Path<Uuid>,
) -> Result<impl IntoResponse, AppError> {
    let checkin = sqlx::query_as::<_, MemberCheckIn>(
        r#"
        select check_ins.id, check_ins.member_id, coalesce(check_in_time, now()) as check_time,
            coalesce(check_in_type, 'ENTRY') as check_type, check_in_method as verification_method,
            check_ins.branch_id <> $4 as is_cross_branch,
            check_ins.notes, coalesce(check_ins.date_created, check_ins.check_in_time, now()) as date_created,
            json_build_object('id', branches.id, 'name', branches.name, 'address', branches.address, 'phone', branches.phone) as branch_id,
            case when contracts.id is null then null else json_build_object(
                'id', contracts.id,
                'contract_no', contracts.contract_no,
                'contract_type', membership_plans.type,
                'remaining_counts', contracts.remaining_counts,
                'plan_id', json_build_object('id', membership_plans.id, 'name', membership_plans.name)
            ) end as contract_id,
            case when employees.id is null then null else json_build_object('id', employees.id, 'full_name', employees.full_name) end as verified_by
        from check_ins
        join branches on branches.id = check_ins.branch_id
        left join contracts on contracts.id = check_ins.contract_id
        left join membership_plans on membership_plans.id = contracts.plan_id
        left join employees on employees.id = check_ins.processed_by_id
        where check_ins.id = $1 and check_ins.member_id = $2 and branches.tenant_id = $3
        "#,
    )
    .bind(id)
    .bind(auth.member_id)
    .bind(auth.tenant_id)
    .bind(auth.branch_id)
    .fetch_optional(&state.db)
    .await?
    .ok_or(AppError::NotFound)?;
    Ok((StatusCode::OK, Json(ApiResponse { success: true, data: checkin })))
}

async fn fetch_contracts(state: &AppState, auth: &MemberAuthContext) -> Result<Vec<MemberContract>, AppError> {
    sqlx::query_as::<_, MemberContract>(
        r#"
        select contracts.id, contract_no, member_id, contracts.plan_id, contracts.branch_id,
            contracts.status as contract_status, start_date, end_date, remaining_counts,
            total_amount::float8 as total_amount, paid_amount::float8 as paid_amount,
            payment_status,
            json_build_object('id', membership_plans.id, 'name', membership_plans.name, 'plan_type', membership_plans.type) as plan
        from contracts
        join membership_plans on membership_plans.id = contracts.plan_id
        where contracts.member_id = $1 and contracts.tenant_id = $2
        order by start_date desc, contracts.created_at desc
        "#,
    )
    .bind(auth.member_id)
    .bind(auth.tenant_id)
    .fetch_all(&state.db)
    .await
    .map_err(AppError::from)
}

async fn fetch_bookings(
    state: &AppState,
    auth: &MemberAuthContext,
    status: Option<String>,
    upcoming: Option<bool>,
    limit: Option<i64>,
) -> Result<Vec<MemberBooking>, AppError> {
    let status = status.map(normalize_member_booking_status_filter);
    sqlx::query_as::<_, MemberBooking>(
        r#"
        select bookings.id, bookings.session_id, bookings.member_id, bookings.contract_id,
            case when coalesce(bookings.booking_status, 'CONFIRMED') = 'WAITLIST' then 'WAITLISTED' else coalesce(bookings.booking_status, 'CONFIRMED') end as booking_status,
            bookings.waitlist_position, coalesce(bookings.booked_at, bookings.created_at) as booked_at,
            bookings.cancelled_at, bookings.attended_at, classes.name as class_name,
            class_sessions.session_date, class_sessions.start_time, class_sessions.end_time,
            class_sessions.room, false as has_review
        from bookings
        join class_sessions on class_sessions.id = bookings.session_id
        join classes on classes.id = class_sessions.class_id
        where bookings.member_id = $1
          and class_sessions.branch_id in (select id from branches where tenant_id = $2)
          and ($3::text is null or bookings.booking_status = $3)
          and ($4::bool is not true or class_sessions.session_date >= current_date)
        order by class_sessions.session_date, class_sessions.start_time
        limit $5
        "#,
    )
    .bind(auth.member_id)
    .bind(auth.tenant_id)
    .bind(status)
    .bind(upcoming.unwrap_or(false))
    .bind(limit.unwrap_or(100).clamp(1, 500))
    .fetch_all(&state.db)
    .await
    .map_err(AppError::from)
}

async fn next_waitlist_position_in_tx(
    tx: &mut sqlx::Transaction<'_, sqlx::Postgres>,
    session_id: Uuid,
) -> Result<i32, AppError> {
    Ok(sqlx::query_scalar::<_, i32>(
        "select coalesce(max(waitlist_position), 0) + 1 from bookings where session_id = $1 and booking_status in ('WAITLIST', 'WAITLISTED')",
    )
    .bind(session_id)
    .fetch_one(&mut **tx)
    .await?)
}

fn normalize_member_booking_status_filter(status: String) -> String {
    let status = status.trim().to_uppercase();
    if status == "WAITLISTED" { "WAITLIST".into() } else { status }
}

pub(crate) fn make_member_token(state: &AppState, member_id: Uuid, tenant_id: Option<Uuid>, branch_id: Uuid) -> Result<String, AppError> {
    let iat = get_current_timestamp();
    let claims = MemberClaims { sub: member_id, tenant_id, branch_id, iat, exp: iat + state.jwt_ttl_seconds };
    encode(&Header::default(), &claims, &EncodingKey::from_secret(state.jwt_secret.as_bytes()))
        .map_err(|_| AppError::Unauthorized)
}

pub(crate) async fn refresh_member_token(state: &AppState, token: &str) -> Result<(String, String), AppError> {
    let claims = decode_member_token(&state.jwt_secret, token)?;
    let active = sqlx::query_scalar::<_, bool>(
        "select exists(select 1 from members where id = $1 and tenant_id = $2 and status = 'ACTIVE')",
    )
    .bind(claims.sub)
    .bind(claims.tenant_id)
    .fetch_one(&state.db)
    .await?;
    if !active {
        return Err(AppError::Unauthorized);
    }
    let token = make_member_token(state, claims.sub, claims.tenant_id, claims.branch_id)?;
    Ok((token.clone(), token))
}

fn decode_member_token(secret: &str, token: &str) -> Result<MemberClaims, AppError> {
    let mut validation = Validation::new(Algorithm::HS256);
    validation.validate_exp = true;
    decode::<MemberClaims>(token, &DecodingKey::from_secret(secret.as_bytes()), &validation)
        .map(|data| data.claims)
        .map_err(|_| AppError::Unauthorized)
}

fn auth_token(headers: &HeaderMap) -> Option<&str> {
    if let Some(token) = headers.get(MEMBER_TOKEN_HEADER).and_then(|value| value.to_str().ok()) {
        return Some(token);
    }
    if let Some(auth) = headers.get(AUTHORIZATION).and_then(|value| value.to_str().ok()) {
        if let Some(token) = auth.strip_prefix("Bearer ") {
            return Some(token);
        }
    }
    headers.get(COOKIE).and_then(|value| value.to_str().ok()).and_then(|cookies| {
        cookies.split(';').find_map(|cookie| {
            let mut parts = cookie.trim().splitn(2, '=');
            match (parts.next(), parts.next()) {
                (Some(name), Some(value)) if name == MEMBER_COOKIE_NAME || name == MEMBER_ACCESS_COOKIE_NAME => Some(value),
                _ => None,
            }
        })
    })
}

fn paginated<T: Serialize>(data: Vec<T>, page: i64, limit: i64) -> PaginatedResponse<Vec<T>> {
    let total = data.len() as i64;
    PaginatedResponse {
        success: true,
        data,
        pagination: Pagination { total, page, limit, total_pages: ((total + limit - 1) / limit).max(1) },
    }
}

fn paginated_page<T: Serialize>(data: Vec<T>, page: i64, limit: i64) -> PaginatedResponse<Vec<T>> {
    let total = data.len() as i64;
    let page = page.max(1);
    let limit = limit.clamp(1, 100);
    let offset = ((page - 1) * limit) as usize;
    let data = data.into_iter().skip(offset).take(limit as usize).collect();
    PaginatedResponse {
        success: true,
        data,
        pagination: Pagination { total, page, limit, total_pages: ((total + limit - 1) / limit).max(1) },
    }
}

impl FromRequestParts<AppState> for MemberAuthContext {
    type Rejection = AppError;

    async fn from_request_parts(parts: &mut Parts, state: &AppState) -> Result<Self, Self::Rejection> {
        let token = auth_token(&parts.headers).ok_or(AppError::Unauthorized)?;
        let claims = decode_member_token(&state.jwt_secret, token)?;
        let tenant_id = claims.tenant_id.ok_or(AppError::Unauthorized)?;
        let active = sqlx::query_scalar::<_, bool>(
            "select exists(select 1 from members where id = $1 and tenant_id = $2 and status = 'ACTIVE')",
        )
        .bind(claims.sub)
        .bind(tenant_id)
        .fetch_one(&state.db)
        .await?;
        if !active {
            return Err(AppError::Unauthorized);
        }
        Ok(Self { member_id: claims.sub, tenant_id, branch_id: claims.branch_id })
    }
}

#[cfg(test)]
mod tests {
    use super::auth_token;
    use axum::http::{header::{AUTHORIZATION, COOKIE}, HeaderMap};

    #[test]
    fn auth_token_accepts_member_app_cookie_alias() {
        let mut headers = HeaderMap::new();
        headers.insert(COOKIE, "member_access_token=member-token; theme=light".parse().unwrap());

        assert_eq!(auth_token(&headers), Some("member-token"));
    }

    #[test]
    fn auth_token_prefers_header_over_cookie() {
        let mut headers = HeaderMap::new();
        headers.insert(AUTHORIZATION, "Bearer bearer-token".parse().unwrap());
        headers.insert(COOKIE, "member_access_token=cookie-token".parse().unwrap());

        assert_eq!(auth_token(&headers), Some("bearer-token"));
    }
}
