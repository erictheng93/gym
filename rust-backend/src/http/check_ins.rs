use axum::{
    extract::{Path, Query, State},
    http::StatusCode,
    response::IntoResponse,
    Json,
};
use chrono::{DateTime, NaiveDate, TimeZone, Utc};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use sqlx::{FromRow, PgPool, Postgres, Transaction};
use uuid::Uuid;

use crate::{
    error::AppError,
    http::{auth::AuthContext, ApiResponse, PaginatedResponse, Pagination},
    state::AppState,
};

#[derive(Debug, Deserialize)]
pub struct CheckInFilters {
    #[serde(rename = "memberId")]
    member_id: Option<Uuid>,
    #[serde(rename = "member_id")]
    member_id_snake: Option<Uuid>,
    #[serde(rename = "branchId")]
    branch_id: Option<Uuid>,
    #[serde(rename = "branch_id")]
    branch_id_snake: Option<Uuid>,
    #[serde(rename = "contractId")]
    contract_id: Option<Uuid>,
    #[serde(rename = "contract_id")]
    contract_id_snake: Option<Uuid>,
    date: Option<NaiveDate>,
    #[serde(rename = "startDate")]
    #[serde(alias = "start_date")]
    start_date: Option<DateTime<Utc>>,
    #[serde(rename = "endDate")]
    #[serde(alias = "end_date")]
    end_date: Option<DateTime<Utc>>,
    search: Option<String>,
    #[serde(rename = "sortBy", alias = "sort")]
    sort_by: Option<String>,
    #[serde(rename = "sortOrder")]
    sort_order: Option<String>,
    page: Option<i64>,
    limit: Option<i64>,
}

#[derive(Debug, Deserialize)]
pub struct CreateCheckInRequest {
    #[serde(rename = "memberId")]
    #[serde(alias = "member_id")]
    member_id: Uuid,
    #[serde(rename = "branchId")]
    #[serde(alias = "branch_id")]
    branch_id: Uuid,
    #[serde(rename = "contractId")]
    #[serde(alias = "contract_id")]
    contract_id: Option<Uuid>,
    #[serde(rename = "checkInTime")]
    #[serde(alias = "check_in_time")]
    check_in_time: Option<DateTime<Utc>>,
    #[serde(rename = "checkInType", default = "default_entry")]
    #[serde(alias = "check_in_type")]
    check_in_type: String,
    #[serde(rename = "checkInMethod", default = "default_manual")]
    #[serde(alias = "check_in_method")]
    check_in_method: String,
    #[serde(rename = "locationIp")]
    #[serde(alias = "location_ip")]
    location_ip: Option<String>,
    #[serde(rename = "locationDevice")]
    #[serde(alias = "location_device")]
    location_device: Option<String>,
    notes: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct QrVerifyRequest {
    payload: Value,
    branch_id: Option<Uuid>,
    verified_by: Option<Uuid>,
}

#[derive(Debug, Serialize, FromRow)]
pub struct CheckIn {
    id: Uuid,
    status: Option<String>,
    #[serde(rename = "memberId")]
    member_id: Uuid,
    #[serde(rename = "branchId")]
    branch_id: Uuid,
    #[serde(rename = "contractId")]
    contract_id: Option<Uuid>,
    #[serde(rename = "checkInTime")]
    check_in_time: Option<DateTime<Utc>>,
    #[serde(rename = "checkInType")]
    check_in_type: Option<String>,
    #[serde(rename = "checkInMethod")]
    check_in_method: Option<String>,
    #[serde(rename = "processedById")]
    processed_by_id: Option<Uuid>,
    #[serde(rename = "locationIp")]
    location_ip: Option<String>,
    #[serde(rename = "locationDevice")]
    location_device: Option<String>,
    notes: Option<String>,
    member: Option<CheckInMember>,
    branch: Option<CheckInBranch>,
    #[serde(rename = "processedBy")]
    processed_by: Option<CheckInProcessedBy>,
}

#[derive(Debug, Serialize, sqlx::Type)]
pub struct CheckInMember {
    id: Uuid,
    #[serde(rename = "fullName")]
    full_name: String,
    #[serde(rename = "memberCode")]
    member_code: String,
}

#[derive(Debug, Serialize, sqlx::Type)]
pub struct CheckInBranch {
    id: Uuid,
    name: String,
}

#[derive(Debug, Serialize, sqlx::Type)]
pub struct CheckInProcessedBy {
    id: Uuid,
    #[serde(rename = "fullName")]
    full_name: String,
}

#[derive(Debug, FromRow)]
struct CheckInRow {
    id: Uuid,
    status: Option<String>,
    member_id: Uuid,
    branch_id: Uuid,
    contract_id: Option<Uuid>,
    check_in_time: Option<DateTime<Utc>>,
    check_in_type: Option<String>,
    check_in_method: Option<String>,
    processed_by_id: Option<Uuid>,
    location_ip: Option<String>,
    location_device: Option<String>,
    notes: Option<String>,
    member_full_name: String,
    member_code: String,
    branch_name: String,
    processed_by_full_name: Option<String>,
}

#[derive(Debug, FromRow)]
struct ContractCheckInContext {
    id: Uuid,
    member_id: Uuid,
    branch_id: Uuid,
    remaining_counts: Option<i32>,
    plan_type: String,
}

#[derive(Debug, FromRow)]
struct QrMemberRow {
    id: Uuid,
    member_code: String,
    full_name: String,
    branch_id: Uuid,
}

#[derive(Debug, FromRow)]
struct QrContractRow {
    id: Uuid,
    contract_no: String,
    member_id: Uuid,
    branch_id: Uuid,
    remaining_counts: Option<i32>,
    end_date: Option<NaiveDate>,
    plan_name: Option<String>,
    plan_type: Option<String>,
}

#[derive(Debug, Serialize)]
pub struct QrVerifyResponse {
    success: bool,
    message: String,
    checkin_id: Uuid,
    member: QrMemberResponse,
    contract: Option<QrContractResponse>,
}

#[derive(Debug, Serialize)]
pub struct QrMemberResponse {
    id: Uuid,
    member_code: String,
    full_name: String,
}

#[derive(Debug, Serialize)]
pub struct QrContractResponse {
    id: Uuid,
    contract_no: String,
    plan_name: Option<String>,
    plan_type: Option<String>,
    remaining_counts: Option<i32>,
    end_date: Option<NaiveDate>,
}

fn default_entry() -> String {
    "ENTRY".into()
}

fn default_manual() -> String {
    "MANUAL".into()
}

pub async fn list(
    auth: AuthContext,
    State(state): State<AppState>,
    Query(filters): Query<CheckInFilters>,
) -> Result<impl IntoResponse, AppError> {
    let tenant_id = require_tenant(&auth)?;
    let member_id = filters.member_id.or(filters.member_id_snake);
    let branch_id = filters.branch_id.or(filters.branch_id_snake);
    let contract_id = filters.contract_id.or(filters.contract_id_snake);
    let start_date = filters.start_date;
    let end_date = filters.end_date;
    let mut check_ins = sqlx::query_as::<_, CheckInRow>(
        r#"
        select
            check_ins.id, check_ins.status, check_ins.member_id, check_ins.branch_id,
            check_ins.contract_id, check_ins.check_in_time, check_ins.check_in_type,
            check_ins.check_in_method, check_ins.processed_by_id, check_ins.location_ip,
            check_ins.location_device, check_ins.notes, members.full_name as member_full_name,
            members.member_code, branches.name as branch_name,
            processed_by.full_name as processed_by_full_name
        from check_ins
        join members on members.id = check_ins.member_id
        join branches on branches.id = check_ins.branch_id
        left join employees processed_by on processed_by.id = check_ins.processed_by_id
        where members.tenant_id = $1
          and ($2::uuid is null or check_ins.member_id = $2)
          and ($3::uuid is null or check_ins.branch_id = $3)
          and ($4::uuid is null or check_ins.contract_id = $4)
          and ($5::date is null or check_ins.check_in_time::date = $5)
          and ($6::timestamptz is null or check_ins.check_in_time >= $6)
          and ($7::timestamptz is null or check_ins.check_in_time < $7)
        order by check_ins.check_in_time desc
        "#,
    )
    .bind(tenant_id)
    .bind(member_id)
    .bind(branch_id)
    .bind(contract_id)
    .bind(filters.date)
    .bind(start_date)
    .bind(end_date)
    .fetch_all(&state.db)
    .await?
    .into_iter()
    .map(CheckIn::from)
    .collect::<Vec<_>>();
    if let Some(search) = trim_opt(filters.search) {
        let search = search.to_lowercase();
        check_ins.retain(|check_in| check_in_matches_search(check_in, &search));
    }
    sort_check_ins(&mut check_ins, filters.sort_by.as_deref(), filters.sort_order.as_deref());

    let total = check_ins.len() as i64;
    let page = filters.page.unwrap_or(1).max(1);
    let limit = filters.limit.unwrap_or(total.max(1)).max(1);
    let start = ((page - 1) * limit) as usize;
    let end = (start + limit as usize).min(check_ins.len());
    let data = if start >= check_ins.len() {
        Vec::new()
    } else {
        check_ins.into_iter().skip(start).take(end - start).collect()
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
    let check_in = fetch_check_in(&state.db, tenant_id, id).await?;

    Ok((StatusCode::OK, Json(ApiResponse { success: true, data: check_in })))
}

pub async fn today_stats(
    auth: AuthContext,
    State(state): State<AppState>,
    Query(filters): Query<CheckInFilters>,
) -> Result<impl IntoResponse, AppError> {
    let tenant_id = require_tenant(&auth)?;
    let branch_id = filters.branch_id.or(filters.branch_id_snake);
    let (total, unique_members) = sqlx::query_as::<_, (i64, i64)>(
        r#"
        select count(*)::bigint, count(distinct check_ins.member_id)::bigint
        from check_ins
        join branches on branches.id = check_ins.branch_id
        where branches.tenant_id = $1
          and check_ins.check_in_time >= current_date
          and check_ins.check_in_time < current_date + interval '1 day'
          and ($2::uuid is null or check_ins.branch_id = $2)
        "#,
    )
    .bind(tenant_id)
    .bind(branch_id)
    .fetch_one(&state.db)
    .await?;

    let hourly = sqlx::query_as::<_, (f64, i64)>(
        r#"
        select extract(hour from check_ins.check_in_time)::float8 as hour, count(*)::bigint
        from check_ins
        join branches on branches.id = check_ins.branch_id
        where branches.tenant_id = $1
          and check_ins.check_in_time >= current_date
          and check_ins.check_in_time < current_date + interval '1 day'
          and ($2::uuid is null or check_ins.branch_id = $2)
        group by extract(hour from check_ins.check_in_time)
        order by extract(hour from check_ins.check_in_time)
        "#,
    )
    .bind(tenant_id)
    .bind(branch_id)
    .fetch_all(&state.db)
    .await?;

    Ok((StatusCode::OK, Json(json!({
        "success": true,
        "data": {
            "total": total,
            "uniqueMembers": unique_members,
            "unique_members": unique_members,
            "hourlyBreakdown": hourly.into_iter().map(|(hour, count)| json!({
                "hour": hour as i64,
                "count": count
            })).collect::<Vec<_>>()
        }
    }))))
}

pub async fn create(
    auth: AuthContext,
    State(state): State<AppState>,
    Json(payload): Json<CreateCheckInRequest>,
) -> Result<impl IntoResponse, AppError> {
    let tenant_id = require_tenant(&auth)?;
    ensure_member_scope(&state.db, tenant_id, payload.member_id).await?;
    ensure_branch_scope(&state.db, tenant_id, payload.branch_id).await?;
    let contract = match payload.contract_id {
        Some(contract_id) => Some(fetch_contract_context(&state.db, tenant_id, contract_id).await?),
        None => None,
    };

    if let Some(contract) = &contract {
        if contract.member_id != payload.member_id {
            return Err(AppError::Validation("contractId does not match memberId".into()));
        }
        if contract.branch_id != payload.branch_id {
            return Err(AppError::Validation("contractId does not match branchId".into()));
        }
        if contract.plan_type == "COUNT_BASED" && contract.remaining_counts.unwrap_or(0) <= 0 {
            return Err(AppError::Validation("contract has no remaining counts".into()));
        }
    }

    let mut tx = state.db.begin().await?;
    let row = sqlx::query_as::<_, CheckInRow>(
        r#"
        insert into check_ins (
            id, member_id, branch_id, contract_id, check_in_time, check_in_type,
            check_in_method, processed_by_id, location_ip, location_device, notes
        )
        values (
            gen_random_uuid(), $1, $2, $3, coalesce($4, now()), $5, $6, $7, $8, $9, $10
        )
        returning
            id, status, member_id, branch_id, contract_id, check_in_time, check_in_type,
            check_in_method, processed_by_id, location_ip, location_device, notes,
            (select full_name from members where members.id = check_ins.member_id) as member_full_name,
            (select member_code from members where members.id = check_ins.member_id) as member_code,
            (select name from branches where branches.id = check_ins.branch_id) as branch_name,
            (select full_name from employees where employees.id = check_ins.processed_by_id) as processed_by_full_name
        "#,
    )
    .bind(payload.member_id)
    .bind(payload.branch_id)
    .bind(payload.contract_id)
    .bind(payload.check_in_time)
    .bind(payload.check_in_type.trim())
    .bind(payload.check_in_method.trim())
    .bind(auth.user.employee_id)
    .bind(payload.location_ip)
    .bind(payload.location_device)
    .bind(payload.notes)
    .fetch_one(&mut *tx)
    .await?;

    if let Some(contract) = contract {
        if contract.plan_type == "COUNT_BASED" {
            decrement_remaining_count(&mut tx, tenant_id, contract.id).await?;
        }
    }

    tx.commit().await?;

    Ok((StatusCode::CREATED, Json(ApiResponse { success: true, data: CheckIn::from(row) })))
}

pub async fn qr_verify(
    auth: AuthContext,
    State(state): State<AppState>,
    Json(payload): Json<QrVerifyRequest>,
) -> Result<impl IntoResponse, AppError> {
    let tenant_id = require_tenant(&auth)?;
    let qr = normalize_qr_payload(payload.payload)?;
    let member_code = qr
        .get("m")
        .and_then(Value::as_str)
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .ok_or_else(|| AppError::Validation("QR payload missing member code".into()))?;
    let timestamp_ms = qr
        .get("t")
        .and_then(Value::as_i64)
        .ok_or_else(|| AppError::Validation("QR payload missing timestamp".into()))?;
    let generated_at = Utc
        .timestamp_millis_opt(timestamp_ms)
        .single()
        .ok_or_else(|| AppError::Validation("QR payload timestamp is invalid".into()))?;

    if (Utc::now() - generated_at).num_milliseconds().abs() > 30_000 {
        return Err(AppError::Validation("QR Code 已過期".into()));
    }

    let member = fetch_member_by_code(&state.db, tenant_id, member_code).await?;
    let branch_id = payload
        .branch_id
        .or(auth.user.branch_id)
        .unwrap_or(member.branch_id);
    ensure_branch_scope(&state.db, tenant_id, branch_id).await?;

    let requested_contract_id = qr
        .get("c")
        .and_then(Value::as_str)
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(Uuid::parse_str)
        .transpose()
        .map_err(|_| AppError::Validation("QR payload contract id is invalid".into()))?;
    let mut contract = match requested_contract_id {
        Some(contract_id) => Some(fetch_qr_contract(&state.db, tenant_id, contract_id).await?),
        None => fetch_active_qr_contract(&state.db, tenant_id, member.id).await?,
    };

    if let Some(contract) = &contract {
        if contract.member_id != member.id {
            return Err(AppError::Validation("contract does not match member".into()));
        }
        if contract.branch_id != branch_id {
            return Err(AppError::Validation("contract does not match branch".into()));
        }
        if contract.plan_type.as_deref() == Some("COUNT_BASED")
            && contract.remaining_counts.unwrap_or(0) <= 0
        {
            return Err(AppError::Validation("contract has no remaining counts".into()));
        }
    }

    let mut tx = state.db.begin().await?;
    let checkin_id = sqlx::query_scalar::<_, Uuid>(
        r#"
        insert into check_ins (
            id, member_id, branch_id, contract_id, check_in_time, check_in_type,
            check_in_method, processed_by_id
        )
        values (gen_random_uuid(), $1, $2, $3, now(), 'ENTRY', 'QR', $4)
        returning id
        "#,
    )
    .bind(member.id)
    .bind(branch_id)
    .bind(contract.as_ref().map(|contract| contract.id))
    .bind(payload.verified_by.or(auth.user.employee_id))
    .fetch_one(&mut *tx)
    .await?;

    if let Some(contract) = &contract {
        if contract.plan_type.as_deref() == Some("COUNT_BASED") {
            decrement_remaining_count(&mut tx, tenant_id, contract.id).await?;
        }
    }

    tx.commit().await?;

    if let Some(existing) = &contract {
        contract = Some(fetch_qr_contract(&state.db, tenant_id, existing.id).await?);
    }

    Ok((
        StatusCode::OK,
        Json(QrVerifyResponse {
            success: true,
            message: "QR Code 驗證成功".into(),
            checkin_id,
            member: QrMemberResponse {
                id: member.id,
                member_code: member.member_code,
                full_name: member.full_name,
            },
            contract: contract.map(QrContractResponse::from),
        }),
    ))
}

async fn fetch_check_in(pool: &PgPool, tenant_id: Uuid, id: Uuid) -> Result<CheckIn, AppError> {
    sqlx::query_as::<_, CheckInRow>(
        r#"
        select
            check_ins.id, check_ins.status, check_ins.member_id, check_ins.branch_id,
            check_ins.contract_id, check_ins.check_in_time, check_ins.check_in_type,
            check_ins.check_in_method, check_ins.processed_by_id, check_ins.location_ip,
            check_ins.location_device, check_ins.notes, members.full_name as member_full_name,
            members.member_code, branches.name as branch_name,
            processed_by.full_name as processed_by_full_name
        from check_ins
        join members on members.id = check_ins.member_id
        join branches on branches.id = check_ins.branch_id
        left join employees processed_by on processed_by.id = check_ins.processed_by_id
        where check_ins.id = $1 and members.tenant_id = $2
        "#,
    )
    .bind(id)
    .bind(tenant_id)
    .fetch_optional(pool)
    .await?
    .map(CheckIn::from)
    .ok_or(AppError::NotFound)
}

async fn ensure_member_scope(pool: &PgPool, tenant_id: Uuid, member_id: Uuid) -> Result<(), AppError> {
    ensure_exists(pool, "members", tenant_id, member_id, "memberId").await
}

async fn ensure_branch_scope(pool: &PgPool, tenant_id: Uuid, branch_id: Uuid) -> Result<(), AppError> {
    ensure_exists(pool, "branches", tenant_id, branch_id, "branchId").await
}

async fn ensure_exists(
    pool: &PgPool,
    table: &str,
    tenant_id: Uuid,
    id: Uuid,
    field: &str,
) -> Result<(), AppError> {
    let sql = format!("select exists(select 1 from {table} where id = $1 and tenant_id = $2)");
    let exists = sqlx::query_scalar::<_, bool>(&sql)
        .bind(id)
        .bind(tenant_id)
        .fetch_one(pool)
        .await?;

    if exists {
        Ok(())
    } else {
        Err(AppError::Validation(format!("{field} is invalid for this tenant")))
    }
}

async fn fetch_contract_context(
    pool: &PgPool,
    tenant_id: Uuid,
    contract_id: Uuid,
) -> Result<ContractCheckInContext, AppError> {
    sqlx::query_as::<_, ContractCheckInContext>(
        r#"
        select
            contracts.id, contracts.member_id, contracts.branch_id, contracts.remaining_counts,
            membership_plans.type as plan_type
        from contracts
        join membership_plans on membership_plans.id = contracts.plan_id
        where contracts.id = $1 and contracts.tenant_id = $2
        "#,
    )
    .bind(contract_id)
    .bind(tenant_id)
    .fetch_optional(pool)
    .await?
    .ok_or_else(|| AppError::Validation("contractId is invalid for this tenant".into()))
}

async fn fetch_member_by_code(
    pool: &PgPool,
    tenant_id: Uuid,
    member_code: &str,
) -> Result<QrMemberRow, AppError> {
    sqlx::query_as::<_, QrMemberRow>(
        r#"
        select id, member_code, full_name, branch_id
        from members
        where tenant_id = $1 and member_code = $2 and status = 'ACTIVE'
        "#,
    )
    .bind(tenant_id)
    .bind(member_code)
    .fetch_optional(pool)
    .await?
    .ok_or_else(|| AppError::Validation("QR member is invalid".into()))
}

async fn fetch_qr_contract(
    pool: &PgPool,
    tenant_id: Uuid,
    contract_id: Uuid,
) -> Result<QrContractRow, AppError> {
    sqlx::query_as::<_, QrContractRow>(
        r#"
        select
            contracts.id, contracts.contract_no, contracts.member_id, contracts.branch_id,
            contracts.remaining_counts, contracts.end_date, membership_plans.name as plan_name,
            membership_plans.type as plan_type
        from contracts
        join membership_plans on membership_plans.id = contracts.plan_id
        where contracts.id = $1 and contracts.tenant_id = $2 and contracts.status = 'ACTIVE'
        "#,
    )
    .bind(contract_id)
    .bind(tenant_id)
    .fetch_optional(pool)
    .await?
    .ok_or_else(|| AppError::Validation("QR contract is invalid".into()))
}

async fn fetch_active_qr_contract(
    pool: &PgPool,
    tenant_id: Uuid,
    member_id: Uuid,
) -> Result<Option<QrContractRow>, AppError> {
    sqlx::query_as::<_, QrContractRow>(
        r#"
        select
            contracts.id, contracts.contract_no, contracts.member_id, contracts.branch_id,
            contracts.remaining_counts, contracts.end_date, membership_plans.name as plan_name,
            membership_plans.type as plan_type
        from contracts
        join membership_plans on membership_plans.id = contracts.plan_id
        where contracts.tenant_id = $1
          and contracts.member_id = $2
          and contracts.status = 'ACTIVE'
          and contracts.start_date <= current_date
          and contracts.end_date >= current_date
        order by contracts.end_date desc
        limit 1
        "#,
    )
    .bind(tenant_id)
    .bind(member_id)
    .fetch_optional(pool)
    .await
    .map_err(AppError::from)
}

async fn decrement_remaining_count(
    tx: &mut Transaction<'_, Postgres>,
    tenant_id: Uuid,
    contract_id: Uuid,
) -> Result<(), AppError> {
    sqlx::query(
        r#"
        update contracts
        set remaining_counts = remaining_counts - 1, updated_at = now()
        where id = $1 and tenant_id = $2 and remaining_counts > 0
        "#,
    )
    .bind(contract_id)
    .bind(tenant_id)
    .execute(&mut **tx)
    .await?;

    Ok(())
}

fn require_tenant(auth: &AuthContext) -> Result<Uuid, AppError> {
    auth.user.tenant_id.ok_or(AppError::Unauthorized)
}

fn trim_opt(value: Option<String>) -> Option<String> {
    value.map(|s| s.trim().to_string()).filter(|s| !s.is_empty())
}

fn check_in_matches_search(check_in: &CheckIn, search: &str) -> bool {
    check_in.member.as_ref().map(|member| {
        member.full_name.to_lowercase().contains(search)
            || member.member_code.to_lowercase().contains(search)
    }).unwrap_or(false)
        || check_in.branch.as_ref().map(|branch| branch.name.to_lowercase().contains(search)).unwrap_or(false)
        || check_in.check_in_type.as_ref().map(|value| value.to_lowercase().contains(search)).unwrap_or(false)
        || check_in.check_in_method.as_ref().map(|value| value.to_lowercase().contains(search)).unwrap_or(false)
}

fn sort_check_ins(check_ins: &mut [CheckIn], sort_by: Option<&str>, sort_order: Option<&str>) {
    match sort_by.unwrap_or("check_in_time") {
        "check_in_time" | "checkInTime" | "check_time" | "checkTime" => {
            check_ins.sort_by(|a, b| a.check_in_time.cmp(&b.check_in_time))
        }
        "member_code" | "memberCode" => check_ins.sort_by(|a, b| {
            let left = a.member.as_ref().map(|member| member.member_code.as_str()).unwrap_or("");
            let right = b.member.as_ref().map(|member| member.member_code.as_str()).unwrap_or("");
            left.cmp(right)
        }),
        "member_name" | "memberName" | "fullName" => check_ins.sort_by(|a, b| {
            let left = a.member.as_ref().map(|member| member.full_name.as_str()).unwrap_or("");
            let right = b.member.as_ref().map(|member| member.full_name.as_str()).unwrap_or("");
            left.cmp(right)
        }),
        "branch_name" | "branchName" => check_ins.sort_by(|a, b| {
            let left = a.branch.as_ref().map(|branch| branch.name.as_str()).unwrap_or("");
            let right = b.branch.as_ref().map(|branch| branch.name.as_str()).unwrap_or("");
            left.cmp(right)
        }),
        _ => {}
    }

    if !sort_order.map(|value| value.eq_ignore_ascii_case("asc")).unwrap_or(false) {
        check_ins.reverse();
    }
}

impl From<CheckInRow> for CheckIn {
    fn from(value: CheckInRow) -> Self {
        Self {
            id: value.id,
            status: value.status,
            member_id: value.member_id,
            branch_id: value.branch_id,
            contract_id: value.contract_id,
            check_in_time: value.check_in_time,
            check_in_type: value.check_in_type,
            check_in_method: value.check_in_method,
            processed_by_id: value.processed_by_id,
            location_ip: value.location_ip,
            location_device: value.location_device,
            notes: value.notes,
            member: Some(CheckInMember {
                id: value.member_id,
                full_name: value.member_full_name,
                member_code: value.member_code,
            }),
            branch: Some(CheckInBranch {
                id: value.branch_id,
                name: value.branch_name,
            }),
            processed_by: value.processed_by_id
                .zip(value.processed_by_full_name)
                .map(|(id, full_name)| CheckInProcessedBy { id, full_name }),
        }
    }
}

impl From<QrContractRow> for QrContractResponse {
    fn from(value: QrContractRow) -> Self {
        Self {
            id: value.id,
            contract_no: value.contract_no,
            plan_name: value.plan_name,
            plan_type: value.plan_type,
            remaining_counts: value.remaining_counts,
            end_date: value.end_date,
        }
    }
}

fn normalize_qr_payload(payload: Value) -> Result<Value, AppError> {
    match payload {
        Value::String(value) => serde_json::from_str(&value)
            .map_err(|_| AppError::Validation("QR payload is invalid".into())),
        Value::Object(_) => Ok(payload),
        _ => Err(AppError::Validation("QR payload is invalid".into())),
    }
}
