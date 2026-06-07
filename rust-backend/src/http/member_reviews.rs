use axum::{
    extract::{Path, Query, State},
    http::StatusCode,
    response::IntoResponse,
    Json,
};
use chrono::{DateTime, NaiveDate, Utc};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use sqlx::FromRow;
use uuid::Uuid;

use crate::{error::AppError, http::member_app::MemberAuthContext, state::AppState};

#[derive(Debug, Serialize)]
struct DataResponse<T> {
    success: bool,
    data: T,
}

#[derive(Debug, Serialize)]
struct MutationResponse {
    success: bool,
    message: &'static str,
    #[serde(skip_serializing_if = "Option::is_none")]
    review_id: Option<Uuid>,
}

#[derive(Debug, Deserialize)]
pub struct ReviewPage {
    limit: Option<i64>,
    offset: Option<i64>,
    page: Option<i64>,
}

#[derive(Debug, Deserialize)]
pub struct SubmitReviewRequest {
    #[serde(alias = "bookingId")]
    booking_id: Uuid,
    rating: i32,
    comment: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct UpdateReviewRequest {
    rating: i32,
    comment: Option<String>,
}

#[derive(Debug, Serialize, FromRow)]
pub struct ReviewRow {
    id: Uuid,
    booking_id: Uuid,
    rating: i32,
    comment: Option<String>,
    session_date: NaiveDate,
    reviewed_at: DateTime<Utc>,
    member_name: Option<String>,
    member_display_name: Option<String>,
    instructor_name: Option<String>,
    class_name: Option<String>,
    class_category: Option<String>,
}

#[derive(Debug, FromRow)]
struct BookingForReview {
    booking_id: Uuid,
    class_id: Uuid,
    session_id: Uuid,
    instructor_id: Option<Uuid>,
    tenant_id: Option<Uuid>,
    session_date: NaiveDate,
}

#[derive(Debug, FromRow)]
struct RatingCounts {
    total_reviews: i64,
    avg_rating: Option<f64>,
    rating_5: i64,
    rating_4: i64,
    rating_3: i64,
    rating_2: i64,
    rating_1: i64,
}

pub async fn eligibility(
    auth: MemberAuthContext,
    State(state): State<AppState>,
    Path(booking_id): Path<Uuid>,
) -> Result<impl IntoResponse, AppError> {
    let booking = fetch_booking_for_review(&state, auth.member_id, booking_id).await?;
    let existing_review = sqlx::query_as::<_, ReviewRow>(REVIEW_SELECT_BY_BOOKING)
        .bind(booking_id)
        .bind(auth.member_id)
        .fetch_optional(&state.db)
        .await?;
    let can_review = existing_review.is_none();
    let reason = if can_review { "可評價" } else { "此預約已評價" };
    let today = Utc::now().date_naive();
    let days_since_session = (today - booking.session_date).num_days();

    Ok((StatusCode::OK, Json(DataResponse {
        success: true,
        data: json!({
            "can_review": can_review,
            "eligible": can_review,
            "reason": reason,
            "days_since_session": days_since_session,
            "existing_review": existing_review
        }),
    })))
}

pub async fn submit_review(
    auth: MemberAuthContext,
    State(state): State<AppState>,
    Json(payload): Json<SubmitReviewRequest>,
) -> Result<impl IntoResponse, AppError> {
    validate_rating(payload.rating)?;
    let booking = fetch_booking_for_review(&state, auth.member_id, payload.booking_id).await?;
    if let Some(existing) = sqlx::query_scalar::<_, Uuid>(
        "select id from class_reviews where booking_id = $1 and member_id = $2",
    )
    .bind(booking.booking_id)
    .bind(auth.member_id)
    .fetch_optional(&state.db)
    .await?
    {
        return Ok((StatusCode::OK, Json(MutationResponse {
            success: true,
            message: "此預約已評價",
            review_id: Some(existing),
        })));
    }

    let id = sqlx::query_scalar::<_, Uuid>(
        r#"
        insert into class_reviews (
            id, member_id, class_id, session_id, booking_id, coach_id,
            rating, comment, is_anonymous, is_public, status, tenant_id
        ) values (
            gen_random_uuid(), $1, $2, $3, $4, $5,
            $6, $7, false, true, 'published', $8
        )
        returning id
        "#,
    )
    .bind(auth.member_id)
    .bind(booking.class_id)
    .bind(booking.session_id)
    .bind(booking.booking_id)
    .bind(booking.instructor_id)
    .bind(payload.rating)
    .bind(payload.comment)
    .bind(booking.tenant_id.unwrap_or(auth.tenant_id))
    .fetch_one(&state.db)
    .await?;

    Ok((StatusCode::CREATED, Json(MutationResponse { success: true, message: "評價已提交", review_id: Some(id) })))
}

pub async fn update_review(
    auth: MemberAuthContext,
    State(state): State<AppState>,
    Path(review_id): Path<Uuid>,
    Json(payload): Json<UpdateReviewRequest>,
) -> Result<impl IntoResponse, AppError> {
    validate_rating(payload.rating)?;
    let id = sqlx::query_scalar::<_, Uuid>(
        r#"
        update class_reviews set rating = $3, comment = $4, updated_at = now()
        where id = $1 and member_id = $2
        returning id
        "#,
    )
    .bind(review_id)
    .bind(auth.member_id)
    .bind(payload.rating)
    .bind(payload.comment)
    .fetch_optional(&state.db)
    .await?
    .ok_or(AppError::NotFound)?;

    Ok((StatusCode::OK, Json(MutationResponse { success: true, message: "評價已更新", review_id: Some(id) })))
}

pub async fn delete_review(
    auth: MemberAuthContext,
    State(state): State<AppState>,
    Path(review_id): Path<Uuid>,
) -> Result<impl IntoResponse, AppError> {
    let affected = sqlx::query("delete from class_reviews where id = $1 and member_id = $2")
        .bind(review_id)
        .bind(auth.member_id)
        .execute(&state.db)
        .await?
        .rows_affected();
    if affected == 0 {
        return Err(AppError::NotFound);
    }
    Ok((StatusCode::OK, Json(MutationResponse { success: true, message: "評價已刪除", review_id: Some(review_id) })))
}

pub async fn class_reviews(
    State(state): State<AppState>,
    Path(class_id): Path<Uuid>,
    Query(page): Query<ReviewPage>,
) -> Result<impl IntoResponse, AppError> {
    let limit = page.limit.unwrap_or(10).clamp(1, 100);
    let offset = page.offset.unwrap_or_else(|| page.page.map(|value| (value.max(1) - 1) * limit).unwrap_or(0)).max(0);
    let reviews = sqlx::query_as::<_, ReviewRow>(REVIEW_SELECT_BY_CLASS)
        .bind(class_id)
        .bind(limit)
        .bind(offset)
        .fetch_all(&state.db)
        .await?;
    let counts = rating_counts(&state, class_id).await?;
    Ok((StatusCode::OK, Json(DataResponse {
        success: true,
        data: json!({
            "reviews": reviews,
            "summary": summary(counts)
        }),
    })))
}

pub async fn my_reviews(
    auth: MemberAuthContext,
    State(state): State<AppState>,
    Query(page): Query<ReviewPage>,
) -> Result<impl IntoResponse, AppError> {
    let limit = page.limit.unwrap_or(20).clamp(1, 100);
    let offset = page.offset.unwrap_or_else(|| page.page.map(|value| (value.max(1) - 1) * limit).unwrap_or(0)).max(0);
    let reviews = sqlx::query_as::<_, ReviewRow>(REVIEW_SELECT_BY_MEMBER)
        .bind(auth.member_id)
        .bind(limit)
        .bind(offset)
        .fetch_all(&state.db)
        .await?;
    Ok((StatusCode::OK, Json(DataResponse { success: true, data: reviews })))
}

async fn fetch_booking_for_review(
    state: &AppState,
    member_id: Uuid,
    booking_id: Uuid,
) -> Result<BookingForReview, AppError> {
    sqlx::query_as::<_, BookingForReview>(
        r#"
        select
            bookings.id as booking_id,
            class_sessions.class_id,
            class_sessions.id as session_id,
            class_sessions.instructor_id,
            branches.tenant_id,
            class_sessions.session_date
        from bookings
        join class_sessions on class_sessions.id = bookings.session_id
        join branches on branches.id = class_sessions.branch_id
        where bookings.id = $1 and bookings.member_id = $2
        "#,
    )
    .bind(booking_id)
    .bind(member_id)
    .fetch_optional(&state.db)
    .await?
    .ok_or(AppError::NotFound)
}

async fn rating_counts(state: &AppState, class_id: Uuid) -> Result<RatingCounts, AppError> {
    sqlx::query_as::<_, RatingCounts>(
        r#"
        select
            count(*)::bigint as total_reviews,
            avg(rating)::float8 as avg_rating,
            count(*) filter (where rating = 5)::bigint as rating_5,
            count(*) filter (where rating = 4)::bigint as rating_4,
            count(*) filter (where rating = 3)::bigint as rating_3,
            count(*) filter (where rating = 2)::bigint as rating_2,
            count(*) filter (where rating = 1)::bigint as rating_1
        from class_reviews
        where class_id = $1 and coalesce(is_public, true) = true and lower(coalesce(status, 'published')) = 'published'
        "#,
    )
    .bind(class_id)
    .fetch_one(&state.db)
    .await
    .map_err(AppError::from)
}

fn summary(counts: RatingCounts) -> Value {
    json!({
        "total_reviews": counts.total_reviews,
        "avg_rating": counts.avg_rating.unwrap_or(0.0),
        "rating_distribution": {
            "5": counts.rating_5,
            "4": counts.rating_4,
            "3": counts.rating_3,
            "2": counts.rating_2,
            "1": counts.rating_1
        }
    })
}

fn validate_rating(rating: i32) -> Result<(), AppError> {
    if !(1..=5).contains(&rating) {
        return Err(AppError::Validation("rating must be between 1 and 5".into()));
    }
    Ok(())
}

const REVIEW_SELECT_BY_BOOKING: &str = r#"
select
class_reviews.id,
class_reviews.booking_id,
class_reviews.rating,
class_reviews.comment,
class_sessions.session_date,
coalesce(class_reviews.updated_at, class_reviews.created_at) as reviewed_at,
members.full_name as member_name,
members.full_name as member_display_name,
employees.full_name as instructor_name,
classes.name as class_name,
classes.category as class_category
from class_reviews
join bookings on bookings.id = class_reviews.booking_id
join class_sessions on class_sessions.id = class_reviews.session_id
join classes on classes.id = class_reviews.class_id
join members on members.id = class_reviews.member_id
left join employees on employees.id = class_reviews.coach_id
where class_reviews.booking_id = $1 and class_reviews.member_id = $2
"#;

const REVIEW_SELECT_BY_CLASS: &str = r#"
select
class_reviews.id,
class_reviews.booking_id,
class_reviews.rating,
class_reviews.comment,
class_sessions.session_date,
coalesce(class_reviews.updated_at, class_reviews.created_at) as reviewed_at,
members.full_name as member_name,
case
    when length(members.full_name) <= 1 then members.full_name
    else concat(substr(members.full_name, 1, 1), '***')
end as member_display_name,
employees.full_name as instructor_name,
classes.name as class_name,
classes.category as class_category
from class_reviews
join bookings on bookings.id = class_reviews.booking_id
join class_sessions on class_sessions.id = class_reviews.session_id
join classes on classes.id = class_reviews.class_id
join members on members.id = class_reviews.member_id
left join employees on employees.id = class_reviews.coach_id
where class_reviews.class_id = $1
  and coalesce(class_reviews.is_public, true) = true
  and lower(coalesce(class_reviews.status, 'published')) = 'published'
order by class_reviews.created_at desc
limit $2 offset $3
"#;

const REVIEW_SELECT_BY_MEMBER: &str = r#"
select
class_reviews.id,
class_reviews.booking_id,
class_reviews.rating,
class_reviews.comment,
class_sessions.session_date,
coalesce(class_reviews.updated_at, class_reviews.created_at) as reviewed_at,
members.full_name as member_name,
members.full_name as member_display_name,
employees.full_name as instructor_name,
classes.name as class_name,
classes.category as class_category
from class_reviews
join bookings on bookings.id = class_reviews.booking_id
join class_sessions on class_sessions.id = class_reviews.session_id
join classes on classes.id = class_reviews.class_id
join members on members.id = class_reviews.member_id
left join employees on employees.id = class_reviews.coach_id
where class_reviews.member_id = $1
order by class_reviews.created_at desc
limit $2 offset $3
"#;
