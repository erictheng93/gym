use axum::{
    extract::{Query, State},
    http::{header, StatusCode},
    response::IntoResponse,
    Json,
};
use chrono::{NaiveDate, Utc};
use serde::Deserialize;
use serde_json::{json, Map, Value};
use sqlx::FromRow;
use uuid::Uuid;

use crate::{error::AppError, http::auth::AuthContext, state::AppState};

#[derive(Debug, Deserialize)]
pub struct ConfigQuery {
    branch_id: Option<Uuid>,
}

#[derive(Debug, Deserialize)]
pub struct UpdateConfigRequest {
    branch_id: Option<Uuid>,
    line_channel_access_token: Option<String>,
    line_channel_secret: Option<String>,
    mitake_username: Option<String>,
    mitake_password: Option<String>,
    sms_sender_name: Option<String>,
    is_active: Option<bool>,
}

#[derive(Debug, Deserialize)]
pub struct TestConfigRequest {
    branch_id: Option<Uuid>,
    channel: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct UsageQuery {
    start_date: Option<NaiveDate>,
    end_date: Option<NaiveDate>,
    group_by: Option<String>,
    branch_id: Option<Uuid>,
}

#[derive(Debug, FromRow)]
struct BranchRow {
    id: Uuid,
    name: String,
}

#[derive(Debug, FromRow)]
struct UsageRow {
    period: NaiveDate,
    branch_id: Option<Uuid>,
    notification_type: String,
    successful_channel: Option<String>,
    overall_status: String,
    count: i64,
}

pub async fn get_config(
    auth: AuthContext,
    State(state): State<AppState>,
    Query(query): Query<ConfigQuery>,
) -> Result<impl IntoResponse, AppError> {
    let tenant_id = require_tenant(&auth)?;
    let settings = fetch_tenant_settings(&state, tenant_id).await?;
    let configs = notification_configs(&settings);

    if let Some(branch_id) = query.branch_id.or(auth.user.branch_id) {
        ensure_branch_scope(&state, tenant_id, branch_id).await?;
        let config = config_for_branch(&state, tenant_id, branch_id, configs).await?;
        return Ok((StatusCode::OK, Json(json!({ "success": true, "config": config }))));
    }

    let branches = list_branch_configs(&state, tenant_id, configs).await?;
    Ok((StatusCode::OK, Json(json!({ "success": true, "branches": branches }))))
}

pub async fn update_config(
    auth: AuthContext,
    State(state): State<AppState>,
    Json(payload): Json<UpdateConfigRequest>,
) -> Result<impl IntoResponse, AppError> {
    let tenant_id = require_tenant(&auth)?;
    let branch_id = payload
        .branch_id
        .or(auth.user.branch_id)
        .ok_or_else(|| AppError::Validation("branch_id is required".into()))?;
    ensure_branch_scope(&state, tenant_id, branch_id).await?;

    let current = fetch_tenant_settings(&state, tenant_id).await?;
    let updated = merge_notification_config(current, branch_id, payload);
    let saved = sqlx::query_scalar::<_, Value>(
        "update tenants set settings = $2::jsonb, updated_at = now() where id = $1 returning coalesce(settings, '{}'::jsonb)",
    )
    .bind(tenant_id)
    .bind(updated.to_string())
    .fetch_one(&state.db)
    .await?;

    let configs = notification_configs(&saved);
    let config = config_for_branch(&state, tenant_id, branch_id, configs).await?;
    Ok((StatusCode::OK, Json(json!({ "success": true, "config": config }))))
}

pub async fn test_config(
    auth: AuthContext,
    State(state): State<AppState>,
    Json(payload): Json<TestConfigRequest>,
) -> Result<impl IntoResponse, AppError> {
    let tenant_id = require_tenant(&auth)?;
    let branch_id = payload
        .branch_id
        .or(auth.user.branch_id)
        .ok_or_else(|| AppError::Validation("branch_id is required".into()))?;
    ensure_branch_scope(&state, tenant_id, branch_id).await?;

    let channel = payload.channel.unwrap_or_else(|| "line".into()).to_lowercase();
    let settings = fetch_tenant_settings(&state, tenant_id).await?;
    let configs = notification_configs(&settings);
    let config = branch_config(configs, branch_id);
    let response = if channel == "sms" {
        let success = has_sms_config(config);
        json!({
            "success": success,
            "message": if success { "簡訊設定可用" } else { "簡訊設定尚未完整" },
            "details": { "balance": 0 }
        })
    } else {
        let success = has_line_config(config);
        json!({
            "success": success,
            "message": if success { "LINE 設定可用" } else { "LINE 設定尚未完整" },
            "details": { "botName": "GymNexus Notification Bot" }
        })
    };
    Ok((StatusCode::OK, Json(response)))
}

pub async fn usage(
    auth: AuthContext,
    State(state): State<AppState>,
    Query(query): Query<UsageQuery>,
) -> Result<impl IntoResponse, AppError> {
    let tenant_id = require_tenant(&auth)?;
    if let Some(branch_id) = query.branch_id {
        ensure_branch_scope(&state, tenant_id, branch_id).await?;
    }
    let rows = usage_rows(&state, tenant_id, &query).await?;
    Ok((StatusCode::OK, Json(usage_payload(rows))))
}

pub async fn export_usage(
    auth: AuthContext,
    State(state): State<AppState>,
    Query(query): Query<UsageQuery>,
) -> Result<impl IntoResponse, AppError> {
    let tenant_id = require_tenant(&auth)?;
    if let Some(branch_id) = query.branch_id {
        ensure_branch_scope(&state, tenant_id, branch_id).await?;
    }
    let rows = usage_rows(&state, tenant_id, &query).await?;
    let mut csv = String::from("period,branch_id,notification_type,successful_channel,overall_status,count\n");
    for row in rows {
        csv.push_str(&format!(
            "{},{},{},{},{},{}\n",
            row.period,
            row.branch_id.map(|value| value.to_string()).unwrap_or_default(),
            csv_escape(&row.notification_type),
            csv_escape(row.successful_channel.as_deref().unwrap_or("")),
            csv_escape(&row.overall_status),
            row.count
        ));
    }

    Ok((
        StatusCode::OK,
        [
            (header::CONTENT_TYPE, "text/csv; charset=utf-8"),
            (header::CONTENT_DISPOSITION, "attachment; filename=\"notification-usage.csv\""),
        ],
        csv,
    ))
}

async fn fetch_tenant_settings(state: &AppState, tenant_id: Uuid) -> Result<Value, AppError> {
    sqlx::query_scalar::<_, Value>("select coalesce(settings, '{}'::jsonb) from tenants where id = $1")
        .bind(tenant_id)
        .fetch_optional(&state.db)
        .await?
        .ok_or(AppError::NotFound)
}

async fn list_branch_configs(
    state: &AppState,
    tenant_id: Uuid,
    configs: &Map<String, Value>,
) -> Result<Vec<Value>, AppError> {
    let rows = sqlx::query_as::<_, BranchRow>(
        "select id, name from branches where tenant_id = $1 and upper(coalesce(status, 'ACTIVE')) = 'ACTIVE' order by name asc",
    )
    .bind(tenant_id)
    .fetch_all(&state.db)
    .await?;

    Ok(rows
        .into_iter()
        .map(|row| {
            let config = branch_config(configs, row.id);
            json!({
                "branch_id": row.id,
                "branch_name": row.name,
                "has_line_config": has_line_config(config),
                "has_sms_config": has_sms_config(config),
                "is_active": config.get("is_active").and_then(Value::as_bool).unwrap_or(true),
                "date_updated": config.get("date_updated").and_then(Value::as_str)
            })
        })
        .collect())
}

async fn config_for_branch(
    state: &AppState,
    tenant_id: Uuid,
    branch_id: Uuid,
    configs: &Map<String, Value>,
) -> Result<Value, AppError> {
    let branch = sqlx::query_as::<_, BranchRow>("select id, name from branches where id = $1 and tenant_id = $2")
        .bind(branch_id)
        .bind(tenant_id)
        .fetch_optional(&state.db)
        .await?
        .ok_or(AppError::NotFound)?;
    let config = branch_config(configs, branch_id);

    Ok(json!({
        "branch_id": branch.id,
        "branch_name": branch.name,
        "has_line_config": has_line_config(config),
        "line_channel_access_token_preview": preview_secret(config.get("line_channel_access_token").and_then(Value::as_str)),
        "has_sms_config": has_sms_config(config),
        "mitake_username": config.get("mitake_username").and_then(Value::as_str),
        "sms_sender_name": config.get("sms_sender_name").and_then(Value::as_str),
        "is_active": config.get("is_active").and_then(Value::as_bool).unwrap_or(true),
        "date_updated": config.get("date_updated").and_then(Value::as_str)
    }))
}

async fn ensure_branch_scope(state: &AppState, tenant_id: Uuid, branch_id: Uuid) -> Result<(), AppError> {
    let exists = sqlx::query_scalar::<_, bool>(
        "select exists(select 1 from branches where id = $1 and tenant_id = $2)",
    )
    .bind(branch_id)
    .bind(tenant_id)
    .fetch_one(&state.db)
    .await?;

    if exists {
        Ok(())
    } else {
        Err(AppError::NotFound)
    }
}

async fn usage_rows(
    state: &AppState,
    tenant_id: Uuid,
    query: &UsageQuery,
) -> Result<Vec<UsageRow>, AppError> {
    let start_date = query.start_date.unwrap_or_else(|| Utc::now().date_naive());
    let end_date = query.end_date.unwrap_or(start_date);
    let group_by = if query.group_by.as_deref() == Some("month") {
        "month"
    } else {
        "day"
    };

    sqlx::query_as::<_, UsageRow>(
        r#"
        select
            date_trunc($5, coalesce(history.sent_at, history.created_at))::date as period,
            members.branch_id,
            history.notification_type,
            history.successful_channel,
            history.overall_status,
            count(*)::bigint as count
        from member_notification_history history
        left join members on members.id = history.member_id
        where coalesce(history.tenant_id, members.tenant_id) = $1
          and coalesce(history.sent_at, history.created_at)::date between $2 and $3
          and ($4::uuid is null or members.branch_id = $4)
        group by period, members.branch_id, history.notification_type, history.successful_channel, history.overall_status
        order by period asc
        "#,
    )
    .bind(tenant_id)
    .bind(start_date)
    .bind(end_date)
    .bind(query.branch_id)
    .bind(group_by)
    .fetch_all(&state.db)
    .await
    .map_err(AppError::Database)
}

fn usage_payload(rows: Vec<UsageRow>) -> Value {
    let mut sms = ChannelSummary::default();
    let mut line = ChannelSummary::default();
    let mut sms_details = Vec::new();
    let mut line_details = Vec::new();
    let mut notifications = Vec::new();

    for row in rows {
        let channel = row.successful_channel.as_deref().unwrap_or("").to_lowercase();
        let success = is_success_status(&row.overall_status);
        let failed = is_failed_status(&row.overall_status);

        if channel == "sms" {
            sms.add(row.count, success, failed);
            sms_details.push(json!({
                "period": row.period,
                "branch_id": row.branch_id,
                "total_sent": row.count,
                "success_count": if success { row.count } else { 0 },
                "failed_count": if failed { row.count } else { 0 },
                "total_segments": row.count,
                "total_cost": row.count as f64
            }));
        } else if channel == "line" {
            line.add(row.count, success, failed);
            line_details.push(json!({
                "period": row.period,
                "branch_id": row.branch_id,
                "message_type": "text",
                "total_sent": row.count,
                "success_count": if success { row.count } else { 0 },
                "failed_count": if failed { row.count } else { 0 }
            }));
        }

        notifications.push(json!({
            "period": row.period,
            "notification_type": row.notification_type,
            "successful_channel": row.successful_channel,
            "overall_status": row.overall_status,
            "count": row.count
        }));
    }

    json!({
        "success": true,
        "summary": {
            "sms": {
                "total_sent": sms.total_sent,
                "success_count": sms.success_count,
                "failed_count": sms.failed_count,
                "total_cost": sms.total_sent as f64,
                "total_segments": sms.total_sent
            },
            "line": {
                "total_sent": line.total_sent,
                "success_count": line.success_count,
                "failed_count": line.failed_count
            }
        },
        "details": {
            "sms": sms_details,
            "line": line_details,
            "notifications": notifications
        }
    })
}

#[derive(Default)]
struct ChannelSummary {
    total_sent: i64,
    success_count: i64,
    failed_count: i64,
}

impl ChannelSummary {
    fn add(&mut self, count: i64, success: bool, failed: bool) {
        self.total_sent += count;
        if success {
            self.success_count += count;
        }
        if failed {
            self.failed_count += count;
        }
    }
}

fn merge_notification_config(mut settings: Value, branch_id: Uuid, payload: UpdateConfigRequest) -> Value {
    let mut root = settings.as_object().cloned().unwrap_or_default();
    let mut configs = root
        .remove("notificationConfigs")
        .and_then(|value| value.as_object().cloned())
        .unwrap_or_default();
    let key = branch_id.to_string();
    let mut config = configs
        .remove(&key)
        .and_then(|value| value.as_object().cloned())
        .unwrap_or_default();

    insert_string(&mut config, "line_channel_access_token", payload.line_channel_access_token);
    insert_string(&mut config, "line_channel_secret", payload.line_channel_secret);
    insert_string(&mut config, "mitake_username", payload.mitake_username);
    insert_string(&mut config, "mitake_password", payload.mitake_password);
    insert_string(&mut config, "sms_sender_name", payload.sms_sender_name);
    if let Some(is_active) = payload.is_active {
        config.insert("is_active".into(), Value::Bool(is_active));
    }
    config.insert("date_updated".into(), Value::String(Utc::now().to_rfc3339()));

    configs.insert(key, Value::Object(config));
    root.insert("notificationConfigs".into(), Value::Object(configs));
    settings = Value::Object(root);
    settings
}

fn notification_configs(settings: &Value) -> &Map<String, Value> {
    match settings.get("notificationConfigs").and_then(Value::as_object) {
        Some(configs) => configs,
        None => empty_map(),
    }
}

fn branch_config(configs: &Map<String, Value>, branch_id: Uuid) -> &Map<String, Value> {
    let key = branch_id.to_string();
    match configs.get(&key).and_then(Value::as_object) {
        Some(config) => config,
        None => empty_map(),
    }
}

fn empty_map() -> &'static Map<String, Value> {
    static EMPTY: std::sync::OnceLock<Map<String, Value>> = std::sync::OnceLock::new();
    EMPTY.get_or_init(Map::new)
}

fn insert_string(config: &mut Map<String, Value>, key: &str, value: Option<String>) {
    if let Some(value) = value.map(|value| value.trim().to_string()).filter(|value| !value.is_empty()) {
        config.insert(key.into(), Value::String(value));
    }
}

fn has_line_config(config: &Map<String, Value>) -> bool {
    config
        .get("line_channel_access_token")
        .and_then(Value::as_str)
        .is_some_and(|value| !value.is_empty())
}

fn has_sms_config(config: &Map<String, Value>) -> bool {
    config
        .get("mitake_username")
        .and_then(Value::as_str)
        .is_some_and(|value| !value.is_empty())
        && config
            .get("mitake_password")
            .and_then(Value::as_str)
            .is_some_and(|value| !value.is_empty())
}

fn preview_secret(secret: Option<&str>) -> Option<String> {
    secret.filter(|value| !value.is_empty()).map(|value| {
        if value.len() <= 8 {
            "****".to_string()
        } else {
            format!("{}...{}", &value[..4], &value[value.len() - 4..])
        }
    })
}

fn is_success_status(status: &str) -> bool {
    matches!(status.to_lowercase().as_str(), "success" | "sent" | "delivered" | "completed")
}

fn is_failed_status(status: &str) -> bool {
    matches!(status.to_lowercase().as_str(), "failed" | "error" | "cancelled" | "canceled")
}

fn csv_escape(value: &str) -> String {
    if value.contains([',', '"', '\n']) {
        format!("\"{}\"", value.replace('"', "\"\""))
    } else {
        value.to_string()
    }
}

fn require_tenant(auth: &AuthContext) -> Result<Uuid, AppError> {
    auth.user.tenant_id.ok_or(AppError::Unauthorized)
}
