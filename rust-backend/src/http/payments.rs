use axum::{
    extract::{Path, Query, State},
    http::{header::{CONTENT_DISPOSITION, CONTENT_TYPE}, StatusCode},
    response::IntoResponse,
    Json,
};
use chrono::{DateTime, Duration, NaiveDate, TimeZone, Utc};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::cmp::Ordering;
use sqlx::{FromRow, PgPool, Postgres, Transaction};
use uuid::Uuid;

use crate::{
    error::AppError,
    http::{auth::AuthContext, ApiResponse, PaginatedResponse, Pagination},
    state::AppState,
};

#[derive(Debug, Deserialize)]
pub struct PaymentFilters {
    id: Option<Uuid>,
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
    payment_type_snake: Option<String>,
    start_date: Option<String>,
    end_date: Option<String>,
    #[serde(rename = "startDate")]
    start_date_camel: Option<String>,
    #[serde(rename = "endDate")]
    end_date_camel: Option<String>,
    search: Option<String>,
    #[serde(rename = "sortBy", alias = "sort")]
    sort_by: Option<String>,
    #[serde(rename = "sortOrder")]
    sort_order: Option<String>,
    page: Option<i64>,
    limit: Option<i64>,
}

#[derive(Debug, Deserialize)]
pub struct CreatePaymentRequest {
    #[serde(rename = "contractId", alias = "contract_id")]
    contract_id: Uuid,
    #[serde(rename = "memberId", alias = "member_id")]
    member_id: Option<Uuid>,
    #[serde(rename = "branchId", alias = "branch_id")]
    branch_id: Option<Uuid>,
    amount: f64,
    #[serde(rename = "paymentMethod", alias = "payment_method", default = "default_cash")]
    payment_method: String,
    #[serde(rename = "paymentDate", alias = "payment_date")]
    payment_date: Option<String>,
    #[serde(rename = "type", alias = "payment_type", default = "default_income")]
    payment_type: String,
    #[serde(rename = "receiptNo", alias = "receipt_no")]
    receipt_no: Option<String>,
    notes: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct UpdatePaymentRequest {
    amount: Option<f64>,
    #[serde(rename = "paymentMethod", alias = "payment_method")]
    payment_method: Option<String>,
    #[serde(rename = "paymentDate", alias = "payment_date")]
    payment_date: Option<String>,
    #[serde(rename = "type", alias = "payment_type")]
    payment_type: Option<String>,
    #[serde(rename = "receiptNo", alias = "receipt_no")]
    receipt_no: Option<String>,
    notes: Option<String>,
}

#[derive(Debug, Serialize, FromRow)]
pub struct Payment {
    id: Uuid,
    contract_id: Uuid,
    member_id: Uuid,
    branch_id: Uuid,
    amount: f64,
    payment_method: String,
    payment_date: DateTime<Utc>,
    payment_type: String,
    receipt_no: Option<String>,
    notes: Option<String>,
    created_by: Option<Uuid>,
    tenant_id: Option<Uuid>,
    #[serde(skip_serializing_if = "Option::is_none")]
    contract: Option<Value>,
    #[serde(skip_serializing_if = "Option::is_none")]
    member: Option<Value>,
    #[serde(skip_serializing_if = "Option::is_none")]
    branch: Option<Value>,
}

#[derive(Debug, FromRow)]
struct ContractPaymentContext {
    id: Uuid,
    member_id: Uuid,
    branch_id: Uuid,
    total_amount: f64,
}

#[derive(Debug, FromRow)]
struct PaymentExportRow {
    receipt_no: Option<String>,
    member_name: Option<String>,
    member_code: Option<String>,
    amount: f64,
    payment_method: String,
    payment_date: DateTime<Utc>,
    payment_type: String,
}

fn default_income() -> String {
    "INCOME".into()
}

fn default_cash() -> String {
    "CASH".into()
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
    let payment_type = filters.payment_type.or(filters.payment_type_snake);
    let start_date = filters.start_date.or(filters.start_date_camel)
        .map(|value| parse_datetime_filter(&value, false))
        .transpose()?;
    let end_date = filters.end_date.or(filters.end_date_camel)
        .map(|value| parse_datetime_filter(&value, true))
        .transpose()?;
    let mut payments = sqlx::query_as::<_, Payment>(
        r#"
        select
            payments.id, payments.contract_id, payments.member_id, payments.branch_id, payments.amount::float8 as amount,
            payments.payment_method, payments.payment_date, payments.type as payment_type, payments.receipt_no, payments.notes,
            payments.created_by, payments.tenant_id,
            json_build_object('id', contracts.id, 'contract_no', contracts.contract_no, 'status', contracts.status) as contract,
            json_build_object('id', members.id, 'full_name', members.full_name, 'member_code', members.member_code) as member,
            json_build_object('id', branches.id, 'name', branches.name) as branch
        from payments
        join contracts on contracts.id = payments.contract_id
        join members on members.id = payments.member_id
        join branches on branches.id = payments.branch_id
        where payments.tenant_id = $1
          and ($2::uuid is null or payments.id = $2)
          and ($3::uuid is null or payments.contract_id = $3)
          and ($4::uuid is null or payments.member_id = $4)
          and ($5::uuid is null or payments.branch_id = $5)
          and ($6::text is null or payments.payment_method = $6)
          and ($7::text is null or payments.type = $7)
          and ($8::timestamptz is null or payments.payment_date >= $8)
          and ($9::timestamptz is null or payments.payment_date < $9)
        order by payments.payment_date desc, payments.created_at desc
        "#,
    )
    .bind(tenant_id)
    .bind(filters.id)
    .bind(contract_id)
    .bind(member_id)
    .bind(branch_id)
    .bind(payment_method)
    .bind(payment_type)
    .bind(start_date)
    .bind(end_date)
    .fetch_all(&state.db)
    .await?;
    if let Some(search) = trim_opt(filters.search) {
        let search = search.to_lowercase();
        payments.retain(|payment| payment_matches_search(payment, &search));
    }
    sort_payments(&mut payments, filters.sort_by.as_deref(), filters.sort_order.as_deref());

    let total = payments.len() as i64;
    let page = filters.page.unwrap_or(1).max(1);
    let limit = filters.limit.unwrap_or(total.max(1)).max(1);
    let start = ((page - 1) * limit) as usize;
    let end = (start + limit as usize).min(payments.len());
    let data = if start >= payments.len() {
        Vec::new()
    } else {
        payments.into_iter().skip(start).take(end - start).collect()
    };

    Ok((
        StatusCode::OK,
        Json(PaginatedResponse {
            success: true,
            data,
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

pub async fn summary(
    auth: AuthContext,
    State(state): State<AppState>,
    Query(filters): Query<PaymentFilters>,
) -> Result<impl IntoResponse, AppError> {
    let tenant_id = require_tenant(&auth)?;
    let branch_id = filters.branch_id.or(filters.branch_id_snake);
    let start_date = filters.start_date.or(filters.start_date_camel)
        .map(|value| parse_datetime_filter(&value, false))
        .transpose()?;
    let end_date = filters.end_date.or(filters.end_date_camel)
        .map(|value| parse_datetime_filter(&value, true))
        .transpose()?;

    let (total_income, total_refund, payment_count) = sqlx::query_as::<_, (f64, f64, i64)>(
        r#"
        select
            coalesce(sum(case when type = 'INCOME' then amount else 0 end), 0)::float8,
            coalesce(sum(case when type = 'REFUND' then amount else 0 end), 0)::float8,
            count(*)::bigint
        from payments
        where tenant_id = $1
          and ($2::uuid is null or branch_id = $2)
          and ($3::timestamptz is null or payment_date >= $3)
          and ($4::timestamptz is null or payment_date < $4)
        "#,
    )
    .bind(tenant_id)
    .bind(branch_id)
    .bind(start_date)
    .bind(end_date)
    .fetch_one(&state.db)
    .await?;

    Ok((StatusCode::OK, Json(json!({
        "success": true,
        "data": {
            "totalIncome": total_income,
            "totalRefund": total_refund,
            "netIncome": total_income - total_refund,
            "paymentCount": payment_count,
            "total_income": total_income,
            "total_refund": total_refund,
            "net_income": total_income - total_refund,
            "payment_count": payment_count
        }
    }))))
}

pub async fn export(
    auth: AuthContext,
    State(state): State<AppState>,
    Query(filters): Query<PaymentFilters>,
) -> Result<impl IntoResponse, AppError> {
    let tenant_id = require_tenant(&auth)?;
    let branch_id = filters.branch_id.or(filters.branch_id_snake);
    let start_date = filters.start_date.or(filters.start_date_camel)
        .map(|value| parse_datetime_filter(&value, false))
        .transpose()?;
    let end_date = filters.end_date.or(filters.end_date_camel)
        .map(|value| parse_datetime_filter(&value, true))
        .transpose()?;

    let rows = sqlx::query_as::<_, PaymentExportRow>(
        r#"
        select payments.receipt_no, members.full_name as member_name, members.member_code,
            payments.amount::float8 as amount, payments.payment_method, payments.payment_date,
            payments.type as payment_type
        from payments
        left join members on members.id = payments.member_id
        where payments.tenant_id = $1
          and ($2::uuid is null or payments.branch_id = $2)
          and ($3::timestamptz is null or payments.payment_date >= $3)
          and ($4::timestamptz is null or payments.payment_date < $4)
        order by payments.payment_date desc, payments.created_at desc
        "#,
    )
    .bind(tenant_id)
    .bind(branch_id)
    .bind(start_date)
    .bind(end_date)
    .fetch_all(&state.db)
    .await?;

    Ok((
        StatusCode::OK,
        [
            (CONTENT_TYPE, "text/csv; charset=utf-8"),
            (CONTENT_DISPOSITION, "attachment; filename=\"payments.csv\""),
        ],
        payments_csv(&rows),
    ))
}

pub async fn create(
    auth: AuthContext,
    State(state): State<AppState>,
    Json(payload): Json<CreatePaymentRequest>,
) -> Result<impl IntoResponse, AppError> {
    let tenant_id = require_tenant(&auth)?;
    validate_amount(payload.amount)?;
    validate_payment_type(&payload.payment_type)?;
    let payment_date = payload.payment_date
        .as_deref()
        .map(|value| parse_datetime_filter(value, false))
        .transpose()?;
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
            created_by, tenant_id,
            (select json_build_object('id', contracts.id, 'contract_no', contracts.contract_no, 'status', contracts.status) from contracts where contracts.id = payments.contract_id) as contract,
            (select json_build_object('id', members.id, 'full_name', members.full_name, 'member_code', members.member_code) from members where members.id = payments.member_id) as member,
            (select json_build_object('id', branches.id, 'name', branches.name) from branches where branches.id = payments.branch_id) as branch
        "#,
    )
    .bind(contract.id)
    .bind(member_id)
    .bind(branch_id)
    .bind(payload.amount)
    .bind(payload.payment_method.trim())
    .bind(payment_date)
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
    let payment_date = payload.payment_date
        .as_deref()
        .map(|value| parse_datetime_filter(value, false))
        .transpose()?;
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
            created_by, tenant_id,
            (select json_build_object('id', contracts.id, 'contract_no', contracts.contract_no, 'status', contracts.status) from contracts where contracts.id = payments.contract_id) as contract,
            (select json_build_object('id', members.id, 'full_name', members.full_name, 'member_code', members.member_code) from members where members.id = payments.member_id) as member,
            (select json_build_object('id', branches.id, 'name', branches.name) from branches where branches.id = payments.branch_id) as branch
        "#,
    )
    .bind(id)
    .bind(tenant_id)
    .bind(payload.amount)
    .bind(payload.payment_method.as_deref().map(str::trim))
    .bind(payment_date)
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
            payments.id, payments.contract_id, payments.member_id, payments.branch_id, payments.amount::float8 as amount,
            payments.payment_method, payments.payment_date, payments.type as payment_type, payments.receipt_no, payments.notes,
            payments.created_by, payments.tenant_id,
            json_build_object('id', contracts.id, 'contract_no', contracts.contract_no, 'status', contracts.status) as contract,
            json_build_object('id', members.id, 'full_name', members.full_name, 'member_code', members.member_code) as member,
            json_build_object('id', branches.id, 'name', branches.name) as branch
        from payments
        join contracts on contracts.id = payments.contract_id
        join members on members.id = payments.member_id
        join branches on branches.id = payments.branch_id
        where payments.id = $1 and payments.tenant_id = $2
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

fn trim_opt(value: Option<String>) -> Option<String> {
    value.map(|s| s.trim().to_string()).filter(|s| !s.is_empty())
}

fn payment_matches_search(payment: &Payment, search: &str) -> bool {
    payment.receipt_no.as_ref().map(|value| value.to_lowercase().contains(search)).unwrap_or(false)
        || payment.payment_method.to_lowercase().contains(search)
        || payment.payment_type.to_lowercase().contains(search)
        || json_field_contains(payment.member.as_ref(), "full_name", search)
        || json_field_contains(payment.member.as_ref(), "member_code", search)
        || json_field_contains(payment.contract.as_ref(), "contract_no", search)
        || json_field_contains(payment.branch.as_ref(), "name", search)
}

fn json_field_contains(value: Option<&Value>, field: &str, search: &str) -> bool {
    value
        .and_then(|value| value.get(field))
        .and_then(Value::as_str)
        .map(|value| value.to_lowercase().contains(search))
        .unwrap_or(false)
}

fn sort_payments(payments: &mut [Payment], sort_by: Option<&str>, sort_order: Option<&str>) {
    match sort_by.unwrap_or("payment_date") {
        "payment_date" | "paymentDate" => payments.sort_by(|a, b| a.payment_date.cmp(&b.payment_date)),
        "amount" => payments.sort_by(|a, b| a.amount.partial_cmp(&b.amount).unwrap_or(Ordering::Equal)),
        "receipt_no" | "receiptNo" => payments.sort_by(|a, b| a.receipt_no.cmp(&b.receipt_no)),
        "payment_method" | "paymentMethod" => payments.sort_by(|a, b| a.payment_method.cmp(&b.payment_method)),
        "type" | "payment_type" | "paymentType" => payments.sort_by(|a, b| a.payment_type.cmp(&b.payment_type)),
        _ => {}
    }

    if !sort_order.map(|value| value.eq_ignore_ascii_case("asc")).unwrap_or(false) {
        payments.reverse();
    }
}

fn parse_datetime_filter(value: &str, exclusive_end: bool) -> Result<DateTime<Utc>, AppError> {
    if let Ok(datetime) = DateTime::parse_from_rfc3339(value) {
        return Ok(datetime.with_timezone(&Utc));
    }

    let date = NaiveDate::parse_from_str(value, "%Y-%m-%d")
        .map_err(|_| AppError::Validation("paymentDate must be YYYY-MM-DD or RFC3339".into()))?;
    let datetime = Utc.from_utc_datetime(&date.and_hms_opt(0, 0, 0).unwrap());
    Ok(if exclusive_end { datetime + Duration::days(1) } else { datetime })
}

fn payments_csv(rows: &[PaymentExportRow]) -> String {
    let mut csv = String::from("receiptNo,memberName,memberCode,amount,paymentMethod,paymentDate,type\n");
    for row in rows {
        csv.push_str(&format!(
            "{},{},{},{},{},{},{}\n",
            csv_cell(row.receipt_no.as_deref().unwrap_or("")),
            csv_cell(row.member_name.as_deref().unwrap_or("")),
            csv_cell(row.member_code.as_deref().unwrap_or("")),
            row.amount,
            csv_cell(&row.payment_method),
            row.payment_date.date_naive(),
            csv_cell(&row.payment_type),
        ));
    }
    csv
}

fn csv_cell(value: &str) -> String {
    if value.contains(',') || value.contains('"') || value.contains('\n') {
        format!("\"{}\"", value.replace('"', "\"\""))
    } else {
        value.to_string()
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
