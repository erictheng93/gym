use axum::{
    extract::{Query, State},
    http::{header, StatusCode},
    response::{IntoResponse, Response},
    Json,
};
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

#[derive(Debug, FromRow)]
struct BranchPerformanceRow {
    branch_id: Uuid,
    branch_name: String,
    current_revenue: f64,
    previous_revenue: f64,
    current_new_members: i64,
    previous_new_members: i64,
    current_check_ins: i64,
    previous_check_ins: i64,
    active_contracts: i64,
}

#[derive(Debug, FromRow)]
struct CoachPerformanceRow {
    coach_id: Uuid,
    coach_name: String,
    coach_code: Option<String>,
    branch_id: Option<Uuid>,
    branch_name: Option<String>,
    job_title: Option<String>,
    classes_taught: i64,
    total_students: i64,
    satisfaction_rating: Option<f64>,
    review_count: i64,
    attendance_rate: f64,
}

#[derive(Debug, FromRow)]
struct CoachCategoryRow {
    coach_id: Uuid,
    category: Option<String>,
    count: i64,
}

#[derive(Debug, FromRow)]
struct CountByStringRow {
    key: Option<String>,
    count: i64,
}

#[derive(Debug, FromRow)]
struct ContractAnalyticsRow {
    contract_type: String,
    count: i64,
    total_value: f64,
}

#[derive(Debug, FromRow)]
struct PlanStatsRow {
    plan_id: Uuid,
    plan_name: String,
    contract_count: i64,
    total_value: f64,
}

#[derive(Debug, FromRow)]
struct RevenueMonthRow {
    year: i32,
    month: i32,
    revenue: f64,
    count: i64,
}

#[derive(Debug, FromRow)]
struct HeatmapRow {
    day: i32,
    hour: i32,
    count: i64,
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
        "select join_date as date, count(*) as new_members from members where tenant_id = $1 and ($4::uuid is null or branch_id = $4) and join_date between $2 and $3 group by join_date order by join_date",
    ).bind(tenant_id).bind(start).bind(end).bind(query.branch_id).fetch_all(&state.db).await?;
    let total_new_members = data.iter().map(|r| r.new_members).sum();
    let total_members = scalar_i64_branch(&state, "select count(*) from members where tenant_id = $1 and ($2::uuid is null or branch_id = $2)", tenant_id, query.branch_id).await?;
    Ok((StatusCode::OK, Json(ApiResponse { success: true, data: MemberGrowthReport { summary: MemberGrowthSummary { total_new_members, total_members }, data } })))
}

pub async fn admin_member_demographics(
    auth: AuthContext,
    State(state): State<AppState>,
    Query(query): Query<DateRangeQuery>,
) -> Result<impl IntoResponse, AppError> {
    let tenant_id = require_tenant(&auth)?;
    let (_start, end) = range(&query);
    let branch_id = query.branch_id;

    let status_distribution = sqlx::query_as::<_, CountByStringRow>(
        "select coalesce(status, 'UNKNOWN') as key, count(*)::bigint as count from members where tenant_id = $1 and ($2::uuid is null or branch_id = $2) and join_date <= $3 group by coalesce(status, 'UNKNOWN') order by count desc",
    )
    .bind(tenant_id)
    .bind(branch_id)
    .bind(end)
    .fetch_all(&state.db)
    .await?
    .into_iter()
    .map(|row| json!({ "status": row.key.unwrap_or_else(|| "UNKNOWN".into()), "count": row.count }))
    .collect::<Vec<_>>();

    let gender_distribution = sqlx::query_as::<_, CountByStringRow>(
        "select coalesce(nullif(gender, ''), 'UNKNOWN') as key, count(*)::bigint as count from members where tenant_id = $1 and ($2::uuid is null or branch_id = $2) and join_date <= $3 group by coalesce(nullif(gender, ''), 'UNKNOWN') order by count desc",
    )
    .bind(tenant_id)
    .bind(branch_id)
    .bind(end)
    .fetch_all(&state.db)
    .await?
    .into_iter()
    .map(|row| json!({ "gender": row.key.unwrap_or_else(|| "UNKNOWN".into()), "count": row.count }))
    .collect::<Vec<_>>();

    let age_distribution = sqlx::query_as::<_, CountByStringRow>(
        r#"
        select
            case
                when birthday is null then 'UNKNOWN'
                when extract(year from age(current_date, birthday)) < 18 then '<18'
                when extract(year from age(current_date, birthday)) between 18 and 24 then '18-24'
                when extract(year from age(current_date, birthday)) between 25 and 34 then '25-34'
                when extract(year from age(current_date, birthday)) between 35 and 44 then '35-44'
                when extract(year from age(current_date, birthday)) between 45 and 54 then '45-54'
                else '55+'
            end as key,
            count(*)::bigint as count
        from members
        where tenant_id = $1 and ($2::uuid is null or branch_id = $2) and join_date <= $3
        group by key
        order by key
        "#,
    )
    .bind(tenant_id)
    .bind(branch_id)
    .bind(end)
    .fetch_all(&state.db)
    .await?
    .into_iter()
    .map(|row| json!({ "age_range": row.key.unwrap_or_else(|| "UNKNOWN".into()), "count": row.count }))
    .collect::<Vec<_>>();

    Ok((StatusCode::OK, Json(json!({
        "success": true,
        "data": {
            "status_distribution": status_distribution,
            "gender_distribution": gender_distribution,
            "age_distribution": age_distribution
        }
    }))))
}

pub async fn admin_contract_analytics(
    auth: AuthContext,
    State(state): State<AppState>,
    Query(query): Query<DateRangeQuery>,
) -> Result<impl IntoResponse, AppError> {
    let tenant_id = require_tenant(&auth)?;
    let (start, end) = range(&query);
    let branch_id = query.branch_id;

    let type_distribution = sqlx::query_as::<_, ContractAnalyticsRow>(
        r#"
        select coalesce(membership_plans.type, 'UNKNOWN') as contract_type,
               count(contracts.id)::bigint as count,
               coalesce(sum(contracts.total_amount), 0)::float8 as total_value
        from contracts
        join membership_plans on membership_plans.id = contracts.plan_id
        where contracts.tenant_id = $1
          and ($4::uuid is null or contracts.branch_id = $4)
          and contracts.created_at::date between $2 and $3
        group by coalesce(membership_plans.type, 'UNKNOWN')
        order by count desc
        "#,
    )
    .bind(tenant_id)
    .bind(start)
    .bind(end)
    .bind(branch_id)
    .fetch_all(&state.db)
    .await?;

    let total_contracts = type_distribution.iter().map(|row| row.count).sum::<i64>();
    let total_value = type_distribution.iter().map(|row| row.total_value).sum::<f64>();
    let type_distribution = type_distribution
        .into_iter()
        .map(|row| json!({
            "contract_type": row.contract_type,
            "count": row.count,
            "total_value": row.total_value,
            "percentage": percentage(row.count as f64, total_contracts as f64)
        }))
        .collect::<Vec<_>>();

    let plan_rows = sqlx::query_as::<_, PlanStatsRow>(
        r#"
        select membership_plans.id as plan_id,
               membership_plans.name as plan_name,
               count(contracts.id)::bigint as contract_count,
               coalesce(sum(contracts.total_amount), 0)::float8 as total_value
        from contracts
        join membership_plans on membership_plans.id = contracts.plan_id
        where contracts.tenant_id = $1
          and ($4::uuid is null or contracts.branch_id = $4)
          and contracts.created_at::date between $2 and $3
        group by membership_plans.id, membership_plans.name
        order by contract_count desc, total_value desc
        "#,
    )
    .bind(tenant_id)
    .bind(start)
    .bind(end)
    .bind(branch_id)
    .fetch_all(&state.db)
    .await?;

    let plan_stats = plan_rows
        .into_iter()
        .map(|row| json!({
            "plan_id": row.plan_id,
            "plan_name": row.plan_name,
            "contract_count": row.contract_count,
            "total_value": row.total_value,
            "percentage": percentage(row.contract_count as f64, total_contracts as f64)
        }))
        .collect::<Vec<_>>();

    let active_contracts = scalar_i64_branch(&state, "select count(*) from contracts where tenant_id = $1 and ($2::uuid is null or branch_id = $2) and status = 'ACTIVE'", tenant_id, branch_id).await?;
    let ended_contracts = scalar_i64_branch(&state, "select count(*) from contracts where tenant_id = $1 and ($2::uuid is null or branch_id = $2) and status in ('EXPIRED', 'ENDED', 'CANCELLED', 'TERMINATED')", tenant_id, branch_id).await?;
    let renewal_rate = percentage(active_contracts as f64, (active_contracts + ended_contracts) as f64);

    Ok((StatusCode::OK, Json(json!({
        "success": true,
        "data": {
            "type_distribution": type_distribution,
            "plan_stats": plan_stats,
            "renewal_rate": renewal_rate,
            "total_contracts": total_contracts,
            "total_value": total_value
        }
    }))))
}

pub async fn admin_revenue_breakdown(
    auth: AuthContext,
    State(state): State<AppState>,
    Query(query): Query<DateRangeQuery>,
) -> Result<impl IntoResponse, AppError> {
    let tenant_id = require_tenant(&auth)?;
    let (start, end) = range(&query);
    let branch_id = query.branch_id;

    let by_month = sqlx::query_as::<_, RevenueMonthRow>(
        r#"
        select extract(year from payment_date)::int as year,
               extract(month from payment_date)::int as month,
               coalesce(sum(amount), 0)::float8 as revenue,
               count(*)::bigint as count
        from payments
        where tenant_id = $1
          and ($4::uuid is null or branch_id = $4)
          and payment_date::date between $2 and $3
        group by year, month
        order by year, month
        "#,
    )
    .bind(tenant_id)
    .bind(start)
    .bind(end)
    .bind(branch_id)
    .fetch_all(&state.db)
    .await?
    .into_iter()
    .map(|row| json!({ "year": row.year, "month": row.month, "revenue": row.revenue, "count": row.count }))
    .collect::<Vec<_>>();

    let by_method = sqlx::query_as::<_, CountByStringRow>(
        "select coalesce(payment_method, 'UNKNOWN') as key, count(*)::bigint as count from payments where tenant_id = $1 and ($4::uuid is null or branch_id = $4) and payment_date::date between $2 and $3 group by coalesce(payment_method, 'UNKNOWN') order by count desc",
    )
    .bind(tenant_id)
    .bind(start)
    .bind(end)
    .bind(branch_id)
    .fetch_all(&state.db)
    .await?
    .into_iter()
    .map(|row| json!({ "payment_method": row.key.unwrap_or_else(|| "UNKNOWN".into()), "count": row.count }))
    .collect::<Vec<_>>();

    let total_revenue = scalar_f64_range_branch(
        &state,
        "select coalesce(sum(amount), 0)::float8 from payments where tenant_id = $1 and payment_date::date between $2 and $3 and ($4::uuid is null or branch_id = $4)",
        tenant_id,
        start,
        end,
        branch_id,
    ).await?;

    Ok((StatusCode::OK, Json(json!({
        "success": true,
        "data": {
            "by_month": by_month,
            "by_method": by_method,
            "total_revenue": total_revenue
        }
    }))))
}

pub async fn admin_checkin_heatmap(
    auth: AuthContext,
    State(state): State<AppState>,
    Query(query): Query<DateRangeQuery>,
) -> Result<impl IntoResponse, AppError> {
    let tenant_id = require_tenant(&auth)?;
    let days = query.days.unwrap_or_else(|| query.limit.unwrap_or(28)).max(1);
    let end = Utc::now().date_naive();
    let start = end - Duration::days(days - 1);

    let rows = sqlx::query_as::<_, HeatmapRow>(
        r#"
        select extract(dow from check_ins.check_in_time)::int as day,
               extract(hour from check_ins.check_in_time)::int as hour,
               count(*)::bigint as count
        from check_ins
        join members on members.id = check_ins.member_id
        where members.tenant_id = $1
          and ($4::uuid is null or check_ins.branch_id = $4)
          and check_ins.check_in_time::date between $2 and $3
        group by day, hour
        order by day, hour
        "#,
    )
    .bind(tenant_id)
    .bind(start)
    .bind(end)
    .bind(query.branch_id)
    .fetch_all(&state.db)
    .await?;

    let mut heatmap = vec![vec![0_i64; 24]; 7];
    for row in rows {
        if (0..=6).contains(&row.day) && (0..=23).contains(&row.hour) {
            heatmap[row.day as usize][row.hour as usize] = row.count;
        }
    }

    Ok((StatusCode::OK, Json(json!({
        "success": true,
        "data": {
            "heatmap": heatmap,
            "start_date": start,
            "end_date": end
        }
    }))))
}

pub async fn admin_member_growth_report(
    auth: AuthContext,
    State(state): State<AppState>,
    Query(query): Query<DateRangeQuery>,
) -> Result<impl IntoResponse, AppError> {
    let tenant_id = require_tenant(&auth)?;
    let (start, end) = range(&query);
    let branch_id = query.branch_id;

    let rows = sqlx::query_as::<_, MemberGrowthRow>(
        "select join_date as date, count(*)::bigint as new_members from members where tenant_id = $1 and ($4::uuid is null or branch_id = $4) and join_date between $2 and $3 group by join_date order by join_date",
    )
    .bind(tenant_id)
    .bind(start)
    .bind(end)
    .bind(branch_id)
    .fetch_all(&state.db)
    .await?;

    let mut total = scalar_i64_range_branch(
        &state,
        "select count(*) from members where tenant_id = $1 and join_date < $2 and $3::date >= $2 and ($4::uuid is null or branch_id = $4)",
        tenant_id,
        start,
        end,
        branch_id,
    ).await?;
    let starting_total = total;
    let mut new_members = 0_i64;
    let growth = rows
        .into_iter()
        .map(|row| {
            total += row.new_members;
            new_members += row.new_members;
            json!({
                "date": row.date,
                "newMembers": row.new_members,
                "new_members": row.new_members,
                "total": total
            })
        })
        .collect::<Vec<_>>();
    let growth_rate = percent_change(total as f64, starting_total as f64);

    Ok((StatusCode::OK, Json(json!({
        "success": true,
        "data": {
            "growth": growth,
            "newMembers": new_members,
            "growthRate": growth_rate,
            "churnedMembers": 0,
            "totalMembers": total
        }
    }))))
}

pub async fn api_stats(auth: AuthContext, Query(_query): Query<DateRangeQuery>) -> Result<impl IntoResponse, AppError> {
    require_tenant(&auth)?;
    Ok((StatusCode::OK, Json(json!({
        "success": true,
        "data": {
            "totalRequests": 0,
            "rateLimitHits": 0,
            "avgResponseTime": 0,
            "topEndpoints": []
        }
    }))))
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

pub async fn dashboard_export(auth: AuthContext, Query(query): Query<DateRangeQuery>) -> Result<Response, AppError> {
    require_tenant(&auth)?;
    let format = query.format.unwrap_or_else(|| "csv".into());
    let export_type = query.period.unwrap_or_else(|| "dashboard".into());
    let today = Utc::now().date_naive();
    let response = if format == "json" {
        (
            StatusCode::OK,
            [
                (header::CONTENT_TYPE, "application/json"),
                (header::CONTENT_DISPOSITION, "attachment; filename=\"dashboard-export.json\""),
            ],
            json!({ "success": true, "generated_at": today, "data": [] }).to_string(),
        )
            .into_response()
    } else {
        (
            StatusCode::OK,
            [
                (header::CONTENT_TYPE, "text/csv; charset=utf-8"),
                (header::CONTENT_DISPOSITION, "attachment; filename=\"dashboard-export.csv\""),
            ],
            format!("type,date,value\n{export_type},{today},0\n"),
        )
            .into_response()
    };
    Ok(response)
}

pub async fn branch_performance_report(
    auth: AuthContext,
    State(state): State<AppState>,
    Query(query): Query<DateRangeQuery>,
) -> Result<impl IntoResponse, AppError> {
    let tenant_id = require_tenant(&auth)?;
    let (start, end) = period_range(query.period.as_deref());
    let days = (end - start).num_days() + 1;
    let previous_end = start - Duration::days(1);
    let previous_start = previous_end - Duration::days(days - 1);
    let rows = sqlx::query_as::<_, BranchPerformanceRow>(
        r#"
        select
            branches.id as branch_id,
            branches.name as branch_name,
            coalesce((select sum(amount) from payments where tenant_id = $1 and branch_id = branches.id and payment_date::date between $2 and $3), 0)::float8 as current_revenue,
            coalesce((select sum(amount) from payments where tenant_id = $1 and branch_id = branches.id and payment_date::date between $4 and $5), 0)::float8 as previous_revenue,
            (select count(*) from members where tenant_id = $1 and branch_id = branches.id and join_date between $2 and $3)::bigint as current_new_members,
            (select count(*) from members where tenant_id = $1 and branch_id = branches.id and join_date between $4 and $5)::bigint as previous_new_members,
            (select count(*) from check_ins join members on members.id = check_ins.member_id where members.tenant_id = $1 and check_ins.branch_id = branches.id and check_ins.check_in_time::date between $2 and $3)::bigint as current_check_ins,
            (select count(*) from check_ins join members on members.id = check_ins.member_id where members.tenant_id = $1 and check_ins.branch_id = branches.id and check_ins.check_in_time::date between $4 and $5)::bigint as previous_check_ins,
            (select count(*) from contracts where tenant_id = $1 and branch_id = branches.id and status = 'ACTIVE')::bigint as active_contracts
        from branches
        where branches.tenant_id = $1
          and ($6::uuid is null or branches.id = $6)
          and upper(coalesce(branches.status, 'ACTIVE')) = 'ACTIVE'
        order by current_revenue desc, branches.name asc
        "#,
    )
    .bind(tenant_id)
    .bind(start)
    .bind(end)
    .bind(previous_start)
    .bind(previous_end)
    .bind(query.branch_id)
    .fetch_all(&state.db)
    .await?;

    let mut data = rows
        .into_iter()
        .enumerate()
        .map(|(index, row)| {
            let revenue_change = percent_change(row.current_revenue, row.previous_revenue);
            let members_change = percent_change(row.current_new_members as f64, row.previous_new_members as f64);
            let check_ins_change = percent_change(row.current_check_ins as f64, row.previous_check_ins as f64);
            json!({
                "branch_id": row.branch_id,
                "branch_name": row.branch_name,
                "current_period": {
                    "revenue": row.current_revenue,
                    "new_members": row.current_new_members,
                    "check_ins": row.current_check_ins,
                    "active_contracts": row.active_contracts
                },
                "previous_period": {
                    "revenue": row.previous_revenue,
                    "new_members": row.previous_new_members,
                    "check_ins": row.previous_check_ins
                },
                "growth": {
                    "revenue_change": revenue_change,
                    "members_change": members_change,
                    "check_ins_change": check_ins_change
                },
                "rank": index + 1
            })
        })
        .collect::<Vec<_>>();

    let total_revenue = data.iter().map(|row| row["current_period"]["revenue"].as_f64().unwrap_or(0.0)).sum::<f64>();
    let previous_revenue = data.iter().map(|row| row["previous_period"]["revenue"].as_f64().unwrap_or(0.0)).sum::<f64>();
    let total_new_members = data.iter().map(|row| row["current_period"]["new_members"].as_i64().unwrap_or(0)).sum::<i64>();
    let total_check_ins = data.iter().map(|row| row["current_period"]["check_ins"].as_i64().unwrap_or(0)).sum::<i64>();
    let total_active_contracts = data.iter().map(|row| row["current_period"]["active_contracts"].as_i64().unwrap_or(0)).sum::<i64>();

    let ranking_revenue = ranking(&data, "current_period", "revenue", false);
    let ranking_growth = ranking(&data, "growth", "revenue_change", true);
    let ranking_check_ins = ranking(&data, "current_period", "check_ins", false);
    data.sort_by_key(|row| row["rank"].as_u64().unwrap_or(0));

    Ok((StatusCode::OK, Json(json!({
        "success": true,
        "period": {
            "current": { "start": start, "end": end },
            "previous": { "start": previous_start, "end": previous_end }
        },
        "summary": {
            "total_revenue": total_revenue,
            "total_revenue_growth": percent_change(total_revenue, previous_revenue),
            "total_new_members": total_new_members,
            "total_check_ins": total_check_ins,
            "total_active_contracts": total_active_contracts
        },
        "data": data,
        "ranking": {
            "by_revenue": ranking_revenue,
            "by_growth": ranking_growth,
            "by_check_ins": ranking_check_ins
        }
    }))))
}

pub async fn coach_performance_report(
    auth: AuthContext,
    State(state): State<AppState>,
    Query(query): Query<DateRangeQuery>,
) -> Result<impl IntoResponse, AppError> {
    let tenant_id = require_tenant(&auth)?;
    let (start, end) = period_range(query.period.as_deref());
    let rows = sqlx::query_as::<_, CoachPerformanceRow>(
        r#"
        select
            employees.id as coach_id,
            employees.full_name as coach_name,
            employees.employee_code as coach_code,
            employees.branch_id,
            branches.name as branch_name,
            job_titles.name as job_title,
            (select count(*) from class_sessions where instructor_id = employees.id and session_date between $2 and $3)::bigint as classes_taught,
            (select count(distinct bookings.member_id) from bookings join class_sessions on class_sessions.id = bookings.session_id where class_sessions.instructor_id = employees.id and class_sessions.session_date between $2 and $3)::bigint as total_students,
            (select avg(rating)::float8 from class_reviews where coach_id = employees.id and created_at::date between $2 and $3) as satisfaction_rating,
            (select count(*) from class_reviews where coach_id = employees.id and created_at::date between $2 and $3)::bigint as review_count,
            coalesce((
                select (count(*) filter (where bookings.attended_at is not null))::float8 * 100.0 / nullif(count(*), 0)::float8
                from bookings
                join class_sessions on class_sessions.id = bookings.session_id
                where class_sessions.instructor_id = employees.id and class_sessions.session_date between $2 and $3
            ), 0)::float8 as attendance_rate
        from employees
        left join branches on branches.id = employees.branch_id
        left join job_titles on job_titles.id = employees.job_title_id
        where employees.tenant_id = $1
          and employees.status = 'ACTIVE'
          and ($4::uuid is null or employees.branch_id = $4)
        order by classes_taught desc, employees.full_name asc
        "#,
    )
    .bind(tenant_id)
    .bind(start)
    .bind(end)
    .bind(query.branch_id)
    .fetch_all(&state.db)
    .await?;

    let categories = sqlx::query_as::<_, CoachCategoryRow>(
        r#"
        select
            class_sessions.instructor_id as coach_id,
            classes.category,
            count(*)::bigint as count
        from class_sessions
        join classes on classes.id = class_sessions.class_id
        join employees on employees.id = class_sessions.instructor_id
        where employees.tenant_id = $1
          and class_sessions.session_date between $2 and $3
          and ($4::uuid is null or employees.branch_id = $4)
        group by class_sessions.instructor_id, classes.category
        "#,
    )
    .bind(tenant_id)
    .bind(start)
    .bind(end)
    .bind(query.branch_id)
    .fetch_all(&state.db)
    .await?;

    let data = rows
        .into_iter()
        .map(|row| {
            let coach_categories = categories
                .iter()
                .filter(|category| category.coach_id == row.coach_id)
                .map(|category| json!({ "category": category.category, "count": category.count }))
                .collect::<Vec<_>>();
            json!({
                "coach_id": row.coach_id,
                "coach_name": row.coach_name,
                "coach_code": row.coach_code.unwrap_or_default(),
                "branch_id": row.branch_id,
                "branch_name": row.branch_name.unwrap_or_default(),
                "job_title": row.job_title.unwrap_or_default(),
                "metrics": {
                    "classes_taught": row.classes_taught,
                    "total_students": row.total_students,
                    "satisfaction_rating": row.satisfaction_rating,
                    "review_count": row.review_count,
                    "renewal_rate": null,
                    "attendance_rate": row.attendance_rate,
                    "notes_created": 0,
                    "lesson_plans_created": 0
                },
                "details": {
                    "classes_by_category": coach_categories
                }
            })
        })
        .collect::<Vec<_>>();

    let total_classes_taught = data.iter().map(|row| row["metrics"]["classes_taught"].as_i64().unwrap_or(0)).sum::<i64>();
    let total_students = data.iter().map(|row| row["metrics"]["total_students"].as_i64().unwrap_or(0)).sum::<i64>();
    let ratings = data.iter().filter_map(|row| row["metrics"]["satisfaction_rating"].as_f64()).collect::<Vec<_>>();
    let average_satisfaction = if ratings.is_empty() {
        0.0
    } else {
        ratings.iter().sum::<f64>() / ratings.len() as f64
    };

    Ok((StatusCode::OK, Json(json!({
        "success": true,
        "period": { "start_date": start, "end_date": end },
        "summary": {
            "total_coaches": data.len(),
            "total_classes_taught": total_classes_taught,
            "total_students": total_students,
            "average_satisfaction": average_satisfaction
        },
        "data": data
    }))))
}

pub async fn performance_export(auth: AuthContext, Query(query): Query<DateRangeQuery>) -> Result<Response, AppError> {
    require_tenant(&auth)?;
    let report_type = query.period.unwrap_or_else(|| "performance".into());
    Ok((
        StatusCode::OK,
        [
            (header::CONTENT_TYPE, "text/csv; charset=utf-8"),
            (header::CONTENT_DISPOSITION, "attachment; filename=\"performance-report.csv\""),
        ],
        format!("type,date,value\n{report_type},{},0\n", Utc::now().date_naive()),
    )
        .into_response())
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

fn period_range(period: Option<&str>) -> (NaiveDate, NaiveDate) {
    let end = Utc::now().date_naive();
    let days = match period {
        Some("week") => 6,
        Some("quarter") => 89,
        Some("year") => 364,
        _ => 29,
    };
    (end - Duration::days(days), end)
}

fn percent_change(current: f64, previous: f64) -> f64 {
    if previous.abs() < f64::EPSILON {
        if current.abs() < f64::EPSILON { 0.0 } else { 100.0 }
    } else {
        ((current - previous) / previous) * 100.0
    }
}

fn percentage(value: f64, total: f64) -> f64 {
    if total.abs() < f64::EPSILON {
        0.0
    } else {
        (value / total) * 100.0
    }
}

fn ranking(data: &[serde_json::Value], section: &str, field: &str, descending_absent_ok: bool) -> Vec<serde_json::Value> {
    let mut rows = data
        .iter()
        .map(|row| {
            let value = row[section][field].as_f64().unwrap_or_else(|| row[section][field].as_i64().unwrap_or(0) as f64);
            (row["branch_id"].clone(), row["branch_name"].clone(), value)
        })
        .collect::<Vec<_>>();
    rows.sort_by(|left, right| right.2.partial_cmp(&left.2).unwrap_or(std::cmp::Ordering::Equal));
    rows.into_iter()
        .enumerate()
        .map(|(index, (branch_id, branch_name, value))| {
            json!({
                "branch_id": branch_id,
                "branch_name": branch_name,
                "value": if descending_absent_ok { value } else { value },
                "rank": index + 1
            })
        })
        .collect()
}

fn require_tenant(auth: &AuthContext) -> Result<Uuid, AppError> {
    auth.user.tenant_id.ok_or(AppError::Unauthorized)
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
