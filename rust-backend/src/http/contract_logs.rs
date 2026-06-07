use axum::{extract::{Path, Query, State}, http::StatusCode, response::IntoResponse, Json};
use chrono::{DateTime, NaiveDate, Utc};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use sqlx::FromRow;
use uuid::Uuid;

use crate::{
    error::AppError,
    http::{auth::AuthContext, ApiResponse, PaginatedResponse, Pagination},
    state::AppState,
};

#[derive(Debug, Deserialize)]
pub struct ContractLogFilters {
    #[serde(rename = "contractId", alias = "contract_id")]
    contract_id: Option<Uuid>,
    #[serde(rename = "logType", alias = "log_type")]
    log_type: Option<String>,
    page: Option<i64>,
    limit: Option<i64>,
}

#[derive(Debug, Deserialize)]
pub struct CreateContractLogRequest {
    #[serde(rename = "contractId", alias = "contract_id")]
    contract_id: Uuid,
    #[serde(rename = "logType", alias = "log_type")]
    log_type: String,
    #[serde(rename = "startDate", alias = "start_date")]
    start_date: Option<NaiveDate>,
    #[serde(rename = "endDate", alias = "end_date")]
    end_date: Option<NaiveDate>,
    #[serde(rename = "daysAffected", alias = "days_affected", alias = "days")]
    days_affected: Option<i32>,
    reason: Option<String>,
    #[serde(rename = "createdByEmployee", alias = "created_by_employee")]
    created_by_employee: Option<Uuid>,
    #[serde(rename = "originalMemberId", alias = "original_member_id")]
    original_member_id: Option<Uuid>,
    #[serde(rename = "targetMemberId", alias = "target_member_id")]
    target_member_id: Option<Uuid>,
    #[serde(rename = "branchId", alias = "branch_id")]
    branch_id: Option<Uuid>,
}

#[derive(Debug, Serialize, FromRow)]
pub struct ContractLog {
    id: Uuid,
    contract_id: Uuid,
    log_type: String,
    start_date: Option<NaiveDate>,
    end_date: Option<NaiveDate>,
    days_affected: Option<i32>,
    reason: Option<String>,
    created_by_employee: Option<Uuid>,
    original_member_id: Option<Uuid>,
    target_member_id: Option<Uuid>,
    branch_id: Option<Uuid>,
    metadata: Value,
    #[serde(skip_serializing_if = "Option::is_none")]
    contract: Option<Value>,
    #[serde(skip_serializing_if = "Option::is_none")]
    member: Option<Value>,
    #[serde(rename = "date_created")]
    created_at: DateTime<Utc>,
    #[serde(rename = "date_updated")]
    updated_at: Option<DateTime<Utc>>,
}

pub async fn list(
    auth: AuthContext,
    State(state): State<AppState>,
    Query(filters): Query<ContractLogFilters>,
) -> Result<impl IntoResponse, AppError> {
    let tenant_id = require_tenant(&auth)?;
    let log_type = filters.log_type.as_deref().map(str::trim).filter(|value| !value.is_empty());
    let logs = sqlx::query_as::<_, ContractLog>(
        r#"
        select contract_logs.id, contract_logs.contract_id, contract_logs.log_type,
            contract_logs.start_date, contract_logs.end_date, contract_logs.days_affected,
            contract_logs.reason, contract_logs.created_by_employee,
            contract_logs.original_member_id, contract_logs.target_member_id,
            contract_logs.branch_id, '{}'::jsonb as metadata,
            null::jsonb as contract, null::jsonb as member,
            contract_logs.date_created as created_at, null::timestamptz as updated_at
        from contract_logs
        where contract_logs.tenant_id = $1
          and ($2::uuid is null or contract_logs.contract_id = $2)
          and ($3::text is null or contract_logs.log_type = $3)
        order by contract_logs.date_created desc
        "#,
    )
    .bind(tenant_id)
    .bind(filters.contract_id)
    .bind(log_type)
    .fetch_all(&state.db)
    .await?;

    Ok((StatusCode::OK, Json(paginated(logs, filters.page.unwrap_or(1), filters.limit.unwrap_or(100)))))
}

pub async fn list_by_contract(
    auth: AuthContext,
    State(state): State<AppState>,
    Path(contract_id): Path<Uuid>,
) -> Result<impl IntoResponse, AppError> {
    let tenant_id = require_tenant(&auth)?;
    ensure_contract_scope(&state, tenant_id, contract_id).await?;
    let logs = sqlx::query_as::<_, ContractLog>(
        r#"
        select contract_logs.id, contract_logs.contract_id, contract_logs.log_type,
            contract_logs.start_date, contract_logs.end_date, contract_logs.days_affected,
            contract_logs.reason, contract_logs.created_by_employee,
            contract_logs.original_member_id, contract_logs.target_member_id,
            contract_logs.branch_id, '{}'::jsonb as metadata,
            null::jsonb as contract, null::jsonb as member,
            contract_logs.date_created as created_at, null::timestamptz as updated_at
        from contract_logs
        where contract_logs.tenant_id = $1 and contract_logs.contract_id = $2
        order by contract_logs.date_created desc
        "#,
    )
    .bind(tenant_id)
    .bind(contract_id)
    .fetch_all(&state.db)
    .await?;

    Ok((StatusCode::OK, Json(ApiResponse { success: true, data: logs })))
}

pub async fn get(
    auth: AuthContext,
    State(state): State<AppState>,
    Path(id): Path<Uuid>,
) -> Result<impl IntoResponse, AppError> {
    let tenant_id = require_tenant(&auth)?;
    let log = sqlx::query_as::<_, ContractLog>(
        r#"
        select contract_logs.id, contract_logs.contract_id, contract_logs.log_type,
            contract_logs.start_date, contract_logs.end_date, contract_logs.days_affected,
            contract_logs.reason, contract_logs.created_by_employee,
            contract_logs.original_member_id, contract_logs.target_member_id,
            contract_logs.branch_id, '{}'::jsonb as metadata,
            json_build_object('id', contracts.id, 'contract_no', contracts.contract_no, 'status', contracts.status) as contract,
            json_build_object('id', members.id, 'member_code', members.member_code, 'full_name', members.full_name) as member,
            contract_logs.date_created as created_at, null::timestamptz as updated_at
        from contract_logs
        join contracts on contracts.id = contract_logs.contract_id
        join members on members.id = contracts.member_id
        where contract_logs.id = $1 and contract_logs.tenant_id = $2
        "#,
    )
    .bind(id)
    .bind(tenant_id)
    .fetch_optional(&state.db)
    .await?
    .ok_or(AppError::NotFound)?;

    Ok((StatusCode::OK, Json(ApiResponse { success: true, data: log })))
}

pub async fn create(
    auth: AuthContext,
    State(state): State<AppState>,
    Json(payload): Json<CreateContractLogRequest>,
) -> Result<impl IntoResponse, AppError> {
    let tenant_id = require_tenant(&auth)?;
    validate_create(&payload)?;
    ensure_contract_scope(&state, tenant_id, payload.contract_id).await?;
    ensure_branch_scope(&state, tenant_id, payload.branch_id).await?;
    ensure_employee_scope(&state, tenant_id, payload.created_by_employee).await?;
    ensure_member_scope(&state, tenant_id, payload.original_member_id, "original_member_id").await?;
    ensure_member_scope(&state, tenant_id, payload.target_member_id, "target_member_id").await?;

    let log = sqlx::query_as::<_, ContractLog>(
        r#"
        insert into contract_logs (
            contract_id, log_type, start_date, end_date, days_affected, reason,
            created_by_employee, original_member_id, target_member_id, branch_id, tenant_id
        ) values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
        returning id, contract_id, log_type, start_date, end_date, days_affected, reason,
            created_by_employee, original_member_id, target_member_id, branch_id, '{}'::jsonb as metadata,
            null::jsonb as contract, null::jsonb as member,
            date_created as created_at, null::timestamptz as updated_at
        "#,
    )
    .bind(payload.contract_id)
    .bind(payload.log_type.trim())
    .bind(payload.start_date)
    .bind(payload.end_date)
    .bind(payload.days_affected)
    .bind(trim_opt(payload.reason))
    .bind(payload.created_by_employee.or(auth.user.employee_id))
    .bind(payload.original_member_id)
    .bind(payload.target_member_id)
    .bind(payload.branch_id)
    .bind(tenant_id)
    .fetch_one(&state.db)
    .await?;

    Ok((StatusCode::CREATED, Json(ApiResponse { success: true, data: log })))
}

fn validate_create(payload: &CreateContractLogRequest) -> Result<(), AppError> {
    validate_log_type(&payload.log_type)?;
    if let (Some(start), Some(end)) = (payload.start_date, payload.end_date) {
        if end < start {
            return Err(AppError::Validation("end_date must be on or after start_date".into()));
        }
    }
    if let Some(days) = payload.days_affected {
        if days < 0 {
            return Err(AppError::Validation("days_affected must not be negative".into()));
        }
    }
    Ok(())
}

fn validate_log_type(log_type: &str) -> Result<(), AppError> {
    match log_type.trim() {
        "ACTIVATE" | "PAUSE" | "RESUME" | "EXTEND" | "EXTENSION" | "TRANSFER" | "CANCEL" | "CLASS_USED" | "RENEWAL" => Ok(()),
        _ => Err(AppError::Validation("log_type is invalid".into())),
    }
}

async fn ensure_contract_scope(state: &AppState, tenant_id: Uuid, contract_id: Uuid) -> Result<(), AppError> {
    let exists = sqlx::query_scalar::<_, bool>(
        "select exists(select 1 from contracts where id = $1 and tenant_id = $2)",
    )
    .bind(contract_id)
    .bind(tenant_id)
    .fetch_one(&state.db)
    .await?;
    if exists {
        Ok(())
    } else {
        Err(AppError::NotFound)
    }
}

async fn ensure_branch_scope(state: &AppState, tenant_id: Uuid, branch_id: Option<Uuid>) -> Result<(), AppError> {
    ensure_optional_scope(state, "branches", tenant_id, branch_id, "branch_id").await
}

async fn ensure_employee_scope(state: &AppState, tenant_id: Uuid, employee_id: Option<Uuid>) -> Result<(), AppError> {
    ensure_optional_scope(state, "employees", tenant_id, employee_id, "created_by_employee").await
}

async fn ensure_member_scope(
    state: &AppState,
    tenant_id: Uuid,
    member_id: Option<Uuid>,
    field: &str,
) -> Result<(), AppError> {
    ensure_optional_scope(state, "members", tenant_id, member_id, field).await
}

async fn ensure_optional_scope(
    state: &AppState,
    table: &str,
    tenant_id: Uuid,
    id: Option<Uuid>,
    field: &str,
) -> Result<(), AppError> {
    let Some(id) = id else {
        return Ok(());
    };
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

fn require_tenant(auth: &AuthContext) -> Result<Uuid, AppError> {
    auth.user.tenant_id.ok_or(AppError::Unauthorized)
}

fn trim_opt(value: Option<String>) -> Option<String> {
    value.map(|s| s.trim().to_string()).filter(|s| !s.is_empty())
}

fn paginated<T: Serialize>(data: Vec<T>, page: i64, limit: i64) -> PaginatedResponse<Vec<T>> {
    let total = data.len() as i64;
    let page = page.max(1);
    let limit = limit.clamp(1, 500);
    let offset = ((page - 1) * limit) as usize;
    let data = data.into_iter().skip(offset).take(limit as usize).collect();
    PaginatedResponse {
        success: true,
        data,
        pagination: Pagination { total, page, limit, total_pages: ((total + limit - 1) / limit).max(1) },
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn rejects_invalid_log_type() {
        assert!(validate_log_type("PAUSE").is_ok());
        assert!(validate_log_type("UNKNOWN").is_err());
    }
}
