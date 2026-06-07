use axum::{extract::{Query, State}, http::StatusCode, Json, response::IntoResponse};
use chrono::{Duration, NaiveDate, Utc};
use serde::{Deserialize, Serialize};
use sqlx::FromRow;
use uuid::Uuid;

use crate::{error::AppError, http::{auth::AuthContext, ApiResponse}, state::AppState};

#[derive(Debug, Deserialize)]
pub struct DateRangeQuery {
    #[serde(rename = "startDate")]
    start_date: Option<NaiveDate>,
    #[serde(rename = "endDate")]
    end_date: Option<NaiveDate>,
    days: Option<i64>,
}

#[derive(Debug, Serialize)]
pub struct DashboardKpis {
    members: MemberKpis,
    revenue: RevenueKpis,
    contracts: ContractKpis,
    operations: OperationKpis,
}

#[derive(Debug, Serialize)]
pub struct MemberKpis {
    total: i64,
    active: i64,
    new_this_period: i64,
}

#[derive(Debug, Serialize)]
pub struct RevenueKpis {
    total: f64,
    payments_count: i64,
}

#[derive(Debug, Serialize)]
pub struct ContractKpis {
    total: i64,
    active: i64,
    expiring_soon: i64,
}

#[derive(Debug, Serialize)]
pub struct OperationKpis {
    today_checkins: i64,
    period_checkins: i64,
    bookings: i64,
}

#[derive(Debug, Serialize)]
pub struct RevenueReport {
    summary: RevenueKpis,
    data: Vec<RevenueRow>,
}

#[derive(Debug, Serialize, FromRow)]
pub struct RevenueRow {
    date: NaiveDate,
    amount: f64,
    count: i64,
}

#[derive(Debug, Serialize)]
pub struct MemberGrowthReport {
    summary: MemberGrowthSummary,
    data: Vec<MemberGrowthRow>,
}

#[derive(Debug, Serialize)]
pub struct MemberGrowthSummary {
    total_new_members: i64,
    total_members: i64,
}

#[derive(Debug, Serialize, FromRow)]
pub struct MemberGrowthRow {
    date: NaiveDate,
    new_members: i64,
}

#[derive(Debug, Serialize)]
pub struct ContractExpiryReport {
    summary: ContractExpirySummary,
    data: Vec<ContractExpiryRow>,
}

#[derive(Debug, Serialize)]
pub struct ContractExpirySummary {
    total_expiring: i64,
}

#[derive(Debug, Serialize, FromRow)]
pub struct ContractExpiryRow {
    id: Uuid,
    contract_no: String,
    member_id: Uuid,
    end_date: NaiveDate,
    status: String,
}

#[derive(Debug, Serialize)]
pub struct MemberActivityReport {
    summary: MemberActivitySummary,
    data: Vec<MemberActivityRow>,
}

#[derive(Debug, Serialize)]
pub struct MemberActivitySummary {
    total_checkins: i64,
    unique_members: i64,
}

#[derive(Debug, Serialize, FromRow)]
pub struct MemberActivityRow {
    date: NaiveDate,
    checkins: i64,
    unique_members: i64,
}

pub async fn dashboard_kpis(
    auth: AuthContext,
    State(state): State<AppState>,
    Query(query): Query<DateRangeQuery>,
) -> Result<impl IntoResponse, AppError> {
    let tenant_id = require_tenant(&auth)?;
    let (start, end) = range(query);

    let total_members = scalar_i64(&state, "select count(*) from members where tenant_id = $1", tenant_id).await?;
    let active_members = scalar_i64(&state, "select count(*) from members where tenant_id = $1 and status = 'ACTIVE'", tenant_id).await?;
    let new_members = scalar_i64_range(&state, "select count(*) from members where tenant_id = $1 and join_date between $2 and $3", tenant_id, start, end).await?;
    let total_revenue = scalar_f64_range(&state, "select coalesce(sum(amount), 0)::float8 from payments where tenant_id = $1 and payment_date::date between $2 and $3", tenant_id, start, end).await?;
    let payments_count = scalar_i64_range(&state, "select count(*) from payments where tenant_id = $1 and payment_date::date between $2 and $3", tenant_id, start, end).await?;
    let total_contracts = scalar_i64(&state, "select count(*) from contracts where tenant_id = $1", tenant_id).await?;
    let active_contracts = scalar_i64(&state, "select count(*) from contracts where tenant_id = $1 and status = 'ACTIVE'", tenant_id).await?;
    let expiring_soon = scalar_i64_range(&state, "select count(*) from contracts where tenant_id = $1 and end_date between $2 and $3", tenant_id, Utc::now().date_naive(), Utc::now().date_naive() + Duration::days(30)).await?;
    let today = Utc::now().date_naive();
    let today_checkins = scalar_i64_range(&state, "select count(*) from check_ins join members on members.id = check_ins.member_id where members.tenant_id = $1 and check_ins.check_in_time::date between $2 and $3", tenant_id, today, today).await?;
    let period_checkins = scalar_i64_range(&state, "select count(*) from check_ins join members on members.id = check_ins.member_id where members.tenant_id = $1 and check_ins.check_in_time::date between $2 and $3", tenant_id, start, end).await?;
    let bookings = scalar_i64_range(&state, "select count(*) from bookings join members on members.id = bookings.member_id where members.tenant_id = $1 and bookings.booked_at::date between $2 and $3", tenant_id, start, end).await?;

    Ok((StatusCode::OK, Json(ApiResponse {
        success: true,
        data: DashboardKpis {
            members: MemberKpis { total: total_members, active: active_members, new_this_period: new_members },
            revenue: RevenueKpis { total: total_revenue, payments_count },
            contracts: ContractKpis { total: total_contracts, active: active_contracts, expiring_soon },
            operations: OperationKpis { today_checkins, period_checkins, bookings },
        },
    })))
}

pub async fn revenue_report(auth: AuthContext, State(state): State<AppState>, Query(query): Query<DateRangeQuery>) -> Result<impl IntoResponse, AppError> {
    let tenant_id = require_tenant(&auth)?;
    let (start, end) = range(query);
    let data = sqlx::query_as::<_, RevenueRow>(
        "select payment_date::date as date, coalesce(sum(amount), 0)::float8 as amount, count(*) as count from payments where tenant_id = $1 and payment_date::date between $2 and $3 group by payment_date::date order by date",
    ).bind(tenant_id).bind(start).bind(end).fetch_all(&state.db).await?;
    let total = data.iter().map(|r| r.amount).sum();
    let count = data.iter().map(|r| r.count).sum();
    Ok((StatusCode::OK, Json(ApiResponse { success: true, data: RevenueReport { summary: RevenueKpis { total, payments_count: count }, data } })))
}

pub async fn member_growth_report(auth: AuthContext, State(state): State<AppState>, Query(query): Query<DateRangeQuery>) -> Result<impl IntoResponse, AppError> {
    let tenant_id = require_tenant(&auth)?;
    let (start, end) = range(query);
    let data = sqlx::query_as::<_, MemberGrowthRow>(
        "select join_date as date, count(*) as new_members from members where tenant_id = $1 and join_date between $2 and $3 group by join_date order by join_date",
    ).bind(tenant_id).bind(start).bind(end).fetch_all(&state.db).await?;
    let total_new_members = data.iter().map(|r| r.new_members).sum();
    let total_members = scalar_i64(&state, "select count(*) from members where tenant_id = $1", tenant_id).await?;
    Ok((StatusCode::OK, Json(ApiResponse { success: true, data: MemberGrowthReport { summary: MemberGrowthSummary { total_new_members, total_members }, data } })))
}

pub async fn contract_expiry_report(auth: AuthContext, State(state): State<AppState>, Query(query): Query<DateRangeQuery>) -> Result<impl IntoResponse, AppError> {
    let tenant_id = require_tenant(&auth)?;
    let (start, end) = range(query);
    let data = sqlx::query_as::<_, ContractExpiryRow>(
        "select id, contract_no, member_id, end_date, status from contracts where tenant_id = $1 and end_date between $2 and $3 order by end_date",
    ).bind(tenant_id).bind(start).bind(end).fetch_all(&state.db).await?;
    let total_expiring = data.len() as i64;
    Ok((StatusCode::OK, Json(ApiResponse { success: true, data: ContractExpiryReport { summary: ContractExpirySummary { total_expiring }, data } })))
}

pub async fn member_activity_report(auth: AuthContext, State(state): State<AppState>, Query(query): Query<DateRangeQuery>) -> Result<impl IntoResponse, AppError> {
    let tenant_id = require_tenant(&auth)?;
    let (start, end) = range(query);
    let data = sqlx::query_as::<_, MemberActivityRow>(
        "select check_ins.check_in_time::date as date, count(*) as checkins, count(distinct check_ins.member_id) as unique_members from check_ins join members on members.id = check_ins.member_id where members.tenant_id = $1 and check_ins.check_in_time::date between $2 and $3 group by check_ins.check_in_time::date order by date",
    ).bind(tenant_id).bind(start).bind(end).fetch_all(&state.db).await?;
    let total_checkins = data.iter().map(|r| r.checkins).sum();
    let unique_members = data.iter().map(|r| r.unique_members).max().unwrap_or(0);
    Ok((StatusCode::OK, Json(ApiResponse { success: true, data: MemberActivityReport { summary: MemberActivitySummary { total_checkins, unique_members }, data } })))
}

fn range(query: DateRangeQuery) -> (NaiveDate, NaiveDate) {
    let end = query.end_date.unwrap_or_else(|| Utc::now().date_naive());
    let start = query.start_date.unwrap_or_else(|| end - Duration::days(query.days.unwrap_or(30)));
    (start, end)
}

fn require_tenant(auth: &AuthContext) -> Result<Uuid, AppError> {
    auth.user.tenant_id.ok_or(AppError::Unauthorized)
}

async fn scalar_i64(state: &AppState, sql: &str, tenant_id: Uuid) -> Result<i64, AppError> {
    Ok(sqlx::query_scalar::<_, i64>(sql).bind(tenant_id).fetch_one(&state.db).await?)
}

async fn scalar_i64_range(state: &AppState, sql: &str, tenant_id: Uuid, start: NaiveDate, end: NaiveDate) -> Result<i64, AppError> {
    Ok(sqlx::query_scalar::<_, i64>(sql).bind(tenant_id).bind(start).bind(end).fetch_one(&state.db).await?)
}

async fn scalar_f64_range(state: &AppState, sql: &str, tenant_id: Uuid, start: NaiveDate, end: NaiveDate) -> Result<f64, AppError> {
    Ok(sqlx::query_scalar::<_, f64>(sql).bind(tenant_id).bind(start).bind(end).fetch_one(&state.db).await?)
}
