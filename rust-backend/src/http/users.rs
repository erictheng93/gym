use axum::{
    extract::{Path, Query, State},
    http::StatusCode,
    response::IntoResponse,
    Json,
};
use bcrypt::hash;
use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use sqlx::FromRow;
use uuid::Uuid;

use crate::{
    error::AppError,
    http::{auth::AuthContext, ApiResponse, PaginatedResponse, Pagination},
    state::AppState,
    validation,
};

#[derive(Debug, Deserialize)]
pub struct UserFilters {
    search: Option<String>,
    role: Option<String>,
    #[serde(rename = "isActive")]
    is_active: Option<bool>,
    page: Option<i64>,
    limit: Option<i64>,
}

#[derive(Debug, Deserialize)]
pub struct CreateUserRequest {
    email: String,
    password: String,
    role: String,
    #[serde(rename = "employeeId")]
    employee_id: Option<Uuid>,
}

#[derive(Debug, Deserialize)]
pub struct UpdateUserRequest {
    email: Option<String>,
    role: Option<String>,
    #[serde(rename = "isActive")]
    is_active: Option<bool>,
    #[serde(rename = "employeeId")]
    employee_id: Option<Option<Uuid>>,
}

#[derive(Debug, Deserialize)]
pub struct ResetPasswordRequest {
    #[serde(rename = "newPassword")]
    new_password: String,
}

#[derive(Debug, Serialize, FromRow)]
pub struct UserRow {
    id: Uuid,
    email: String,
    role: String,
    #[serde(rename = "isActive")]
    is_active: bool,
    #[serde(rename = "emailVerified")]
    email_verified: bool,
    #[serde(rename = "lastLoginAt")]
    last_login_at: Option<DateTime<Utc>>,
    #[serde(rename = "createdAt")]
    created_at: Option<DateTime<Utc>>,
    #[serde(rename = "employeeId")]
    employee_id: Option<Uuid>,
    employee: Option<Value>,
}

#[derive(Debug, Serialize, FromRow)]
pub struct AvailableEmployeeRow {
    id: Uuid,
    #[serde(rename = "fullName")]
    full_name: String,
    #[serde(rename = "employeeCode")]
    employee_code: String,
    email: Option<String>,
}

pub async fn list(
    auth: AuthContext,
    State(state): State<AppState>,
    Query(filters): Query<UserFilters>,
) -> Result<impl IntoResponse, AppError> {
    let tenant_id = require_tenant(&auth)?;
    let search = filters.search.map(|value| value.trim().to_string()).filter(|value| !value.is_empty());
    let role = filters.role.map(normalize_role);
    let users = sqlx::query_as::<_, UserRow>(
        r#"
        select
            users.id, users.email, users.role,
            coalesce(users.is_active, true) as is_active,
            coalesce(users.email_verified, false) as email_verified,
            users.last_login_at, users.created_at, users.employee_id,
            case when employees.id is null then null else json_build_object(
                'id', employees.id,
                'fullName', employees.full_name,
                'employeeCode', employees.employee_code,
                'branch', case when branches.id is null then null else json_build_object('id', branches.id, 'name', branches.name) end,
                'jobTitle', case when job_titles.id is null then null else json_build_object('id', job_titles.id, 'name', job_titles.name) end
            ) end as employee
        from users
        left join employees on employees.id = users.employee_id
        left join branches on branches.id = employees.branch_id
        left join job_titles on job_titles.id = employees.job_title_id
        where users.tenant_id = $1
          and ($2::text is null or users.email ilike '%' || $2 || '%' or employees.full_name ilike '%' || $2 || '%')
          and ($3::text is null or users.role = $3)
          and ($4::bool is null or coalesce(users.is_active, true) = $4)
        order by users.created_at desc
        "#,
    )
    .bind(tenant_id)
    .bind(search)
    .bind(role)
    .bind(filters.is_active)
    .fetch_all(&state.db)
    .await?;

    Ok((StatusCode::OK, Json(paginated(users, filters.page, filters.limit))))
}

pub async fn get(
    auth: AuthContext,
    State(state): State<AppState>,
    Path(id): Path<Uuid>,
) -> Result<impl IntoResponse, AppError> {
    let tenant_id = require_tenant(&auth)?;
    let user = fetch_user(&state, tenant_id, id).await?;
    Ok((StatusCode::OK, Json(ApiResponse { success: true, data: user })))
}

pub async fn create(
    auth: AuthContext,
    State(state): State<AppState>,
    Json(payload): Json<CreateUserRequest>,
) -> Result<impl IntoResponse, AppError> {
    let tenant_id = require_tenant(&auth)?;
    validation::required_text("email", &payload.email)?;
    validation::required_text("password", &payload.password)?;
    let role = normalize_role(payload.role);
    validate_role(&role)?;
    if let Some(employee_id) = payload.employee_id {
        ensure_employee_scope(&state, tenant_id, employee_id).await?;
    }
    let password_hash = hash(payload.password, 4).map_err(|_| AppError::Unauthorized)?;
    let id = sqlx::query_scalar::<_, Uuid>(
        r#"
        insert into users (id, email, password_hash, role, employee_id, tenant_id, is_active, email_verified)
        values (gen_random_uuid(), lower($1), $2, $3, $4, $5, true, true)
        returning id
        "#,
    )
    .bind(payload.email.trim())
    .bind(password_hash)
    .bind(role)
    .bind(payload.employee_id)
    .bind(tenant_id)
    .fetch_one(&state.db)
    .await?;
    if let Some(employee_id) = payload.employee_id {
        link_employee_user(&state, tenant_id, employee_id, Some(id)).await?;
    }
    let user = fetch_user(&state, tenant_id, id).await?;
    Ok((StatusCode::CREATED, Json(ApiResponse { success: true, data: user })))
}

pub async fn update(
    auth: AuthContext,
    State(state): State<AppState>,
    Path(id): Path<Uuid>,
    Json(payload): Json<UpdateUserRequest>,
) -> Result<impl IntoResponse, AppError> {
    let tenant_id = require_tenant(&auth)?;
    let role = payload.role.map(normalize_role);
    if let Some(role) = &role {
        validate_role(role)?;
    }
    if let Some(Some(employee_id)) = payload.employee_id {
        ensure_employee_scope(&state, tenant_id, employee_id).await?;
    }
    let current = fetch_user(&state, tenant_id, id).await?;
    let new_employee_id = payload.employee_id.clone().unwrap_or(current.employee_id);
    sqlx::query(
        r#"
        update users set
            email = case when $3::bool then lower($4) else email end,
            role = coalesce($5, role),
            is_active = coalesce($6, is_active),
            employee_id = case when $7::bool then $8 else employee_id end,
            updated_at = now()
        where id = $1 and tenant_id = $2
        "#,
    )
    .bind(id)
    .bind(tenant_id)
    .bind(payload.email.is_some())
    .bind(payload.email.as_deref().map(str::trim))
    .bind(role)
    .bind(payload.is_active)
    .bind(payload.employee_id.is_some())
    .bind(new_employee_id)
    .execute(&state.db)
    .await?;
    if current.employee_id != new_employee_id {
        if let Some(old_employee_id) = current.employee_id {
            link_employee_user(&state, tenant_id, old_employee_id, None).await?;
        }
        if let Some(employee_id) = new_employee_id {
            link_employee_user(&state, tenant_id, employee_id, Some(id)).await?;
        }
    }
    let user = fetch_user(&state, tenant_id, id).await?;
    Ok((StatusCode::OK, Json(ApiResponse { success: true, data: user })))
}

pub async fn delete(
    auth: AuthContext,
    State(state): State<AppState>,
    Path(id): Path<Uuid>,
) -> Result<impl IntoResponse, AppError> {
    let tenant_id = require_tenant(&auth)?;
    let affected = sqlx::query("update users set is_active = false, updated_at = now() where id = $1 and tenant_id = $2")
        .bind(id)
        .bind(tenant_id)
        .execute(&state.db)
        .await?
        .rows_affected();
    if affected == 0 {
        return Err(AppError::NotFound);
    }
    Ok((StatusCode::OK, Json(ApiResponse { success: true, data: serde_json::json!({ "id": id }) })))
}

pub async fn reset_password(
    auth: AuthContext,
    State(state): State<AppState>,
    Path(id): Path<Uuid>,
    Json(payload): Json<ResetPasswordRequest>,
) -> Result<impl IntoResponse, AppError> {
    let tenant_id = require_tenant(&auth)?;
    validation::required_text("newPassword", &payload.new_password)?;
    let password_hash = hash(payload.new_password, 4).map_err(|_| AppError::Unauthorized)?;
    let affected = sqlx::query("update users set password_hash = $3, updated_at = now() where id = $1 and tenant_id = $2")
        .bind(id)
        .bind(tenant_id)
        .bind(password_hash)
        .execute(&state.db)
        .await?
        .rows_affected();
    if affected == 0 {
        return Err(AppError::NotFound);
    }
    Ok((StatusCode::OK, Json(ApiResponse { success: true, data: serde_json::json!({ "id": id }) })))
}

pub async fn available_employees(
    auth: AuthContext,
    State(state): State<AppState>,
) -> Result<impl IntoResponse, AppError> {
    let tenant_id = require_tenant(&auth)?;
    let employees = sqlx::query_as::<_, AvailableEmployeeRow>(
        r#"
        select id, full_name, employee_code, email
        from employees
        where tenant_id = $1
          and status = 'ACTIVE'
          and user_id is null
        order by full_name
        "#,
    )
    .bind(tenant_id)
    .fetch_all(&state.db)
    .await?;
    Ok((StatusCode::OK, Json(ApiResponse { success: true, data: employees })))
}

async fn fetch_user(state: &AppState, tenant_id: Uuid, id: Uuid) -> Result<UserRow, AppError> {
    sqlx::query_as::<_, UserRow>(
        r#"
        select
            users.id, users.email, users.role,
            coalesce(users.is_active, true) as is_active,
            coalesce(users.email_verified, false) as email_verified,
            users.last_login_at, users.created_at, users.employee_id,
            case when employees.id is null then null else json_build_object(
                'id', employees.id,
                'fullName', employees.full_name,
                'employeeCode', employees.employee_code,
                'branch', case when branches.id is null then null else json_build_object('id', branches.id, 'name', branches.name) end,
                'jobTitle', case when job_titles.id is null then null else json_build_object('id', job_titles.id, 'name', job_titles.name) end
            ) end as employee
        from users
        left join employees on employees.id = users.employee_id
        left join branches on branches.id = employees.branch_id
        left join job_titles on job_titles.id = employees.job_title_id
        where users.id = $1 and users.tenant_id = $2
        "#,
    )
    .bind(id)
    .bind(tenant_id)
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
    if exists { Ok(()) } else { Err(AppError::Validation("employeeId is invalid for this tenant".into())) }
}

async fn link_employee_user(state: &AppState, tenant_id: Uuid, employee_id: Uuid, user_id: Option<Uuid>) -> Result<(), AppError> {
    sqlx::query("update employees set user_id = $3, updated_at = now() where id = $1 and tenant_id = $2")
        .bind(employee_id)
        .bind(tenant_id)
        .bind(user_id)
        .execute(&state.db)
        .await?;
    Ok(())
}

fn normalize_role(role: String) -> String {
    role.trim().to_uppercase()
}

fn validate_role(role: &str) -> Result<(), AppError> {
    match role {
        "ADMIN" | "MANAGER" | "COACH" | "STAFF" => Ok(()),
        _ => Err(AppError::Validation("role is invalid".into())),
    }
}

fn require_tenant(auth: &AuthContext) -> Result<Uuid, AppError> {
    auth.user.tenant_id.ok_or(AppError::Unauthorized)
}

fn paginated<T: Serialize>(data: Vec<T>, page: Option<i64>, limit: Option<i64>) -> PaginatedResponse<Vec<T>> {
    let total = data.len() as i64;
    let page = page.unwrap_or(1).max(1);
    let limit = limit.unwrap_or(total.max(1)).max(1);
    PaginatedResponse {
        success: true,
        data,
        pagination: Pagination {
            total,
            page,
            limit,
            total_pages: ((total + limit - 1) / limit).max(1),
        },
    }
}

