use axum::{
    extract::{Path, Query, State},
    http::StatusCode,
    response::IntoResponse,
    Json,
};
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
pub struct BranchFilters {
    status: Option<String>,
    search: Option<String>,
    page: Option<i64>,
    limit: Option<i64>,
}

#[derive(Debug, Deserialize)]
pub struct CreateBranchRequest {
    name: String,
    code: Option<String>,
    #[serde(rename = "type")]
    branch_type: Option<String>,
    address: Option<String>,
    phone: Option<String>,
    tax_id: Option<String>,
    settings: Option<Value>,
    status: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct UpdateBranchRequest {
    name: Option<String>,
    code: Option<String>,
    #[serde(rename = "type")]
    branch_type: Option<String>,
    address: Option<String>,
    phone: Option<String>,
    tax_id: Option<String>,
    settings: Option<Value>,
    status: Option<String>,
}

#[derive(Debug, Serialize, FromRow)]
pub struct BranchRow {
    id: Uuid,
    status: Option<String>,
    created_at: Option<DateTime<Utc>>,
    updated_at: Option<DateTime<Utc>>,
    name: String,
    code: String,
    #[serde(rename = "type")]
    branch_type: String,
    address: Option<String>,
    phone: Option<String>,
    tax_id: Option<String>,
    settings: Option<Value>,
    tenant_id: Option<Uuid>,
}

pub async fn list(
    auth: AuthContext,
    State(state): State<AppState>,
    Query(filters): Query<BranchFilters>,
) -> Result<impl IntoResponse, AppError> {
    let tenant_id = require_tenant(&auth)?;
    let status = filters.status.map(|value| value.to_uppercase());
    let search = filters.search.map(|value| value.trim().to_string()).filter(|value| !value.is_empty());
    let rows = sqlx::query_as::<_, BranchRow>(
        r#"
        select id, status, created_at, updated_at, name, code, type as branch_type,
            address, phone, tax_id, settings, tenant_id
        from branches
        where tenant_id = $1
          and ($2::text is null or upper(coalesce(status, 'ACTIVE')) = $2)
          and ($3::text is null or name ilike '%' || $3 || '%' or code ilike '%' || $3 || '%')
        order by name asc
        "#,
    )
    .bind(tenant_id)
    .bind(status)
    .bind(search)
    .fetch_all(&state.db)
    .await?;
    let total = rows.len() as i64;
    let page = filters.page.unwrap_or(1).max(1);
    let limit = filters.limit.unwrap_or(total.max(1)).max(1);
    Ok((StatusCode::OK, Json(paginated(rows, total, page, limit))))
}

pub async fn get(
    auth: AuthContext,
    State(state): State<AppState>,
    Path(id): Path<Uuid>,
) -> Result<impl IntoResponse, AppError> {
    let tenant_id = require_tenant(&auth)?;
    let row = fetch_branch(&state, tenant_id, id).await?;
    Ok((StatusCode::OK, Json(ApiResponse { success: true, data: row })))
}

pub async fn create(
    auth: AuthContext,
    State(state): State<AppState>,
    Json(payload): Json<CreateBranchRequest>,
) -> Result<impl IntoResponse, AppError> {
    let tenant_id = require_tenant(&auth)?;
    validation::required_text("name", &payload.name)?;
    let code = payload.code.unwrap_or_else(|| code_from_name(&payload.name));
    let id = sqlx::query_scalar::<_, Uuid>(
        r#"
        insert into branches (id, name, code, type, address, phone, tax_id, settings, status, tenant_id)
        values (gen_random_uuid(), $1, $2, $3, $4, $5, $6, coalesce($7::jsonb, '{}'::jsonb), coalesce($8, 'ACTIVE'), $9)
        returning id
        "#,
    )
    .bind(payload.name)
    .bind(code)
    .bind(payload.branch_type.unwrap_or_else(|| "BRANCH".into()))
    .bind(payload.address)
    .bind(payload.phone)
    .bind(payload.tax_id)
    .bind(payload.settings.map(|value| value.to_string()))
    .bind(payload.status.map(|value| value.to_uppercase()))
    .bind(tenant_id)
    .fetch_one(&state.db)
    .await?;
    let row = fetch_branch(&state, tenant_id, id).await?;
    Ok((StatusCode::CREATED, Json(ApiResponse { success: true, data: row })))
}

pub async fn update(
    auth: AuthContext,
    State(state): State<AppState>,
    Path(id): Path<Uuid>,
    Json(payload): Json<UpdateBranchRequest>,
) -> Result<impl IntoResponse, AppError> {
    let tenant_id = require_tenant(&auth)?;
    let updated_id = sqlx::query_scalar::<_, Uuid>(
        r#"
        update branches set
            name = coalesce($3, name),
            code = coalesce($4, code),
            type = coalesce($5, type),
            address = coalesce($6, address),
            phone = coalesce($7, phone),
            tax_id = coalesce($8, tax_id),
            settings = coalesce($9::jsonb, settings),
            status = coalesce($10, status),
            updated_at = now()
        where id = $1 and tenant_id = $2
        returning id
        "#,
    )
    .bind(id)
    .bind(tenant_id)
    .bind(payload.name)
    .bind(payload.code)
    .bind(payload.branch_type)
    .bind(payload.address)
    .bind(payload.phone)
    .bind(payload.tax_id)
    .bind(payload.settings.map(|value| value.to_string()))
    .bind(payload.status.map(|value| value.to_uppercase()))
    .fetch_optional(&state.db)
    .await?
    .ok_or(AppError::NotFound)?;
    let row = fetch_branch(&state, tenant_id, updated_id).await?;
    Ok((StatusCode::OK, Json(ApiResponse { success: true, data: row })))
}

pub async fn delete(
    auth: AuthContext,
    State(state): State<AppState>,
    Path(id): Path<Uuid>,
) -> Result<impl IntoResponse, AppError> {
    let tenant_id = require_tenant(&auth)?;
    let affected = sqlx::query("update branches set status = 'ARCHIVED', updated_at = now() where id = $1 and tenant_id = $2")
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

async fn fetch_branch(state: &AppState, tenant_id: Uuid, id: Uuid) -> Result<BranchRow, AppError> {
    sqlx::query_as::<_, BranchRow>(
        r#"
        select id, status, created_at, updated_at, name, code, type as branch_type,
            address, phone, tax_id, settings, tenant_id
        from branches
        where id = $1 and tenant_id = $2
        "#,
    )
    .bind(id)
    .bind(tenant_id)
    .fetch_optional(&state.db)
    .await?
    .ok_or(AppError::NotFound)
}

fn paginated<T: Serialize>(data: Vec<T>, total: i64, page: i64, limit: i64) -> PaginatedResponse<Vec<T>> {
    PaginatedResponse {
        success: true,
        data,
        pagination: Pagination { total, page, limit, total_pages: ((total + limit - 1) / limit).max(1) },
    }
}

fn require_tenant(auth: &AuthContext) -> Result<Uuid, AppError> {
    auth.user.tenant_id.ok_or(AppError::Unauthorized)
}

fn code_from_name(name: &str) -> String {
    let code: String = name.chars().filter(|ch| ch.is_ascii_alphanumeric()).take(12).collect();
    if code.is_empty() { format!("BR{}", Uuid::new_v4().simple().to_string()[..8].to_string()) } else { code.to_uppercase() }
}
