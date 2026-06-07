use axum::{
    extract::{Path, Query, State},
    http::StatusCode,
    response::IntoResponse,
    Json,
};
use chrono::{Duration, NaiveDate};
use serde::{ser::{SerializeMap, Serializer}, Deserialize, Serialize};
use serde_json::Value;
use std::cmp::Ordering;
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
    contract_status: Option<String>,
    search: Option<String>,
    #[serde(rename = "sortBy", alias = "sort")]
    sort_by: Option<String>,
    #[serde(rename = "sortOrder")]
    sort_order: Option<String>,
    page: Option<i64>,
    limit: Option<i64>,
}

#[derive(Debug, Deserialize)]
pub struct CreateContractRequest {
    #[serde(rename = "contractNo", alias = "contract_no")]
    contract_no: Option<String>,
    #[serde(rename = "memberId", alias = "member_id")]
    member_id: Uuid,
    #[serde(rename = "planId", alias = "plan_id")]
    plan_id: Uuid,
    #[serde(rename = "branchId", alias = "branch_id")]
    branch_id: Uuid,
    #[serde(rename = "salesPersonId", alias = "sales_person_id")]
    sales_person_id: Option<Uuid>,
    #[serde(alias = "contract_status", default = "default_active")]
    status: String,
    #[serde(rename = "signDate", alias = "sign_date")]
    sign_date: Option<NaiveDate>,
    #[serde(rename = "startDate", alias = "start_date")]
    start_date: NaiveDate,
    #[serde(rename = "originalEndDate", alias = "original_end_date")]
    original_end_date: NaiveDate,
    #[serde(rename = "endDate", alias = "end_date")]
    end_date: NaiveDate,
    #[serde(rename = "remainingCounts", alias = "remaining_counts")]
    remaining_counts: Option<i32>,
    #[serde(rename = "totalAmount", alias = "total_amount")]
    total_amount: f64,
    #[serde(rename = "paidAmount", alias = "paid_amount", default)]
    paid_amount: f64,
    #[serde(rename = "paymentStatus", alias = "payment_status", default = "default_unpaid")]
    payment_status: String,
    #[serde(rename = "termsAccepted", alias = "terms_accepted", default)]
    terms_accepted: bool,
    notes: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct UpdateContractRequest {
    #[serde(alias = "contract_status")]
    status: Option<String>,
    #[serde(rename = "signDate", alias = "sign_date")]
    sign_date: Option<NaiveDate>,
    #[serde(rename = "startDate", alias = "start_date")]
    start_date: Option<NaiveDate>,
    #[serde(rename = "originalEndDate", alias = "original_end_date")]
    original_end_date: Option<NaiveDate>,
    #[serde(rename = "endDate", alias = "end_date")]
    end_date: Option<NaiveDate>,
    #[serde(rename = "remainingCounts", alias = "remaining_counts")]
    remaining_counts: Option<i32>,
    #[serde(rename = "totalAmount", alias = "total_amount")]
    total_amount: Option<f64>,
    #[serde(rename = "paidAmount", alias = "paid_amount")]
    paid_amount: Option<f64>,
    #[serde(rename = "paymentStatus", alias = "payment_status")]
    payment_status: Option<String>,
    #[serde(rename = "termsAccepted", alias = "terms_accepted")]
    terms_accepted: Option<bool>,
    notes: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct ContractActionRequest {
    #[serde(rename = "startDate", alias = "start_date")]
    start_date: Option<NaiveDate>,
    #[serde(rename = "endDate", alias = "end_date")]
    end_date: Option<NaiveDate>,
    reason: Option<String>,
}

#[derive(Debug, FromRow)]
pub struct Contract {
    id: Uuid,
    contract_no: String,
    member_id: Uuid,
    plan_id: Uuid,
    branch_id: Uuid,
    sales_person_id: Option<Uuid>,
    #[sqlx(rename = "status")]
    contract_status: String,
    sign_date: Option<NaiveDate>,
    start_date: NaiveDate,
    original_end_date: NaiveDate,
    end_date: NaiveDate,
    remaining_counts: Option<i32>,
    total_amount: f64,
    paid_amount: f64,
    payment_status: String,
    terms_accepted: bool,
    notes: Option<String>,
    created_by: Option<Uuid>,
    tenant_id: Option<Uuid>,
    plan: Option<Value>,
    member: Option<Value>,
    branch: Option<Value>,
    sales_person: Option<Value>,
}

#[derive(Debug, FromRow)]
struct PlanInfo {
    plan_type: String,
    class_counts: Option<i32>,
}

#[derive(Debug, FromRow)]
struct ContractActionRow {
    id: Uuid,
    member_id: Uuid,
    branch_id: Uuid,
    status: String,
    end_date: NaiveDate,
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
    let status = filters.status.or(filters.contract_status);
    let mut contracts = sqlx::query_as::<_, Contract>(
        r#"
        select
            contracts.id, contracts.contract_no, contracts.member_id, contracts.plan_id,
            contracts.branch_id, contracts.sales_person_id, contracts.status, contracts.sign_date,
            contracts.start_date, contracts.original_end_date, contracts.end_date,
            contracts.remaining_counts, contracts.total_amount::float8 as total_amount,
            contracts.paid_amount::float8 as paid_amount, contracts.payment_status,
            contracts.terms_accepted, contracts.notes, contracts.created_by, contracts.tenant_id,
            json_build_object(
                'id', membership_plans.id,
                'name', membership_plans.name,
                'planType', membership_plans.type,
                'plan_type', membership_plans.type,
                'duration_months', membership_plans.duration_months,
                'class_counts', membership_plans.class_counts,
                'price', membership_plans.price::float8,
                'allow_pause', membership_plans.allow_pause,
                'allow_transfer', membership_plans.allow_transfer
            ) as plan,
            json_build_object('id', members.id, 'full_name', members.full_name, 'member_code', members.member_code) as member,
            json_build_object('id', branches.id, 'name', branches.name) as branch,
            case when employees.id is null then null else json_build_object('id', employees.id, 'full_name', employees.full_name) end as sales_person
        from contracts
        join membership_plans on membership_plans.id = contracts.plan_id
        join members on members.id = contracts.member_id
        join branches on branches.id = contracts.branch_id
        left join employees on employees.id = contracts.sales_person_id
        where contracts.tenant_id = $1
          and ($2::uuid is null or contracts.id = $2)
          and ($3::uuid is null or contracts.member_id = $3)
          and ($4::uuid is null or contracts.branch_id = $4)
          and ($5::text is null or contracts.status = $5)
        order by contracts.created_at desc
        "#,
    )
    .bind(tenant_id)
    .bind(filters.id)
    .bind(member_id)
    .bind(branch_id)
    .bind(status)
    .fetch_all(&state.db)
    .await?;
    if let Some(search) = trim_opt(filters.search) {
        let search = search.to_lowercase();
        contracts.retain(|contract| contract_matches_search(contract, &search));
    }
    sort_contracts(&mut contracts, filters.sort_by.as_deref(), filters.sort_order.as_deref());

    let total = contracts.len() as i64;
    let page = filters.page.unwrap_or(1).max(1);
    let limit = filters.limit.unwrap_or(total.max(1)).max(1);
    let start = ((page - 1) * limit) as usize;
    let end = (start + limit as usize).min(contracts.len());
    let data = if start >= contracts.len() {
        Vec::new()
    } else {
        contracts.into_iter().skip(start).take(end - start).collect()
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
    let contract_no = payload.contract_no
        .as_deref()
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(ToOwned::to_owned)
        .unwrap_or_else(|| {
            let suffix = Uuid::new_v4().simple().to_string();
            format!("C{}", &suffix[..10])
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
            payment_status, terms_accepted, notes, created_by, tenant_id,
            null::jsonb as plan, null::jsonb as member, null::jsonb as branch, null::jsonb as sales_person
        "#,
    )
    .bind(contract_no)
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
            payment_status, terms_accepted, notes, created_by, tenant_id,
            null::jsonb as plan, null::jsonb as member, null::jsonb as branch, null::jsonb as sales_person
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
        set status = 'TERMINATED', updated_at = now()
        where id = $1 and tenant_id = $2
        returning
            id, contract_no, member_id, plan_id, branch_id, sales_person_id, status, sign_date,
            start_date, original_end_date, end_date, remaining_counts,
            total_amount::float8 as total_amount, paid_amount::float8 as paid_amount,
            payment_status, terms_accepted, notes, created_by, tenant_id,
            null::jsonb as plan, null::jsonb as member, null::jsonb as branch, null::jsonb as sales_person
        "#,
    )
    .bind(id)
    .bind(tenant_id)
    .fetch_optional(&state.db)
    .await?
    .ok_or(AppError::NotFound)?;

    Ok((StatusCode::OK, Json(ApiResponse { success: true, data: contract })))
}

pub async fn activate(
    auth: AuthContext,
    State(state): State<AppState>,
    Path(id): Path<Uuid>,
) -> Result<impl IntoResponse, AppError> {
    let tenant_id = require_tenant(&auth)?;
    let current = fetch_contract_action_row(&state, tenant_id, id).await?;
    if current.status != "DRAFT" && current.status != "PENDING" {
        return Err(AppError::Validation("contract must be DRAFT or PENDING to activate".into()));
    }

    let mut tx = state.db.begin().await?;
    let contract = update_contract_status_in_tx(&mut tx, tenant_id, id, "ACTIVE", None).await?;
    insert_contract_log_in_tx(
        &mut tx,
        tenant_id,
        &current,
        "ACTIVATE",
        None,
        None,
        None,
        None,
        auth.user.employee_id,
    ).await?;
    tx.commit().await?;

    Ok((StatusCode::OK, Json(ApiResponse { success: true, data: contract })))
}

pub async fn pause(
    auth: AuthContext,
    State(state): State<AppState>,
    Path(id): Path<Uuid>,
    Json(payload): Json<ContractActionRequest>,
) -> Result<impl IntoResponse, AppError> {
    let tenant_id = require_tenant(&auth)?;
    let current = fetch_contract_action_row(&state, tenant_id, id).await?;
    if current.status != "ACTIVE" {
        return Err(AppError::Validation("contract must be ACTIVE to pause".into()));
    }
    let start_date = payload.start_date.ok_or_else(|| AppError::Validation("start_date is required".into()))?;
    let end_date = payload.end_date.ok_or_else(|| AppError::Validation("end_date is required".into()))?;
    validate_dates(start_date, end_date)?;
    let days = end_date.signed_duration_since(start_date).num_days().max(0) as i32;
    let extended_end_date = current.end_date + Duration::days(days as i64);

    let mut tx = state.db.begin().await?;
    let contract = update_contract_status_in_tx(&mut tx, tenant_id, id, "PAUSED", Some(extended_end_date)).await?;
    insert_contract_log_in_tx(
        &mut tx,
        tenant_id,
        &current,
        "PAUSE",
        Some(start_date),
        Some(end_date),
        Some(days),
        trim_opt(payload.reason),
        auth.user.employee_id,
    ).await?;
    tx.commit().await?;

    Ok((StatusCode::OK, Json(ApiResponse { success: true, data: contract })))
}

pub async fn resume(
    auth: AuthContext,
    State(state): State<AppState>,
    Path(id): Path<Uuid>,
) -> Result<impl IntoResponse, AppError> {
    let tenant_id = require_tenant(&auth)?;
    let current = fetch_contract_action_row(&state, tenant_id, id).await?;
    if current.status != "PAUSED" {
        return Err(AppError::Validation("contract must be PAUSED to resume".into()));
    }

    let mut tx = state.db.begin().await?;
    let contract = update_contract_status_in_tx(&mut tx, tenant_id, id, "ACTIVE", None).await?;
    insert_contract_log_in_tx(
        &mut tx,
        tenant_id,
        &current,
        "RESUME",
        None,
        None,
        None,
        None,
        auth.user.employee_id,
    ).await?;
    tx.commit().await?;

    Ok((StatusCode::OK, Json(ApiResponse { success: true, data: contract })))
}

async fn fetch_contract(state: &AppState, tenant_id: Uuid, id: Uuid) -> Result<Contract, AppError> {
    sqlx::query_as::<_, Contract>(
        r#"
        select
            contracts.id, contracts.contract_no, contracts.member_id, contracts.plan_id,
            contracts.branch_id, contracts.sales_person_id, contracts.status, contracts.sign_date,
            contracts.start_date, contracts.original_end_date, contracts.end_date,
            contracts.remaining_counts, contracts.total_amount::float8 as total_amount,
            contracts.paid_amount::float8 as paid_amount, contracts.payment_status,
            contracts.terms_accepted, contracts.notes, contracts.created_by, contracts.tenant_id,
            json_build_object(
                'id', membership_plans.id,
                'name', membership_plans.name,
                'planType', membership_plans.type,
                'plan_type', membership_plans.type,
                'duration_months', membership_plans.duration_months,
                'class_counts', membership_plans.class_counts,
                'price', membership_plans.price::float8,
                'allow_pause', membership_plans.allow_pause,
                'allow_transfer', membership_plans.allow_transfer
            ) as plan,
            json_build_object('id', members.id, 'full_name', members.full_name, 'member_code', members.member_code) as member,
            json_build_object('id', branches.id, 'name', branches.name) as branch,
            case when employees.id is null then null else json_build_object('id', employees.id, 'full_name', employees.full_name) end as sales_person
        from contracts
        join membership_plans on membership_plans.id = contracts.plan_id
        join members on members.id = contracts.member_id
        join branches on branches.id = contracts.branch_id
        left join employees on employees.id = contracts.sales_person_id
        where contracts.id = $1 and contracts.tenant_id = $2
        "#,
    )
    .bind(id)
    .bind(tenant_id)
    .fetch_optional(&state.db)
    .await?
    .ok_or(AppError::NotFound)
}

async fn fetch_contract_action_row(state: &AppState, tenant_id: Uuid, id: Uuid) -> Result<ContractActionRow, AppError> {
    sqlx::query_as::<_, ContractActionRow>(
        "select id, member_id, branch_id, status, end_date from contracts where id = $1 and tenant_id = $2",
    )
    .bind(id)
    .bind(tenant_id)
    .fetch_optional(&state.db)
    .await?
    .ok_or(AppError::NotFound)
}

async fn update_contract_status_in_tx(
    tx: &mut sqlx::Transaction<'_, sqlx::Postgres>,
    tenant_id: Uuid,
    id: Uuid,
    status: &str,
    end_date: Option<NaiveDate>,
) -> Result<Contract, AppError> {
    sqlx::query_as::<_, Contract>(
        r#"
        update contracts
        set status = $3,
            end_date = coalesce($4, end_date),
            updated_at = now()
        where id = $1 and tenant_id = $2
        returning
            id, contract_no, member_id, plan_id, branch_id, sales_person_id, status, sign_date,
            start_date, original_end_date, end_date, remaining_counts,
            total_amount::float8 as total_amount, paid_amount::float8 as paid_amount,
            payment_status, terms_accepted, notes, created_by, tenant_id,
            null::jsonb as plan, null::jsonb as member, null::jsonb as branch, null::jsonb as sales_person
        "#,
    )
    .bind(id)
    .bind(tenant_id)
    .bind(status)
    .bind(end_date)
    .fetch_optional(&mut **tx)
    .await?
    .ok_or(AppError::NotFound)
}

async fn insert_contract_log_in_tx(
    tx: &mut sqlx::Transaction<'_, sqlx::Postgres>,
    tenant_id: Uuid,
    contract: &ContractActionRow,
    log_type: &str,
    start_date: Option<NaiveDate>,
    end_date: Option<NaiveDate>,
    days_affected: Option<i32>,
    reason: Option<String>,
    employee_id: Option<Uuid>,
) -> Result<(), AppError> {
    sqlx::query(
        r#"
        insert into contract_logs (
            contract_id, log_type, start_date, end_date, days_affected, reason,
            created_by_employee, original_member_id, branch_id, tenant_id
        ) values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
        "#,
    )
    .bind(contract.id)
    .bind(log_type)
    .bind(start_date)
    .bind(end_date)
    .bind(days_affected)
    .bind(reason)
    .bind(employee_id)
    .bind(contract.member_id)
    .bind(contract.branch_id)
    .bind(tenant_id)
    .execute(&mut **tx)
    .await?;
    Ok(())
}

fn require_tenant(auth: &AuthContext) -> Result<Uuid, AppError> {
    auth.user.tenant_id.ok_or(AppError::Unauthorized)
}

fn validate_create(payload: &CreateContractRequest) -> Result<(), AppError> {
    if let Some(contract_no) = &payload.contract_no {
        validation::required_text("contractNo", contract_no)?;
    }
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
        "DRAFT" | "ACTIVE" | "PAUSED" | "EXPIRED" | "TERMINATED" | "PENDING" | "CANCELLED" | "SUSPENDED" => Ok(()),
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

fn trim_opt(value: Option<String>) -> Option<String> {
    value.map(|s| s.trim().to_string()).filter(|s| !s.is_empty())
}

fn contract_matches_search(contract: &Contract, search: &str) -> bool {
    contract.contract_no.to_lowercase().contains(search)
        || contract.contract_status.to_lowercase().contains(search)
        || json_field_contains(contract.member.as_ref(), "full_name", search)
        || json_field_contains(contract.member.as_ref(), "member_code", search)
        || json_field_contains(contract.plan.as_ref(), "name", search)
        || json_field_contains(contract.branch.as_ref(), "name", search)
}

fn json_field_contains(value: Option<&Value>, field: &str, search: &str) -> bool {
    value
        .and_then(|value| value.get(field))
        .and_then(Value::as_str)
        .map(|value| value.to_lowercase().contains(search))
        .unwrap_or(false)
}

fn sort_contracts(contracts: &mut [Contract], sort_by: Option<&str>, sort_order: Option<&str>) {
    let mut sorted = true;
    match sort_by.unwrap_or("date_created") {
        "contract_no" | "contractNo" => contracts.sort_by(|a, b| a.contract_no.cmp(&b.contract_no)),
        "status" | "contract_status" | "contractStatus" => {
            contracts.sort_by(|a, b| a.contract_status.cmp(&b.contract_status))
        }
        "start_date" | "startDate" => contracts.sort_by(|a, b| a.start_date.cmp(&b.start_date)),
        "end_date" | "endDate" => contracts.sort_by(|a, b| a.end_date.cmp(&b.end_date)),
        "total_amount" | "totalAmount" => contracts.sort_by(|a, b| {
            a.total_amount.partial_cmp(&b.total_amount).unwrap_or(Ordering::Equal)
        }),
        _ => sorted = false,
    }

    let ascending = sort_order.map(|value| value.eq_ignore_ascii_case("asc")).unwrap_or(false);
    if (sorted && !ascending) || (!sorted && ascending) {
        contracts.reverse();
    }
}

impl Serialize for Contract {
    fn serialize<S>(&self, serializer: S) -> Result<S::Ok, S::Error>
    where
        S: Serializer,
    {
        let mut map = serializer.serialize_map(None)?;
        map.serialize_entry("id", &self.id)?;
        map.serialize_entry("contract_no", &self.contract_no)?;
        map.serialize_entry("member_id", &self.member_id)?;
        map.serialize_entry("plan_id", &self.plan_id)?;
        map.serialize_entry("branch_id", &self.branch_id)?;
        map.serialize_entry("sales_person_id", &self.sales_person_id)?;
        map.serialize_entry("contract_status", &self.contract_status)?;
        map.serialize_entry("sign_date", &self.sign_date)?;
        map.serialize_entry("start_date", &self.start_date)?;
        map.serialize_entry("original_end_date", &self.original_end_date)?;
        map.serialize_entry("end_date", &self.end_date)?;
        map.serialize_entry("remaining_counts", &self.remaining_counts)?;
        map.serialize_entry("total_amount", &self.total_amount)?;
        map.serialize_entry("paid_amount", &self.paid_amount)?;
        map.serialize_entry("payment_status", &self.payment_status)?;
        map.serialize_entry("terms_accepted", &self.terms_accepted)?;
        map.serialize_entry("notes", &self.notes)?;
        map.serialize_entry("created_by", &self.created_by)?;
        map.serialize_entry("tenant_id", &self.tenant_id)?;
        map.serialize_entry("plan", &self.plan)?;
        map.serialize_entry("member", &self.member)?;
        map.serialize_entry("branch", &self.branch)?;
        map.serialize_entry("sales_person", &self.sales_person)?;
        map.serialize_entry("contractNo", &self.contract_no)?;
        map.serialize_entry("memberId", &self.member_id)?;
        map.serialize_entry("planId", &self.plan_id)?;
        map.serialize_entry("branchId", &self.branch_id)?;
        map.serialize_entry("salesPersonId", &self.sales_person_id)?;
        map.serialize_entry("status", &self.contract_status)?;
        map.serialize_entry("contractStatus", &self.contract_status)?;
        map.serialize_entry("signDate", &self.sign_date)?;
        map.serialize_entry("startDate", &self.start_date)?;
        map.serialize_entry("originalEndDate", &self.original_end_date)?;
        map.serialize_entry("endDate", &self.end_date)?;
        map.serialize_entry("remainingCounts", &self.remaining_counts)?;
        map.serialize_entry("totalAmount", &self.total_amount)?;
        map.serialize_entry("paidAmount", &self.paid_amount)?;
        map.serialize_entry("paymentStatus", &self.payment_status)?;
        map.serialize_entry("termsAccepted", &self.terms_accepted)?;
        map.serialize_entry("createdBy", &self.created_by)?;
        map.serialize_entry("tenantId", &self.tenant_id)?;
        map.serialize_entry("salesPerson", &self.sales_person)?;
        map.end()
    }
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
