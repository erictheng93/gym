use axum::{
    extract::{Path, Query, State},
    http::StatusCode,
    response::IntoResponse,
    Json,
};
use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use sqlx::FromRow;
use uuid::Uuid;

use crate::{error::AppError, http::auth::AuthContext, state::AppState};

#[derive(Debug, Serialize)]
struct ApiListResponse<T> {
    success: bool,
    data: T,
    meta: Meta,
}

#[derive(Debug, Serialize)]
struct ApiDataResponse<T> {
    success: bool,
    data: T,
}

#[derive(Debug, Serialize)]
struct Meta {
    total: i64,
}

#[derive(Debug, Deserialize)]
pub struct ReviewFilters {
    #[serde(alias = "employeeId")]
    employee_id: Option<Uuid>,
    #[serde(alias = "reviewerId")]
    reviewer_id: Option<Uuid>,
    status: Option<String>,
    #[serde(alias = "reviewType")]
    review_type: Option<String>,
    period: Option<String>,
    limit: Option<i64>,
    offset: Option<i64>,
}

#[derive(Debug, Deserialize)]
pub struct CreateReviewRequest {
    #[serde(alias = "employeeId")]
    employee_id: Uuid,
    #[serde(alias = "reviewerId")]
    reviewer_id: Option<Uuid>,
    #[serde(alias = "reviewPeriod")]
    review_period: String,
    #[serde(alias = "reviewType")]
    review_type: String,
    #[serde(alias = "templateId")]
    template_id: Option<Uuid>,
    #[serde(alias = "kpiData")]
    kpi_data: Option<Value>,
    score: Option<f64>,
    comments: Option<String>,
    improvement_plan: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct UpdateReviewRequest {
    #[serde(alias = "kpiData")]
    kpi_data: Option<Value>,
    score: Option<f64>,
    comments: Option<String>,
    improvement_plan: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct RejectReviewRequest {
    reason: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct CreateTemplateRequest {
    name: String,
    description: Option<String>,
    #[serde(alias = "jobTitleId")]
    job_title_id: Option<Uuid>,
    #[serde(alias = "reviewType")]
    review_type: Option<String>,
    kpis: Value,
    #[serde(alias = "isDefault")]
    is_default: Option<bool>,
}

#[derive(Debug, Deserialize)]
pub struct DashboardFilters {
    #[serde(alias = "branchId")]
    branch_id: Option<Uuid>,
    period: Option<String>,
}

#[derive(Debug, Serialize, FromRow)]
pub struct PerformanceReviewRow {
    id: Uuid,
    employee_id: Uuid,
    employee: Value,
    reviewer_id: Option<Uuid>,
    reviewer: Option<Value>,
    review_period: String,
    review_type: String,
    kpi_data: Value,
    score: Option<f64>,
    comments: Option<String>,
    improvement_plan: Option<String>,
    status: String,
    reviewed_at: Option<DateTime<Utc>>,
    date_created: Option<DateTime<Utc>>,
}

#[derive(Debug, Serialize, FromRow)]
pub struct KpiTemplateRow {
    id: Uuid,
    name: String,
    description: Option<String>,
    job_title_id: Option<Uuid>,
    review_type: String,
    kpis: Value,
    is_default: bool,
    is_active: bool,
    date_created: Option<DateTime<Utc>>,
}

#[derive(Debug, Serialize, FromRow)]
struct DashboardSummary {
    total_reviews: i64,
    pending_reviews: i64,
    completed_reviews: i64,
    average_score: Option<f64>,
    excellent: i64,
    good: i64,
    poor: i64,
}

#[derive(Debug, Serialize, FromRow)]
struct TopPerformer {
    id: Uuid,
    full_name: String,
    score: f64,
}

pub async fn list_reviews(
    auth: AuthContext,
    State(state): State<AppState>,
    Query(filters): Query<ReviewFilters>,
) -> Result<impl IntoResponse, AppError> {
    let tenant_id = require_tenant(&auth)?;
    let rows = sqlx::query_as::<_, PerformanceReviewRow>(REVIEW_SELECT)
        .bind(tenant_id)
        .bind(filters.employee_id)
        .bind(filters.reviewer_id)
        .bind(filters.status)
        .bind(filters.review_type)
        .bind(filters.period)
        .bind(filters.limit.unwrap_or(20).clamp(1, 500))
        .bind(filters.offset.unwrap_or(0).max(0))
        .fetch_all(&state.db)
        .await?;
    let total = rows.len() as i64;

    Ok((
        StatusCode::OK,
        Json(ApiListResponse {
            success: true,
            data: rows,
            meta: Meta { total },
        }),
    ))
}

pub async fn get_review(
    auth: AuthContext,
    State(state): State<AppState>,
    Path(id): Path<Uuid>,
) -> Result<impl IntoResponse, AppError> {
    let tenant_id = require_tenant(&auth)?;
    let row = fetch_review(&state, tenant_id, id).await?;
    Ok((
        StatusCode::OK,
        Json(ApiDataResponse {
            success: true,
            data: row,
        }),
    ))
}

pub async fn create_review(
    auth: AuthContext,
    State(state): State<AppState>,
    Json(payload): Json<CreateReviewRequest>,
) -> Result<impl IntoResponse, AppError> {
    let tenant_id = require_tenant(&auth)?;
    let reviewer_id = payload.reviewer_id.or(auth.user.employee_id);
    let kpi_data = match payload.kpi_data {
        Some(value) => value,
        None => match payload.template_id {
            Some(template_id) => sqlx::query_scalar::<_, Value>(
                "select kpis from kpi_templates where id = $1 and tenant_id = $2 and is_active = true",
            )
            .bind(template_id)
            .bind(tenant_id)
            .fetch_optional(&state.db)
            .await?
            .unwrap_or_else(|| json!([])),
            None => json!([]),
        },
    };

    let id = sqlx::query_scalar::<_, Uuid>(
        r#"
        insert into performance_reviews (
            id, employee_id, reviewer_id, review_period, review_type, kpi_data,
            overall_score, reviewer_comments, improvement_plan, status, tenant_id
        ) values (
            gen_random_uuid(), $1, $2, $3, $4, $5::jsonb,
            ($6::double precision)::numeric, $7, $8, 'DRAFT', $9
        ) returning id
        "#,
    )
    .bind(payload.employee_id)
    .bind(reviewer_id)
    .bind(payload.review_period)
    .bind(payload.review_type)
    .bind(kpi_data.to_string())
    .bind(payload.score)
    .bind(payload.comments)
    .bind(payload.improvement_plan)
    .bind(tenant_id)
    .fetch_one(&state.db)
    .await?;

    let row = fetch_review(&state, tenant_id, id).await?;
    Ok((
        StatusCode::CREATED,
        Json(ApiDataResponse {
            success: true,
            data: row,
        }),
    ))
}

pub async fn update_review(
    auth: AuthContext,
    State(state): State<AppState>,
    Path(id): Path<Uuid>,
    Json(payload): Json<UpdateReviewRequest>,
) -> Result<impl IntoResponse, AppError> {
    let tenant_id = require_tenant(&auth)?;
    let updated_id = sqlx::query_scalar::<_, Uuid>(
        r#"
        update performance_reviews set
            kpi_data = coalesce($3::jsonb, kpi_data),
            overall_score = coalesce(($4::double precision)::numeric, overall_score),
            reviewer_comments = coalesce($5, reviewer_comments),
            improvement_plan = coalesce($6, improvement_plan),
            updated_at = now()
        where id = $1 and tenant_id = $2
        returning id
        "#,
    )
    .bind(id)
    .bind(tenant_id)
    .bind(payload.kpi_data.map(|value| value.to_string()))
    .bind(payload.score)
    .bind(payload.comments)
    .bind(payload.improvement_plan)
    .fetch_optional(&state.db)
    .await?
    .ok_or(AppError::NotFound)?;

    let row = fetch_review(&state, tenant_id, updated_id).await?;
    Ok((
        StatusCode::OK,
        Json(ApiDataResponse {
            success: true,
            data: row,
        }),
    ))
}

pub async fn submit_review(
    auth: AuthContext,
    State(state): State<AppState>,
    Path(id): Path<Uuid>,
) -> Result<impl IntoResponse, AppError> {
    let tenant_id = require_tenant(&auth)?;
    let row = set_review_status(&state, tenant_id, id, "SUBMITTED", None).await?;
    Ok((
        StatusCode::OK,
        Json(ApiDataResponse {
            success: true,
            data: row,
        }),
    ))
}

pub async fn approve_review(
    auth: AuthContext,
    State(state): State<AppState>,
    Path(id): Path<Uuid>,
) -> Result<impl IntoResponse, AppError> {
    let tenant_id = require_tenant(&auth)?;
    let approved_by = auth.user.employee_id;
    let updated_id = sqlx::query_scalar::<_, Uuid>(
        r#"
        update performance_reviews set
            status = 'APPROVED',
            reviewed_at = now(),
            approved_at = now(),
            approved_by = $3,
            updated_at = now()
        where id = $1 and tenant_id = $2
        returning id
        "#,
    )
    .bind(id)
    .bind(tenant_id)
    .bind(approved_by)
    .fetch_optional(&state.db)
    .await?
    .ok_or(AppError::NotFound)?;
    let row = fetch_review(&state, tenant_id, updated_id).await?;
    Ok((
        StatusCode::OK,
        Json(ApiDataResponse {
            success: true,
            data: row,
        }),
    ))
}

pub async fn reject_review(
    auth: AuthContext,
    State(state): State<AppState>,
    Path(id): Path<Uuid>,
    Json(payload): Json<RejectReviewRequest>,
) -> Result<impl IntoResponse, AppError> {
    let tenant_id = require_tenant(&auth)?;
    let row = set_review_status(&state, tenant_id, id, "DRAFT", payload.reason).await?;
    Ok((
        StatusCode::OK,
        Json(ApiDataResponse {
            success: true,
            data: row,
        }),
    ))
}

pub async fn list_templates(
    auth: AuthContext,
    State(state): State<AppState>,
) -> Result<impl IntoResponse, AppError> {
    let tenant_id = require_tenant(&auth)?;
    let rows = sqlx::query_as::<_, KpiTemplateRow>(
        r#"
        select
            id,
            name,
            description,
            job_title_id,
            review_type,
            kpis,
            coalesce(is_default, false) as is_default,
            coalesce(is_active, true) as is_active,
            created_at as date_created
        from kpi_templates
        where tenant_id = $1 and coalesce(is_active, true) = true
        order by created_at desc
        "#,
    )
    .bind(tenant_id)
    .fetch_all(&state.db)
    .await?;
    let total = rows.len() as i64;
    Ok((
        StatusCode::OK,
        Json(ApiListResponse {
            success: true,
            data: rows,
            meta: Meta { total },
        }),
    ))
}

pub async fn create_template(
    auth: AuthContext,
    State(state): State<AppState>,
    Json(payload): Json<CreateTemplateRequest>,
) -> Result<impl IntoResponse, AppError> {
    let tenant_id = require_tenant(&auth)?;
    let id = sqlx::query_scalar::<_, Uuid>(
        r#"
        insert into kpi_templates (
            id, name, description, job_title_id, review_type, kpis,
            is_default, is_active, created_by, tenant_id
        ) values (
            gen_random_uuid(), $1, $2, $3, coalesce($4, 'MONTHLY'), $5::jsonb,
            coalesce($6, false), true, $7, $8
        ) returning id
        "#,
    )
    .bind(payload.name)
    .bind(payload.description)
    .bind(payload.job_title_id)
    .bind(payload.review_type)
    .bind(payload.kpis.to_string())
    .bind(payload.is_default)
    .bind(auth.user.employee_id)
    .bind(tenant_id)
    .fetch_one(&state.db)
    .await?;

    let row = fetch_template(&state, tenant_id, id).await?;
    Ok((
        StatusCode::CREATED,
        Json(ApiDataResponse {
            success: true,
            data: row,
        }),
    ))
}

pub async fn delete_template(
    auth: AuthContext,
    State(state): State<AppState>,
    Path(id): Path<Uuid>,
) -> Result<impl IntoResponse, AppError> {
    let tenant_id = require_tenant(&auth)?;
    sqlx::query(
        "update kpi_templates set is_active = false, updated_at = now() where id = $1 and tenant_id = $2",
    )
    .bind(id)
    .bind(tenant_id)
    .execute(&state.db)
    .await?;
    Ok((
        StatusCode::OK,
        Json(ApiDataResponse {
            success: true,
            data: json!({ "id": id }),
        }),
    ))
}

pub async fn team_dashboard(
    auth: AuthContext,
    State(state): State<AppState>,
    Query(filters): Query<DashboardFilters>,
) -> Result<impl IntoResponse, AppError> {
    let tenant_id = require_tenant(&auth)?;
    let period = filters.period.unwrap_or_default();
    let summary = sqlx::query_as::<_, DashboardSummary>(
        r#"
        select
            count(*)::bigint as total_reviews,
            count(*) filter (where pr.status = 'SUBMITTED')::bigint as pending_reviews,
            count(*) filter (where pr.status = 'APPROVED')::bigint as completed_reviews,
            avg(pr.overall_score)::float8 as average_score,
            count(*) filter (where pr.overall_score >= 80)::bigint as excellent,
            count(*) filter (where pr.overall_score >= 60 and pr.overall_score < 80)::bigint as good,
            count(*) filter (where pr.overall_score < 60)::bigint as poor
        from performance_reviews pr
        join employees e on e.id = pr.employee_id
        where pr.tenant_id = $1
          and ($2::uuid is null or e.branch_id = $2)
          and ($3 = '' or pr.review_period = $3)
        "#,
    )
    .bind(tenant_id)
    .bind(filters.branch_id)
    .bind(period.clone())
    .fetch_one(&state.db)
    .await?;

    let top_performers = sqlx::query_as::<_, TopPerformer>(
        r#"
        select e.id, e.full_name, pr.overall_score::float8 as score
        from performance_reviews pr
        join employees e on e.id = pr.employee_id
        where pr.tenant_id = $1
          and pr.status = 'APPROVED'
          and pr.overall_score is not null
          and ($2::uuid is null or e.branch_id = $2)
          and ($3 = '' or pr.review_period = $3)
        order by pr.overall_score desc, e.full_name
        limit 5
        "#,
    )
    .bind(tenant_id)
    .bind(filters.branch_id)
    .bind(period)
    .fetch_all(&state.db)
    .await?;

    let data = json!({
        "total_reviews": summary.total_reviews,
        "pending_reviews": summary.pending_reviews,
        "completed_reviews": summary.completed_reviews,
        "average_score": summary.average_score,
        "score_distribution": {
            "excellent": summary.excellent,
            "good": summary.good,
            "poor": summary.poor
        },
        "top_performers": top_performers
    });
    Ok((
        StatusCode::OK,
        Json(ApiDataResponse {
            success: true,
            data,
        }),
    ))
}

async fn fetch_review(
    state: &AppState,
    tenant_id: Uuid,
    id: Uuid,
) -> Result<PerformanceReviewRow, AppError> {
    sqlx::query_as::<_, PerformanceReviewRow>(REVIEW_SELECT_BY_ID)
        .bind(tenant_id)
        .bind(id)
        .fetch_optional(&state.db)
        .await?
        .ok_or(AppError::NotFound)
}

async fn fetch_template(
    state: &AppState,
    tenant_id: Uuid,
    id: Uuid,
) -> Result<KpiTemplateRow, AppError> {
    sqlx::query_as::<_, KpiTemplateRow>(
        r#"
        select
            id,
            name,
            description,
            job_title_id,
            review_type,
            kpis,
            coalesce(is_default, false) as is_default,
            coalesce(is_active, true) as is_active,
            created_at as date_created
        from kpi_templates
        where id = $1 and tenant_id = $2
        "#,
    )
    .bind(id)
    .bind(tenant_id)
    .fetch_optional(&state.db)
    .await?
    .ok_or(AppError::NotFound)
}

async fn set_review_status(
    state: &AppState,
    tenant_id: Uuid,
    id: Uuid,
    status: &str,
    reason: Option<String>,
) -> Result<PerformanceReviewRow, AppError> {
    let updated_id = sqlx::query_scalar::<_, Uuid>(
        r#"
        update performance_reviews set
            status = $3,
            reviewer_comments = coalesce($4, reviewer_comments),
            submitted_at = case when $3 = 'SUBMITTED' then now() else submitted_at end,
            updated_at = now()
        where id = $1 and tenant_id = $2
        returning id
        "#,
    )
    .bind(id)
    .bind(tenant_id)
    .bind(status)
    .bind(reason)
    .fetch_optional(&state.db)
    .await?
    .ok_or(AppError::NotFound)?;

    fetch_review(state, tenant_id, updated_id).await
}

fn require_tenant(auth: &AuthContext) -> Result<Uuid, AppError> {
    auth.user.tenant_id.ok_or(AppError::Unauthorized)
}

const REVIEW_SELECT: &str = r#"
select
    pr.id,
    pr.employee_id,
    jsonb_build_object(
        'id', e.id,
        'full_name', e.full_name,
        'employee_code', e.employee_code,
        'job_title_id', e.job_title_id,
        'job_title', jsonb_build_object('id', jt.id, 'name', jt.name),
        'branch_id', e.branch_id,
        'branch', jsonb_build_object('id', b.id, 'name', b.name)
    ) as employee,
    pr.reviewer_id,
    case when r.id is null then null else jsonb_build_object(
        'id', r.id,
        'full_name', r.full_name,
        'employee_code', r.employee_code
    ) end as reviewer,
    pr.review_period,
    pr.review_type,
    pr.kpi_data,
    pr.overall_score::float8 as score,
    pr.reviewer_comments as comments,
    pr.improvement_plan,
    pr.status,
    pr.reviewed_at,
    pr.created_at as date_created
from performance_reviews pr
join employees e on e.id = pr.employee_id
left join employees r on r.id = pr.reviewer_id
left join job_titles jt on jt.id = e.job_title_id
left join branches b on b.id = e.branch_id
where pr.tenant_id = $1
  and ($2::uuid is null or pr.employee_id = $2)
  and ($3::uuid is null or pr.reviewer_id = $3)
  and ($4::text is null or pr.status = $4)
  and ($5::text is null or pr.review_type = $5)
  and ($6::text is null or pr.review_period = $6)
order by pr.created_at desc
limit $7 offset $8
"#;

const REVIEW_SELECT_BY_ID: &str = r#"
select
    pr.id,
    pr.employee_id,
    jsonb_build_object(
        'id', e.id,
        'full_name', e.full_name,
        'employee_code', e.employee_code,
        'job_title_id', e.job_title_id,
        'job_title', jsonb_build_object('id', jt.id, 'name', jt.name),
        'branch_id', e.branch_id,
        'branch', jsonb_build_object('id', b.id, 'name', b.name)
    ) as employee,
    pr.reviewer_id,
    case when r.id is null then null else jsonb_build_object(
        'id', r.id,
        'full_name', r.full_name,
        'employee_code', r.employee_code
    ) end as reviewer,
    pr.review_period,
    pr.review_type,
    pr.kpi_data,
    pr.overall_score::float8 as score,
    pr.reviewer_comments as comments,
    pr.improvement_plan,
    pr.status,
    pr.reviewed_at,
    pr.created_at as date_created
from performance_reviews pr
join employees e on e.id = pr.employee_id
left join employees r on r.id = pr.reviewer_id
left join job_titles jt on jt.id = e.job_title_id
left join branches b on b.id = e.branch_id
where pr.tenant_id = $1 and pr.id = $2
"#;
