use axum::{
    extract::{Path, Query, State},
    http::StatusCode,
    response::IntoResponse,
    Json,
};
use serde::{Deserialize, Serialize};
use sqlx::FromRow;
use uuid::Uuid;

use crate::{
    error::AppError,
    http::{auth::AuthContext, ApiResponse, PaginatedResponse, Pagination},
    state::AppState,
    validation,
};

#[derive(Debug, Deserialize)]
pub struct ClassFilters {
    #[serde(rename = "branchId")]
    branch_id: Option<Uuid>,
    #[serde(rename = "branch_id")]
    branch_id_snake: Option<Uuid>,
    category: Option<String>,
    #[serde(rename = "category_id")]
    category_id: Option<String>,
    #[serde(rename = "difficultyLevel")]
    difficulty_level: Option<String>,
    #[serde(rename = "difficulty_level")]
    difficulty_level_snake: Option<String>,
    #[serde(rename = "activeOnly")]
    active_only: Option<bool>,
    #[serde(rename = "is_active")]
    is_active: Option<bool>,
    search: Option<String>,
    page: Option<i64>,
    limit: Option<i64>,
}

#[derive(Debug, Deserialize)]
pub struct CreateClassRequest {
    name: String,
    description: Option<String>,
    #[serde(rename = "durationMinutes", alias = "duration_minutes")]
    duration_minutes: i32,
    #[serde(rename = "maxCapacity", alias = "max_capacity")]
    max_capacity: i32,
    #[serde(rename = "instructorId", alias = "instructor_id")]
    instructor_id: Option<Uuid>,
    #[serde(rename = "branchId", alias = "branch_id")]
    branch_id: Uuid,
    category: Option<String>,
    #[serde(rename = "difficultyLevel", alias = "difficulty_level")]
    difficulty_level: Option<String>,
    #[serde(rename = "imageUrl", alias = "image_url")]
    image_url: Option<String>,
    #[serde(rename = "isActive", alias = "is_active", default = "default_true")]
    is_active: bool,
    #[serde(rename = "requiresCount", alias = "requires_count", default)]
    requires_count: bool,
    #[serde(rename = "countDeduction", alias = "count_deduction", default = "default_count_deduction")]
    count_deduction: i32,
}

#[derive(Debug, Deserialize)]
pub struct UpdateClassRequest {
    name: Option<String>,
    description: Option<String>,
    #[serde(rename = "durationMinutes", alias = "duration_minutes")]
    duration_minutes: Option<i32>,
    #[serde(rename = "maxCapacity", alias = "max_capacity")]
    max_capacity: Option<i32>,
    #[serde(rename = "instructorId", alias = "instructor_id")]
    instructor_id: Option<Uuid>,
    #[serde(rename = "branchId", alias = "branch_id")]
    branch_id: Option<Uuid>,
    category: Option<String>,
    #[serde(rename = "difficultyLevel", alias = "difficulty_level")]
    difficulty_level: Option<String>,
    #[serde(rename = "imageUrl", alias = "image_url")]
    image_url: Option<String>,
    #[serde(rename = "isActive", alias = "is_active")]
    is_active: Option<bool>,
    #[serde(rename = "requiresCount", alias = "requires_count")]
    requires_count: Option<bool>,
    #[serde(rename = "countDeduction", alias = "count_deduction")]
    count_deduction: Option<i32>,
}

#[derive(Debug, Serialize, FromRow)]
pub struct GymClass {
    id: Uuid,
    status: Option<String>,
    name: String,
    description: Option<String>,
    duration_minutes: i32,
    max_capacity: i32,
    instructor_id: Option<Uuid>,
    branch_id: Uuid,
    category: Option<String>,
    difficulty_level: Option<String>,
    image_url: Option<String>,
    is_active: Option<bool>,
    requires_count: Option<bool>,
    count_deduction: Option<i32>,
}

fn default_true() -> bool {
    true
}

fn default_count_deduction() -> i32 {
    1
}

pub async fn list(
    auth: AuthContext,
    State(state): State<AppState>,
    Query(filters): Query<ClassFilters>,
) -> Result<impl IntoResponse, AppError> {
    let tenant_id = require_tenant(&auth)?;
    let branch_id = filters.branch_id.or(filters.branch_id_snake);
    let category = filters.category.or(filters.category_id);
    let difficulty_level = filters.difficulty_level.or(filters.difficulty_level_snake);
    let is_active = filters.is_active.or(filters.active_only);
    let search = filters.search.map(|s| s.trim().to_string()).filter(|s| !s.is_empty());
    let classes = sqlx::query_as::<_, GymClass>(
        r#"
        select
            classes.id, classes.status, classes.name, classes.description,
            classes.duration_minutes, classes.max_capacity, classes.instructor_id,
            classes.branch_id, classes.category, classes.difficulty_level, classes.image_url,
            classes.is_active, classes.requires_count, classes.count_deduction
        from classes
        join branches on branches.id = classes.branch_id
        where branches.tenant_id = $1
          and ($2::uuid is null or classes.branch_id = $2)
          and ($3::text is null or classes.category = $3)
          and ($4::text is null or classes.difficulty_level = $4)
          and ($5::bool is null or classes.is_active = $5)
          and ($6::text is null or classes.name ilike '%' || $6 || '%')
        order by classes.created_at desc
        "#,
    )
    .bind(tenant_id)
    .bind(branch_id)
    .bind(category)
    .bind(difficulty_level)
    .bind(is_active)
    .bind(search)
    .fetch_all(&state.db)
    .await?;

    let total = classes.len() as i64;
    let page = filters.page.unwrap_or(1).max(1);
    let limit = filters.limit.unwrap_or(total.max(1)).max(1);

    Ok((
        StatusCode::OK,
        Json(PaginatedResponse {
            success: true,
            data: classes,
            pagination: Pagination {
                total,
                page,
                limit,
                total_pages: ((total + limit - 1) / limit).max(1),
            },
        }),
    ))
}

pub async fn get(
    auth: AuthContext,
    State(state): State<AppState>,
    Path(id): Path<Uuid>,
) -> Result<impl IntoResponse, AppError> {
    let tenant_id = require_tenant(&auth)?;
    let class = fetch_class(&state, tenant_id, id).await?;

    Ok((StatusCode::OK, Json(ApiResponse { success: true, data: class })))
}

pub async fn create(
    auth: AuthContext,
    State(state): State<AppState>,
    Json(payload): Json<CreateClassRequest>,
) -> Result<impl IntoResponse, AppError> {
    let tenant_id = require_tenant(&auth)?;
    validate_create(&payload)?;
    ensure_branch_scope(&state, tenant_id, payload.branch_id).await?;
    ensure_instructor_scope(&state, tenant_id, payload.instructor_id).await?;

    let class = sqlx::query_as::<_, GymClass>(
        r#"
        insert into classes (
            id, name, description, duration_minutes, max_capacity, instructor_id, branch_id,
            category, difficulty_level, image_url, is_active, requires_count, count_deduction
        )
        values (
            gen_random_uuid(), $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12
        )
        returning
            id, status, name, description, duration_minutes, max_capacity, instructor_id,
            branch_id, category, difficulty_level, image_url, is_active, requires_count,
            count_deduction
        "#,
    )
    .bind(payload.name.trim())
    .bind(payload.description)
    .bind(payload.duration_minutes)
    .bind(payload.max_capacity)
    .bind(payload.instructor_id)
    .bind(payload.branch_id)
    .bind(payload.category)
    .bind(payload.difficulty_level)
    .bind(payload.image_url)
    .bind(payload.is_active)
    .bind(payload.requires_count)
    .bind(payload.count_deduction)
    .fetch_one(&state.db)
    .await?;

    Ok((StatusCode::CREATED, Json(ApiResponse { success: true, data: class })))
}

pub async fn update(
    auth: AuthContext,
    State(state): State<AppState>,
    Path(id): Path<Uuid>,
    Json(payload): Json<UpdateClassRequest>,
) -> Result<impl IntoResponse, AppError> {
    let tenant_id = require_tenant(&auth)?;
    validate_update(&payload)?;
    if let Some(branch_id) = payload.branch_id {
        ensure_branch_scope(&state, tenant_id, branch_id).await?;
    }
    ensure_instructor_scope(&state, tenant_id, payload.instructor_id).await?;

    let class = sqlx::query_as::<_, GymClass>(
        r#"
        update classes
        set
            name = coalesce($3, name),
            description = coalesce($4, description),
            duration_minutes = coalesce($5, duration_minutes),
            max_capacity = coalesce($6, max_capacity),
            instructor_id = coalesce($7, instructor_id),
            branch_id = coalesce($8, branch_id),
            category = coalesce($9, category),
            difficulty_level = coalesce($10, difficulty_level),
            image_url = coalesce($11, image_url),
            is_active = coalesce($12, is_active),
            requires_count = coalesce($13, requires_count),
            count_deduction = coalesce($14, count_deduction),
            updated_at = now()
        where id = $1
          and exists(select 1 from branches where branches.id = classes.branch_id and branches.tenant_id = $2)
        returning
            id, status, name, description, duration_minutes, max_capacity, instructor_id,
            branch_id, category, difficulty_level, image_url, is_active, requires_count,
            count_deduction
        "#,
    )
    .bind(id)
    .bind(tenant_id)
    .bind(payload.name.as_deref().map(str::trim))
    .bind(payload.description)
    .bind(payload.duration_minutes)
    .bind(payload.max_capacity)
    .bind(payload.instructor_id)
    .bind(payload.branch_id)
    .bind(payload.category)
    .bind(payload.difficulty_level)
    .bind(payload.image_url)
    .bind(payload.is_active)
    .bind(payload.requires_count)
    .bind(payload.count_deduction)
    .fetch_optional(&state.db)
    .await?
    .ok_or(AppError::NotFound)?;

    Ok((StatusCode::OK, Json(ApiResponse { success: true, data: class })))
}

pub async fn delete(
    auth: AuthContext,
    State(state): State<AppState>,
    Path(id): Path<Uuid>,
) -> Result<impl IntoResponse, AppError> {
    let tenant_id = require_tenant(&auth)?;
    let class = sqlx::query_as::<_, GymClass>(
        r#"
        update classes
        set is_active = false, updated_at = now()
        where id = $1
          and exists(select 1 from branches where branches.id = classes.branch_id and branches.tenant_id = $2)
        returning
            id, status, name, description, duration_minutes, max_capacity, instructor_id,
            branch_id, category, difficulty_level, image_url, is_active, requires_count,
            count_deduction
        "#,
    )
    .bind(id)
    .bind(tenant_id)
    .fetch_optional(&state.db)
    .await?
    .ok_or(AppError::NotFound)?;

    Ok((StatusCode::OK, Json(ApiResponse { success: true, data: class })))
}

async fn fetch_class(state: &AppState, tenant_id: Uuid, id: Uuid) -> Result<GymClass, AppError> {
    sqlx::query_as::<_, GymClass>(
        r#"
        select
            classes.id, classes.status, classes.name, classes.description,
            classes.duration_minutes, classes.max_capacity, classes.instructor_id,
            classes.branch_id, classes.category, classes.difficulty_level, classes.image_url,
            classes.is_active, classes.requires_count, classes.count_deduction
        from classes
        join branches on branches.id = classes.branch_id
        where classes.id = $1 and branches.tenant_id = $2
        "#,
    )
    .bind(id)
    .bind(tenant_id)
    .fetch_optional(&state.db)
    .await?
    .ok_or(AppError::NotFound)
}

fn require_tenant(auth: &AuthContext) -> Result<Uuid, AppError> {
    auth.user.tenant_id.ok_or(AppError::Unauthorized)
}

fn validate_create(payload: &CreateClassRequest) -> Result<(), AppError> {
    validation::required_text("name", &payload.name)?;
    validate_positive("durationMinutes", payload.duration_minutes)?;
    validate_positive("maxCapacity", payload.max_capacity)?;
    validate_positive("countDeduction", payload.count_deduction)
}

fn validate_update(payload: &UpdateClassRequest) -> Result<(), AppError> {
    if let Some(name) = &payload.name {
        validation::required_text("name", name)?;
    }
    if let Some(duration_minutes) = payload.duration_minutes {
        validate_positive("durationMinutes", duration_minutes)?;
    }
    if let Some(max_capacity) = payload.max_capacity {
        validate_positive("maxCapacity", max_capacity)?;
    }
    if let Some(count_deduction) = payload.count_deduction {
        validate_positive("countDeduction", count_deduction)?;
    }
    Ok(())
}

fn validate_positive(field: &str, value: i32) -> Result<(), AppError> {
    if value <= 0 {
        return Err(AppError::Validation(format!("{field} must be greater than zero")));
    }
    Ok(())
}

async fn ensure_branch_scope(state: &AppState, tenant_id: Uuid, branch_id: Uuid) -> Result<(), AppError> {
    let exists = sqlx::query_scalar::<_, bool>(
        "select exists(select 1 from branches where id = $1 and tenant_id = $2)",
    )
    .bind(branch_id)
    .bind(tenant_id)
    .fetch_one(&state.db)
    .await?;

    if exists {
        Ok(())
    } else {
        Err(AppError::Validation("branchId is invalid for this tenant".into()))
    }
}

async fn ensure_instructor_scope(
    state: &AppState,
    tenant_id: Uuid,
    instructor_id: Option<Uuid>,
) -> Result<(), AppError> {
    let Some(instructor_id) = instructor_id else {
        return Ok(());
    };
    let exists = sqlx::query_scalar::<_, bool>(
        "select exists(select 1 from employees where id = $1 and tenant_id = $2)",
    )
    .bind(instructor_id)
    .bind(tenant_id)
    .fetch_one(&state.db)
    .await?;

    if exists {
        Ok(())
    } else {
        Err(AppError::Validation("instructorId is invalid for this tenant".into()))
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn rejects_zero_duration() {
        assert!(validate_positive("durationMinutes", 0).is_err());
    }
}
