use axum::{
    extract::{Path, Query, State},
    http::StatusCode,
    response::IntoResponse,
    Json,
};
use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use sqlx::{FromRow, PgPool, Postgres, Transaction};
use uuid::Uuid;

use crate::{
    error::AppError,
    http::{auth::AuthContext, ApiResponse, PaginatedResponse, Pagination},
    state::AppState,
};

#[derive(Debug, Deserialize)]
pub struct PaymentFilters {
    #[serde(rename = "contractId")]
    contract_id: Option<Uuid>,
    #[serde(rename = "contract_id")]
    contract_id_snake: Option<Uuid>,
    #[serde(rename = "memberId")]
    member_id: Option<Uuid>,
    #[serde(rename = "member_id")]
    member_id_snake: Option<Uuid>,
    #[serde(rename = "branchId")]
    branch_id: Option<Uuid>,
    #[serde(rename = "branch_id")]
    branch_id_snake: Option<Uuid>,
    #[serde(rename = "paymentMethod")]
    payment_method: Option<String>,
    #[serde(rename = "payment_method")]
    payment_method_snake: Option<String>,
    #[serde(rename = "type")]
    payment_type: Option<String>,
    page: Option<i64>,
    limit: Option<i64>,
}

#[derive(Debug, Deserialize)]
pub struct CreatePaymentRequest {
    #[serde(rename = "contractId")]
    contract_id: Uuid,
    #[serde(rename = "memberId")]
    member_id: Option<Uuid>,
    #[serde(rename = "branchId")]
    branch_id: Option<Uuid>,
    amount: f64,
    #[serde(rename = "paymentMethod")]
    payment_method: String,
    #[serde(rename = "paymentDate")]
    payment_date: Option<DateTime<Utc>>,
    #[serde(rename = "type", default = "default_income")]
    payment_type: String,
    #[serde(rename = "receiptNo")]
    receipt_no: Option<String>,
    notes: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct UpdatePaymentRequest {
    amount: Option<f64>,
    #[serde(rename = "paymentMethod")]
    payment_method: Option<String>,
    #[serde(rename = "paymentDate")]
    payment_date: Option<DateTime<Utc>>,
    #[serde(rename = "type")]
    payment_type: Option<String>,
    #[serde(rename = "receiptNo")]
    receipt_no: Option<String>,
    notes: Option<String>,
}

#[derive(Debug, Serialize, FromRow)]
pub struct Payment {
    id: Uuid,
    #[serde(rename = "contractId")]
    contract_id: Uuid,
    #[serde(rename = "memberId")]
    member_id: Uuid,
    #[serde(rename = "branchId")]
    branch_id: Uuid,
    amount: f64,
    #[serde(rename = "paymentMethod")]
    payment_method: String,
    #[serde(rename = "paymentDate")]
    payment_date: DateTime<Utc>,
    #[serde(rename = "type")]
    payment_type: String,
    #[serde(rename = "receiptNo")]
    receipt_no: Option<String>,
    notes: Option<String>,
    #[serde(rename = "createdBy")]
    created_by: Option<Uuid>,
    #[serde(rename = "tenantId")]
    tenant_id: Option<Uuid>,
}

#[derive(Debug, FromRow)]
struct ContractPaymentContext {
    id: Uuid,
    member_id: Uuid,
    branch_id: Uuid,
    total_amount: f64,
}

fn default_income() -> String {
    "INCOME".into()
}

pub async fn list(
    auth: AuthContext,
    State(state): State<AppState>,
    Query(filters): Query<PaymentFilters>,
) -> Result<impl IntoResponse, AppError> {
    let tenant_id = require_tenant(&auth)?;
    let contract_id = filters.contract_id.or(filters.contract_id_snake);
    let member_id = filters.member_id.or(filters.member_id_snake);
    let branch_id = filters.branch_id.or(filters.branch_id_snake);
    let payment_method = filters.payment_method.or(filters.payment_method_snake);
    let payments = sqlx::query_as::<_, Payment>(
        r#"
        select
            id, contract_id, member_id, branch_id, amount::float8 as amount,
            payment_method, payment_date, type as payment_type, receipt_no, notes,
            created_by, tenant_id
        from payments
        where tenant_id = $1
          and ($2::uuid is null or contract_id = $2)
          and ($3::uuid is null or member_id = $3)
          and ($4::uuid is null or branch_id = $4)
          and ($5::text is null or payment_method = $5)
          and ($6::text is null or type = $6)
        order by payment_date desc, created_at desc
        "#,
    )
    .bind(tenant_id)
    .bind(contract_id)
    .bind(member_id)
    .bind(branch_id)
    .bind(payment_method)
    .bind(filters.payment_type)
    .fetch_all(&state.db)
    .await?;

    let total = payments.len() as i64;
    let page = filters.page.unwrap_or(1).max(1);
    let limit = filters.limit.unwrap_or(total.max(1)).max(1);

    Ok((
        StatusCode::OK,
        Json(PaginatedResponse {
            success: true,
            data: payments,
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
    let payment = fetch_payment(&state.db, tenant_id, id).await?;

    Ok((StatusCode::OK, Json(ApiResponse { success: true, data: payment })))
}

pub async fn create(
    auth: AuthContext,
    State(state): State<AppState>,
    Json(payload): Json<CreatePaymentRequest>,
) -> Result<impl IntoResponse, AppError> {
    let tenant_id = require_tenant(&auth)?;
    validate_amount(payload.amount)?;
    validate_payment_type(&payload.payment_type)?;
    let contract = fetch_contract_context(&state.db, tenant_id, payload.contract_id).await?;
    let member_id = payload.member_id.unwrap_or(contract.member_id);
    let branch_id = payload.branch_id.unwrap_or(contract.branch_id);
    if member_id != contract.member_id {
        return Err(AppError::Validation("memberId does not match contract".into()));
    }
    if branch_id != contract.branch_id {
        return Err(AppError::Validation("branchId does not match contract".into()));
    }

    let mut tx = state.db.begin().await?;
    let payment = sqlx::query_as::<_, Payment>(
        r#"
        insert into payments (
            id, contract_id, member_id, branch_id, amount, payment_method, payment_date,
            type, receipt_no, notes, created_by, tenant_id
        )
        values (
            gen_random_uuid(), $1, $2, $3, ($4::double precision)::numeric, $5,
            coalesce($6, now()), $7, $8, $9, $10, $11
        )
        returning
            id, contract_id, member_id, branch_id, amount::float8 as amount,
            payment_method, payment_date, type as payment_type, receipt_no, notes,
            created_by, tenant_id
        "#,
    )
    .bind(contract.id)
    .bind(member_id)
    .bind(branch_id)
    .bind(payload.amount)
    .bind(payload.payment_method.trim())
    .bind(payload.payment_date)
    .bind(payload.payment_type.trim())
    .bind(payload.receipt_no)
    .bind(payload.notes)
    .bind(auth.user.employee_id)
    .bind(tenant_id)
    .fetch_one(&mut *tx)
    .await?;

    refresh_contract_payment_status(&mut tx, tenant_id, contract.id, contract.total_amount).await?;
    tx.commit().await?;

    Ok((StatusCode::CREATED, Json(ApiResponse { success: true, data: payment })))
}

pub async fn update(
    auth: AuthContext,
    State(state): State<AppState>,
    Path(id): Path<Uuid>,
    Json(payload): Json<UpdatePaymentRequest>,
) -> Result<impl IntoResponse, AppError> {
    let tenant_id = require_tenant(&auth)?;
    if let Some(amount) = payload.amount {
        validate_amount(amount)?;
    }
    if let Some(payment_type) = &payload.payment_type {
        validate_payment_type(payment_type)?;
    }
    let existing = fetch_payment(&state.db, tenant_id, id).await?;
    let contract = fetch_contract_context(&state.db, tenant_id, existing.contract_id).await?;

    let mut tx = state.db.begin().await?;
    let payment = sqlx::query_as::<_, Payment>(
        r#"
        update payments
        set
            amount = coalesce(($3::double precision)::numeric, amount),
            payment_method = coalesce($4, payment_method),
            payment_date = coalesce($5, payment_date),
            type = coalesce($6, type),
            receipt_no = coalesce($7, receipt_no),
            notes = coalesce($8, notes)
        where id = $1 and tenant_id = $2
        returning
            id, contract_id, member_id, branch_id, amount::float8 as amount,
            payment_method, payment_date, type as payment_type, receipt_no, notes,
            created_by, tenant_id
        "#,
    )
    .bind(id)
    .bind(tenant_id)
    .bind(payload.amount)
    .bind(payload.payment_method.as_deref().map(str::trim))
    .bind(payload.payment_date)
    .bind(payload.payment_type.as_deref().map(str::trim))
    .bind(payload.receipt_no)
    .bind(payload.notes)
    .fetch_one(&mut *tx)
    .await?;

    refresh_contract_payment_status(&mut tx, tenant_id, contract.id, contract.total_amount).await?;
    tx.commit().await?;

    Ok((StatusCode::OK, Json(ApiResponse { success: true, data: payment })))
}

pub async fn delete(
    auth: AuthContext,
    State(state): State<AppState>,
    Path(id): Path<Uuid>,
) -> Result<impl IntoResponse, AppError> {
    let tenant_id = require_tenant(&auth)?;
    let existing = fetch_payment(&state.db, tenant_id, id).await?;
    let contract = fetch_contract_context(&state.db, tenant_id, existing.contract_id).await?;

    let mut tx = state.db.begin().await?;
    sqlx::query("delete from payments where id = $1 and tenant_id = $2")
        .bind(id)
        .bind(tenant_id)
        .execute(&mut *tx)
        .await?;
    refresh_contract_payment_status(&mut tx, tenant_id, contract.id, contract.total_amount).await?;
    tx.commit().await?;

    Ok((StatusCode::OK, Json(ApiResponse { success: true, data: existing })))
}

async fn fetch_payment(pool: &PgPool, tenant_id: Uuid, id: Uuid) -> Result<Payment, AppError> {
    sqlx::query_as::<_, Payment>(
        r#"
        select
            id, contract_id, member_id, branch_id, amount::float8 as amount,
            payment_method, payment_date, type as payment_type, receipt_no, notes,
            created_by, tenant_id
        from payments
        where id = $1 and tenant_id = $2
        "#,
    )
    .bind(id)
    .bind(tenant_id)
    .fetch_optional(pool)
    .await?
    .ok_or(AppError::NotFound)
}

async fn fetch_contract_context(
    pool: &PgPool,
    tenant_id: Uuid,
    contract_id: Uuid,
) -> Result<ContractPaymentContext, AppError> {
    sqlx::query_as::<_, ContractPaymentContext>(
        r#"
        select id, member_id, branch_id, total_amount::float8 as total_amount
        from contracts
        where id = $1 and tenant_id = $2
        "#,
    )
    .bind(contract_id)
    .bind(tenant_id)
    .fetch_optional(pool)
    .await?
    .ok_or_else(|| AppError::Validation("contractId is invalid for this tenant".into()))
}

async fn refresh_contract_payment_status(
    tx: &mut Transaction<'_, Postgres>,
    tenant_id: Uuid,
    contract_id: Uuid,
    total_amount: f64,
) -> Result<(), AppError> {
    let paid_amount = sqlx::query_scalar::<_, Option<f64>>(
        r#"
        select coalesce(sum(
            case when type = 'REFUND' then -amount else amount end
        ), 0)::float8
        from payments
        where contract_id = $1 and tenant_id = $2
        "#,
    )
    .bind(contract_id)
    .bind(tenant_id)
    .fetch_one(&mut **tx)
    .await?
    .unwrap_or(0.0);

    let payment_status = if paid_amount <= 0.0 {
        "UNPAID"
    } else if paid_amount + f64::EPSILON >= total_amount {
        "PAID"
    } else {
        "PARTIAL"
    };

    sqlx::query(
        "update contracts set paid_amount = ($3::double precision)::numeric, payment_status = $4, updated_at = now() where id = $1 and tenant_id = $2",
    )
    .bind(contract_id)
    .bind(tenant_id)
    .bind(paid_amount)
    .bind(payment_status)
    .execute(&mut **tx)
    .await?;

    Ok(())
}

fn require_tenant(auth: &AuthContext) -> Result<Uuid, AppError> {
    auth.user.tenant_id.ok_or(AppError::Unauthorized)
}

fn validate_amount(amount: f64) -> Result<(), AppError> {
    if amount <= 0.0 {
        return Err(AppError::Validation("amount must be greater than zero".into()));
    }
    Ok(())
}

fn validate_payment_type(payment_type: &str) -> Result<(), AppError> {
    match payment_type {
        "INCOME" | "REFUND" => Ok(()),
        _ => Err(AppError::Validation("type must be INCOME or REFUND".into())),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn rejects_zero_payment_amount() {
        assert!(validate_amount(0.0).is_err());
    }

    #[test]
    fn accepts_income_payment_type() {
        assert!(validate_payment_type("INCOME").is_ok());
    }
}
