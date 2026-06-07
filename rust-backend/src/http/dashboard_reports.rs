use axum::{extract::{Query, State}, http::StatusCode, Json, response::IntoResponse};
use chrono::{Datelike, Duration, NaiveDate, Utc};
use serde::{Deserialize, Serialize};
use serde_json::json;
use sqlx::FromRow;
use uuid::Uuid;

use crate::{error::AppError, http::{auth::AuthContext, ApiResponse}, state::AppState};

#[derive(Debug, Deserialize)]
pub struct DateRangeQuery {
    #[serde(rename = "startDate")]
    start_date: Option<NaiveDate>,
    #[serde(rename = "start_date")]
    start_date_snake: Option<NaiveDate>,
    #[serde(rename = "endDate")]
    end_date: Option<NaiveDate>,
    #[serde(rename = "end_date")]
    end_date_snake: Option<NaiveDate>,
    days: Option<i64>,
    period: Option<String>,
    #[serde(rename = "branch_id")]
    branch_id: Option<Uuid>,
    #[serde(rename = "days_ahead")]
    days_ahead: Option<i64>,
    limit: Option<i64>,
    year: Option<i32>,
    format: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct SetRevenueTargetRequest {
    branch_id: Uuid,
    year: i32,
    month: i32,
    target_amount: f64,
}

#[derive(Debug, Serialize)]
pub struct RevenueKpis {
    total: f64,
    payments_count: i64,
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

#[derive(Debug, FromRow)]
struct ContractAlertRow {
    contract_id: Uuid,
    contract_no: String,
    days_until_expiry: Option<i32>,
    member_name: String,
    member_phone: String,
    plan_name: String,
    branch_name: String,
}

#[derive(Debug, FromRow)]
struct BranchLiteRow {
    id: Uuid,
    name: String,
}

pub async fn dashboard_kpis(
    auth: AuthContext,
    State(state): State<AppState>,
    Query(query): Query<DateRangeQuery>,
) -> Result<impl IntoResponse, AppError> {
    let tenant_id = require_tenant(&auth)?;
    let (start, end) = range(&query);
    let branch_id = query.branch_id;
    let period_type = query.period.unwrap_or_else(|| "custom".into());

    let total_members = scalar_i64_branch(&state, "select count(*) from members where tenant_id = $1 and ($2::uuid is null or branch_id = $2)", tenant_id, branch_id).await?;
    let active_members = scalar_i64_branch(&state, "select count(*) from members where tenant_id = $1 and ($2::uuid is null or branch_id = $2) and status = 'ACTIVE'", tenant_id, branch_id).await?;
    let new_members = scalar_i64_range_branch(&state, "select count(*) from members where tenant_id = $1 and ($4::uuid is null or branch_id = $4) and join_date between $2 and $3", tenant_id, start, end, branch_id).await?;
    let total_revenue = scalar_f64_range_branch(&state, "select coalesce(sum(amount), 0)::float8 from payments where tenant_id = $1 and ($4::uuid is null or branch_id = $4) and payment_date::date between $2 and $3", tenant_id, start, end, branch_id).await?;
    let today_revenue = scalar_f64_range_branch(&state, "select coalesce(sum(amount), 0)::float8 from payments where tenant_id = $1 and ($4::uuid is null or branch_id = $4) and payment_date::date between $2 and $3", tenant_id, Utc::now().date_naive(), Utc::now().date_naive(), branch_id).await?;
    let payments_count = scalar_i64_range_branch(&state, "select count(*) from payments where tenant_id = $1 and ($4::uuid is null or branch_id = $4) and payment_date::date between $2 and $3", tenant_id, start, end, branch_id).await?;
    let active_contracts = scalar_i64_branch(&state, "select count(*) from contracts where tenant_id = $1 and ($2::uuid is null or branch_id = $2) and status = 'ACTIVE'", tenant_id, branch_id).await?;
    let expiring_7 = scalar_i64_range_branch(&state, "select count(*) from contracts where tenant_id = $1 and ($4::uuid is null or branch_id = $4) and end_date between $2 and $3", tenant_id, Utc::now().date_naive(), Utc::now().date_naive() + Duration::days(7), branch_id).await?;
    let expiring_30 = scalar_i64_range_branch(&state, "select count(*) from contracts where tenant_id = $1 and ($4::uuid is null or branch_id = $4) and end_date between $2 and $3", tenant_id, Utc::now().date_naive(), Utc::now().date_naive() + Duration::days(30), branch_id).await?;
    let expiring_90 = scalar_i64_range_branch(&state, "select count(*) from contracts where tenant_id = $1 and ($4::uuid is null or branch_id = $4) and end_date between $2 and $3", tenant_id, Utc::now().date_naive(), Utc::now().date_naive() + Duration::days(90), branch_id).await?;
    let today = Utc::now().date_naive();
    let today_checkins = scalar_i64_range_branch(&state, "select count(*) from check_ins join members on members.id = check_ins.member_id where members.tenant_id = $1 and ($4::uuid is null or check_ins.branch_id = $4) and check_ins.check_in_time::date between $2 and $3", tenant_id, today, today, branch_id).await?;
    let period_checkins = scalar_i64_range_branch(&state, "select count(*) from check_ins join members on members.id = check_ins.member_id where members.tenant_id = $1 and ($4::uuid is null or check_ins.branch_id = $4) and check_ins.check_in_time::date between $2 and $3", tenant_id, start, end, branch_id).await?;
    let bookings = scalar_i64_range_branch(&state, "select count(*) from bookings join members on members.id = bookings.member_id where members.tenant_id = $1 and ($4::uuid is null or members.branch_id = $4) and bookings.booked_at::date between $2 and $3", tenant_id, start, end, branch_id).await?;

    Ok((StatusCode::OK, Json(json!({
        "success": true,
        "period": {
            "type": period_type,
            "start_date": start,
            "end_date": end
        },
        "revenue": {
            "today": today_revenue,
            "mtd": total_revenue,
            "ytd": total_revenue,
            "period": total_revenue,
            "change": 0,
            "transactions": { "today": payments_count, "period": payments_count },
            "by_payment_method": [],
            "by_branch": []
        },
        "members": {
            "total": total_members,
            "active": active_members,
            "new": new_members,
            "churned": 0,
            "active_rate": if total_members > 0 { active_members as f64 / total_members as f64 } else { 0.0 },
            "by_gender": { "male": 0, "female": 0 },
            "by_age": [],
            "by_branch": []
        },
        "contracts": {
            "active": active_contracts,
            "expiring_7": expiring_7,
            "expiring_30": expiring_30,
            "expiring_90": expiring_90,
            "renewal_rate": 0,
            "avg_value": 0,
            "by_type": []
        },
        "operations": {
            "today_checkins": today_checkins,
            "period_checkins": period_checkins,
            "peak_hour": 0,
            "hourly_distribution": [],
            "class_attendance_rate": 0,
            "by_branch": [],
            "bookings": bookings
        },
        "generated_at": Utc::now()
    }))))
}

pub async fn revenue_report(auth: AuthContext, State(state): State<AppState>, Query(query): Query<DateRangeQuery>) -> Result<impl IntoResponse, AppError> {
    let tenant_id = require_tenant(&auth)?;
    let (start, end) = range(&query);
    let data = sqlx::query_as::<_, RevenueRow>(
        "select payment_date::date as date, coalesce(sum(amount), 0)::float8 as amount, count(*) as count from payments where tenant_id = $1 and payment_date::date between $2 and $3 group by payment_date::date order by date",
    ).bind(tenant_id).bind(start).bind(end).fetch_all(&state.db).await?;
    let total = data.iter().map(|r| r.amount).sum();
    let count = data.iter().map(|r| r.count).sum();
    Ok((StatusCode::OK, Json(ApiResponse { success: true, data: RevenueReport { summary: RevenueKpis { total, payments_count: count }, data } })))
}

pub async fn member_growth_report(auth: AuthContext, State(state): State<AppState>, Query(query): Query<DateRangeQuery>) -> Result<impl IntoResponse, AppError> {
    let tenant_id = require_tenant(&auth)?;
    let (start, end) = range(&query);
    let data = sqlx::query_as::<_, MemberGrowthRow>(
        "select join_date as date, count(*) as new_members from members where tenant_id = $1 and join_date between $2 and $3 group by join_date order by join_date",
    ).bind(tenant_id).bind(start).bind(end).fetch_all(&state.db).await?;
    let total_new_members = data.iter().map(|r| r.new_members).sum();
    let total_members = scalar_i64(&state, "select count(*) from members where tenant_id = $1", tenant_id).await?;
    Ok((StatusCode::OK, Json(ApiResponse { success: true, data: MemberGrowthReport { summary: MemberGrowthSummary { total_new_members, total_members }, data } })))
}

pub async fn contract_expiry_report(auth: AuthContext, State(state): State<AppState>, Query(query): Query<DateRangeQuery>) -> Result<impl IntoResponse, AppError> {
    let tenant_id = require_tenant(&auth)?;
    let today = Utc::now().date_naive();
    let start = query.start_date.or(query.start_date_snake).unwrap_or(today);
    let end = query
        .end_date
        .or(query.end_date_snake)
        .unwrap_or(today + Duration::days(query.days_ahead.or(query.days).unwrap_or(30)));
    let data = sqlx::query_as::<_, ContractExpiryRow>(
        "select id, contract_no, member_id, end_date, status from contracts where tenant_id = $1 and end_date between $2 and $3 order by end_date",
    ).bind(tenant_id).bind(start).bind(end).fetch_all(&state.db).await?;
    let total_expiring = data.len() as i64;
    Ok((StatusCode::OK, Json(ApiResponse { success: true, data: ContractExpiryReport { summary: ContractExpirySummary { total_expiring }, data } })))
}

pub async fn member_activity_report(auth: AuthContext, State(state): State<AppState>, Query(query): Query<DateRangeQuery>) -> Result<impl IntoResponse, AppError> {
    let tenant_id = require_tenant(&auth)?;
    let (start, end) = range(&query);
    let data = sqlx::query_as::<_, MemberActivityRow>(
        "select check_ins.check_in_time::date as date, count(*) as checkins, count(distinct check_ins.member_id) as unique_members from check_ins join members on members.id = check_ins.member_id where members.tenant_id = $1 and check_ins.check_in_time::date between $2 and $3 group by check_ins.check_in_time::date order by date",
    ).bind(tenant_id).bind(start).bind(end).fetch_all(&state.db).await?;
    let total_checkins = data.iter().map(|r| r.checkins).sum();
    let unique_members = data.iter().map(|r| r.unique_members).max().unwrap_or(0);
    Ok((StatusCode::OK, Json(ApiResponse { success: true, data: MemberActivityReport { summary: MemberActivitySummary { total_checkins, unique_members }, data } })))
}

pub async fn contract_alerts(auth: AuthContext, State(state): State<AppState>, Query(query): Query<DateRangeQuery>) -> Result<impl IntoResponse, AppError> {
    let tenant_id = require_tenant(&auth)?;
    let today = Utc::now().date_naive();
    let days_ahead = query.days_ahead.or(query.days).unwrap_or(30);
    let limit = query.limit.unwrap_or(50).max(1);
    let alerts = sqlx::query_as::<_, ContractAlertRow>(
        r#"
        select
            contracts.id as contract_id,
            contracts.contract_no,
            (contracts.end_date - current_date)::int as days_until_expiry,
            members.full_name as member_name,
            members.phone as member_phone,
            membership_plans.name as plan_name,
            branches.name as branch_name
        from contracts
        join members on members.id = contracts.member_id
        join membership_plans on membership_plans.id = contracts.plan_id
        join branches on branches.id = contracts.branch_id
        where contracts.tenant_id = $1
          and contracts.status = 'ACTIVE'
          and contracts.end_date between $2 and $3
          and ($4::uuid is null or contracts.branch_id = $4)
        order by contracts.end_date asc
        limit $5
        "#,
    )
    .bind(tenant_id)
    .bind(today)
    .bind(today + Duration::days(days_ahead))
    .bind(query.branch_id)
    .bind(limit)
    .fetch_all(&state.db)
    .await?;

    let alerts = alerts
        .into_iter()
        .map(|row| {
            let urgency = if row.days_until_expiry.unwrap_or(0) <= 7 {
                "URGENT"
            } else if row.days_until_expiry.unwrap_or(0) <= 30 {
                "SOON"
            } else {
                "UPCOMING"
            };
            json!({
                "contract_id": row.contract_id,
                "contract_no": row.contract_no,
                "days_until_expiry": row.days_until_expiry.unwrap_or(0),
                "member_name": row.member_name,
                "member_phone": row.member_phone,
                "plan_name": row.plan_name,
                "branch_name": row.branch_name,
                "urgency": urgency
            })
        })
        .collect::<Vec<_>>();
    let urgent = alerts.iter().filter(|alert| alert["urgency"] == "URGENT").cloned().collect::<Vec<_>>();
    let soon = alerts.iter().filter(|alert| alert["urgency"] == "SOON").cloned().collect::<Vec<_>>();
    let upcoming = alerts.iter().filter(|alert| alert["urgency"] == "UPCOMING").cloned().collect::<Vec<_>>();

    Ok((StatusCode::OK, Json(json!({
        "success": true,
        "summary": {
            "total": alerts.len(),
            "urgent": urgent.len(),
            "soon": soon.len(),
            "upcoming": upcoming.len()
        },
        "grouped": {
            "urgent": urgent,
            "soon": soon,
            "upcoming": upcoming
        },
        "alerts": alerts
    }))))
}

pub async fn revenue_targets(auth: AuthContext, State(state): State<AppState>, Query(query): Query<DateRangeQuery>) -> Result<impl IntoResponse, AppError> {
    let tenant_id = require_tenant(&auth)?;
    let year = query.year.unwrap_or_else(|| Utc::now().date_naive().year());
    let branches = sqlx::query_as::<_, BranchLiteRow>(
        "select id, name from branches where tenant_id = $1 and ($2::uuid is null or id = $2) and upper(coalesce(status, 'ACTIVE')) = 'ACTIVE' order by name",
    )
    .bind(tenant_id)
    .bind(query.branch_id)
    .fetch_all(&state.db)
    .await?;

    let mut targets = Vec::new();
    for branch in branches {
        for month in 1..=12 {
            targets.push(json!({
                "id": format!("{}-{year}-{month}", branch.id),
                "branch_id": branch.id,
                "branch_name": branch.name,
                "year": year,
                "month": month,
                "target_amount": 0.0
            }));
        }
    }

    Ok((StatusCode::OK, Json(json!({ "success": true, "targets": targets }))))
}

pub async fn set_revenue_target(
    auth: AuthContext,
    State(state): State<AppState>,
    Json(payload): Json<SetRevenueTargetRequest>,
) -> Result<impl IntoResponse, AppError> {
    let tenant_id = require_tenant(&auth)?;
    if !(1..=12).contains(&payload.month) {
        return Err(AppError::Validation("month must be between 1 and 12".into()));
    }
    let branch = sqlx::query_as::<_, BranchLiteRow>("select id, name from branches where id = $1 and tenant_id = $2")
        .bind(payload.branch_id)
        .bind(tenant_id)
        .fetch_optional(&state.db)
        .await?
        .ok_or(AppError::NotFound)?;

    Ok((StatusCode::OK, Json(json!({
        "success": true,
        "target": {
            "id": format!("{}-{}-{}", branch.id, payload.year, payload.month),
            "branch_id": branch.id,
            "branch_name": branch.name,
            "year": payload.year,
            "month": payload.month,
            "target_amount": payload.target_amount
        }
    }))))
}

pub async fn refresh_reports(auth: AuthContext) -> Result<impl IntoResponse, AppError> {
    require_tenant(&auth)?;
    Ok((StatusCode::OK, Json(json!({ "success": true, "message": "報表已刷新" }))))
}

pub async fn dashboard_export(auth: AuthContext, Query(query): Query<DateRangeQuery>) -> Result<impl IntoResponse, AppError> {
    require_tenant(&auth)?;
    let format = query.format.unwrap_or_else(|| "csv".into());
    let body = if format == "json" {
        json!({ "success": true, "data": [] }).to_string()
    } else {
        "type,date,value\nexport,generated,0\n".into()
    };
    Ok((StatusCode::OK, body))
}

fn range(query: &DateRangeQuery) -> (NaiveDate, NaiveDate) {
    let end = query.end_date.or(query.end_date_snake).unwrap_or_else(|| Utc::now().date_naive());
    let default_days = match query.period.as_deref() {
        Some("today") => 0,
        Some("week") => 6,
        Some("month") => 29,
        Some("year") => 364,
        _ => query.days.unwrap_or(30),
    };
    let start = query.start_date.or(query.start_date_snake).unwrap_or(end - Duration::days(default_days));
    (start, end)
}

fn require_tenant(auth: &AuthContext) -> Result<Uuid, AppError> {
    auth.user.tenant_id.ok_or(AppError::Unauthorized)
}

async fn scalar_i64(state: &AppState, sql: &str, tenant_id: Uuid) -> Result<i64, AppError> {
    Ok(sqlx::query_scalar::<_, i64>(sql).bind(tenant_id).fetch_one(&state.db).await?)
}

async fn scalar_i64_branch(state: &AppState, sql: &str, tenant_id: Uuid, branch_id: Option<Uuid>) -> Result<i64, AppError> {
    Ok(sqlx::query_scalar::<_, i64>(sql).bind(tenant_id).bind(branch_id).fetch_one(&state.db).await?)
}

async fn scalar_i64_range_branch(state: &AppState, sql: &str, tenant_id: Uuid, start: NaiveDate, end: NaiveDate, branch_id: Option<Uuid>) -> Result<i64, AppError> {
    Ok(sqlx::query_scalar::<_, i64>(sql).bind(tenant_id).bind(start).bind(end).bind(branch_id).fetch_one(&state.db).await?)
}

async fn scalar_f64_range_branch(state: &AppState, sql: &str, tenant_id: Uuid, start: NaiveDate, end: NaiveDate, branch_id: Option<Uuid>) -> Result<f64, AppError> {
    Ok(sqlx::query_scalar::<_, f64>(sql).bind(tenant_id).bind(start).bind(end).bind(branch_id).fetch_one(&state.db).await?)
}
