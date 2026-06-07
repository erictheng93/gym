use axum::{
    extract::{Path, Query, State},
    http::StatusCode,
    response::IntoResponse,
    Json,
};
use chrono::NaiveDate;
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
pub struct EmployeeFilters {
    search: Option<String>,
    #[serde(rename = "branchId")]
    branch_id_camel: Option<Uuid>,
    branch_id: Option<Uuid>,
    #[serde(rename = "jobTitleId")]
    job_title_id_camel: Option<Uuid>,
    job_title_id: Option<Uuid>,
    status: Option<String>,
    employment_status: Option<String>,
    page: Option<i64>,
    limit: Option<i64>,
}

#[derive(Debug, Deserialize)]
pub struct CreateEmployeeRequest {
    user_id: Option<Uuid>,
    branch_id: Option<Uuid>,
    #[serde(rename = "branchId")]
    branch_id_camel: Option<Uuid>,
    job_title_id: Option<Uuid>,
    #[serde(rename = "jobTitleId")]
    job_title_id_camel: Option<Uuid>,
    employee_code: Option<String>,
    #[serde(rename = "employeeCode")]
    employee_code_camel: Option<String>,
    full_name: String,
    #[serde(rename = "fullName")]
    full_name_camel: Option<String>,
    phone: Option<String>,
    email: Option<String>,
    employment_status: Option<String>,
    status: Option<String>,
    employment_type: Option<String>,
    #[serde(rename = "employmentType")]
    employment_type_camel: Option<String>,
    hire_date: Option<NaiveDate>,
    #[serde(rename = "hireDate")]
    hire_date_camel: Option<NaiveDate>,
    resign_date: Option<NaiveDate>,
    #[serde(rename = "resignDate")]
    resign_date_camel: Option<NaiveDate>,
    basic_salary: Option<f64>,
    #[serde(rename = "basicSalary")]
    basic_salary_camel: Option<f64>,
    custom_permissions: Option<Value>,
    #[serde(rename = "customPermissions")]
    custom_permissions_camel: Option<Value>,
}

#[derive(Debug, Deserialize)]
pub struct UpdateEmployeeRequest {
    user_id: Option<Uuid>,
    branch_id: Option<Uuid>,
    #[serde(rename = "branchId")]
    branch_id_camel: Option<Uuid>,
    job_title_id: Option<Uuid>,
    #[serde(rename = "jobTitleId")]
    job_title_id_camel: Option<Uuid>,
    employee_code: Option<String>,
    #[serde(rename = "employeeCode")]
    employee_code_camel: Option<String>,
    full_name: Option<String>,
    #[serde(rename = "fullName")]
    full_name_camel: Option<String>,
    phone: Option<String>,
    email: Option<String>,
    employment_status: Option<String>,
    status: Option<String>,
    employment_type: Option<String>,
    #[serde(rename = "employmentType")]
    employment_type_camel: Option<String>,
    hire_date: Option<NaiveDate>,
    #[serde(rename = "hireDate")]
    hire_date_camel: Option<NaiveDate>,
    resign_date: Option<NaiveDate>,
    #[serde(rename = "resignDate")]
    resign_date_camel: Option<NaiveDate>,
    basic_salary: Option<f64>,
    #[serde(rename = "basicSalary")]
    basic_salary_camel: Option<f64>,
    custom_permissions: Option<Value>,
    #[serde(rename = "customPermissions")]
    custom_permissions_camel: Option<Value>,
}

#[derive(Debug, Serialize, FromRow)]
pub struct Employee {
    id: Uuid,
    user_id: Option<Uuid>,
    branch_id: Uuid,
    job_title_id: Uuid,
    employee_code: String,
    full_name: String,
    phone: Option<String>,
    email: Option<String>,
    employment_status: String,
    status: String,
    employment_type: String,
    hire_date: NaiveDate,
    resign_date: Option<NaiveDate>,
    basic_salary: Option<f64>,
    custom_permissions: Option<Value>,
    tenant_id: Option<Uuid>,
}

#[derive(Debug, Deserialize)]
pub struct JobTitleFilters {
    #[serde(rename = "status")]
    _status: Option<String>,
    search: Option<String>,
    page: Option<i64>,
    limit: Option<i64>,
}

#[derive(Debug, Deserialize)]
pub struct CreateJobTitleRequest {
    name: String,
    code: Option<String>,
    description: Option<String>,
    level: Option<i32>,
    sort: Option<i32>,
    permissions_config: Option<Value>,
    #[serde(rename = "permissionsConfig")]
    permissions_config_camel: Option<Value>,
}

#[derive(Debug, Deserialize)]
pub struct UpdateJobTitleRequest {
    name: Option<String>,
    code: Option<String>,
    description: Option<String>,
    level: Option<i32>,
    sort: Option<i32>,
    permissions_config: Option<Value>,
    #[serde(rename = "permissionsConfig")]
    permissions_config_camel: Option<Value>,
}

#[derive(Debug, Serialize, FromRow)]
pub struct JobTitle {
    id: Uuid,
    name: String,
    code: String,
    description: Option<String>,
    level: Option<i32>,
    sort: Option<i32>,
    permissions_config: Value,
    tenant_id: Option<Uuid>,
}

pub async fn list_employees(
    auth: AuthContext,
    State(state): State<AppState>,
    Query(filters): Query<EmployeeFilters>,
) -> Result<impl IntoResponse, AppError> {
    let tenant_id = require_tenant(&auth)?;
    let branch_id = filters.branch_id.or(filters.branch_id_camel);
    let job_title_id = filters.job_title_id.or(filters.job_title_id_camel);
    let status = filters.employment_status.or(filters.status);
    let search = filters.search.map(|s| s.trim().to_string()).filter(|s| !s.is_empty());
    let employee_sql = employee_select(
        r#"
        where employees.tenant_id = $1
          and ($2::uuid is null or employees.branch_id = $2)
          and ($3::uuid is null or employees.job_title_id = $3)
          and ($4::text is null or employees.status = $4)
          and (
            $5::text is null
            or employees.full_name ilike '%' || $5 || '%'
            or employees.employee_code ilike '%' || $5 || '%'
            or employees.email ilike '%' || $5 || '%'
            or employees.phone ilike '%' || $5 || '%'
          )
        order by employees.created_at desc
        "#,
    );
    let employees = sqlx::query_as::<_, Employee>(&employee_sql)
    .bind(tenant_id)
    .bind(branch_id)
    .bind(job_title_id)
    .bind(status)
    .bind(search)
    .fetch_all(&state.db)
    .await?;

    let total = employees.len() as i64;
    let page = filters.page.unwrap_or(1).max(1);
    let limit = filters.limit.unwrap_or(total.max(1)).max(1);
    Ok((StatusCode::OK, Json(paginated(employees, total, page, limit))))
}

pub async fn get_employee(
    auth: AuthContext,
    State(state): State<AppState>,
    Path(id): Path<Uuid>,
) -> Result<impl IntoResponse, AppError> {
    let tenant_id = require_tenant(&auth)?;
    let employee = fetch_employee(&state, tenant_id, id).await?;
    Ok((StatusCode::OK, Json(ApiResponse { success: true, data: employee })))
}

pub async fn create_employee(
    auth: AuthContext,
    State(state): State<AppState>,
    Json(payload): Json<CreateEmployeeRequest>,
) -> Result<impl IntoResponse, AppError> {
    let tenant_id = require_tenant(&auth)?;
    let full_name = payload.full_name_camel.as_ref().unwrap_or(&payload.full_name).trim().to_string();
    validation::required_text("full_name", &full_name)?;
    let branch_id = payload.branch_id.or(payload.branch_id_camel).ok_or_else(|| AppError::Validation("branch_id is required".into()))?;
    let job_title_id = payload.job_title_id.or(payload.job_title_id_camel).ok_or_else(|| AppError::Validation("job_title_id is required".into()))?;
    let employee_code = payload.employee_code.or(payload.employee_code_camel).unwrap_or_else(|| format!("EMP{}", Uuid::new_v4().simple().to_string()[..8].to_uppercase()));
    let employment_type = payload.employment_type.or(payload.employment_type_camel).unwrap_or_else(|| "FULL_TIME".into());
    let status = payload.employment_status.or(payload.status).unwrap_or_else(|| "ACTIVE".into());
    let hire_date = payload.hire_date.or(payload.hire_date_camel).unwrap_or_else(|| chrono::Utc::now().date_naive());
    let resign_date = payload.resign_date.or(payload.resign_date_camel);
    let basic_salary = payload.basic_salary.or(payload.basic_salary_camel);
    let custom_permissions = payload.custom_permissions.or(payload.custom_permissions_camel);
    ensure_branch_scope(&state, tenant_id, branch_id).await?;
    ensure_job_title_scope(&state, tenant_id, job_title_id).await?;
    ensure_user_scope(&state, tenant_id, payload.user_id).await?;

    let employee = sqlx::query_as::<_, Employee>(
        &format!(
            r#"
            insert into employees (
                id, user_id, branch_id, job_title_id, employee_code, full_name, phone, email,
                status, employment_type, hire_date, resign_date, basic_salary, custom_permissions,
                tenant_id
            ) values (
                gen_random_uuid(), $1, $2, $3, $4, $5, $6, $7,
                $8, $9, $10, $11, ($12::double precision)::numeric, $13, $14
            )
            returning
            {}
            "#,
            employee_returning_fields(),
        ),
    )
    .bind(payload.user_id)
    .bind(branch_id)
    .bind(job_title_id)
    .bind(employee_code.trim())
    .bind(full_name)
    .bind(payload.phone)
    .bind(payload.email)
    .bind(status.trim())
    .bind(employment_type.trim())
    .bind(hire_date)
    .bind(resign_date)
    .bind(basic_salary)
    .bind(custom_permissions)
    .bind(tenant_id)
    .fetch_one(&state.db)
    .await?;

    Ok((StatusCode::CREATED, Json(ApiResponse { success: true, data: employee })))
}

pub async fn update_employee(
    auth: AuthContext,
    State(state): State<AppState>,
    Path(id): Path<Uuid>,
    Json(payload): Json<UpdateEmployeeRequest>,
) -> Result<impl IntoResponse, AppError> {
    let tenant_id = require_tenant(&auth)?;
    if let Some(branch_id) = payload.branch_id.or(payload.branch_id_camel) {
        ensure_branch_scope(&state, tenant_id, branch_id).await?;
    }
    if let Some(job_title_id) = payload.job_title_id.or(payload.job_title_id_camel) {
        ensure_job_title_scope(&state, tenant_id, job_title_id).await?;
    }
    ensure_user_scope(&state, tenant_id, payload.user_id).await?;

    let employee = sqlx::query_as::<_, Employee>(&format!(
        r#"
        update employees set
            user_id = coalesce($3, user_id),
            branch_id = coalesce($4, branch_id),
            job_title_id = coalesce($5, job_title_id),
            employee_code = coalesce($6, employee_code),
            full_name = coalesce($7, full_name),
            phone = coalesce($8, phone),
            email = coalesce($9, email),
            status = coalesce($10, status),
            employment_type = coalesce($11, employment_type),
            hire_date = coalesce($12, hire_date),
            resign_date = coalesce($13, resign_date),
            basic_salary = coalesce(($14::double precision)::numeric, basic_salary),
            custom_permissions = coalesce($15, custom_permissions),
            updated_at = now()
        where id = $1 and tenant_id = $2
        returning
        {}
        "#,
        employee_returning_fields(),
    ))
    .bind(id)
    .bind(tenant_id)
    .bind(payload.user_id)
    .bind(payload.branch_id.or(payload.branch_id_camel))
    .bind(payload.job_title_id.or(payload.job_title_id_camel))
    .bind(payload.employee_code.or(payload.employee_code_camel))
    .bind(payload.full_name.or(payload.full_name_camel))
    .bind(payload.phone)
    .bind(payload.email)
    .bind(payload.employment_status.or(payload.status))
    .bind(payload.employment_type.or(payload.employment_type_camel))
    .bind(payload.hire_date.or(payload.hire_date_camel))
    .bind(payload.resign_date.or(payload.resign_date_camel))
    .bind(payload.basic_salary.or(payload.basic_salary_camel))
    .bind(payload.custom_permissions.or(payload.custom_permissions_camel))
    .fetch_optional(&state.db)
    .await?
    .ok_or(AppError::NotFound)?;

    Ok((StatusCode::OK, Json(ApiResponse { success: true, data: employee })))
}

pub async fn delete_employee(
    auth: AuthContext,
    State(state): State<AppState>,
    Path(id): Path<Uuid>,
) -> Result<impl IntoResponse, AppError> {
    let tenant_id = require_tenant(&auth)?;
    let result = sqlx::query("delete from employees where id = $1 and tenant_id = $2")
        .bind(id)
        .bind(tenant_id)
        .execute(&state.db)
        .await?;
    if result.rows_affected() == 0 {
        return Err(AppError::NotFound);
    }
    Ok((StatusCode::OK, Json(ApiResponse { success: true, data: serde_json::json!({"id": id}) })))
}

pub async fn list_job_titles(
    auth: AuthContext,
    State(state): State<AppState>,
    Query(filters): Query<JobTitleFilters>,
) -> Result<impl IntoResponse, AppError> {
    let tenant_id = require_tenant(&auth)?;
    let search = filters.search.map(|s| s.trim().to_string()).filter(|s| !s.is_empty());
    let job_titles = sqlx::query_as::<_, JobTitle>(
        r#"
        select id, name, code, description, level, sort, permissions_config, tenant_id
        from job_titles
        where tenant_id = $1
          and ($2::text is null or name ilike '%' || $2 || '%' or code ilike '%' || $2 || '%')
        order by sort nulls last, name
        "#,
    )
    .bind(tenant_id)
    .bind(search)
    .fetch_all(&state.db)
    .await?;
    let total = job_titles.len() as i64;
    let page = filters.page.unwrap_or(1).max(1);
    let limit = filters.limit.unwrap_or(total.max(1)).max(1);
    Ok((StatusCode::OK, Json(paginated(job_titles, total, page, limit))))
}

pub async fn get_job_title(
    auth: AuthContext,
    State(state): State<AppState>,
    Path(id): Path<Uuid>,
) -> Result<impl IntoResponse, AppError> {
    let tenant_id = require_tenant(&auth)?;
    let job_title = fetch_job_title(&state, tenant_id, id).await?;
    Ok((StatusCode::OK, Json(ApiResponse { success: true, data: job_title })))
}

pub async fn create_job_title(
    auth: AuthContext,
    State(state): State<AppState>,
    Json(payload): Json<CreateJobTitleRequest>,
) -> Result<impl IntoResponse, AppError> {
    let tenant_id = require_tenant(&auth)?;
    validation::required_text("name", &payload.name)?;
    let code = payload.code.unwrap_or_else(|| format!("JT{}", Uuid::new_v4().simple().to_string()[..8].to_uppercase()));
    let permissions = payload.permissions_config.or(payload.permissions_config_camel).unwrap_or_else(|| serde_json::json!({}));
    let job_title = sqlx::query_as::<_, JobTitle>(
        r#"
        insert into job_titles (id, name, code, description, level, sort, permissions_config, tenant_id)
        values (gen_random_uuid(), $1, $2, $3, $4, $5, $6, $7)
        returning id, name, code, description, level, sort, permissions_config, tenant_id
        "#,
    )
    .bind(payload.name.trim())
    .bind(code.trim())
    .bind(payload.description)
    .bind(payload.level)
    .bind(payload.sort)
    .bind(permissions)
    .bind(tenant_id)
    .fetch_one(&state.db)
    .await?;
    Ok((StatusCode::CREATED, Json(ApiResponse { success: true, data: job_title })))
}

pub async fn update_job_title(
    auth: AuthContext,
    State(state): State<AppState>,
    Path(id): Path<Uuid>,
    Json(payload): Json<UpdateJobTitleRequest>,
) -> Result<impl IntoResponse, AppError> {
    let tenant_id = require_tenant(&auth)?;
    if let Some(name) = payload.name.as_ref() {
        validation::required_text("name", name)?;
    }
    let job_title = sqlx::query_as::<_, JobTitle>(
        r#"
        update job_titles set
            name = coalesce($3, name),
            code = coalesce($4, code),
            description = coalesce($5, description),
            level = coalesce($6, level),
            sort = coalesce($7, sort),
            permissions_config = coalesce($8, permissions_config)
        where id = $1 and tenant_id = $2
        returning id, name, code, description, level, sort, permissions_config, tenant_id
        "#,
    )
    .bind(id)
    .bind(tenant_id)
    .bind(payload.name)
    .bind(payload.code)
    .bind(payload.description)
    .bind(payload.level)
    .bind(payload.sort)
    .bind(payload.permissions_config.or(payload.permissions_config_camel))
    .fetch_optional(&state.db)
    .await?
    .ok_or(AppError::NotFound)?;
    Ok((StatusCode::OK, Json(ApiResponse { success: true, data: job_title })))
}

pub async fn delete_job_title(
    auth: AuthContext,
    State(state): State<AppState>,
    Path(id): Path<Uuid>,
) -> Result<impl IntoResponse, AppError> {
    let tenant_id = require_tenant(&auth)?;
    let result = sqlx::query("delete from job_titles where id = $1 and tenant_id = $2")
        .bind(id)
        .bind(tenant_id)
        .execute(&state.db)
        .await?;
    if result.rows_affected() == 0 {
        return Err(AppError::NotFound);
    }
    Ok((StatusCode::OK, Json(ApiResponse { success: true, data: serde_json::json!({"id": id}) })))
}

async fn fetch_employee(state: &AppState, tenant_id: Uuid, id: Uuid) -> Result<Employee, AppError> {
    sqlx::query_as::<_, Employee>(&employee_select("where employees.id = $1 and employees.tenant_id = $2"))
        .bind(id)
        .bind(tenant_id)
        .fetch_optional(&state.db)
        .await?
        .ok_or(AppError::NotFound)
}

async fn fetch_job_title(state: &AppState, tenant_id: Uuid, id: Uuid) -> Result<JobTitle, AppError> {
    sqlx::query_as::<_, JobTitle>(
        "select id, name, code, description, level, sort, permissions_config, tenant_id from job_titles where id = $1 and tenant_id = $2",
    )
    .bind(id)
    .bind(tenant_id)
    .fetch_optional(&state.db)
    .await?
    .ok_or(AppError::NotFound)
}

async fn ensure_branch_scope(state: &AppState, tenant_id: Uuid, branch_id: Uuid) -> Result<(), AppError> {
    ensure_exists(&state.db, "branches", tenant_id, branch_id, "branch_id").await
}

async fn ensure_job_title_scope(state: &AppState, tenant_id: Uuid, job_title_id: Uuid) -> Result<(), AppError> {
    ensure_exists(&state.db, "job_titles", tenant_id, job_title_id, "job_title_id").await
}

async fn ensure_user_scope(state: &AppState, tenant_id: Uuid, user_id: Option<Uuid>) -> Result<(), AppError> {
    let Some(user_id) = user_id else { return Ok(()); };
    ensure_exists(&state.db, "users", tenant_id, user_id, "user_id").await
}

async fn ensure_exists(pool: &sqlx::PgPool, table: &str, tenant_id: Uuid, id: Uuid, field: &str) -> Result<(), AppError> {
    let sql = format!("select exists(select 1 from {table} where id = $1 and tenant_id = $2)");
    let exists = sqlx::query_scalar::<_, bool>(&sql)
        .bind(id)
        .bind(tenant_id)
        .fetch_one(pool)
        .await?;
    if exists { Ok(()) } else { Err(AppError::Validation(format!("{field} is invalid for this tenant"))) }
}

fn employee_select(tail: &str) -> String {
    format!(
        r#"
        select
            {}
        from employees
        {tail}
        "#,
        employee_returning_fields(),
    )
}

fn employee_returning_fields() -> &'static str {
    r#"
            employees.id, employees.user_id, employees.branch_id, employees.job_title_id,
            employees.employee_code, employees.full_name, employees.phone, employees.email,
            employees.status as employment_status, employees.status, employees.employment_type,
            employees.hire_date, employees.resign_date, employees.basic_salary::float8 as basic_salary,
            employees.custom_permissions, employees.tenant_id
    "#
}

fn paginated<T: Serialize>(data: Vec<T>, total: i64, page: i64, limit: i64) -> PaginatedResponse<Vec<T>> {
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

fn require_tenant(auth: &AuthContext) -> Result<Uuid, AppError> {
    auth.user.tenant_id.ok_or(AppError::Unauthorized)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn employee_select_includes_status_aliases() {
        let sql = employee_select("where true");
        assert!(sql.contains("employment_status"));
        assert!(sql.contains("employees.status"));
    }
}
