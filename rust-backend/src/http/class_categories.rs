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
pub struct CategoryFilters {
    search: Option<String>,
    #[serde(rename = "parent_id")]
    parent_id: Option<Uuid>,
    #[serde(rename = "parentId")]
    parent_id_camel: Option<Uuid>,
    #[serde(rename = "parent_id_null")]
    parent_id_null: Option<bool>,
    #[serde(rename = "is_active")]
    is_active: Option<bool>,
    #[serde(rename = "isActive")]
    is_active_camel: Option<bool>,
    status: Option<String>,
    #[serde(rename = "sortBy")]
    sort_by: Option<String>,
    #[serde(rename = "sortOrder")]
    sort_order: Option<String>,
    page: Option<i64>,
    limit: Option<i64>,
}

#[derive(Debug, Deserialize)]
pub struct CreateCategoryRequest {
    code: String,
    name: String,
    name_en: Option<String>,
    parent_id: Option<Uuid>,
    icon: Option<String>,
    color: Option<String>,
    image_url: Option<String>,
    description: Option<String>,
    is_active: Option<bool>,
    requires_equipment: Option<bool>,
    equipment_list: Option<Value>,
    metadata: Option<Value>,
    owner_branch_id: Option<Uuid>,
    visibility: Option<String>,
    status: Option<String>,
    sort: Option<i32>,
}

#[derive(Debug, Deserialize)]
pub struct UpdateCategoryRequest {
    code: Option<String>,
    name: Option<String>,
    name_en: Option<String>,
    parent_id: Option<Uuid>,
    icon: Option<String>,
    color: Option<String>,
    image_url: Option<String>,
    description: Option<String>,
    is_active: Option<bool>,
    requires_equipment: Option<bool>,
    equipment_list: Option<Value>,
    metadata: Option<Value>,
    owner_branch_id: Option<Uuid>,
    visibility: Option<String>,
    status: Option<String>,
    sort: Option<i32>,
}

#[derive(Debug, Serialize, FromRow)]
pub struct ClassCategory {
    id: Uuid,
    status: String,
    sort: Option<i32>,
    #[serde(rename = "date_created")]
    created_at: DateTime<Utc>,
    #[serde(rename = "date_updated")]
    updated_at: Option<DateTime<Utc>>,
    #[serde(rename = "user_created")]
    created_by: Option<Uuid>,
    #[serde(rename = "user_updated")]
    updated_by: Option<Uuid>,
    code: String,
    name: String,
    name_en: Option<String>,
    parent_id: Option<Uuid>,
    icon: Option<String>,
    color: String,
    image_url: Option<String>,
    description: Option<String>,
    is_active: bool,
    requires_equipment: bool,
    equipment_list: Value,
    metadata: Value,
    owner_branch_id: Option<Uuid>,
    visibility: String,
}

pub async fn list(
    auth: AuthContext,
    State(state): State<AppState>,
    Query(filters): Query<CategoryFilters>,
) -> Result<impl IntoResponse, AppError> {
    let tenant_id = require_tenant(&auth)?;
    seed_legacy_categories(&state, tenant_id).await?;

    let parent_id = filters.parent_id.or(filters.parent_id_camel);
    let is_active = filters.is_active.or(filters.is_active_camel);
    let search = filters.search.map(|s| s.trim().to_string()).filter(|s| !s.is_empty());
    let parent_id_null = filters.parent_id_null.unwrap_or(false);
    let sort_by = filters.sort_by.as_deref().unwrap_or("sort");
    let sort_desc = matches!(filters.sort_order.as_deref(), Some("desc"));

    let mut categories = sqlx::query_as::<_, ClassCategory>(
        r#"
        select id, status, sort, created_at, updated_at, created_by, updated_by, code, name,
            name_en, parent_id, icon, color, image_url, description, is_active,
            requires_equipment, equipment_list, metadata, owner_branch_id, visibility
        from class_categories
        where tenant_id = $1
          and ($2::uuid is null or parent_id = $2)
          and ($3::bool is not true or parent_id is null)
          and ($4::bool is null or is_active = $4)
          and ($5::text is null or status = $5)
          and ($6::text is null or name ilike '%' || $6 || '%' or code ilike '%' || $6 || '%' or name_en ilike '%' || $6 || '%')
        "#,
    )
    .bind(tenant_id)
    .bind(parent_id)
    .bind(parent_id_null)
    .bind(is_active)
    .bind(filters.status)
    .bind(search)
    .fetch_all(&state.db)
    .await?;

    match sort_by {
        "code" => categories.sort_by(|a, b| a.code.cmp(&b.code)),
        "name" => categories.sort_by(|a, b| a.name.cmp(&b.name)),
        _ => categories.sort_by_key(|c| c.sort.unwrap_or(i32::MAX)),
    }
    if sort_desc {
        categories.reverse();
    }

    Ok((StatusCode::OK, Json(paginated(categories, filters.page, filters.limit))))
}

pub async fn get(
    auth: AuthContext,
    State(state): State<AppState>,
    Path(id): Path<Uuid>,
) -> Result<impl IntoResponse, AppError> {
    let tenant_id = require_tenant(&auth)?;
    let category = fetch_category(&state, tenant_id, id).await?;
    Ok((StatusCode::OK, Json(ApiResponse { success: true, data: category })))
}

pub async fn create(
    auth: AuthContext,
    State(state): State<AppState>,
    Json(payload): Json<CreateCategoryRequest>,
) -> Result<impl IntoResponse, AppError> {
    let tenant_id = require_tenant(&auth)?;
    validate_create(&payload)?;
    ensure_parent_scope(&state, tenant_id, payload.parent_id, None).await?;
    ensure_branch_scope(&state, tenant_id, payload.owner_branch_id).await?;

    let category = sqlx::query_as::<_, ClassCategory>(
        r#"
        insert into class_categories (
            tenant_id, status, sort, created_by, code, name, name_en, parent_id, icon, color,
            image_url, description, is_active, requires_equipment, equipment_list, metadata,
            owner_branch_id, visibility
        ) values (
            $1, coalesce($2, 'published'), $3, $4, lower($5), $6, $7, $8, $9,
            coalesce($10, '#6366f1'), $11, $12, coalesce($13, true), coalesce($14, false),
            coalesce($15, '[]'::jsonb), coalesce($16, '{}'::jsonb), $17, coalesce($18, 'shared')
        )
        returning id, status, sort, created_at, updated_at, created_by, updated_by, code, name,
            name_en, parent_id, icon, color, image_url, description, is_active,
            requires_equipment, equipment_list, metadata, owner_branch_id, visibility
        "#,
    )
    .bind(tenant_id)
    .bind(payload.status.as_deref().map(str::trim))
    .bind(payload.sort)
    .bind(auth.user.employee_id)
    .bind(payload.code.trim())
    .bind(payload.name.trim())
    .bind(trim_opt(payload.name_en))
    .bind(payload.parent_id)
    .bind(trim_opt(payload.icon))
    .bind(trim_opt(payload.color))
    .bind(trim_opt(payload.image_url))
    .bind(trim_opt(payload.description))
    .bind(payload.is_active)
    .bind(payload.requires_equipment)
    .bind(payload.equipment_list)
    .bind(payload.metadata)
    .bind(payload.owner_branch_id)
    .bind(trim_opt(payload.visibility))
    .fetch_one(&state.db)
    .await?;

    Ok((StatusCode::CREATED, Json(ApiResponse { success: true, data: category })))
}

pub async fn update(
    auth: AuthContext,
    State(state): State<AppState>,
    Path(id): Path<Uuid>,
    Json(payload): Json<UpdateCategoryRequest>,
) -> Result<impl IntoResponse, AppError> {
    let tenant_id = require_tenant(&auth)?;
    validate_update(&payload)?;
    ensure_parent_scope(&state, tenant_id, payload.parent_id, Some(id)).await?;
    ensure_branch_scope(&state, tenant_id, payload.owner_branch_id).await?;

    let old_code = sqlx::query_scalar::<_, String>(
        "select code from class_categories where id = $1 and tenant_id = $2",
    )
    .bind(id)
    .bind(tenant_id)
    .fetch_optional(&state.db)
    .await?
    .ok_or(AppError::NotFound)?;

    let category = sqlx::query_as::<_, ClassCategory>(
        r#"
        update class_categories
        set status = coalesce($3, status),
            sort = coalesce($4, sort),
            updated_by = $5,
            code = coalesce(lower($6), code),
            name = coalesce($7, name),
            name_en = coalesce($8, name_en),
            parent_id = coalesce($9, parent_id),
            icon = coalesce($10, icon),
            color = coalesce($11, color),
            image_url = coalesce($12, image_url),
            description = coalesce($13, description),
            is_active = coalesce($14, is_active),
            requires_equipment = coalesce($15, requires_equipment),
            equipment_list = coalesce($16, equipment_list),
            metadata = coalesce($17, metadata),
            owner_branch_id = coalesce($18, owner_branch_id),
            visibility = coalesce($19, visibility),
            updated_at = now()
        where id = $1 and tenant_id = $2
        returning id, status, sort, created_at, updated_at, created_by, updated_by, code, name,
            name_en, parent_id, icon, color, image_url, description, is_active,
            requires_equipment, equipment_list, metadata, owner_branch_id, visibility
        "#,
    )
    .bind(id)
    .bind(tenant_id)
    .bind(payload.status.as_deref().map(str::trim))
    .bind(payload.sort)
    .bind(auth.user.employee_id)
    .bind(payload.code.as_deref().map(str::trim))
    .bind(payload.name.as_deref().map(str::trim))
    .bind(trim_opt(payload.name_en))
    .bind(payload.parent_id)
    .bind(trim_opt(payload.icon))
    .bind(trim_opt(payload.color))
    .bind(trim_opt(payload.image_url))
    .bind(trim_opt(payload.description))
    .bind(payload.is_active)
    .bind(payload.requires_equipment)
    .bind(payload.equipment_list)
    .bind(payload.metadata)
    .bind(payload.owner_branch_id)
    .bind(trim_opt(payload.visibility))
    .fetch_one(&state.db)
    .await?;

    if old_code != category.code {
        sync_class_category_code(&state, tenant_id, &old_code, &category.code).await?;
    }

    Ok((StatusCode::OK, Json(ApiResponse { success: true, data: category })))
}

pub async fn delete(
    auth: AuthContext,
    State(state): State<AppState>,
    Path(id): Path<Uuid>,
) -> Result<impl IntoResponse, AppError> {
    let tenant_id = require_tenant(&auth)?;
    let category = sqlx::query_as::<_, ClassCategory>(
        r#"
        update class_categories
        set status = 'archived', is_active = false, updated_at = now(), updated_by = $3
        where id = $1 and tenant_id = $2
        returning id, status, sort, created_at, updated_at, created_by, updated_by, code, name,
            name_en, parent_id, icon, color, image_url, description, is_active,
            requires_equipment, equipment_list, metadata, owner_branch_id, visibility
        "#,
    )
    .bind(id)
    .bind(tenant_id)
    .bind(auth.user.employee_id)
    .fetch_optional(&state.db)
    .await?
    .ok_or(AppError::NotFound)?;

    Ok((StatusCode::OK, Json(ApiResponse { success: true, data: category })))
}

async fn seed_legacy_categories(state: &AppState, tenant_id: Uuid) -> Result<(), AppError> {
    sqlx::query(
        r#"
        insert into class_categories (tenant_id, code, name, status, is_active, metadata)
        select distinct $1, lower(classes.category), classes.category, 'published', true,
            jsonb_build_object('source', 'classes.category')
        from classes
        join branches on branches.id = classes.branch_id
        where branches.tenant_id = $1
          and classes.category is not null
          and btrim(classes.category) <> ''
        on conflict (tenant_id, code) do nothing
        "#,
    )
    .bind(tenant_id)
    .execute(&state.db)
    .await?;
    Ok(())
}

async fn fetch_category(state: &AppState, tenant_id: Uuid, id: Uuid) -> Result<ClassCategory, AppError> {
    sqlx::query_as::<_, ClassCategory>(
        r#"
        select id, status, sort, created_at, updated_at, created_by, updated_by, code, name,
            name_en, parent_id, icon, color, image_url, description, is_active,
            requires_equipment, equipment_list, metadata, owner_branch_id, visibility
        from class_categories
        where id = $1 and tenant_id = $2
        "#,
    )
    .bind(id)
    .bind(tenant_id)
    .fetch_optional(&state.db)
    .await?
    .ok_or(AppError::NotFound)
}

async fn ensure_parent_scope(
    state: &AppState,
    tenant_id: Uuid,
    parent_id: Option<Uuid>,
    current_id: Option<Uuid>,
) -> Result<(), AppError> {
    let Some(parent_id) = parent_id else {
        return Ok(());
    };
    if current_id == Some(parent_id) {
        return Err(AppError::Validation("parent_id must not reference the same category".into()));
    }
    let exists = sqlx::query_scalar::<_, bool>(
        "select exists(select 1 from class_categories where id = $1 and tenant_id = $2)",
    )
    .bind(parent_id)
    .bind(tenant_id)
    .fetch_one(&state.db)
    .await?;
    if exists {
        Ok(())
    } else {
        Err(AppError::Validation("parent_id is invalid for this tenant".into()))
    }
}

async fn ensure_branch_scope(state: &AppState, tenant_id: Uuid, branch_id: Option<Uuid>) -> Result<(), AppError> {
    let Some(branch_id) = branch_id else {
        return Ok(());
    };
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
        Err(AppError::Validation("owner_branch_id is invalid for this tenant".into()))
    }
}

async fn sync_class_category_code(
    state: &AppState,
    tenant_id: Uuid,
    old_code: &str,
    new_code: &str,
) -> Result<(), AppError> {
    sqlx::query(
        r#"
        update classes
        set category = $3, updated_at = now()
        where lower(category) = lower($2)
          and exists(select 1 from branches where branches.id = classes.branch_id and branches.tenant_id = $1)
        "#,
    )
    .bind(tenant_id)
    .bind(old_code)
    .bind(new_code)
    .execute(&state.db)
    .await?;
    Ok(())
}

fn require_tenant(auth: &AuthContext) -> Result<Uuid, AppError> {
    auth.user.tenant_id.ok_or(AppError::Unauthorized)
}

fn validate_create(payload: &CreateCategoryRequest) -> Result<(), AppError> {
    validation::required_text("code", &payload.code)?;
    validation::required_text("name", &payload.name)?;
    validate_code(&payload.code)?;
    validate_visibility(payload.visibility.as_deref())?;
    validate_status(payload.status.as_deref())
}

fn validate_update(payload: &UpdateCategoryRequest) -> Result<(), AppError> {
    if let Some(code) = &payload.code {
        validation::required_text("code", code)?;
        validate_code(code)?;
    }
    if let Some(name) = &payload.name {
        validation::required_text("name", name)?;
    }
    validate_visibility(payload.visibility.as_deref())?;
    validate_status(payload.status.as_deref())
}

fn validate_code(code: &str) -> Result<(), AppError> {
    let code = code.trim();
    let mut chars = code.chars();
    let Some(first) = chars.next() else {
        return Err(AppError::Validation("code is required".into()));
    };
    if !first.is_ascii_lowercase() || !chars.all(|c| c.is_ascii_lowercase() || c.is_ascii_digit() || c == '_') {
        return Err(AppError::Validation("code must start with a lowercase letter and contain only lowercase letters, digits, or underscores".into()));
    }
    Ok(())
}

fn validate_visibility(visibility: Option<&str>) -> Result<(), AppError> {
    match visibility {
        None | Some("shared") | Some("owner_only") => Ok(()),
        _ => Err(AppError::Validation("visibility is invalid".into())),
    }
}

fn validate_status(status: Option<&str>) -> Result<(), AppError> {
    match status {
        None | Some("published") | Some("draft") | Some("archived") => Ok(()),
        _ => Err(AppError::Validation("status is invalid".into())),
    }
}

fn trim_opt(value: Option<String>) -> Option<String> {
    value.map(|s| s.trim().to_string()).filter(|s| !s.is_empty())
}

fn paginated<T>(data: Vec<T>, page: Option<i64>, limit: Option<i64>) -> PaginatedResponse<Vec<T>> {
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

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn rejects_invalid_category_code() {
        assert!(validate_code("Yoga").is_err());
        assert!(validate_code("1yoga").is_err());
        assert!(validate_code("yoga_flow").is_ok());
    }
}
