use axum::{
    extract::{Path, Query, State},
    http::{header, HeaderMap, StatusCode},
    response::IntoResponse,
    Json,
};
use chrono::{DateTime, NaiveDate, Utc};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use sqlx::FromRow;
use uuid::Uuid;

use crate::{
    error::AppError,
    http::auth::AuthContext,
    state::AppState,
};

#[derive(Debug, Serialize)]
struct ApiListResponse<T> {
    success: bool,
    data: T,
    meta: Meta,
}

#[derive(Debug, Serialize)]
struct ApiDataResponse<T> {
    success: bool,
    data: T,
}

#[derive(Debug, Serialize)]
struct Meta {
    total: i64,
}

#[derive(Debug, Deserialize)]
pub struct SalaryFilters {
    employee_id: Option<Uuid>,
    period: Option<String>,
    status: Option<String>,
    branch_id: Option<Uuid>,
    limit: Option<i64>,
    offset: Option<i64>,
}

#[derive(Debug, Deserialize)]
pub struct GeneratePayrollRequest {
    period: String,
    branch_id: Option<Uuid>,
    employee_ids: Option<Vec<Uuid>>,
}

#[derive(Debug, Deserialize)]
pub struct UpdateSalaryRequest {
    overtime_hours: Option<f64>,
    overtime_pay: Option<f64>,
    commission: Option<f64>,
    bonus: Option<f64>,
    deductions: Option<f64>,
    notes: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct BatchApproveRequest {
    ids: Option<Vec<Uuid>>,
    record_ids: Option<Vec<Uuid>>,
}

#[derive(Debug, Serialize, FromRow)]
pub struct SalaryRecordRow {
    id: Uuid,
    employee_id: Uuid,
    employee: Value,
    period: String,
    base_salary: f64,
    overtime_hours: f64,
    overtime_pay: f64,
    commission: f64,
    bonus: f64,
    deductions: f64,
    net_salary: f64,
    hourly_rate: Option<f64>,
    work_days: i32,
    leave_days: Option<Value>,
    notes: Option<String>,
    status: String,
    approved_by: Option<Uuid>,
    approved_at: Option<DateTime<Utc>>,
    paid_at: Option<DateTime<Utc>>,
    date_created: Option<DateTime<Utc>>,
}

#[derive(Debug, Deserialize)]
pub struct PromotionFilters {
    employee_id: Option<Uuid>,
    #[serde(rename = "type")]
    promotion_type: Option<String>,
    limit: Option<i64>,
    offset: Option<i64>,
}

#[derive(Debug, Deserialize)]
pub struct CreatePromotionRequest {
    employee_id: Uuid,
    #[serde(rename = "type")]
    promotion_type: String,
    effective_date: NaiveDate,
    to_job_title_id: Option<Uuid>,
    to_branch_id: Option<Uuid>,
    new_base_salary: Option<f64>,
    reason: Option<String>,
}

#[derive(Debug, Serialize, FromRow)]
pub struct PromotionRecordRow {
    id: Uuid,
    employee_id: Uuid,
    employee: Value,
    #[serde(rename = "type")]
    promotion_type: String,
    from_job_title_id: Option<Uuid>,
    to_job_title_id: Option<Uuid>,
    from_job_title: Option<Value>,
    to_job_title: Option<Value>,
    from_branch_id: Option<Uuid>,
    to_branch_id: Option<Uuid>,
    from_branch: Option<Value>,
    to_branch: Option<Value>,
    effective_date: NaiveDate,
    new_base_salary: Option<f64>,
    reason: Option<String>,
    date_created: Option<DateTime<Utc>>,
}

#[derive(Debug, FromRow)]
struct EmployeeForPayroll {
    id: Uuid,
    basic_salary: Option<f64>,
}

pub async fn list_salary_records(
    auth: AuthContext,
    State(state): State<AppState>,
    Query(filters): Query<SalaryFilters>,
) -> Result<impl IntoResponse, AppError> {
    let tenant_id = require_tenant(&auth)?;
    let rows = sqlx::query_as::<_, SalaryRecordRow>(SALARY_SELECT)
        .bind(tenant_id)
        .bind(None::<Uuid>)
        .bind(filters.employee_id)
        .bind(filters.period)
        .bind(filters.status)
        .bind(filters.branch_id)
        .bind(filters.limit.unwrap_or(20).clamp(1, 500))
        .bind(filters.offset.unwrap_or(0).max(0))
        .fetch_all(&state.db)
        .await?;
    let total = rows.len() as i64;
    Ok((StatusCode::OK, Json(ApiListResponse { success: true, data: rows, meta: Meta { total } })))
}

pub async fn get_salary_record(
    auth: AuthContext,
    State(state): State<AppState>,
    Path(id): Path<Uuid>,
) -> Result<impl IntoResponse, AppError> {
    let tenant_id = require_tenant(&auth)?;
    let row = fetch_salary_record(&state, tenant_id, id).await?;
    Ok((StatusCode::OK, Json(ApiDataResponse { success: true, data: row })))
}

pub async fn generate_payroll(
    auth: AuthContext,
    State(state): State<AppState>,
    Json(payload): Json<GeneratePayrollRequest>,
) -> Result<impl IntoResponse, AppError> {
    let tenant_id = require_tenant(&auth)?;
    let employees = sqlx::query_as::<_, EmployeeForPayroll>(
        r#"
        select id, basic_salary::float8 as basic_salary
        from employees
        where tenant_id = $1 and status = 'ACTIVE'
          and ($2::uuid is null or branch_id = $2)
          and ($3::uuid[] is null or id = any($3))
        order by full_name
        "#,
    )
    .bind(tenant_id)
    .bind(payload.branch_id)
    .bind(payload.employee_ids.clone())
    .fetch_all(&state.db)
    .await?;

    let mut records = Vec::new();
    for employee in employees {
        let base_salary = employee.basic_salary.unwrap_or(0.0);
        let id = sqlx::query_scalar::<_, Uuid>(
            r#"
            insert into payroll_salary_records (
                id, employee_id, period, base_salary, overtime_hours, overtime_pay,
                commission, bonus, deductions, net_salary, hourly_rate, work_days,
                leave_days, status, tenant_id
            ) values (
                gen_random_uuid(), $1, $2, ($3::double precision)::numeric, 0, 0,
                0, 0, 0, ($3::double precision)::numeric, null, 0, '{}'::jsonb, 'PENDING', $4
            ) returning id
            "#,
        )
        .bind(employee.id)
        .bind(&payload.period)
        .bind(base_salary)
        .bind(tenant_id)
        .fetch_one(&state.db)
        .await?;
        records.push(fetch_salary_record(&state, tenant_id, id).await?);
    }

    Ok((StatusCode::OK, Json(ApiDataResponse {
        success: true,
        data: json!({ "generated": records.len(), "records": records }),
    })))
}

pub async fn update_salary_record(
    auth: AuthContext,
    State(state): State<AppState>,
    Path(id): Path<Uuid>,
    Json(payload): Json<UpdateSalaryRequest>,
) -> Result<impl IntoResponse, AppError> {
    let tenant_id = require_tenant(&auth)?;
    let updated_id = sqlx::query_scalar::<_, Uuid>(
        r#"
        update payroll_salary_records set
            overtime_hours = coalesce(($3::double precision)::numeric, overtime_hours),
            overtime_pay = coalesce(($4::double precision)::numeric, overtime_pay),
            commission = coalesce(($5::double precision)::numeric, commission),
            bonus = coalesce(($6::double precision)::numeric, bonus),
            deductions = coalesce(($7::double precision)::numeric, deductions),
            notes = coalesce($8, notes),
            net_salary = base_salary + coalesce(($4::double precision)::numeric, overtime_pay)
                + coalesce(($5::double precision)::numeric, commission)
                + coalesce(($6::double precision)::numeric, bonus)
                - coalesce(($7::double precision)::numeric, deductions)
        where id = $1 and tenant_id = $2
        returning id
        "#,
    )
    .bind(id)
    .bind(tenant_id)
    .bind(payload.overtime_hours)
    .bind(payload.overtime_pay)
    .bind(payload.commission)
    .bind(payload.bonus)
    .bind(payload.deductions)
    .bind(payload.notes)
    .fetch_optional(&state.db)
    .await?
    .ok_or(AppError::NotFound)?;
    let row = fetch_salary_record(&state, tenant_id, updated_id).await?;
    Ok((StatusCode::OK, Json(ApiDataResponse { success: true, data: row })))
}

pub async fn approve_salary(
    auth: AuthContext,
    State(state): State<AppState>,
    Path(id): Path<Uuid>,
) -> Result<impl IntoResponse, AppError> {
    let tenant_id = require_tenant(&auth)?;
    let row = set_salary_status(&state, tenant_id, id, "APPROVED", auth.user.employee_id, true).await?;
    Ok((StatusCode::OK, Json(ApiDataResponse { success: true, data: row })))
}

pub async fn batch_approve_salary(
    auth: AuthContext,
    State(state): State<AppState>,
    Json(payload): Json<BatchApproveRequest>,
) -> Result<impl IntoResponse, AppError> {
    let tenant_id = require_tenant(&auth)?;
    let ids = payload.ids.or(payload.record_ids).unwrap_or_default();
    let mut count = 0;
    for id in ids {
        if set_salary_status(&state, tenant_id, id, "APPROVED", auth.user.employee_id, true).await.is_ok() {
            count += 1;
        }
    }
    Ok((StatusCode::OK, Json(ApiDataResponse { success: true, data: json!({ "approved_count": count }) })))
}

pub async fn mark_salary_paid(
    auth: AuthContext,
    State(state): State<AppState>,
    Path(id): Path<Uuid>,
) -> Result<impl IntoResponse, AppError> {
    let tenant_id = require_tenant(&auth)?;
    let row = set_salary_status(&state, tenant_id, id, "PAID", auth.user.employee_id, false).await?;
    Ok((StatusCode::OK, Json(ApiDataResponse { success: true, data: row })))
}

pub async fn export_payroll(
    auth: AuthContext,
    State(_state): State<AppState>,
    Query(filters): Query<SalaryFilters>,
) -> Result<impl IntoResponse, AppError> {
    let _tenant_id = require_tenant(&auth)?;
    let period = filters.period.unwrap_or_else(|| "unknown".into());
    let body = format!("period,total\n{period},0\n");
    let mut headers = HeaderMap::new();
    headers.insert(header::CONTENT_TYPE, "text/csv; charset=utf-8".parse().unwrap());
    Ok((StatusCode::OK, headers, body))
}

pub async fn list_promotions(
    auth: AuthContext,
    State(state): State<AppState>,
    Query(filters): Query<PromotionFilters>,
) -> Result<impl IntoResponse, AppError> {
    let tenant_id = require_tenant(&auth)?;
    let rows = sqlx::query_as::<_, PromotionRecordRow>(PROMOTION_SELECT)
        .bind(tenant_id)
        .bind(None::<Uuid>)
        .bind(filters.employee_id)
        .bind(filters.promotion_type)
        .bind(filters.limit.unwrap_or(20).clamp(1, 500))
        .bind(filters.offset.unwrap_or(0).max(0))
        .fetch_all(&state.db)
        .await?;
    let total = rows.len() as i64;
    Ok((StatusCode::OK, Json(ApiListResponse { success: true, data: rows, meta: Meta { total } })))
}

pub async fn create_promotion(
    auth: AuthContext,
    State(state): State<AppState>,
    Json(payload): Json<CreatePromotionRequest>,
) -> Result<impl IntoResponse, AppError> {
    let tenant_id = require_tenant(&auth)?;
    let current = sqlx::query_as::<_, (Option<Uuid>, Option<Uuid>)>(
        "select job_title_id, branch_id from employees where id = $1 and tenant_id = $2",
    )
    .bind(payload.employee_id)
    .bind(tenant_id)
    .fetch_optional(&state.db)
    .await?
    .ok_or(AppError::NotFound)?;
    let id = sqlx::query_scalar::<_, Uuid>(
        r#"
        insert into payroll_promotions (
            id, employee_id, type, from_job_title_id, to_job_title_id,
            from_branch_id, to_branch_id, effective_date, new_base_salary, reason, tenant_id
        ) values (
            gen_random_uuid(), $1, $2, $3, $4, $5, $6, $7,
            ($8::double precision)::numeric, $9, $10
        ) returning id
        "#,
    )
    .bind(payload.employee_id)
    .bind(payload.promotion_type)
    .bind(current.0)
    .bind(payload.to_job_title_id)
    .bind(current.1)
    .bind(payload.to_branch_id)
    .bind(payload.effective_date)
    .bind(payload.new_base_salary)
    .bind(payload.reason)
    .bind(tenant_id)
    .fetch_one(&state.db)
    .await?;
    let row = fetch_promotion(&state, tenant_id, id).await?;
    Ok((StatusCode::CREATED, Json(ApiDataResponse { success: true, data: row })))
}

async fn set_salary_status(
    state: &AppState,
    tenant_id: Uuid,
    id: Uuid,
    status: &str,
    employee_id: Option<Uuid>,
    set_approved: bool,
) -> Result<SalaryRecordRow, AppError> {
    let updated_id = sqlx::query_scalar::<_, Uuid>(
        r#"
        update payroll_salary_records set
            status = $3,
            approved_by = case when $4::bool then $5 else approved_by end,
            approved_at = case when $4::bool then now() else approved_at end,
            paid_at = case when $3 = 'PAID' then now() else paid_at end
        where id = $1 and tenant_id = $2
        returning id
        "#,
    )
    .bind(id)
    .bind(tenant_id)
    .bind(status)
    .bind(set_approved)
    .bind(employee_id)
    .fetch_optional(&state.db)
    .await?
    .ok_or(AppError::NotFound)?;
    fetch_salary_record(state, tenant_id, updated_id).await
}

async fn fetch_salary_record(state: &AppState, tenant_id: Uuid, id: Uuid) -> Result<SalaryRecordRow, AppError> {
    sqlx::query_as::<_, SalaryRecordRow>(SALARY_SELECT)
        .bind(tenant_id)
        .bind(id)
        .bind(None::<Uuid>)
        .bind(None::<String>)
        .bind(None::<String>)
        .bind(None::<Uuid>)
        .bind(1_i64)
        .bind(0_i64)
        .fetch_optional(&state.db)
        .await?
        .ok_or(AppError::NotFound)
}

async fn fetch_promotion(state: &AppState, tenant_id: Uuid, id: Uuid) -> Result<PromotionRecordRow, AppError> {
    sqlx::query_as::<_, PromotionRecordRow>(PROMOTION_SELECT)
        .bind(tenant_id)
        .bind(id)
        .bind(None::<Uuid>)
        .bind(None::<String>)
        .bind(1_i64)
        .bind(0_i64)
        .fetch_optional(&state.db)
        .await?
        .ok_or(AppError::NotFound)
}

fn require_tenant(auth: &AuthContext) -> Result<Uuid, AppError> {
    auth.user.tenant_id.ok_or(AppError::Unauthorized)
}

const SALARY_SELECT: &str = r#"
    select payroll_salary_records.id, payroll_salary_records.employee_id,
        json_build_object(
            'id', employees.id,
            'full_name', employees.full_name,
            'employee_code', employees.employee_code,
            'base_salary', employees.basic_salary::float8,
            'job_title', json_build_object('name', job_titles.name),
            'branch', json_build_object('name', branches.name)
        ) as employee,
        payroll_salary_records.period,
        payroll_salary_records.base_salary::float8 as base_salary,
        payroll_salary_records.overtime_hours::float8 as overtime_hours,
        payroll_salary_records.overtime_pay::float8 as overtime_pay,
        payroll_salary_records.commission::float8 as commission,
        payroll_salary_records.bonus::float8 as bonus,
        payroll_salary_records.deductions::float8 as deductions,
        payroll_salary_records.net_salary::float8 as net_salary,
        payroll_salary_records.hourly_rate::float8 as hourly_rate,
        payroll_salary_records.work_days,
        payroll_salary_records.leave_days,
        payroll_salary_records.notes,
        payroll_salary_records.status,
        payroll_salary_records.approved_by,
        payroll_salary_records.approved_at,
        payroll_salary_records.paid_at,
        payroll_salary_records.created_at as date_created
    from payroll_salary_records
    join employees on employees.id = payroll_salary_records.employee_id
    join branches on branches.id = employees.branch_id
    join job_titles on job_titles.id = employees.job_title_id
    where payroll_salary_records.tenant_id = $1
      and ($2::uuid is null or payroll_salary_records.id = $2)
      and ($3::uuid is null or payroll_salary_records.employee_id = $3)
      and ($4::text is null or payroll_salary_records.period = $4)
      and ($5::text is null or payroll_salary_records.status = $5)
      and ($6::uuid is null or employees.branch_id = $6)
    order by payroll_salary_records.created_at desc
    limit $7 offset $8
"#;

const PROMOTION_SELECT: &str = r#"
    select payroll_promotions.id, payroll_promotions.employee_id,
        json_build_object('id', employees.id, 'full_name', employees.full_name, 'employee_code', employees.employee_code) as employee,
        payroll_promotions.type as promotion_type,
        payroll_promotions.from_job_title_id,
        payroll_promotions.to_job_title_id,
        case when from_titles.id is null then null else json_build_object('name', from_titles.name) end as from_job_title,
        case when to_titles.id is null then null else json_build_object('name', to_titles.name) end as to_job_title,
        payroll_promotions.from_branch_id,
        payroll_promotions.to_branch_id,
        case when from_branches.id is null then null else json_build_object('name', from_branches.name) end as from_branch,
        case when to_branches.id is null then null else json_build_object('name', to_branches.name) end as to_branch,
        payroll_promotions.effective_date,
        payroll_promotions.new_base_salary::float8 as new_base_salary,
        payroll_promotions.reason,
        payroll_promotions.created_at as date_created
    from payroll_promotions
    join employees on employees.id = payroll_promotions.employee_id
    left join job_titles from_titles on from_titles.id = payroll_promotions.from_job_title_id
    left join job_titles to_titles on to_titles.id = payroll_promotions.to_job_title_id
    left join branches from_branches on from_branches.id = payroll_promotions.from_branch_id
    left join branches to_branches on to_branches.id = payroll_promotions.to_branch_id
    where payroll_promotions.tenant_id = $1
      and ($2::uuid is null or payroll_promotions.id = $2)
      and ($3::uuid is null or payroll_promotions.employee_id = $3)
      and ($4::text is null or payroll_promotions.type = $4)
    order by payroll_promotions.created_at desc
    limit $5 offset $6
"#;
