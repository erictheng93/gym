use axum::{
    extract::{Path, Query, State},
    http::StatusCode,
    response::IntoResponse,
    Json,
};
use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use sqlx::FromRow;
use uuid::Uuid;

use crate::{error::AppError, http::member_app::MemberAuthContext, state::AppState, validation};

#[derive(Debug, Serialize)]
struct DataResponse<T> {
    success: bool,
    data: T,
}

#[derive(Debug, Serialize)]
struct ListResponse<T> {
    success: bool,
    data: Vec<T>,
}

#[derive(Debug, Serialize)]
struct MutationResponse<T> {
    success: bool,
    message: &'static str,
    #[serde(skip_serializing_if = "Option::is_none")]
    data: Option<T>,
}

#[derive(Debug, Deserialize)]
pub struct IssueFilter {
    status: Option<String>,
    #[serde(rename = "type")]
    issue_type: Option<String>,
    limit: Option<i64>,
    offset: Option<i64>,
}

#[derive(Debug, Deserialize)]
pub struct CreateIssueRequest {
    #[serde(rename = "type")]
    issue_type: String,
    title: String,
    content: String,
    attachments: Option<Value>,
}

#[derive(Debug, Deserialize)]
pub struct UpdateIssueRequest {
    title: Option<String>,
    content: Option<String>,
    attachments: Option<Value>,
}

#[derive(Debug, Deserialize)]
pub struct CreateSupportTicketRequest {
    category: String,
    subject: String,
    description: String,
    status: Option<String>,
    metadata: Option<Value>,
}

#[derive(Debug, Serialize, FromRow)]
pub struct IssueRow {
    id: Uuid,
    member_id: Uuid,
    branch_id: Uuid,
    #[serde(rename = "type")]
    issue_type: String,
    title: String,
    content: String,
    attachments: Option<Value>,
    status: String,
    assigned_to: Option<Uuid>,
    assigned_to_name: Option<String>,
    branch_name: Option<String>,
    resolution: Option<String>,
    resolved_at: Option<DateTime<Utc>>,
    created_at: DateTime<Utc>,
    updated_at: DateTime<Utc>,
}

#[derive(Debug, Serialize, FromRow)]
pub struct SupportTicketRow {
    id: Uuid,
    member_id: Uuid,
    branch_id: Uuid,
    category: String,
    subject: String,
    description: String,
    status: String,
    metadata: Option<Value>,
    created_at: DateTime<Utc>,
    updated_at: DateTime<Utc>,
}

pub async fn list_issues(
    auth: MemberAuthContext,
    State(state): State<AppState>,
    Query(filter): Query<IssueFilter>,
) -> Result<impl IntoResponse, AppError> {
    let rows = sqlx::query_as::<_, IssueRow>(ISSUE_SELECT)
        .bind(auth.member_id)
        .bind(filter.status)
        .bind(filter.issue_type)
        .bind(filter.limit.unwrap_or(50).clamp(1, 100))
        .bind(filter.offset.unwrap_or(0).max(0))
        .fetch_all(&state.db)
        .await?;
    Ok((StatusCode::OK, Json(ListResponse { success: true, data: rows })))
}

pub async fn get_issue(
    auth: MemberAuthContext,
    State(state): State<AppState>,
    Path(id): Path<Uuid>,
) -> Result<impl IntoResponse, AppError> {
    let row = fetch_issue(&state, auth.member_id, id).await?;
    Ok((StatusCode::OK, Json(DataResponse { success: true, data: row })))
}

pub async fn create_issue(
    auth: MemberAuthContext,
    State(state): State<AppState>,
    Json(payload): Json<CreateIssueRequest>,
) -> Result<impl IntoResponse, AppError> {
    validation::required_text("title", &payload.title)?;
    validation::required_text("content", &payload.content)?;

    let id = sqlx::query_scalar::<_, Uuid>(
        r#"
        insert into member_issues (
            id, member_id, branch_id, type, title, content, attachments, status
        ) values (
            gen_random_uuid(), $1, $2, $3, $4, $5, $6::jsonb, 'SUBMITTED'
        ) returning id
        "#,
    )
    .bind(auth.member_id)
    .bind(auth.branch_id)
    .bind(payload.issue_type)
    .bind(payload.title)
    .bind(payload.content)
    .bind(payload.attachments.map(|value| value.to_string()))
    .fetch_one(&state.db)
    .await?;
    let row = fetch_issue(&state, auth.member_id, id).await?;
    Ok((StatusCode::CREATED, Json(MutationResponse { success: true, message: "問題已提交", data: Some(row) })))
}

pub async fn update_issue(
    auth: MemberAuthContext,
    State(state): State<AppState>,
    Path(id): Path<Uuid>,
    Json(payload): Json<UpdateIssueRequest>,
) -> Result<impl IntoResponse, AppError> {
    let updated_id = sqlx::query_scalar::<_, Uuid>(
        r#"
        update member_issues set
            title = coalesce($3, title),
            content = coalesce($4, content),
            attachments = coalesce($5::jsonb, attachments),
            updated_at = now()
        where id = $1 and member_id = $2 and status = 'SUBMITTED'
        returning id
        "#,
    )
    .bind(id)
    .bind(auth.member_id)
    .bind(payload.title)
    .bind(payload.content)
    .bind(payload.attachments.map(|value| value.to_string()))
    .fetch_optional(&state.db)
    .await?
    .ok_or(AppError::NotFound)?;
    let row = fetch_issue(&state, auth.member_id, updated_id).await?;
    Ok((StatusCode::OK, Json(MutationResponse { success: true, message: "問題已更新", data: Some(row) })))
}

pub async fn create_support_ticket(
    auth: MemberAuthContext,
    State(state): State<AppState>,
    Json(payload): Json<CreateSupportTicketRequest>,
) -> Result<impl IntoResponse, AppError> {
    validation::required_text("category", &payload.category)?;
    validation::required_text("subject", &payload.subject)?;
    validation::required_text("description", &payload.description)?;

    let id = sqlx::query_scalar::<_, Uuid>(
        r#"
        insert into support_tickets (
            id, member_id, branch_id, category, subject, description, status, metadata
        ) values (
            gen_random_uuid(), $1, $2, $3, $4, $5, coalesce($6, 'pending'), $7::jsonb
        ) returning id
        "#,
    )
    .bind(auth.member_id)
    .bind(auth.branch_id)
    .bind(payload.category)
    .bind(payload.subject)
    .bind(payload.description)
    .bind(payload.status)
    .bind(payload.metadata.map(|value| value.to_string()))
    .fetch_one(&state.db)
    .await?;
    let row = sqlx::query_as::<_, SupportTicketRow>(
        r#"
        select id, member_id, branch_id, category, subject, description, status, metadata,
            created_at, coalesce(updated_at, created_at) as updated_at
        from support_tickets
        where id = $1 and member_id = $2
        "#,
    )
    .bind(id)
    .bind(auth.member_id)
    .fetch_optional(&state.db)
    .await?
    .ok_or(AppError::NotFound)?;
    Ok((StatusCode::CREATED, Json(MutationResponse { success: true, message: "客服單已提交", data: Some(row) })))
}

async fn fetch_issue(state: &AppState, member_id: Uuid, id: Uuid) -> Result<IssueRow, AppError> {
    sqlx::query_as::<_, IssueRow>(ISSUE_SELECT_BY_ID)
        .bind(id)
        .bind(member_id)
        .fetch_optional(&state.db)
        .await?
        .ok_or(AppError::NotFound)
}

const ISSUE_SELECT: &str = r#"
select
    member_issues.id,
    member_issues.member_id,
    member_issues.branch_id,
    member_issues.type as issue_type,
    member_issues.title,
    member_issues.content,
    member_issues.attachments,
    member_issues.status,
    member_issues.assigned_to,
    employees.full_name as assigned_to_name,
    branches.name as branch_name,
    member_issues.resolution,
    member_issues.resolved_at,
    member_issues.created_at,
    coalesce(member_issues.updated_at, member_issues.created_at) as updated_at
from member_issues
join branches on branches.id = member_issues.branch_id
left join employees on employees.id = member_issues.assigned_to
where member_issues.member_id = $1
  and ($2::text is null or member_issues.status = $2)
  and ($3::text is null or member_issues.type = $3)
order by member_issues.created_at desc
limit $4 offset $5
"#;

const ISSUE_SELECT_BY_ID: &str = r#"
select
    member_issues.id,
    member_issues.member_id,
    member_issues.branch_id,
    member_issues.type as issue_type,
    member_issues.title,
    member_issues.content,
    member_issues.attachments,
    member_issues.status,
    member_issues.assigned_to,
    employees.full_name as assigned_to_name,
    branches.name as branch_name,
    member_issues.resolution,
    member_issues.resolved_at,
    member_issues.created_at,
    coalesce(member_issues.updated_at, member_issues.created_at) as updated_at
from member_issues
join branches on branches.id = member_issues.branch_id
left join employees on employees.id = member_issues.assigned_to
where member_issues.id = $1 and member_issues.member_id = $2
"#;
