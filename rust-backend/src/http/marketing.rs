use axum::{
    extract::{Path, Query, State},
    http::{header, StatusCode},
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
    http::{auth::AuthContext, ApiResponse},
    state::AppState,
    validation,
};

#[derive(Debug, Serialize)]
struct Meta {
    total: i64,
}

#[derive(Debug, Serialize)]
struct ListResponse<T> {
    success: bool,
    data: Vec<T>,
    meta: Meta,
}

#[derive(Debug, Deserialize)]
pub struct ListFilters {
    status: Option<String>,
    source: Option<String>,
    #[serde(rename = "assigned_to")]
    assigned_to: Option<Uuid>,
    #[serde(rename = "branch_id")]
    branch_id: Option<Uuid>,
    #[serde(rename = "discount_type")]
    discount_type: Option<String>,
    #[serde(rename = "type")]
    item_type: Option<String>,
    search: Option<String>,
    segment: Option<String>,
    limit: Option<i64>,
    offset: Option<i64>,
}

#[derive(Debug, Serialize, FromRow)]
pub struct LeadRow {
    id: Uuid,
    name: String,
    phone: String,
    email: Option<String>,
    source: String,
    utm_source: Option<String>,
    utm_medium: Option<String>,
    utm_campaign: Option<String>,
    branch_id: Option<Uuid>,
    assigned_to: Option<Value>,
    status: String,
    interest: Option<Value>,
    notes: Option<String>,
    converted_member_id: Option<Uuid>,
    converted_at: Option<DateTime<Utc>>,
    created_at: Option<DateTime<Utc>>,
    updated_at: Option<DateTime<Utc>>,
    assigned_to_name: Option<String>,
    branch_name: Option<String>,
    branch: Option<Value>,
    converted_member_name: Option<String>,
    activities: Option<Value>,
}

#[derive(Debug, Serialize, FromRow)]
pub struct LeadActivityRow {
    id: Uuid,
    lead_id: Uuid,
    activity_type: String,
    content: String,
    result: Option<String>,
    next_action: Option<String>,
    next_action_date: Option<NaiveDate>,
    created_by: Option<Value>,
    created_at: Option<DateTime<Utc>>,
    created_by_name: Option<String>,
}

#[derive(Debug, Serialize, FromRow)]
pub struct CampaignRow {
    id: Uuid,
    name: String,
    #[serde(rename = "type")]
    campaign_type: String,
    description: Option<String>,
    start_date: NaiveDate,
    end_date: NaiveDate,
    target_audience: Option<Value>,
    budget: Option<f64>,
    actual_cost: Option<f64>,
    status: String,
    metrics: Value,
    created_by: Option<Uuid>,
    created_at: Option<DateTime<Utc>>,
    created_by_name: Option<String>,
    assets: Option<Value>,
}

#[derive(Debug, Serialize, FromRow)]
pub struct CampaignAssetRow {
    id: Uuid,
    campaign_id: Uuid,
    name: String,
    #[serde(rename = "type")]
    asset_type: String,
    category: Option<String>,
    file_id: Option<Uuid>,
    content: Option<String>,
    created_by: Option<Uuid>,
    created_at: Option<DateTime<Utc>>,
}

#[derive(Debug, Serialize, FromRow)]
pub struct CouponRow {
    id: Uuid,
    code: String,
    name: String,
    discount_type: String,
    discount_value: f64,
    min_purchase: f64,
    max_discount: Option<f64>,
    usage_limit: Option<i32>,
    usage_per_member: i32,
    used_count: i32,
    applicable_plans: Option<Value>,
    start_date: NaiveDate,
    end_date: NaiveDate,
    status: String,
    created_by: Option<Uuid>,
    created_at: Option<DateTime<Utc>>,
    created_by_name: Option<String>,
    is_valid: bool,
    remaining_uses: Option<i32>,
}

#[derive(Debug, Serialize, FromRow)]
pub struct CouponUsageRow {
    id: Uuid,
    coupon_id: Uuid,
    member_id: Uuid,
    contract_id: Option<Uuid>,
    discount_amount: f64,
    used_at: DateTime<Utc>,
    used_by: Option<Uuid>,
    member_name: Option<String>,
    member_code: Option<String>,
    contract_no: Option<String>,
    used_by_name: Option<String>,
}

#[derive(Debug, Serialize, FromRow)]
pub struct RfmRow {
    id: Uuid,
    member_id: Uuid,
    branch_id: Uuid,
    recency_score: i32,
    frequency_score: i32,
    monetary_score: i32,
    rfm_segment: String,
    last_payment_date: Option<DateTime<Utc>>,
    last_checkin_date: Option<DateTime<Utc>>,
    total_payments_12m: f64,
    total_checkins_12m: i32,
    calculated_at: DateTime<Utc>,
    member_name: Option<String>,
    member_code: Option<String>,
    member_phone: Option<String>,
    member_email: Option<String>,
    branch_name: Option<String>,
}

pub async fn list_leads(auth: AuthContext, State(state): State<AppState>, Query(filters): Query<ListFilters>) -> Result<impl IntoResponse, AppError> {
    let tenant_id = require_tenant(&auth)?;
    let search = clean(filters.search);
    let limit = filters.limit.unwrap_or(20).clamp(1, 200);
    let offset = filters.offset.unwrap_or(0).max(0);
    let status = filters.status.clone();
    let source = filters.source.clone();
    let assigned_to = filters.assigned_to;
    let branch_id = filters.branch_id;
    let rows = sqlx::query_as::<_, LeadRow>(LEAD_SELECT_LIST)
        .bind(tenant_id).bind(status.clone()).bind(source.clone()).bind(assigned_to)
        .bind(branch_id).bind(search.clone()).bind(limit).bind(offset)
        .fetch_all(&state.db).await?;
    let total = sqlx::query_scalar::<_, i64>(LEAD_COUNT)
        .bind(tenant_id).bind(status).bind(source).bind(assigned_to)
        .bind(branch_id).bind(search).fetch_one(&state.db).await?;
    Ok((StatusCode::OK, Json(ListResponse { success: true, data: rows, meta: Meta { total } })))
}

pub async fn get_lead(auth: AuthContext, State(state): State<AppState>, Path(id): Path<Uuid>) -> Result<impl IntoResponse, AppError> {
    let tenant_id = require_tenant(&auth)?;
    let lead = fetch_lead(&state, tenant_id, id).await?;
    Ok((StatusCode::OK, Json(ApiResponse { success: true, data: lead })))
}

pub async fn create_lead(auth: AuthContext, State(state): State<AppState>, Json(payload): Json<Value>) -> Result<impl IntoResponse, AppError> {
    let tenant_id = require_tenant(&auth)?;
    let name = text(&payload, "name").ok_or_else(|| AppError::Validation("name is required".into()))?;
    let phone = text(&payload, "phone").ok_or_else(|| AppError::Validation("phone is required".into()))?;
    validation::required_text("name", &name)?;
    validation::required_text("phone", &phone)?;
    let branch_id = uuid_value(&payload, "branch_id").or(auth.user.branch_id);
    if let Some(branch_id) = branch_id { ensure_branch(&state, tenant_id, branch_id).await?; }
    let assigned_to = uuid_value(&payload, "assigned_to").or(auth.user.employee_id);
    if let Some(employee_id) = assigned_to { ensure_employee(&state, tenant_id, employee_id).await?; }
    let id = sqlx::query_scalar::<_, Uuid>(
        "insert into leads (tenant_id, branch_id, name, full_name, phone, email, source, utm_source, utm_medium, utm_campaign, assigned_to, status, interest, notes) values ($1,$2,$3,$3,$4,$5,coalesce($6,'WALK_IN'),$7,$8,$9,$10,coalesce($11,'NEW'),$12,$13) returning id"
    )
    .bind(tenant_id).bind(branch_id).bind(name).bind(phone).bind(text(&payload, "email"))
    .bind(text(&payload, "source")).bind(text(&payload, "utm_source")).bind(text(&payload, "utm_medium"))
    .bind(text(&payload, "utm_campaign")).bind(assigned_to).bind(text(&payload, "status"))
    .bind(payload.get("interest").cloned()).bind(text(&payload, "notes"))
    .fetch_one(&state.db).await?;
    let lead = fetch_lead(&state, tenant_id, id).await?;
    Ok((StatusCode::CREATED, Json(ApiResponse { success: true, data: lead })))
}

pub async fn update_lead(auth: AuthContext, State(state): State<AppState>, Path(id): Path<Uuid>, Json(payload): Json<Value>) -> Result<impl IntoResponse, AppError> {
    let tenant_id = require_tenant(&auth)?;
    fetch_lead(&state, tenant_id, id).await?;
    let branch_id = uuid_value(&payload, "branch_id");
    if let Some(branch_id) = branch_id { ensure_branch(&state, tenant_id, branch_id).await?; }
    let assigned_to = uuid_value(&payload, "assigned_to");
    if let Some(employee_id) = assigned_to { ensure_employee(&state, tenant_id, employee_id).await?; }
    sqlx::query("update leads set name = coalesce($3, name), phone = coalesce($4, phone), email = case when $5 then $6 else email end, source = coalesce($7, source), utm_source = case when $8 then $9 else utm_source end, utm_medium = case when $10 then $11 else utm_medium end, utm_campaign = case when $12 then $13 else utm_campaign end, branch_id = coalesce($14, branch_id), assigned_to = case when $15 then $16 else assigned_to end, status = coalesce($17, status), interest = case when $18 then $19 else interest end, notes = case when $20 then $21 else notes end, updated_at = now() where id = $1 and tenant_id = $2")
        .bind(id).bind(tenant_id).bind(text(&payload, "name")).bind(text(&payload, "phone"))
        .bind(payload.get("email").is_some()).bind(text(&payload, "email")).bind(text(&payload, "source"))
        .bind(payload.get("utm_source").is_some()).bind(text(&payload, "utm_source"))
        .bind(payload.get("utm_medium").is_some()).bind(text(&payload, "utm_medium"))
        .bind(payload.get("utm_campaign").is_some()).bind(text(&payload, "utm_campaign"))
        .bind(branch_id).bind(payload.get("assigned_to").is_some()).bind(assigned_to)
        .bind(text(&payload, "status")).bind(payload.get("interest").is_some()).bind(payload.get("interest").cloned())
        .bind(payload.get("notes").is_some()).bind(text(&payload, "notes"))
        .execute(&state.db).await?;
    let lead = fetch_lead(&state, tenant_id, id).await?;
    Ok((StatusCode::OK, Json(ApiResponse { success: true, data: lead })))
}

pub async fn delete_lead(auth: AuthContext, State(state): State<AppState>, Path(id): Path<Uuid>) -> Result<impl IntoResponse, AppError> {
    let tenant_id = require_tenant(&auth)?;
    fetch_lead(&state, tenant_id, id).await?;
    sqlx::query("update leads set status = 'LOST', updated_at = now() where id = $1 and tenant_id = $2").bind(id).bind(tenant_id).execute(&state.db).await?;
    Ok((StatusCode::OK, Json(json!({ "success": true }))))
}

pub async fn add_lead_activity(auth: AuthContext, State(state): State<AppState>, Path(id): Path<Uuid>, Json(payload): Json<Value>) -> Result<impl IntoResponse, AppError> {
    let tenant_id = require_tenant(&auth)?;
    fetch_lead(&state, tenant_id, id).await?;
    let activity_type = text(&payload, "activity_type").unwrap_or_else(|| "CALL".into());
    let content = text(&payload, "content").ok_or_else(|| AppError::Validation("content is required".into()))?;
    let created_by = uuid_value(&payload, "created_by").or(auth.user.employee_id);
    let row = sqlx::query_as::<_, LeadActivityRow>(
        "insert into lead_activities (tenant_id, lead_id, activity_type, content, result, next_action, next_action_date, created_by) values ($1,$2,$3,$4,$5,$6,$7,$8) returning id, lead_id, activity_type, content, result, next_action, next_action_date, case when $8::uuid is null then null else json_build_object('id', $8::uuid, 'full_name', (select full_name from employees where id = $8)) end as created_by, created_at, (select full_name from employees where id = $8) as created_by_name"
    )
    .bind(tenant_id).bind(id).bind(activity_type).bind(content).bind(text(&payload, "result"))
    .bind(text(&payload, "next_action")).bind(date_value(&payload, "next_action_date")).bind(created_by)
    .fetch_one(&state.db).await?;
    Ok((StatusCode::CREATED, Json(ApiResponse { success: true, data: row })))
}

pub async fn assign_lead(auth: AuthContext, State(state): State<AppState>, Path(id): Path<Uuid>, Json(payload): Json<Value>) -> Result<impl IntoResponse, AppError> {
    let tenant_id = require_tenant(&auth)?;
    let assigned_to = uuid_value(&payload, "assigned_to").ok_or_else(|| AppError::Validation("assigned_to is required".into()))?;
    ensure_employee(&state, tenant_id, assigned_to).await?;
    sqlx::query("update leads set assigned_to = $3, updated_at = now() where id = $1 and tenant_id = $2").bind(id).bind(tenant_id).bind(assigned_to).execute(&state.db).await?;
    let lead = fetch_lead(&state, tenant_id, id).await?;
    Ok((StatusCode::OK, Json(ApiResponse { success: true, data: lead })))
}

pub async fn convert_lead(auth: AuthContext, State(state): State<AppState>, Path(id): Path<Uuid>, Json(_payload): Json<Value>) -> Result<impl IntoResponse, AppError> {
    let tenant_id = require_tenant(&auth)?;
    let lead = fetch_lead(&state, tenant_id, id).await?;
    if let Some(member_id) = lead.converted_member_id {
        let member = member_json(&state, tenant_id, member_id).await?;
        return Ok((StatusCode::OK, Json(ApiResponse { success: true, data: json!({ "lead": lead, "member": member, "is_new_member": false, "member_id": member_id }) })));
    }
    let branch_id = lead.branch_id.or(auth.user.branch_id).ok_or_else(|| AppError::Validation("branch_id is required".into()))?;
    let member_code = format!("LEAD{}", &id.simple().to_string()[..10]);
    let member_id = sqlx::query_scalar::<_, Uuid>(
        "insert into members (member_code, full_name, phone, email, branch_id, sales_person_id, status, join_date, notes, tenant_id) values ($1,$2,$3,$4,$5,$6,'ACTIVE',current_date,$7,$8) returning id"
    )
    .bind(member_code).bind(&lead.name).bind(&lead.phone).bind(&lead.email).bind(branch_id).bind(lead.assigned_to.as_ref().and_then(|v| v.get("id")).and_then(Value::as_str).and_then(|s| Uuid::parse_str(s).ok()))
    .bind(&lead.notes).bind(tenant_id).fetch_one(&state.db).await?;
    sqlx::query("update leads set status = 'CONVERTED', converted_member_id = $3, converted_at = now(), updated_at = now() where id = $1 and tenant_id = $2").bind(id).bind(tenant_id).bind(member_id).execute(&state.db).await?;
    let lead = fetch_lead(&state, tenant_id, id).await?;
    let member = member_json(&state, tenant_id, member_id).await?;
    Ok((StatusCode::OK, Json(ApiResponse { success: true, data: json!({ "lead": lead, "member": member, "is_new_member": true, "member_id": member_id }) })))
}

pub async fn lead_analytics(auth: AuthContext, State(state): State<AppState>, Query(filters): Query<ListFilters>) -> Result<impl IntoResponse, AppError> {
    let tenant_id = require_tenant(&auth)?;
    let total = sqlx::query_scalar::<_, i64>("select count(*) from leads where tenant_id = $1 and ($2::uuid is null or branch_id = $2)").bind(tenant_id).bind(filters.branch_id).fetch_one(&state.db).await?;
    let converted = sqlx::query_scalar::<_, i64>("select count(*) from leads where tenant_id = $1 and status = 'CONVERTED' and ($2::uuid is null or branch_id = $2)").bind(tenant_id).bind(filters.branch_id).fetch_one(&state.db).await?;
    let by_source: Value = sqlx::query_scalar("select coalesce(json_agg(row_to_json(t)), '[]'::json) from (select source, count(*)::int as total, count(*)::int as count, count(*) filter (where status = 'CONVERTED')::int as converted, case when count(*) = 0 then 0 else round((count(*) filter (where status = 'CONVERTED'))::numeric * 100 / count(*), 2)::float8 end as conversion_rate from leads where tenant_id = $1 and ($2::uuid is null or branch_id = $2) group by source order by source) t").bind(tenant_id).bind(filters.branch_id).fetch_one(&state.db).await?;
    let by_status: Value = sqlx::query_scalar("select coalesce(json_agg(row_to_json(t)), '[]'::json) from (select status, count(*)::int as count from leads where tenant_id = $1 and ($2::uuid is null or branch_id = $2) group by status order by status) t").bind(tenant_id).bind(filters.branch_id).fetch_one(&state.db).await?;
    let top_performers: Value = sqlx::query_scalar("select coalesce(json_agg(row_to_json(t)), '[]'::json) from (select e.id, e.full_name, count(l.id)::int as total_leads, count(l.id) filter (where l.status = 'CONVERTED')::int as converted, case when count(l.id)=0 then 0 else round((count(l.id) filter (where l.status = 'CONVERTED'))::numeric * 100 / count(l.id), 2)::float8 end as conversion_rate from employees e join leads l on l.assigned_to = e.id where l.tenant_id = $1 and ($2::uuid is null or l.branch_id = $2) group by e.id, e.full_name order by converted desc, total_leads desc limit 10) t").bind(tenant_id).bind(filters.branch_id).fetch_one(&state.db).await?;
    Ok((StatusCode::OK, Json(ApiResponse { success: true, data: json!({ "total_leads": total, "converted_leads": converted, "by_source": by_source, "source_conversion": by_source, "by_status": by_status, "average_conversion_days": 0, "avg_conversion_days": 0, "top_performers": top_performers }) })))
}

pub async fn list_campaigns(auth: AuthContext, State(state): State<AppState>, Query(filters): Query<ListFilters>) -> Result<impl IntoResponse, AppError> {
    let tenant_id = require_tenant(&auth)?;
    let search = clean(filters.search);
    let limit = filters.limit.unwrap_or(20).clamp(1, 200);
    let offset = filters.offset.unwrap_or(0).max(0);
    let item_type = filters.item_type.clone();
    let status = filters.status.clone();
    let rows = sqlx::query_as::<_, CampaignRow>(CAMPAIGN_SELECT_LIST)
        .bind(tenant_id).bind(item_type.clone()).bind(status.clone()).bind(search.clone()).bind(limit).bind(offset)
        .fetch_all(&state.db).await?;
    let total = sqlx::query_scalar::<_, i64>("select count(*) from campaigns where tenant_id = $1 and ($2::text is null or type = $2) and ($3::text is null or status = $3) and ($4::text is null or name ilike '%' || $4 || '%')")
        .bind(tenant_id).bind(item_type).bind(status).bind(search).fetch_one(&state.db).await?;
    Ok((StatusCode::OK, Json(ListResponse { success: true, data: rows, meta: Meta { total } })))
}

pub async fn get_campaign(auth: AuthContext, State(state): State<AppState>, Path(id): Path<Uuid>) -> Result<impl IntoResponse, AppError> {
    let tenant_id = require_tenant(&auth)?;
    let row = fetch_campaign(&state, tenant_id, id).await?;
    Ok((StatusCode::OK, Json(ApiResponse { success: true, data: row })))
}

pub async fn create_campaign(auth: AuthContext, State(state): State<AppState>, Json(payload): Json<Value>) -> Result<impl IntoResponse, AppError> {
    let tenant_id = require_tenant(&auth)?;
    let name = text(&payload, "name").ok_or_else(|| AppError::Validation("name is required".into()))?;
    let campaign_type = text(&payload, "type").unwrap_or_else(|| "PROMOTION".into());
    let start_date = date_value(&payload, "start_date").unwrap_or_else(|| Utc::now().date_naive());
    let end_date = date_value(&payload, "end_date").unwrap_or(start_date);
    let id = sqlx::query_scalar::<_, Uuid>("insert into campaigns (tenant_id, name, type, description, start_date, end_date, target_audience, budget, actual_cost, status, metrics, created_by) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,coalesce($10,'DRAFT'),coalesce($11,'{}'::jsonb),$12) returning id")
        .bind(tenant_id).bind(name).bind(campaign_type).bind(text(&payload, "description")).bind(start_date).bind(end_date)
        .bind(payload.get("target_audience").cloned()).bind(f64_value(&payload, "budget")).bind(f64_value(&payload, "actual_cost"))
        .bind(text(&payload, "status")).bind(payload.get("metrics").cloned()).bind(uuid_value(&payload, "created_by").or(auth.user.employee_id))
        .fetch_one(&state.db).await?;
    let row = fetch_campaign(&state, tenant_id, id).await?;
    Ok((StatusCode::CREATED, Json(ApiResponse { success: true, data: row })))
}

pub async fn update_campaign(auth: AuthContext, State(state): State<AppState>, Path(id): Path<Uuid>, Json(payload): Json<Value>) -> Result<impl IntoResponse, AppError> {
    let tenant_id = require_tenant(&auth)?;
    fetch_campaign(&state, tenant_id, id).await?;
    sqlx::query("update campaigns set name = coalesce($3, name), type = coalesce($4, type), description = case when $5 then $6 else description end, start_date = coalesce($7, start_date), end_date = coalesce($8, end_date), target_audience = case when $9 then $10 else target_audience end, budget = case when $11 then $12 else budget end, actual_cost = case when $13 then $14 else actual_cost end, status = coalesce($15, status), metrics = case when $16 then $17 else metrics end, updated_at = now() where id = $1 and tenant_id = $2")
        .bind(id).bind(tenant_id).bind(text(&payload, "name")).bind(text(&payload, "type"))
        .bind(payload.get("description").is_some()).bind(text(&payload, "description")).bind(date_value(&payload, "start_date")).bind(date_value(&payload, "end_date"))
        .bind(payload.get("target_audience").is_some()).bind(payload.get("target_audience").cloned()).bind(payload.get("budget").is_some()).bind(f64_value(&payload, "budget"))
        .bind(payload.get("actual_cost").is_some()).bind(f64_value(&payload, "actual_cost")).bind(text(&payload, "status")).bind(payload.get("metrics").is_some()).bind(payload.get("metrics").cloned())
        .execute(&state.db).await?;
    let row = fetch_campaign(&state, tenant_id, id).await?;
    Ok((StatusCode::OK, Json(ApiResponse { success: true, data: row })))
}

pub async fn delete_campaign(auth: AuthContext, State(state): State<AppState>, Path(id): Path<Uuid>) -> Result<impl IntoResponse, AppError> {
    let tenant_id = require_tenant(&auth)?;
    fetch_campaign(&state, tenant_id, id).await?;
    sqlx::query("update campaigns set status = 'CANCELLED', updated_at = now() where id = $1 and tenant_id = $2").bind(id).bind(tenant_id).execute(&state.db).await?;
    Ok((StatusCode::OK, Json(json!({ "success": true }))))
}

pub async fn campaign_metrics(auth: AuthContext, State(state): State<AppState>, Path(id): Path<Uuid>) -> Result<impl IntoResponse, AppError> {
    let tenant_id = require_tenant(&auth)?;
    let c = fetch_campaign(&state, tenant_id, id).await?;
    Ok((StatusCode::OK, Json(ApiResponse { success: true, data: json!({ "campaign_id": c.id, "campaign_name": c.name, "period": { "start_date": c.start_date, "end_date": c.end_date }, "budget": c.budget, "actual_cost": c.actual_cost, "metrics": normalize_metrics(c.metrics, c.actual_cost) }) })))
}

pub async fn update_campaign_metrics(auth: AuthContext, State(state): State<AppState>, Path(id): Path<Uuid>, Json(payload): Json<Value>) -> Result<impl IntoResponse, AppError> {
    let tenant_id = require_tenant(&auth)?;
    fetch_campaign(&state, tenant_id, id).await?;
    let actual_cost = f64_value(&payload, "actual_cost");
    let mut metrics = payload.as_object().cloned().unwrap_or_default();
    metrics.remove("actual_cost");
    metrics.insert("updated_at".into(), json!(Utc::now()));
    sqlx::query("update campaigns set metrics = metrics || $3::jsonb, actual_cost = coalesce($4, actual_cost), updated_at = now() where id = $1 and tenant_id = $2")
        .bind(id).bind(tenant_id).bind(Value::Object(metrics)).bind(actual_cost).execute(&state.db).await?;
    let row = fetch_campaign(&state, tenant_id, id).await?;
    Ok((StatusCode::OK, Json(ApiResponse { success: true, data: row })))
}

pub async fn add_campaign_asset(auth: AuthContext, State(state): State<AppState>, Path(id): Path<Uuid>, Json(payload): Json<Value>) -> Result<impl IntoResponse, AppError> {
    let tenant_id = require_tenant(&auth)?;
    fetch_campaign(&state, tenant_id, id).await?;
    let row = sqlx::query_as::<_, CampaignAssetRow>("insert into campaign_assets (tenant_id, campaign_id, name, type, category, file_id, content, created_by) values ($1,$2,$3,$4,$5,$6,$7,$8) returning id, campaign_id, name, type as asset_type, category, file_id, content, created_by, created_at")
        .bind(tenant_id).bind(id).bind(text(&payload, "name").unwrap_or_else(|| "Asset".into())).bind(text(&payload, "type").unwrap_or_else(|| "TEXT".into()))
        .bind(text(&payload, "category")).bind(uuid_value(&payload, "file_id")).bind(text(&payload, "content")).bind(uuid_value(&payload, "created_by").or(auth.user.employee_id))
        .fetch_one(&state.db).await?;
    Ok((StatusCode::CREATED, Json(ApiResponse { success: true, data: row })))
}

pub async fn campaign_roi_report(auth: AuthContext, State(state): State<AppState>, Query(filters): Query<ListFilters>) -> Result<impl IntoResponse, AppError> {
    let tenant_id = require_tenant(&auth)?;
    let rows: Value = sqlx::query_scalar("select coalesce(json_agg(row_to_json(t)), '[]'::json) from (select id, name, type, status, json_build_object('start', start_date, 'end', end_date) as period, budget::float8 as budget, coalesce(actual_cost, budget, 0)::float8 as actual_cost, coalesce((metrics->>'revenue')::float8, (metrics->>'total_revenue')::float8, (metrics->>'revenue_generated')::float8, 0) as revenue, coalesce((metrics->>'revenue')::float8, (metrics->>'total_revenue')::float8, (metrics->>'revenue_generated')::float8, 0) - coalesce(actual_cost, budget, 0)::float8 as profit, case when coalesce(actual_cost, budget, 0) = 0 then null else round(((coalesce((metrics->>'revenue')::numeric, (metrics->>'total_revenue')::numeric, (metrics->>'revenue_generated')::numeric, 0) - coalesce(actual_cost, budget, 0)) * 100 / coalesce(actual_cost, budget, 0))::numeric, 2)::float8 end as roi, coalesce((metrics->>'conversions')::int, (metrics->>'contracts_created')::int, 0) as conversions from campaigns where tenant_id = $1 and ($2::text is null or type = $2) order by created_at desc) t")
        .bind(tenant_id).bind(filters.item_type).fetch_one(&state.db).await?;
    let arr = rows.as_array().cloned().unwrap_or_default();
    let total_cost: f64 = arr.iter().filter_map(|v| v.get("actual_cost").and_then(Value::as_f64)).sum();
    let total_revenue: f64 = arr.iter().filter_map(|v| v.get("revenue").and_then(Value::as_f64)).sum();
    let total_conversions: i64 = arr.iter().filter_map(|v| v.get("conversions").and_then(Value::as_i64)).sum();
    Ok((StatusCode::OK, Json(json!({ "success": true, "period": { "start_date": serde_json::Value::Null, "end_date": serde_json::Value::Null }, "summary": { "total_campaigns": arr.len(), "total_budget": 0, "total_cost": total_cost, "total_revenue": total_revenue, "total_profit": total_revenue - total_cost, "total_conversions": total_conversions, "average_roi": serde_json::Value::Null, "best_performing": arr.first(), "worst_performing": arr.last() }, "data": rows }))))
}

pub async fn list_coupons(auth: AuthContext, State(state): State<AppState>, Query(filters): Query<ListFilters>) -> Result<impl IntoResponse, AppError> {
    let tenant_id = require_tenant(&auth)?;
    let search = clean(filters.search);
    let limit = filters.limit.unwrap_or(20).clamp(1, 200);
    let offset = filters.offset.unwrap_or(0).max(0);
    let status = filters.status.clone();
    let discount_type = filters.discount_type.clone();
    let rows = sqlx::query_as::<_, CouponRow>(COUPON_SELECT_LIST)
        .bind(tenant_id).bind(status.clone()).bind(discount_type.clone()).bind(search.clone()).bind(limit).bind(offset).fetch_all(&state.db).await?;
    let total = sqlx::query_scalar::<_, i64>("select count(*) from coupons where tenant_id = $1 and ($2::text is null or status = $2) and ($3::text is null or discount_type = $3) and ($4::text is null or code ilike '%' || $4 || '%' or name ilike '%' || $4 || '%')")
        .bind(tenant_id).bind(status).bind(discount_type).bind(search).fetch_one(&state.db).await?;
    Ok((StatusCode::OK, Json(ListResponse { success: true, data: rows, meta: Meta { total } })))
}

pub async fn get_coupon(auth: AuthContext, State(state): State<AppState>, Path(id): Path<Uuid>) -> Result<impl IntoResponse, AppError> {
    let tenant_id = require_tenant(&auth)?;
    let row = fetch_coupon(&state, tenant_id, id).await?;
    Ok((StatusCode::OK, Json(ApiResponse { success: true, data: row })))
}

pub async fn create_coupon(auth: AuthContext, State(state): State<AppState>, Json(payload): Json<Value>) -> Result<impl IntoResponse, AppError> {
    let tenant_id = require_tenant(&auth)?;
    let id = insert_coupon(&state, tenant_id, &payload, text(&payload, "code").ok_or_else(|| AppError::Validation("code is required".into()))?, auth.user.employee_id).await?;
    let row = fetch_coupon(&state, tenant_id, id).await?;
    Ok((StatusCode::CREATED, Json(ApiResponse { success: true, data: row })))
}

pub async fn update_coupon(auth: AuthContext, State(state): State<AppState>, Path(id): Path<Uuid>, Json(payload): Json<Value>) -> Result<impl IntoResponse, AppError> {
    let tenant_id = require_tenant(&auth)?;
    fetch_coupon(&state, tenant_id, id).await?;
    sqlx::query("update coupons set code = coalesce($3, code), name = coalesce($4, name), discount_type = coalesce($5, discount_type), discount_value = coalesce($6, discount_value), min_purchase = coalesce($7, min_purchase), max_discount = case when $8 then $9 else max_discount end, usage_limit = case when $10 then $11 else usage_limit end, usage_per_member = coalesce($12, usage_per_member), applicable_plans = case when $13 then $14 else applicable_plans end, start_date = coalesce($15, start_date), end_date = coalesce($16, end_date), status = coalesce($17, status), updated_at = now() where id = $1 and tenant_id = $2")
        .bind(id).bind(tenant_id).bind(text(&payload, "code")).bind(text(&payload, "name")).bind(text(&payload, "discount_type"))
        .bind(f64_value(&payload, "discount_value")).bind(f64_value(&payload, "min_purchase")).bind(payload.get("max_discount").is_some()).bind(f64_value(&payload, "max_discount"))
        .bind(payload.get("usage_limit").is_some()).bind(i32_value(&payload, "usage_limit")).bind(i32_value(&payload, "usage_per_member"))
        .bind(payload.get("applicable_plans").is_some()).bind(payload.get("applicable_plans").cloned()).bind(date_value(&payload, "start_date")).bind(date_value(&payload, "end_date")).bind(text(&payload, "status"))
        .execute(&state.db).await?;
    let row = fetch_coupon(&state, tenant_id, id).await?;
    Ok((StatusCode::OK, Json(ApiResponse { success: true, data: row })))
}

pub async fn delete_coupon(auth: AuthContext, State(state): State<AppState>, Path(id): Path<Uuid>) -> Result<impl IntoResponse, AppError> {
    let tenant_id = require_tenant(&auth)?;
    fetch_coupon(&state, tenant_id, id).await?;
    sqlx::query("update coupons set status = 'INACTIVE', updated_at = now() where id = $1 and tenant_id = $2").bind(id).bind(tenant_id).execute(&state.db).await?;
    Ok((StatusCode::OK, Json(json!({ "success": true }))))
}

pub async fn validate_coupon(auth: AuthContext, State(state): State<AppState>, Json(payload): Json<Value>) -> Result<impl IntoResponse, AppError> {
    let tenant_id = require_tenant(&auth)?;
    let code = text(&payload, "code").ok_or_else(|| AppError::Validation("code is required".into()))?;
    let amount = f64_value(&payload, "amount").unwrap_or(0.0);
    let coupon = sqlx::query_as::<_, CouponRow>(COUPON_SELECT_ONE_BY_CODE).bind(tenant_id).bind(code.trim()).fetch_optional(&state.db).await?;
    let Some(coupon) = coupon else { return Ok((StatusCode::OK, Json(ApiResponse { success: true, data: json!({ "valid": false, "reason": "COUPON_NOT_FOUND" }) }))); };
    let valid = coupon.status == "ACTIVE" && coupon.is_valid && amount >= coupon.min_purchase && coupon.usage_limit.map(|limit| coupon.used_count < limit).unwrap_or(true);
    let discount = if !valid { 0.0 } else if coupon.discount_type == "PERCENTAGE" { (amount * coupon.discount_value / 100.0).min(coupon.max_discount.unwrap_or(amount)) } else { coupon.discount_value.min(amount) };
    Ok((StatusCode::OK, Json(ApiResponse { success: true, data: json!({ "valid": valid, "reason": if valid { serde_json::Value::Null } else { json!("COUPON_NOT_VALID") }, "coupon_id": coupon.id, "coupon_code": coupon.code, "coupon_name": coupon.name, "discount_type": coupon.discount_type, "discount_value": coupon.discount_value, "discount_amount": discount, "original_amount": amount, "final_amount": (amount - discount).max(0.0) }) })))
}

pub async fn coupon_usages(auth: AuthContext, State(state): State<AppState>, Path(id): Path<Uuid>, Query(filters): Query<ListFilters>) -> Result<impl IntoResponse, AppError> {
    let tenant_id = require_tenant(&auth)?;
    fetch_coupon(&state, tenant_id, id).await?;
    let limit = filters.limit.unwrap_or(50).clamp(1, 200);
    let offset = filters.offset.unwrap_or(0).max(0);
    let rows = sqlx::query_as::<_, CouponUsageRow>("select u.id, u.coupon_id, u.member_id, u.contract_id, u.discount_amount::float8 as discount_amount, u.used_at, u.used_by, m.full_name as member_name, m.member_code, c.contract_no, e.full_name as used_by_name from coupon_usages u join members m on m.id = u.member_id left join contracts c on c.id = u.contract_id left join employees e on e.id = u.used_by where u.tenant_id = $1 and u.coupon_id = $2 order by u.used_at desc limit $3 offset $4")
        .bind(tenant_id).bind(id).bind(limit).bind(offset).fetch_all(&state.db).await?;
    let total = sqlx::query_scalar::<_, i64>("select count(*) from coupon_usages where tenant_id = $1 and coupon_id = $2").bind(tenant_id).bind(id).fetch_one(&state.db).await?;
    Ok((StatusCode::OK, Json(ListResponse { success: true, data: rows, meta: Meta { total } })))
}

pub async fn generate_batch_coupons(auth: AuthContext, State(state): State<AppState>, Json(payload): Json<Value>) -> Result<impl IntoResponse, AppError> {
    let tenant_id = require_tenant(&auth)?;
    let count = i32_value(&payload, "count").unwrap_or(1).clamp(1, 100);
    let prefix = text(&payload, "prefix").unwrap_or_else(|| "CP".into());
    let mut codes = Vec::new();
    for _ in 0..count {
        let code = format!("{}{}", prefix, &Uuid::new_v4().simple().to_string()[..8]).to_uppercase();
        insert_coupon(&state, tenant_id, &payload, code.clone(), auth.user.employee_id).await?;
        codes.push(code);
    }
    Ok((StatusCode::CREATED, Json(ApiResponse { success: true, data: json!({ "count": codes.len(), "codes": codes }) })))
}

pub async fn apply_coupon(auth: AuthContext, State(state): State<AppState>, Json(payload): Json<Value>) -> Result<impl IntoResponse, AppError> {
    let tenant_id = require_tenant(&auth)?;
    let coupon_id = uuid_value(&payload, "coupon_id").ok_or_else(|| AppError::Validation("coupon_id is required".into()))?;
    let member_id = uuid_value(&payload, "member_id").ok_or_else(|| AppError::Validation("member_id is required".into()))?;
    fetch_coupon(&state, tenant_id, coupon_id).await?;
    let usage = sqlx::query_as::<_, CouponUsageRow>("insert into coupon_usages (tenant_id, coupon_id, member_id, contract_id, discount_amount, used_by) values ($1,$2,$3,$4,$5,$6) returning id, coupon_id, member_id, contract_id, discount_amount::float8 as discount_amount, used_at, used_by, (select full_name from members where id = $3) as member_name, (select member_code from members where id = $3) as member_code, (select contract_no from contracts where id = $4) as contract_no, (select full_name from employees where id = $6) as used_by_name")
        .bind(tenant_id).bind(coupon_id).bind(member_id).bind(uuid_value(&payload, "contract_id")).bind(f64_value(&payload, "discount_amount").unwrap_or(0.0)).bind(uuid_value(&payload, "used_by").or(auth.user.employee_id)).fetch_one(&state.db).await?;
    sqlx::query("update coupons set used_count = used_count + 1, updated_at = now() where id = $1 and tenant_id = $2").bind(coupon_id).bind(tenant_id).execute(&state.db).await?;
    Ok((StatusCode::CREATED, Json(ApiResponse { success: true, data: usage })))
}

pub async fn list_rfm(auth: AuthContext, State(state): State<AppState>, Query(filters): Query<ListFilters>) -> Result<impl IntoResponse, AppError> {
    let tenant_id = require_tenant(&auth)?;
    let limit = filters.limit.unwrap_or(50).clamp(1, 200);
    let offset = filters.offset.unwrap_or(0).max(0);
    let rows = sqlx::query_as::<_, RfmRow>(RFM_SELECT_LIST).bind(tenant_id).bind(filters.branch_id).bind(filters.segment.clone()).bind(limit).bind(offset).fetch_all(&state.db).await?;
    let total = sqlx::query_scalar::<_, i64>("select count(*) from rfm_scores where tenant_id = $1 and ($2::uuid is null or branch_id = $2) and ($3::text is null or rfm_segment = $3)").bind(tenant_id).bind(filters.branch_id).bind(filters.segment).fetch_one(&state.db).await?;
    Ok((StatusCode::OK, Json(ListResponse { success: true, data: rows, meta: Meta { total } })))
}

pub async fn get_member_rfm(auth: AuthContext, State(state): State<AppState>, Path(member_id): Path<Uuid>) -> Result<impl IntoResponse, AppError> {
    let tenant_id = require_tenant(&auth)?;
    let row = sqlx::query_as::<_, RfmRow>(RFM_SELECT_ONE).bind(tenant_id).bind(member_id).fetch_optional(&state.db).await?.ok_or(AppError::NotFound)?;
    Ok((StatusCode::OK, Json(ApiResponse { success: true, data: row })))
}

pub async fn calculate_rfm(auth: AuthContext, State(state): State<AppState>, Json(payload): Json<Value>) -> Result<impl IntoResponse, AppError> {
    let tenant_id = require_tenant(&auth)?;
    let branch_id = uuid_value(&payload, "branch_id");
    let members = sqlx::query_as::<_, (Uuid, Uuid)>("select id, branch_id from members where tenant_id = $1 and ($2::uuid is null or branch_id = $2)").bind(tenant_id).bind(branch_id).fetch_all(&state.db).await?;
    for (member_id, member_branch_id) in &members {
        sqlx::query("insert into rfm_scores (tenant_id, member_id, branch_id, recency_score, frequency_score, monetary_score, rfm_segment, last_payment_date, last_checkin_date, total_payments_12m, total_checkins_12m, calculated_at) select $1, $2, $3, 3, 3, 3, 'LOYAL', (select max(payment_date) from payments where tenant_id = $1 and member_id = $2 and payment_date >= now() - interval '12 months'), (select max(check_in_time) from check_ins where member_id = $2 and check_in_time >= now() - interval '12 months'), coalesce((select sum(amount) from payments where tenant_id = $1 and member_id = $2 and payment_date >= now() - interval '12 months'), 0), coalesce((select count(*)::int from check_ins where member_id = $2 and check_in_time >= now() - interval '12 months'), 0), now() on conflict (tenant_id, member_id) do update set branch_id = excluded.branch_id, recency_score = excluded.recency_score, frequency_score = excluded.frequency_score, monetary_score = excluded.monetary_score, rfm_segment = excluded.rfm_segment, last_payment_date = excluded.last_payment_date, last_checkin_date = excluded.last_checkin_date, total_payments_12m = excluded.total_payments_12m, total_checkins_12m = excluded.total_checkins_12m, calculated_at = now()")
            .bind(tenant_id).bind(member_id).bind(member_branch_id).execute(&state.db).await?;
    }
    Ok((StatusCode::OK, Json(ApiResponse { success: true, data: json!({ "calculated": members.len(), "calculated_at": Utc::now() }) })))
}

pub async fn segments(auth: AuthContext, State(state): State<AppState>, Query(filters): Query<ListFilters>) -> Result<impl IntoResponse, AppError> {
    let tenant_id = require_tenant(&auth)?;
    let counts: Value = sqlx::query_scalar("select coalesce(json_object_agg(rfm_segment, count), '{}'::json) from (select rfm_segment, count(*)::int as count from rfm_scores where tenant_id = $1 and ($2::uuid is null or branch_id = $2) group by rfm_segment) t").bind(tenant_id).bind(filters.branch_id).fetch_one(&state.db).await?;
    let total = sqlx::query_scalar::<_, i64>("select count(*) from rfm_scores where tenant_id = $1 and ($2::uuid is null or branch_id = $2)").bind(tenant_id).bind(filters.branch_id).fetch_one(&state.db).await?;
    let segments: Vec<Value> = SEGMENTS.iter().map(|(segment, label, description)| json!({ "segment": segment, "label": label, "description": description, "criteria": { "recency": [1,5], "frequency": [1,5], "monetary": [1,5] }, "member_count": counts.get(*segment).and_then(Value::as_i64).unwrap_or(0) })).collect();
    Ok((StatusCode::OK, Json(ApiResponse { success: true, data: json!({ "segments": segments, "total_members": total }) })))
}

pub async fn segment_members(auth: AuthContext, State(state): State<AppState>, Path(segment): Path<String>, Query(mut filters): Query<ListFilters>) -> Result<impl IntoResponse, AppError> {
    filters.segment = Some(segment.clone());
    let tenant_id = require_tenant(&auth)?;
    let limit = filters.limit.unwrap_or(50).clamp(1, 200);
    let offset = filters.offset.unwrap_or(0).max(0);
    let rows = sqlx::query_as::<_, RfmRow>(RFM_SELECT_LIST).bind(tenant_id).bind(filters.branch_id).bind(Some(segment.clone())).bind(limit).bind(offset).fetch_all(&state.db).await?;
    let total = sqlx::query_scalar::<_, i64>("select count(*) from rfm_scores where tenant_id = $1 and ($2::uuid is null or branch_id = $2) and rfm_segment = $3").bind(tenant_id).bind(filters.branch_id).bind(&segment).fetch_one(&state.db).await?;
    Ok((StatusCode::OK, Json(json!({ "success": true, "data": { "segment": segment, "segment_label": segment_label(&segment), "segment_description": segment_description(&segment), "members": rows }, "meta": { "total": total } }))))
}

pub async fn auto_tag(auth: AuthContext, State(state): State<AppState>, Json(payload): Json<Value>) -> Result<impl IntoResponse, AppError> {
    let tenant_id = require_tenant(&auth)?;
    let segment = text(&payload, "segment");
    let branch_id = uuid_value(&payload, "branch_id");
    let updated = sqlx::query("update members set tags = coalesce(tags, '[]'::jsonb) || to_jsonb(array[coalesce($3, 'RFM')]) where tenant_id = $1 and id in (select member_id from rfm_scores where tenant_id = $1 and ($2::uuid is null or branch_id = $2) and ($3::text is null or rfm_segment = $3))")
        .bind(tenant_id).bind(branch_id).bind(segment).execute(&state.db).await?.rows_affected();
    Ok((StatusCode::OK, Json(ApiResponse { success: true, data: json!({ "updated": updated }) })))
}

pub async fn export_segment(auth: AuthContext, State(state): State<AppState>, Path(segment): Path<String>, Query(filters): Query<ListFilters>) -> Result<impl IntoResponse, AppError> {
    let tenant_id = require_tenant(&auth)?;
    let segment_filter = (segment != "ALL").then_some(segment);
    let rows = sqlx::query_as::<_, RfmRow>(RFM_SELECT_LIST).bind(tenant_id).bind(filters.branch_id).bind(segment_filter).bind(10000_i64).bind(0_i64).fetch_all(&state.db).await?;
    let mut csv = "member_code,member_name,branch_name,segment,recency_score,frequency_score,monetary_score\n".to_string();
    for row in rows {
        csv.push_str(&format!("{},{},{},{},{},{},{}\n", row.member_code.unwrap_or_default(), row.member_name.unwrap_or_default(), row.branch_name.unwrap_or_default(), row.rfm_segment, row.recency_score, row.frequency_score, row.monetary_score));
    }
    Ok((StatusCode::OK, [(header::CONTENT_TYPE, "text/csv; charset=utf-8")], csv))
}

const LEAD_SELECT_LIST: &str = "select l.id, coalesce(l.name, l.full_name) as name, l.phone, l.email, l.source, l.utm_source, l.utm_medium, l.utm_campaign, l.branch_id, case when e.id is null then null else json_build_object('id', e.id, 'full_name', e.full_name, 'employee_code', e.employee_code) end as assigned_to, l.status, l.interest, l.notes, l.converted_member_id, l.converted_at, l.created_at, l.updated_at, e.full_name as assigned_to_name, b.name as branch_name, case when b.id is null then null else json_build_object('id', b.id, 'name', b.name) end as branch, m.full_name as converted_member_name, null::json as activities from leads l left join employees e on e.id = l.assigned_to left join branches b on b.id = l.branch_id left join members m on m.id = l.converted_member_id where l.tenant_id = $1 and ($2::text is null or l.status = $2) and ($3::text is null or l.source = $3) and ($4::uuid is null or l.assigned_to = $4) and ($5::uuid is null or l.branch_id = $5) and ($6::text is null or l.name ilike '%' || $6 || '%' or l.phone ilike '%' || $6 || '%' or l.email ilike '%' || $6 || '%') order by l.created_at desc limit $7 offset $8";
const LEAD_SELECT_ONE: &str = "select l.id, coalesce(l.name, l.full_name) as name, l.phone, l.email, l.source, l.utm_source, l.utm_medium, l.utm_campaign, l.branch_id, case when e.id is null then null else json_build_object('id', e.id, 'full_name', e.full_name, 'employee_code', e.employee_code) end as assigned_to, l.status, l.interest, l.notes, l.converted_member_id, l.converted_at, l.created_at, l.updated_at, e.full_name as assigned_to_name, b.name as branch_name, case when b.id is null then null else json_build_object('id', b.id, 'name', b.name) end as branch, m.full_name as converted_member_name, null::json as activities from leads l left join employees e on e.id = l.assigned_to left join branches b on b.id = l.branch_id left join members m on m.id = l.converted_member_id where l.tenant_id = $1 and l.id = $2";
const LEAD_COUNT: &str = "select count(*) from leads l where l.tenant_id = $1 and ($2::text is null or l.status = $2) and ($3::text is null or l.source = $3) and ($4::uuid is null or l.assigned_to = $4) and ($5::uuid is null or l.branch_id = $5) and ($6::text is null or l.name ilike '%' || $6 || '%' or l.phone ilike '%' || $6 || '%' or l.email ilike '%' || $6 || '%')";
const CAMPAIGN_SELECT_LIST: &str = "select c.id, c.name, c.type as campaign_type, c.description, c.start_date, c.end_date, c.target_audience, c.budget::float8 as budget, c.actual_cost::float8 as actual_cost, c.status, c.metrics, c.created_by, c.created_at, e.full_name as created_by_name, (select coalesce(json_agg(json_build_object('id', a.id, 'name', a.name, 'type', a.type, 'file_id', a.file_id)), '[]'::json) from campaign_assets a where a.campaign_id = c.id) as assets from campaigns c left join employees e on e.id = c.created_by where c.tenant_id = $1 and ($2::text is null or c.type = $2) and ($3::text is null or c.status = $3) and ($4::text is null or c.name ilike '%' || $4 || '%') order by c.created_at desc limit $5 offset $6";
const CAMPAIGN_SELECT_ONE: &str = "select c.id, c.name, c.type as campaign_type, c.description, c.start_date, c.end_date, c.target_audience, c.budget::float8 as budget, c.actual_cost::float8 as actual_cost, c.status, c.metrics, c.created_by, c.created_at, e.full_name as created_by_name, (select coalesce(json_agg(json_build_object('id', a.id, 'name', a.name, 'type', a.type, 'file_id', a.file_id)), '[]'::json) from campaign_assets a where a.campaign_id = c.id) as assets from campaigns c left join employees e on e.id = c.created_by where c.tenant_id = $1 and c.id = $2";
const COUPON_SELECT_LIST: &str = "select c.id, c.code, c.name, c.discount_type, c.discount_value::float8 as discount_value, c.min_purchase::float8 as min_purchase, c.max_discount::float8 as max_discount, c.usage_limit, c.usage_per_member, c.used_count, c.applicable_plans, coalesce(c.start_date, c.valid_from) as start_date, coalesce(c.end_date, c.valid_until) as end_date, c.status, c.created_by, c.created_at, e.full_name as created_by_name, (c.status = 'ACTIVE' and current_date between coalesce(c.start_date, c.valid_from) and coalesce(c.end_date, c.valid_until) and (c.usage_limit is null or c.used_count < c.usage_limit)) as is_valid, case when c.usage_limit is null then null else greatest(c.usage_limit - c.used_count, 0) end as remaining_uses from coupons c left join employees e on e.id = c.created_by where c.tenant_id = $1 and ($2::text is null or c.status = $2) and ($3::text is null or c.discount_type = $3) and ($4::text is null or c.code ilike '%' || $4 || '%' or c.name ilike '%' || $4 || '%') order by c.created_at desc limit $5 offset $6";
const COUPON_SELECT_ONE: &str = "select c.id, c.code, c.name, c.discount_type, c.discount_value::float8 as discount_value, c.min_purchase::float8 as min_purchase, c.max_discount::float8 as max_discount, c.usage_limit, c.usage_per_member, c.used_count, c.applicable_plans, coalesce(c.start_date, c.valid_from) as start_date, coalesce(c.end_date, c.valid_until) as end_date, c.status, c.created_by, c.created_at, e.full_name as created_by_name, (c.status = 'ACTIVE' and current_date between coalesce(c.start_date, c.valid_from) and coalesce(c.end_date, c.valid_until) and (c.usage_limit is null or c.used_count < c.usage_limit)) as is_valid, case when c.usage_limit is null then null else greatest(c.usage_limit - c.used_count, 0) end as remaining_uses from coupons c left join employees e on e.id = c.created_by where c.tenant_id = $1 and c.id = $2";
const COUPON_SELECT_ONE_BY_CODE: &str = "select c.id, c.code, c.name, c.discount_type, c.discount_value::float8 as discount_value, c.min_purchase::float8 as min_purchase, c.max_discount::float8 as max_discount, c.usage_limit, c.usage_per_member, c.used_count, c.applicable_plans, coalesce(c.start_date, c.valid_from) as start_date, coalesce(c.end_date, c.valid_until) as end_date, c.status, c.created_by, c.created_at, e.full_name as created_by_name, (c.status = 'ACTIVE' and current_date between coalesce(c.start_date, c.valid_from) and coalesce(c.end_date, c.valid_until) and (c.usage_limit is null or c.used_count < c.usage_limit)) as is_valid, case when c.usage_limit is null then null else greatest(c.usage_limit - c.used_count, 0) end as remaining_uses from coupons c left join employees e on e.id = c.created_by where c.tenant_id = $1 and c.code = $2";
const RFM_SELECT_LIST: &str = "select r.id, r.member_id, r.branch_id, r.recency_score, r.frequency_score, r.monetary_score, r.rfm_segment, r.last_payment_date, r.last_checkin_date, r.total_payments_12m::float8 as total_payments_12m, r.total_checkins_12m, r.calculated_at, m.full_name as member_name, m.member_code, m.phone as member_phone, m.email as member_email, b.name as branch_name from rfm_scores r join members m on m.id = r.member_id join branches b on b.id = r.branch_id where r.tenant_id = $1 and ($2::uuid is null or r.branch_id = $2) and ($3::text is null or r.rfm_segment = $3) order by r.calculated_at desc limit $4 offset $5";
const RFM_SELECT_ONE: &str = "select r.id, r.member_id, r.branch_id, r.recency_score, r.frequency_score, r.monetary_score, r.rfm_segment, r.last_payment_date, r.last_checkin_date, r.total_payments_12m::float8 as total_payments_12m, r.total_checkins_12m, r.calculated_at, m.full_name as member_name, m.member_code, m.phone as member_phone, m.email as member_email, b.name as branch_name from rfm_scores r join members m on m.id = r.member_id join branches b on b.id = r.branch_id where r.tenant_id = $1 and r.member_id = $2";
const SEGMENTS: &[(&str, &str, &str)] = &[("CHAMPIONS", "冠軍客戶", "高價值且近期活躍"), ("LOYAL", "忠誠客戶", "穩定互動與消費"), ("POTENTIAL_LOYAL", "潛力客戶", "可培養為忠誠客戶"), ("NEW_CUSTOMERS", "新客戶", "剛加入的會員"), ("PROMISING", "有前景", "具備回訪可能"), ("NEED_ATTENTION", "需要關注", "互動下降"), ("ABOUT_TO_SLEEP", "即將沉睡", "近期活躍度降低"), ("AT_RISK", "有風險", "流失風險升高"), ("HIBERNATING", "休眠中", "長期未活躍"), ("LOST", "已流失", "已長期未互動")];

async fn fetch_lead(state: &AppState, tenant_id: Uuid, id: Uuid) -> Result<LeadRow, AppError> {
    let mut row = sqlx::query_as::<_, LeadRow>(LEAD_SELECT_ONE)
        .bind(tenant_id).bind(id)
        .fetch_optional(&state.db).await?.ok_or(AppError::NotFound)?;
    let activities: Value = sqlx::query_scalar("select coalesce(json_agg(row_to_json(t) order by created_at desc), '[]'::json) from (select a.id, a.lead_id, a.activity_type, a.content, a.result, a.next_action, a.next_action_date, case when e.id is null then null else json_build_object('id', e.id, 'full_name', e.full_name) end as created_by, a.created_at, e.full_name as created_by_name from lead_activities a left join employees e on e.id = a.created_by where a.tenant_id = $1 and a.lead_id = $2) t").bind(tenant_id).bind(id).fetch_one(&state.db).await?;
    row.activities = Some(activities);
    Ok(row)
}

async fn fetch_campaign(state: &AppState, tenant_id: Uuid, id: Uuid) -> Result<CampaignRow, AppError> {
    sqlx::query_as::<_, CampaignRow>(CAMPAIGN_SELECT_ONE)
        .bind(tenant_id).bind(id)
        .fetch_optional(&state.db).await?.ok_or(AppError::NotFound)
}

async fn fetch_coupon(state: &AppState, tenant_id: Uuid, id: Uuid) -> Result<CouponRow, AppError> {
    sqlx::query_as::<_, CouponRow>(COUPON_SELECT_ONE)
        .bind(tenant_id).bind(id)
        .fetch_optional(&state.db).await?.ok_or(AppError::NotFound)
}

async fn insert_coupon(state: &AppState, tenant_id: Uuid, payload: &Value, code: String, created_by: Option<Uuid>) -> Result<Uuid, AppError> {
    let name = text(payload, "name").ok_or_else(|| AppError::Validation("name is required".into()))?;
    let discount_type = text(payload, "discount_type").unwrap_or_else(|| "FIXED_AMOUNT".into());
    let discount_value = f64_value(payload, "discount_value").ok_or_else(|| AppError::Validation("discount_value is required".into()))?;
    let start_date = date_value(payload, "start_date").unwrap_or_else(|| Utc::now().date_naive());
    let end_date = date_value(payload, "end_date").unwrap_or(start_date);
    sqlx::query_scalar::<_, Uuid>("insert into coupons (tenant_id, code, name, discount_type, discount_value, min_purchase, max_discount, usage_limit, usage_per_member, usage_limit_per_member, applicable_plans, start_date, end_date, valid_from, valid_until, status, created_by) values ($1,upper($2),$3,$4,$5,coalesce($6,0),$7,$8,coalesce($9,1),coalesce($9,1),$10,$11,$12,$11,$12,coalesce($13,'ACTIVE'),$14) returning id")
        .bind(tenant_id).bind(code).bind(name).bind(discount_type).bind(discount_value).bind(f64_value(payload, "min_purchase"))
        .bind(f64_value(payload, "max_discount")).bind(i32_value(payload, "usage_limit")).bind(i32_value(payload, "usage_per_member"))
        .bind(payload.get("applicable_plans").cloned()).bind(start_date).bind(end_date).bind(text(payload, "status")).bind(uuid_value(payload, "created_by").or(created_by))
        .fetch_one(&state.db).await.map_err(Into::into)
}

async fn member_json(state: &AppState, tenant_id: Uuid, id: Uuid) -> Result<Value, AppError> {
    sqlx::query_scalar("select row_to_json(t) from (select id, member_code, full_name, phone, email, branch_id, status, join_date, tenant_id from members where tenant_id = $1 and id = $2) t")
        .bind(tenant_id).bind(id).fetch_one(&state.db).await.map_err(Into::into)
}

async fn ensure_branch(state: &AppState, tenant_id: Uuid, branch_id: Uuid) -> Result<(), AppError> {
    let exists = sqlx::query_scalar::<_, bool>("select exists(select 1 from branches where tenant_id = $1 and id = $2)").bind(tenant_id).bind(branch_id).fetch_one(&state.db).await?;
    if exists { Ok(()) } else { Err(AppError::Validation("branch_id is not in tenant scope".into())) }
}

async fn ensure_employee(state: &AppState, tenant_id: Uuid, employee_id: Uuid) -> Result<(), AppError> {
    let exists = sqlx::query_scalar::<_, bool>("select exists(select 1 from employees where tenant_id = $1 and id = $2)").bind(tenant_id).bind(employee_id).fetch_one(&state.db).await?;
    if exists { Ok(()) } else { Err(AppError::Validation("employee_id is not in tenant scope".into())) }
}

fn require_tenant(auth: &AuthContext) -> Result<Uuid, AppError> { auth.user.tenant_id.ok_or(AppError::Unauthorized) }
fn clean(value: Option<String>) -> Option<String> { value.map(|v| v.trim().to_string()).filter(|v| !v.is_empty()) }
fn text(payload: &Value, key: &str) -> Option<String> { payload.get(key).and_then(Value::as_str).map(str::trim).map(str::to_string).filter(|v| !v.is_empty()) }
fn uuid_value(payload: &Value, key: &str) -> Option<Uuid> { text(payload, key).and_then(|v| Uuid::parse_str(&v).ok()) }
fn date_value(payload: &Value, key: &str) -> Option<NaiveDate> { text(payload, key).and_then(|v| NaiveDate::parse_from_str(&v, "%Y-%m-%d").ok()) }
fn f64_value(payload: &Value, key: &str) -> Option<f64> { payload.get(key).and_then(Value::as_f64) }
fn i32_value(payload: &Value, key: &str) -> Option<i32> { payload.get(key).and_then(Value::as_i64).and_then(|v| i32::try_from(v).ok()) }
fn normalize_metrics(metrics: Value, actual_cost: Option<f64>) -> Value { let mut value = metrics; if let Some(map) = value.as_object_mut() { map.entry("impressions").or_insert(json!(0)); map.entry("clicks").or_insert(json!(0)); map.entry("conversions").or_insert(json!(0)); map.entry("revenue").or_insert(json!(0)); map.entry("actual_cost").or_insert(json!(actual_cost)); } value }
fn segment_label(segment: &str) -> &'static str { SEGMENTS.iter().find(|(s, _, _)| *s == segment).map(|(_, l, _)| *l).unwrap_or("未知分群") }
fn segment_description(segment: &str) -> &'static str { SEGMENTS.iter().find(|(s, _, _)| *s == segment).map(|(_, _, d)| *d).unwrap_or("") }
