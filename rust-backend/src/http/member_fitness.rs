use axum::{
    extract::{Path, Query, State},
    http::StatusCode,
    response::IntoResponse,
    Json,
};
use chrono::{DateTime, Duration, NaiveDate, Utc};
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
struct ListResponse<T> {
    success: bool,
    data: Vec<T>,
    #[serde(skip_serializing_if = "Option::is_none")]
    total: Option<i64>,
}

#[derive(Debug, Serialize)]
struct MutationResponse<T> {
    success: bool,
    message: &'static str,
    #[serde(skip_serializing_if = "Option::is_none")]
    data: Option<T>,
}

#[derive(Debug, Deserialize)]
pub struct GoalFilter {
    status: Option<String>,
    limit: Option<i64>,
    offset: Option<i64>,
}

#[derive(Debug, Deserialize)]
pub struct DateFilter {
    start_date: Option<NaiveDate>,
    end_date: Option<NaiveDate>,
    limit: Option<i64>,
    offset: Option<i64>,
}

#[derive(Debug, Deserialize)]
pub struct PeriodFilter {
    period: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct CreateGoalRequest {
    goal_type: String,
    target_value: Value,
    current_value: Option<Value>,
    start_date: Option<NaiveDate>,
    target_date: Option<NaiveDate>,
    notes: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct UpdateGoalRequest {
    target_value: Option<Value>,
    current_value: Option<Value>,
    target_date: Option<NaiveDate>,
    status: Option<String>,
    notes: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct WorkoutRequest {
    date: Option<NaiveDate>,
    duration: Option<i32>,
    calories: Option<i32>,
    exercises: Option<Value>,
    notes: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct MeasurementRequest {
    date: Option<NaiveDate>,
    weight: Option<f32>,
    body_fat: Option<f32>,
    muscle_mass: Option<f32>,
    bmi: Option<f32>,
    source: Option<String>,
    raw_data: Option<Value>,
}

#[derive(Debug, Serialize, FromRow)]
pub struct GoalRow {
    id: Uuid,
    member_id: Uuid,
    goal_type: String,
    target_value: Value,
    current_value: Option<Value>,
    start_date: NaiveDate,
    target_date: Option<NaiveDate>,
    status: String,
    notes: Option<String>,
    created_at: DateTime<Utc>,
    updated_at: DateTime<Utc>,
}

#[derive(Debug, Serialize, FromRow)]
pub struct WorkoutRow {
    id: Uuid,
    member_id: Uuid,
    date: NaiveDate,
    duration: Option<i32>,
    calories: Option<i32>,
    exercises: Option<Value>,
    notes: Option<String>,
    created_at: DateTime<Utc>,
}

#[derive(Debug, Serialize, FromRow, Clone)]
pub struct MeasurementRow {
    id: Uuid,
    member_id: Uuid,
    date: NaiveDate,
    weight: Option<f32>,
    body_fat: Option<f32>,
    muscle_mass: Option<f32>,
    bmi: Option<f32>,
    source: String,
    raw_data: Option<Value>,
    created_at: DateTime<Utc>,
}

#[derive(Debug, Serialize, FromRow)]
struct WorkoutDailyRow {
    date: NaiveDate,
    duration: i64,
    calories: i64,
    count: i64,
}

#[derive(Debug, Serialize)]
struct TrendData {
    first: Option<f32>,
    last: Option<f32>,
    change: Option<f32>,
    trend: Option<&'static str>,
}

pub async fn list_goals(
    auth: MemberAuthContext,
    State(state): State<AppState>,
    Query(filter): Query<GoalFilter>,
) -> Result<impl IntoResponse, AppError> {
    let rows = sqlx::query_as::<_, GoalRow>(
        r#"
        select id, member_id, goal_type, target_value, current_value, start_date, target_date,
            coalesce(status, 'IN_PROGRESS') as status, notes, created_at,
            coalesce(updated_at, created_at) as updated_at
        from member_goals
        where member_id = $1 and ($2::text is null or status = $2)
        order by created_at desc
        limit $3 offset $4
        "#,
    )
    .bind(auth.member_id)
    .bind(filter.status)
    .bind(filter.limit.unwrap_or(50).clamp(1, 100))
    .bind(filter.offset.unwrap_or(0).max(0))
    .fetch_all(&state.db)
    .await?;

    Ok((StatusCode::OK, Json(ListResponse { success: true, data: rows, total: None })))
}

pub async fn get_goal(
    auth: MemberAuthContext,
    State(state): State<AppState>,
    Path(id): Path<Uuid>,
) -> Result<impl IntoResponse, AppError> {
    let row = fetch_goal(&state, auth.member_id, id).await?;
    Ok((StatusCode::OK, Json(DataResponse { success: true, data: row })))
}

pub async fn create_goal(
    auth: MemberAuthContext,
    State(state): State<AppState>,
    Json(payload): Json<CreateGoalRequest>,
) -> Result<impl IntoResponse, AppError> {
    let id = sqlx::query_scalar::<_, Uuid>(
        r#"
        insert into member_goals (
            id, member_id, goal_type, target_value, current_value, start_date,
            target_date, status, notes, updated_at
        ) values (
            gen_random_uuid(), $1, $2, $3::jsonb, $4::jsonb, coalesce($5, current_date),
            $6, 'IN_PROGRESS', $7, now()
        ) returning id
        "#,
    )
    .bind(auth.member_id)
    .bind(payload.goal_type)
    .bind(payload.target_value.to_string())
    .bind(payload.current_value.map(|value| value.to_string()))
    .bind(payload.start_date)
    .bind(payload.target_date)
    .bind(payload.notes)
    .fetch_one(&state.db)
    .await?;
    let row = fetch_goal(&state, auth.member_id, id).await?;
    Ok((StatusCode::CREATED, Json(MutationResponse { success: true, message: "目標已建立", data: Some(row) })))
}

pub async fn update_goal(
    auth: MemberAuthContext,
    State(state): State<AppState>,
    Path(id): Path<Uuid>,
    Json(payload): Json<UpdateGoalRequest>,
) -> Result<impl IntoResponse, AppError> {
    let updated_id = sqlx::query_scalar::<_, Uuid>(
        r#"
        update member_goals set
            target_value = coalesce($3::jsonb, target_value),
            current_value = coalesce($4::jsonb, current_value),
            target_date = coalesce($5, target_date),
            status = coalesce($6, status),
            notes = coalesce($7, notes),
            updated_at = now()
        where id = $1 and member_id = $2
        returning id
        "#,
    )
    .bind(id)
    .bind(auth.member_id)
    .bind(payload.target_value.map(|value| value.to_string()))
    .bind(payload.current_value.map(|value| value.to_string()))
    .bind(payload.target_date)
    .bind(payload.status)
    .bind(payload.notes)
    .fetch_optional(&state.db)
    .await?
    .ok_or(AppError::NotFound)?;
    let row = fetch_goal(&state, auth.member_id, updated_id).await?;
    Ok((StatusCode::OK, Json(MutationResponse { success: true, message: "目標已更新", data: Some(row) })))
}

pub async fn delete_goal(
    auth: MemberAuthContext,
    State(state): State<AppState>,
    Path(id): Path<Uuid>,
) -> Result<impl IntoResponse, AppError> {
    delete_owned(&state, "member_goals", auth.member_id, id).await?;
    Ok((StatusCode::OK, Json(MutationResponse::<Value> { success: true, message: "目標已刪除", data: None })))
}

pub async fn list_workouts(
    auth: MemberAuthContext,
    State(state): State<AppState>,
    Query(filter): Query<DateFilter>,
) -> Result<impl IntoResponse, AppError> {
    let rows = sqlx::query_as::<_, WorkoutRow>(WORKOUT_SELECT)
        .bind(auth.member_id)
        .bind(filter.start_date)
        .bind(filter.end_date)
        .bind(filter.limit.unwrap_or(50).clamp(1, 100))
        .bind(filter.offset.unwrap_or(0).max(0))
        .fetch_all(&state.db)
        .await?;
    let total = rows.len() as i64;
    Ok((StatusCode::OK, Json(ListResponse { success: true, data: rows, total: Some(total) })))
}

pub async fn get_workout(
    auth: MemberAuthContext,
    State(state): State<AppState>,
    Path(id): Path<Uuid>,
) -> Result<impl IntoResponse, AppError> {
    let row = fetch_workout(&state, auth.member_id, id).await?;
    Ok((StatusCode::OK, Json(DataResponse { success: true, data: row })))
}

pub async fn create_workout(
    auth: MemberAuthContext,
    State(state): State<AppState>,
    Json(payload): Json<WorkoutRequest>,
) -> Result<impl IntoResponse, AppError> {
    let id = sqlx::query_scalar::<_, Uuid>(
        r#"
        insert into workout_logs (id, member_id, date, duration, calories, exercises, notes)
        values (gen_random_uuid(), $1, coalesce($2, current_date), $3, $4, $5::jsonb, $6)
        returning id
        "#,
    )
    .bind(auth.member_id)
    .bind(payload.date)
    .bind(payload.duration)
    .bind(payload.calories)
    .bind(payload.exercises.map(|value| value.to_string()))
    .bind(payload.notes)
    .fetch_one(&state.db)
    .await?;
    let row = fetch_workout(&state, auth.member_id, id).await?;
    Ok((StatusCode::CREATED, Json(MutationResponse { success: true, message: "運動紀錄已建立", data: Some(row) })))
}

pub async fn update_workout(
    auth: MemberAuthContext,
    State(state): State<AppState>,
    Path(id): Path<Uuid>,
    Json(payload): Json<WorkoutRequest>,
) -> Result<impl IntoResponse, AppError> {
    let updated_id = sqlx::query_scalar::<_, Uuid>(
        r#"
        update workout_logs set
            date = coalesce($3, date),
            duration = coalesce($4, duration),
            calories = coalesce($5, calories),
            exercises = coalesce($6::jsonb, exercises),
            notes = coalesce($7, notes)
        where id = $1 and member_id = $2
        returning id
        "#,
    )
    .bind(id)
    .bind(auth.member_id)
    .bind(payload.date)
    .bind(payload.duration)
    .bind(payload.calories)
    .bind(payload.exercises.map(|value| value.to_string()))
    .bind(payload.notes)
    .fetch_optional(&state.db)
    .await?
    .ok_or(AppError::NotFound)?;
    let row = fetch_workout(&state, auth.member_id, updated_id).await?;
    Ok((StatusCode::OK, Json(MutationResponse { success: true, message: "運動紀錄已更新", data: Some(row) })))
}

pub async fn delete_workout(
    auth: MemberAuthContext,
    State(state): State<AppState>,
    Path(id): Path<Uuid>,
) -> Result<impl IntoResponse, AppError> {
    delete_owned(&state, "workout_logs", auth.member_id, id).await?;
    Ok((StatusCode::OK, Json(MutationResponse::<Value> { success: true, message: "運動紀錄已刪除", data: None })))
}

pub async fn workout_stats(
    auth: MemberAuthContext,
    State(state): State<AppState>,
    Query(filter): Query<PeriodFilter>,
) -> Result<impl IntoResponse, AppError> {
    let period = filter.period.unwrap_or_else(|| "week".into());
    let days = match period.as_str() {
        "year" => 365,
        "month" => 30,
        _ => 7,
    };
    let since = Utc::now().date_naive() - Duration::days(days - 1);
    let rows = sqlx::query_as::<_, WorkoutDailyRow>(
        r#"
        select date, coalesce(sum(duration), 0)::bigint as duration,
            coalesce(sum(calories), 0)::bigint as calories, count(*)::bigint as count
        from workout_logs
        where member_id = $1 and date >= $2
        group by date
        order by date
        "#,
    )
    .bind(auth.member_id)
    .bind(since)
    .fetch_all(&state.db)
    .await?;
    let total_workouts: i64 = rows.iter().map(|row| row.count).sum();
    let total_duration: i64 = rows.iter().map(|row| row.duration).sum();
    let total_calories: i64 = rows.iter().map(|row| row.calories).sum();
    let stats = json!({
        "period": period,
        "total_workouts": total_workouts,
        "total_duration": total_duration,
        "total_calories": total_calories,
        "avg_duration": if total_workouts > 0 { total_duration as f64 / total_workouts as f64 } else { 0.0 },
        "avg_calories": if total_workouts > 0 { total_calories as f64 / total_workouts as f64 } else { 0.0 },
        "workout_days": rows.len()
    });
    Ok((StatusCode::OK, Json(DataResponse { success: true, data: json!({ "stats": stats, "daily": rows }) })))
}

pub async fn list_measurements(
    auth: MemberAuthContext,
    State(state): State<AppState>,
    Query(filter): Query<DateFilter>,
) -> Result<impl IntoResponse, AppError> {
    let rows = fetch_measurements(&state, auth.member_id, filter.start_date, filter.end_date, filter.limit, filter.offset).await?;
    Ok((StatusCode::OK, Json(ListResponse { success: true, data: rows, total: None })))
}

pub async fn latest_measurement(
    auth: MemberAuthContext,
    State(state): State<AppState>,
) -> Result<impl IntoResponse, AppError> {
    let row = sqlx::query_as::<_, MeasurementRow>(MEASUREMENT_SELECT_BY_MEMBER)
        .bind(auth.member_id)
        .bind(None::<NaiveDate>)
        .bind(None::<NaiveDate>)
        .bind(1_i64)
        .bind(0_i64)
        .fetch_optional(&state.db)
        .await?;
    Ok((StatusCode::OK, Json(DataResponse { success: true, data: row })))
}

pub async fn create_measurement(
    auth: MemberAuthContext,
    State(state): State<AppState>,
    Json(payload): Json<MeasurementRequest>,
) -> Result<impl IntoResponse, AppError> {
    let id = sqlx::query_scalar::<_, Uuid>(
        r#"
        insert into body_measurements (
            id, member_id, date, weight, body_fat, muscle_mass, bmi, source, raw_data
        ) values (
            gen_random_uuid(), $1, coalesce($2, current_date), $3, $4, $5, $6, coalesce($7, 'MANUAL'), $8::jsonb
        ) returning id
        "#,
    )
    .bind(auth.member_id)
    .bind(payload.date)
    .bind(payload.weight)
    .bind(payload.body_fat)
    .bind(payload.muscle_mass)
    .bind(payload.bmi)
    .bind(payload.source)
    .bind(payload.raw_data.map(|value| value.to_string()))
    .fetch_one(&state.db)
    .await?;
    let row = fetch_measurement(&state, auth.member_id, id).await?;
    Ok((StatusCode::CREATED, Json(MutationResponse { success: true, message: "量測紀錄已建立", data: Some(row) })))
}

pub async fn delete_measurement(
    auth: MemberAuthContext,
    State(state): State<AppState>,
    Path(id): Path<Uuid>,
) -> Result<impl IntoResponse, AppError> {
    delete_owned(&state, "body_measurements", auth.member_id, id).await?;
    Ok((StatusCode::OK, Json(MutationResponse::<Value> { success: true, message: "量測紀錄已刪除", data: None })))
}

pub async fn measurement_stats(
    auth: MemberAuthContext,
    State(state): State<AppState>,
    Query(filter): Query<PeriodFilter>,
) -> Result<impl IntoResponse, AppError> {
    let period_days = filter.period.and_then(|value| value.parse::<i64>().ok()).unwrap_or(30).clamp(1, 365);
    let since = Utc::now().date_naive() - Duration::days(period_days - 1);
    let rows = fetch_measurements(&state, auth.member_id, Some(since), None, Some(500), Some(0)).await?;
    let daily: Vec<Value> = rows.iter().map(|row| json!({ "date": row.date, "weight": row.weight, "body_fat": row.body_fat })).collect();
    let stats = json!({
        "total_records": rows.len(),
        "period_days": period_days,
        "weight": trend(rows.iter().filter_map(|row| row.weight).collect()),
        "body_fat": trend(rows.iter().filter_map(|row| row.body_fat).collect()),
        "muscle_mass": trend(rows.iter().filter_map(|row| row.muscle_mass).collect()),
        "bmi": trend(rows.iter().filter_map(|row| row.bmi).collect())
    });
    Ok((StatusCode::OK, Json(DataResponse { success: true, data: json!({ "stats": stats, "daily": daily }) })))
}

async fn fetch_goal(state: &AppState, member_id: Uuid, id: Uuid) -> Result<GoalRow, AppError> {
    sqlx::query_as::<_, GoalRow>(
        r#"
        select id, member_id, goal_type, target_value, current_value, start_date, target_date,
            coalesce(status, 'IN_PROGRESS') as status, notes, created_at,
            coalesce(updated_at, created_at) as updated_at
        from member_goals
        where id = $1 and member_id = $2
        "#,
    )
    .bind(id)
    .bind(member_id)
    .fetch_optional(&state.db)
    .await?
    .ok_or(AppError::NotFound)
}

async fn fetch_workout(state: &AppState, member_id: Uuid, id: Uuid) -> Result<WorkoutRow, AppError> {
    sqlx::query_as::<_, WorkoutRow>(
        r#"
        select id, member_id, date, duration, calories, exercises, notes, created_at
        from workout_logs
        where id = $1 and member_id = $2
        "#,
    )
    .bind(id)
    .bind(member_id)
    .fetch_optional(&state.db)
    .await?
    .ok_or(AppError::NotFound)
}

async fn fetch_measurement(state: &AppState, member_id: Uuid, id: Uuid) -> Result<MeasurementRow, AppError> {
    sqlx::query_as::<_, MeasurementRow>(
        r#"
        select id, member_id, date, weight, body_fat, muscle_mass, bmi,
            coalesce(source, 'MANUAL') as source, raw_data, created_at
        from body_measurements
        where id = $1 and member_id = $2
        "#,
    )
    .bind(id)
    .bind(member_id)
    .fetch_optional(&state.db)
    .await?
    .ok_or(AppError::NotFound)
}

async fn fetch_measurements(
    state: &AppState,
    member_id: Uuid,
    start_date: Option<NaiveDate>,
    end_date: Option<NaiveDate>,
    limit: Option<i64>,
    offset: Option<i64>,
) -> Result<Vec<MeasurementRow>, AppError> {
    sqlx::query_as::<_, MeasurementRow>(MEASUREMENT_SELECT_BY_MEMBER)
        .bind(member_id)
        .bind(start_date)
        .bind(end_date)
        .bind(limit.unwrap_or(100).clamp(1, 500))
        .bind(offset.unwrap_or(0).max(0))
        .fetch_all(&state.db)
        .await
        .map_err(AppError::from)
}

async fn delete_owned(state: &AppState, table: &str, member_id: Uuid, id: Uuid) -> Result<(), AppError> {
    let sql = format!("delete from {table} where id = $1 and member_id = $2");
    let affected = sqlx::query(&sql)
        .bind(id)
        .bind(member_id)
        .execute(&state.db)
        .await?
        .rows_affected();
    if affected == 0 {
        return Err(AppError::NotFound);
    }
    Ok(())
}

fn trend(values: Vec<f32>) -> TrendData {
    let first = values.first().copied();
    let last = values.last().copied();
    let change = first.zip(last).map(|(start, end)| end - start);
    let trend = change.map(|value| {
        if value > 0.01 {
            "up"
        } else if value < -0.01 {
            "down"
        } else {
            "stable"
        }
    });
    TrendData { first, last, change, trend }
}

const WORKOUT_SELECT: &str = r#"
select id, member_id, date, duration, calories, exercises, notes, created_at
from workout_logs
where member_id = $1
  and ($2::date is null or date >= $2)
  and ($3::date is null or date <= $3)
order by date desc, created_at desc
limit $4 offset $5
"#;

const MEASUREMENT_SELECT_BY_MEMBER: &str = r#"
select id, member_id, date, weight, body_fat, muscle_mass, bmi,
    coalesce(source, 'MANUAL') as source, raw_data, created_at
from body_measurements
where member_id = $1
  and ($2::date is null or date >= $2)
  and ($3::date is null or date <= $3)
order by date desc, created_at desc
limit $4 offset $5
"#;
