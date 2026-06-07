use axum::{
    extract::{Path, Query, State},
    http::StatusCode,
    response::IntoResponse,
    Json,
};
use chrono::NaiveDate;
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
pub struct ContractFilters {
    id: Option<Uuid>,
    #[serde(rename = "memberId")]
    member_id: Option<Uuid>,
    #[serde(rename = "member_id")]
    member_id_snake: Option<Uuid>,
    #[serde(rename = "branchId")]
    branch_id: Option<Uuid>,
    #[serde(rename = "branch_id")]
    branch_id_snake: Option<Uuid>,
    status: Option<String>,
    page: Option<i64>,
    limit: Option<i64>,
}

#[derive(Debug, Deserialize)]
pub struct CreateContractRequest {
    #[serde(rename = "contractNo")]
    contract_no: String,
    #[serde(rename = "memberId")]
    member_id: Uuid,
    #[serde(rename = "planId")]
    plan_id: Uuid,
    #[serde(rename = "branchId")]
    branch_id: Uuid,
    #[serde(rename = "salesPersonId")]
    sales_person_id: Option<Uuid>,
    #[serde(default = "default_active")]
    status: String,
    #[serde(rename = "signDate")]
    sign_date: Option<NaiveDate>,
    #[serde(rename = "startDate")]
    start_date: NaiveDate,
    #[serde(rename = "originalEndDate")]
    original_end_date: NaiveDate,
    #[serde(rename = "endDate")]
    end_date: NaiveDate,
    #[serde(rename = "remainingCounts")]
    remaining_counts: Option<i32>,
    #[serde(rename = "totalAmount")]
    total_amount: f64,
    #[serde(rename = "paidAmount", default)]
    paid_amount: f64,
    #[serde(rename = "paymentStatus", default = "default_unpaid")]
    payment_status: String,
    #[serde(rename = "termsAccepted", default)]
    terms_accepted: bool,
    notes: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct UpdateContractRequest {
    status: Option<String>,
    #[serde(rename = "signDate")]
    sign_date: Option<NaiveDate>,
    #[serde(rename = "startDate")]
    start_date: Option<NaiveDate>,
    #[serde(rename = "originalEndDate")]
    original_end_date: Option<NaiveDate>,
    #[serde(rename = "endDate")]
    end_date: Option<NaiveDate>,
    #[serde(rename = "remainingCounts")]
    remaining_counts: Option<i32>,
    #[serde(rename = "totalAmount")]
    total_amount: Option<f64>,
    #[serde(rename = "paidAmount")]
    paid_amount: Option<f64>,
    #[serde(rename = "paymentStatus")]
    payment_status: Option<String>,
    #[serde(rename = "termsAccepted")]
    terms_accepted: Option<bool>,
    notes: Option<String>,
}

#[derive(Debug, Serialize, FromRow)]
pub struct Contract {
    id: Uuid,
    #[serde(rename = "contractNo")]
    contract_no: String,
    #[serde(rename = "memberId")]
    member_id: Uuid,
    #[serde(rename = "planId")]
    plan_id: Uuid,
    #[serde(rename = "branchId")]
    branch_id: Uuid,
    #[serde(rename = "salesPersonId")]
    sales_person_id: Option<Uuid>,
    status: String,
    #[serde(rename = "signDate")]
    sign_date: Option<NaiveDate>,
    #[serde(rename = "startDate")]
    start_date: NaiveDate,
    #[serde(rename = "originalEndDate")]
    original_end_date: NaiveDate,
    #[serde(rename = "endDate")]
    end_date: NaiveDate,
    #[serde(rename = "remainingCounts")]
    remaining_counts: Option<i32>,
    #[serde(rename = "totalAmount")]
    total_amount: f64,
    #[serde(rename = "paidAmount")]
    paid_amount: f64,
    #[serde(rename = "paymentStatus")]
    payment_status: String,
    #[serde(rename = "termsAccepted")]
    terms_accepted: bool,
    notes: Option<String>,
    #[serde(rename = "createdBy")]
    created_by: Option<Uuid>,
    #[serde(rename = "tenantId")]
    tenant_id: Option<Uuid>,
}

#[derive(Debug, FromRow)]
struct PlanInfo {
    plan_type: String,
    class_counts: Option<i32>,
}

fn default_active() -> String {
    "ACTIVE".into()
}

fn default_unpaid() -> String {
    "UNPAID".into()
}

pub async fn list(
    auth: AuthContext,
    State(state): State<AppState>,
    Query(filters): Query<ContractFilters>,
) -> Result<impl IntoResponse, AppError> {
    let tenant_id = require_tenant(&auth)?;
    let member_id = filters.member_id.or(filters.member_id_snake);
    let branch_id = filters.branch_id.or(filters.branch_id_snake);
    let contracts = sqlx::query_as::<_, Contract>(
        r#"
        select
            id, contract_no, member_id, plan_id, branch_id, sales_person_id, status, sign_date,
            start_date, original_end_date, end_date, remaining_counts,
            total_amount::float8 as total_amount, paid_amount::float8 as paid_amount,
            payment_status, terms_accepted, notes, created_by, tenant_id
        from contracts
        where tenant_id = $1
          and ($2::uuid is null or id = $2)
          and ($3::uuid is null or member_id = $3)
          and ($4::uuid is null or branch_id = $4)
          and ($5::text is null or status = $5)
        order by created_at desc
        "#,
    )
    .bind(tenant_id)
    .bind(filters.id)
    .bind(member_id)
    .bind(branch_id)
    .bind(filters.status)
    .fetch_all(&state.db)
    .await?;

    let total = contracts.len() as i64;
    let page = filters.page.unwrap_or(1).max(1);
    let limit = filters.limit.unwrap_or(total.max(1)).max(1);
    Ok((
        StatusCode::OK,
        Json(PaginatedResponse {
            success: true,
            data: contracts,
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
    let contract = fetch_contract(&state, tenant_id, id).await?;

    Ok((StatusCode::OK, Json(ApiResponse { success: true, data: contract })))
}

pub async fn create(
    auth: AuthContext,
    State(state): State<AppState>,
    Json(payload): Json<CreateContractRequest>,
) -> Result<impl IntoResponse, AppError> {
    let tenant_id = require_tenant(&auth)?;
    validate_create(&payload)?;
    ensure_member_scope(&state, tenant_id, payload.member_id).await?;
    ensure_branch_scope(&state, tenant_id, payload.branch_id).await?;
    ensure_employee_scope(&state, tenant_id, payload.sales_person_id).await?;
    let plan = ensure_plan_scope(&state, tenant_id, payload.plan_id).await?;

    let remaining_counts = payload.remaining_counts.or_else(|| {
        (plan.plan_type == "COUNT_BASED").then_some(plan.class_counts.unwrap_or(0))
    });

    let contract = sqlx::query_as::<_, Contract>(
        r#"
        insert into contracts (
            id, contract_no, member_id, plan_id, branch_id, sales_person_id, status, sign_date,
            start_date, original_end_date, end_date, remaining_counts, total_amount, paid_amount,
            payment_status, terms_accepted, notes, created_by, tenant_id
        )
        values (
            gen_random_uuid(), $1, $2, $3, $4, $5, $6, $7, $8, $9,
            $10, $11, ($12::double precision)::numeric, ($13::double precision)::numeric,
            $14, $15, $16, $17, $18
        )
        returning
            id, contract_no, member_id, plan_id, branch_id, sales_person_id, status, sign_date,
            start_date, original_end_date, end_date, remaining_counts,
            total_amount::float8 as total_amount, paid_amount::float8 as paid_amount,
            payment_status, terms_accepted, notes, created_by, tenant_id
        "#,
    )
    .bind(payload.contract_no.trim())
    .bind(payload.member_id)
    .bind(payload.plan_id)
    .bind(payload.branch_id)
    .bind(payload.sales_person_id)
    .bind(payload.status.trim())
    .bind(payload.sign_date)
    .bind(payload.start_date)
    .bind(payload.original_end_date)
    .bind(payload.end_date)
    .bind(remaining_counts)
    .bind(payload.total_amount)
    .bind(payload.paid_amount)
    .bind(payload.payment_status.trim())
    .bind(payload.terms_accepted)
    .bind(payload.notes)
    .bind(auth.user.employee_id)
    .bind(tenant_id)
    .fetch_one(&state.db)
    .await?;

    Ok((StatusCode::CREATED, Json(ApiResponse { success: true, data: contract })))
}

pub async fn update(
    auth: AuthContext,
    State(state): State<AppState>,
    Path(id): Path<Uuid>,
    Json(payload): Json<UpdateContractRequest>,
) -> Result<impl IntoResponse, AppError> {
    let tenant_id = require_tenant(&auth)?;
    validate_update(&payload)?;
    let contract = sqlx::query_as::<_, Contract>(
        r#"
        update contracts
        set
            status = coalesce($3, status),
            sign_date = coalesce($4, sign_date),
            start_date = coalesce($5, start_date),
            original_end_date = coalesce($6, original_end_date),
            end_date = coalesce($7, end_date),
            remaining_counts = coalesce($8, remaining_counts),
            total_amount = coalesce(($9::double precision)::numeric, total_amount),
            paid_amount = coalesce(($10::double precision)::numeric, paid_amount),
            payment_status = coalesce($11, payment_status),
            terms_accepted = coalesce($12, terms_accepted),
            notes = coalesce($13, notes),
            updated_at = now()
        where id = $1 and tenant_id = $2
        returning
            id, contract_no, member_id, plan_id, branch_id, sales_person_id, status, sign_date,
            start_date, original_end_date, end_date, remaining_counts,
            total_amount::float8 as total_amount, paid_amount::float8 as paid_amount,
            payment_status, terms_accepted, notes, created_by, tenant_id
        "#,
    )
    .bind(id)
    .bind(tenant_id)
    .bind(payload.status.as_deref().map(str::trim))
    .bind(payload.sign_date)
    .bind(payload.start_date)
    .bind(payload.original_end_date)
    .bind(payload.end_date)
    .bind(payload.remaining_counts)
    .bind(payload.total_amount)
    .bind(payload.paid_amount)
    .bind(payload.payment_status.as_deref().map(str::trim))
    .bind(payload.terms_accepted)
    .bind(payload.notes)
    .fetch_optional(&state.db)
    .await?
    .ok_or(AppError::NotFound)?;

    Ok((StatusCode::OK, Json(ApiResponse { success: true, data: contract })))
}

pub async fn delete(
    auth: AuthContext,
    State(state): State<AppState>,
    Path(id): Path<Uuid>,
) -> Result<impl IntoResponse, AppError> {
    let tenant_id = require_tenant(&auth)?;
    let contract = sqlx::query_as::<_, Contract>(
        r#"
        update contracts
        set status = 'CANCELLED', updated_at = now()
        where id = $1 and tenant_id = $2
        returning
            id, contract_no, member_id, plan_id, branch_id, sales_person_id, status, sign_date,
            start_date, original_end_date, end_date, remaining_counts,
            total_amount::float8 as total_amount, paid_amount::float8 as paid_amount,
            payment_status, terms_accepted, notes, created_by, tenant_id
        "#,
    )
    .bind(id)
    .bind(tenant_id)
    .fetch_optional(&state.db)
    .await?
    .ok_or(AppError::NotFound)?;

    Ok((StatusCode::OK, Json(ApiResponse { success: true, data: contract })))
}

async fn fetch_contract(state: &AppState, tenant_id: Uuid, id: Uuid) -> Result<Contract, AppError> {
    sqlx::query_as::<_, Contract>(
        r#"
        select
            id, contract_no, member_id, plan_id, branch_id, sales_person_id, status, sign_date,
            start_date, original_end_date, end_date, remaining_counts,
            total_amount::float8 as total_amount, paid_amount::float8 as paid_amount,
            payment_status, terms_accepted, notes, created_by, tenant_id
        from contracts
        where id = $1 and tenant_id = $2
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

fn validate_create(payload: &CreateContractRequest) -> Result<(), AppError> {
    validation::required_text("contractNo", &payload.contract_no)?;
    validate_status(&payload.status)?;
    validate_payment_status(&payload.payment_status)?;
    validate_amount("totalAmount", payload.total_amount)?;
    validate_amount("paidAmount", payload.paid_amount)?;
    validate_dates(payload.start_date, payload.end_date)
}

fn validate_update(payload: &UpdateContractRequest) -> Result<(), AppError> {
    if let Some(status) = &payload.status {
        validate_status(status)?;
    }
    if let Some(payment_status) = &payload.payment_status {
        validate_payment_status(payment_status)?;
    }
    if let Some(total_amount) = payload.total_amount {
        validate_amount("totalAmount", total_amount)?;
    }
    if let Some(paid_amount) = payload.paid_amount {
        validate_amount("paidAmount", paid_amount)?;
    }
    if let (Some(start), Some(end)) = (payload.start_date, payload.end_date) {
        validate_dates(start, end)?;
    }

    Ok(())
}

fn validate_status(status: &str) -> Result<(), AppError> {
    match status {
        "ACTIVE" | "PENDING" | "EXPIRED" | "CANCELLED" | "SUSPENDED" => Ok(()),
        _ => Err(AppError::Validation("status is invalid".into())),
    }
}

fn validate_payment_status(status: &str) -> Result<(), AppError> {
    match status {
        "UNPAID" | "PARTIAL" | "PAID" | "REFUNDED" => Ok(()),
        _ => Err(AppError::Validation("paymentStatus is invalid".into())),
    }
}

fn validate_amount(field: &str, amount: f64) -> Result<(), AppError> {
    if amount < 0.0 {
        return Err(AppError::Validation(format!("{field} must not be negative")));
    }
    Ok(())
}

fn validate_dates(start: NaiveDate, end: NaiveDate) -> Result<(), AppError> {
    if end < start {
        return Err(AppError::Validation("endDate must be on or after startDate".into()));
    }
    Ok(())
}

async fn ensure_member_scope(state: &AppState, tenant_id: Uuid, member_id: Uuid) -> Result<(), AppError> {
    ensure_exists(state, "members", tenant_id, member_id, "memberId").await
}

async fn ensure_branch_scope(state: &AppState, tenant_id: Uuid, branch_id: Uuid) -> Result<(), AppError> {
    ensure_exists(state, "branches", tenant_id, branch_id, "branchId").await
}

async fn ensure_employee_scope(
    state: &AppState,
    tenant_id: Uuid,
    employee_id: Option<Uuid>,
) -> Result<(), AppError> {
    let Some(employee_id) = employee_id else {
        return Ok(());
    };
    ensure_exists(state, "employees", tenant_id, employee_id, "salesPersonId").await
}

async fn ensure_plan_scope(state: &AppState, tenant_id: Uuid, plan_id: Uuid) -> Result<PlanInfo, AppError> {
    sqlx::query_as::<_, PlanInfo>(
        "select type as plan_type, class_counts from membership_plans where id = $1 and tenant_id = $2",
    )
    .bind(plan_id)
    .bind(tenant_id)
    .fetch_optional(&state.db)
    .await?
    .ok_or_else(|| AppError::Validation("planId is invalid for this tenant".into()))
}

async fn ensure_exists(
    state: &AppState,
    table: &str,
    tenant_id: Uuid,
    id: Uuid,
    field: &str,
) -> Result<(), AppError> {
    let sql = format!("select exists(select 1 from {table} where id = $1 and tenant_id = $2)");
    let exists = sqlx::query_scalar::<_, bool>(&sql)
        .bind(id)
        .bind(tenant_id)
        .fetch_one(&state.db)
        .await?;

    if exists {
        Ok(())
    } else {
        Err(AppError::Validation(format!("{field} is invalid for this tenant")))
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn rejects_contract_end_date_before_start_date() {
        let start = NaiveDate::from_ymd_opt(2026, 2, 1).unwrap();
        let end = NaiveDate::from_ymd_opt(2026, 1, 1).unwrap();

        assert!(validate_dates(start, end).is_err());
    }
}
