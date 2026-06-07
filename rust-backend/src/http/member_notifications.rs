use axum::{
    extract::{Query, State},
    http::StatusCode,
    response::IntoResponse,
    Json,
};
use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use sqlx::FromRow;
use uuid::Uuid;

use crate::{error::AppError, http::member_app::MemberAuthContext, state::AppState};

const DEV_VAPID_PUBLIC_KEY: &str = "BEl62iUYgUivxIkv69yViEuiBIa40HI80VEFgrYchSowXc_F3KytvF-f9c7G9Z9fcGx1GqQ9XQ3x0GF7S9a0R1s";

#[derive(Debug, Deserialize)]
pub struct HistoryFilter {
    limit: Option<i64>,
    offset: Option<i64>,
}

#[derive(Debug, Deserialize)]
pub struct TestNotificationRequest {
    channel: Option<String>,
    #[serde(rename = "type")]
    notification_type: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct SubscribeRequest {
    endpoint: String,
    keys: PushKeys,
    device_name: Option<String>,
    preferences: Option<PushPreferences>,
}

#[derive(Debug, Deserialize)]
pub struct PushKeys {
    p256dh: String,
    auth: String,
}

#[derive(Debug, Deserialize)]
pub struct PushPreferences {
    notify_booking_reminder: Option<bool>,
    notify_contract_expiry: Option<bool>,
    notify_class_cancelled: Option<bool>,
    notify_promotions: Option<bool>,
}

#[derive(Debug, Deserialize)]
pub struct PushPreferencesRequest {
    endpoint: String,
    preferences: PushPreferences,
}

#[derive(Debug, Deserialize)]
pub struct UnsubscribeRequest {
    endpoint: String,
}

#[derive(Debug, Serialize, Deserialize, FromRow)]
pub struct NotificationPreferencesRow {
    enable_line: bool,
    enable_push: bool,
    enable_email: bool,
    enable_sms: bool,
    notify_booking_confirmation: bool,
    notify_booking_reminder: bool,
    notify_booking_cancelled: bool,
    notify_contract_expiry: bool,
    notify_payment_confirmation: bool,
    notify_promotions: bool,
    notify_system: bool,
    quiet_hours_enabled: bool,
    quiet_hours_start: String,
    quiet_hours_end: String,
    sms_fallback_enabled: bool,
    sms_otp_only: bool,
}

#[derive(Debug, Serialize, FromRow)]
pub struct NotificationHistoryRow {
    id: Uuid,
    notification_type: String,
    title: Option<String>,
    body: Option<String>,
    successful_channel: Option<String>,
    overall_status: String,
    sent_at: Option<DateTime<Utc>>,
    reference_type: Option<String>,
    reference_id: Option<Uuid>,
    date_created: DateTime<Utc>,
}

#[derive(Debug, FromRow)]
struct MemberChannelRow {
    email: Option<String>,
    phone: Option<String>,
}

pub async fn get_preferences(
    auth: MemberAuthContext,
    State(state): State<AppState>,
) -> Result<impl IntoResponse, AppError> {
    let preferences = ensure_preferences(&state, &auth).await?;
    let available_channels = available_channels(&state, &auth).await?;
    Ok((StatusCode::OK, Json(json!({
        "success": true,
        "preferences": preferences,
        "available_channels": available_channels
    }))))
}

pub async fn update_preferences(
    auth: MemberAuthContext,
    State(state): State<AppState>,
    Json(payload): Json<Value>,
) -> Result<impl IntoResponse, AppError> {
    ensure_preferences(&state, &auth).await?;
    let current = fetch_preferences(&state, auth.member_id).await?;
    let merged = merge_preferences(current, &payload);
    sqlx::query(
        r#"
        update member_notification_preferences set
            enable_line = $2,
            enable_push = $3,
            enable_email = $4,
            enable_sms = $5,
            notify_booking_confirmation = $6,
            notify_booking_reminder = $7,
            notify_booking_cancelled = $8,
            notify_contract_expiry = $9,
            notify_payment_confirmation = $10,
            notify_promotions = $11,
            notify_system = $12,
            quiet_hours_enabled = $13,
            quiet_hours_start = $14,
            quiet_hours_end = $15,
            sms_fallback_enabled = $16,
            sms_otp_only = $17,
            updated_at = now()
        where member_id = $1
        "#,
    )
    .bind(auth.member_id)
    .bind(merged.enable_line)
    .bind(merged.enable_push)
    .bind(merged.enable_email)
    .bind(merged.enable_sms)
    .bind(merged.notify_booking_confirmation)
    .bind(merged.notify_booking_reminder)
    .bind(merged.notify_booking_cancelled)
    .bind(merged.notify_contract_expiry)
    .bind(merged.notify_payment_confirmation)
    .bind(merged.notify_promotions)
    .bind(merged.notify_system)
    .bind(merged.quiet_hours_enabled)
    .bind(&merged.quiet_hours_start)
    .bind(&merged.quiet_hours_end)
    .bind(merged.sms_fallback_enabled)
    .bind(merged.sms_otp_only)
    .execute(&state.db)
    .await?;

    let preferences = fetch_preferences(&state, auth.member_id).await?;
    Ok((StatusCode::OK, Json(json!({
        "success": true,
        "message": "通知設定已更新",
        "preferences": preferences
    }))))
}

pub async fn channels(
    auth: MemberAuthContext,
    State(state): State<AppState>,
) -> Result<impl IntoResponse, AppError> {
    let member = member_channels(&state, auth.member_id).await?;
    let push = active_push(&state, auth.member_id).await?;
    Ok((StatusCode::OK, Json(json!({
        "success": true,
        "channels": {
            "line": { "available": false },
            "push": {
                "available": push.is_some(),
                "deviceName": push.as_ref().and_then(|value| value.get("deviceName")).and_then(Value::as_str),
                "subscribedAt": push.as_ref().and_then(|value| value.get("subscribedAt")).and_then(Value::as_str)
            },
            "email": { "available": member.email.is_some(), "address": member.email },
            "sms": { "available": member.phone.is_some(), "phone": member.phone }
        }
    }))))
}

pub async fn history(
    auth: MemberAuthContext,
    State(state): State<AppState>,
    Query(filter): Query<HistoryFilter>,
) -> Result<impl IntoResponse, AppError> {
    let limit = filter.limit.unwrap_or(20).clamp(1, 100);
    let offset = filter.offset.unwrap_or(0).max(0);
    let rows = sqlx::query_as::<_, NotificationHistoryRow>(
        r#"
        select id, notification_type, title, body, successful_channel, overall_status,
            sent_at, reference_type, reference_id, created_at as date_created
        from member_notification_history
        where member_id = $1
        order by created_at desc
        limit $2 offset $3
        "#,
    )
    .bind(auth.member_id)
    .bind(limit)
    .bind(offset)
    .fetch_all(&state.db)
    .await?;
    let total = sqlx::query_scalar::<_, i64>(
        "select count(*)::bigint from member_notification_history where member_id = $1",
    )
    .bind(auth.member_id)
    .fetch_one(&state.db)
    .await?;

    Ok((StatusCode::OK, Json(json!({
        "success": true,
        "data": rows,
        "pagination": { "limit": limit, "offset": offset, "total": total }
    }))))
}

pub async fn test_notification(
    auth: MemberAuthContext,
    State(state): State<AppState>,
    Json(payload): Json<TestNotificationRequest>,
) -> Result<impl IntoResponse, AppError> {
    let channel = payload.channel.unwrap_or_else(|| "push".into());
    let notification_type = payload.notification_type.unwrap_or_else(|| "test".into());
    sqlx::query(
        r#"
        insert into member_notification_history (
            id, member_id, notification_type, title, body, successful_channel,
            overall_status, sent_at
        ) values (
            gen_random_uuid(), $1, $2, '測試通知', '這是一則測試通知', $3, 'sent', now()
        )
        "#,
    )
    .bind(auth.member_id)
    .bind(notification_type)
    .bind(&channel)
    .execute(&state.db)
    .await?;
    Ok((StatusCode::OK, Json(json!({ "success": true, "channel": channel }))))
}

pub async fn vapid_public_key() -> impl IntoResponse {
    (StatusCode::OK, Json(json!({ "success": true, "publicKey": DEV_VAPID_PUBLIC_KEY })))
}

pub async fn subscribe(
    auth: MemberAuthContext,
    State(state): State<AppState>,
    Json(payload): Json<SubscribeRequest>,
) -> Result<impl IntoResponse, AppError> {
    let prefs = payload.preferences.unwrap_or_default();
    let id = sqlx::query_scalar::<_, Uuid>(
        r#"
        insert into push_subscriptions (
            id, member_id, endpoint, p256dh, auth, user_agent, is_active,
            notify_booking_reminder, notify_class_cancelled, notify_contract_expiry,
            notify_promotions, tenant_id
        ) values (
            gen_random_uuid(), $1, $2, $3, $4, $5, true,
            coalesce($6, true), coalesce($7, true), coalesce($8, true),
            coalesce($9, true), $10
        )
        on conflict (endpoint) do update set
            member_id = excluded.member_id,
            p256dh = excluded.p256dh,
            auth = excluded.auth,
            user_agent = excluded.user_agent,
            is_active = true,
            notify_booking_reminder = excluded.notify_booking_reminder,
            notify_class_cancelled = excluded.notify_class_cancelled,
            notify_contract_expiry = excluded.notify_contract_expiry,
            notify_promotions = excluded.notify_promotions,
            updated_at = now()
        returning id
        "#,
    )
    .bind(auth.member_id)
    .bind(payload.endpoint)
    .bind(payload.keys.p256dh)
    .bind(payload.keys.auth)
    .bind(payload.device_name)
    .bind(prefs.notify_booking_reminder)
    .bind(prefs.notify_class_cancelled)
    .bind(prefs.notify_contract_expiry)
    .bind(prefs.notify_promotions)
    .bind(auth.tenant_id)
    .fetch_one(&state.db)
    .await?;
    Ok((StatusCode::OK, Json(json!({ "success": true, "subscription_id": id }))))
}

pub async fn unsubscribe(
    State(state): State<AppState>,
    Json(payload): Json<UnsubscribeRequest>,
) -> Result<impl IntoResponse, AppError> {
    sqlx::query("update push_subscriptions set is_active = false, updated_at = now() where endpoint = $1")
        .bind(payload.endpoint)
        .execute(&state.db)
        .await?;
    Ok((StatusCode::OK, Json(json!({ "success": true }))))
}

pub async fn update_push_preferences(
    auth: MemberAuthContext,
    State(state): State<AppState>,
    Json(payload): Json<PushPreferencesRequest>,
) -> Result<impl IntoResponse, AppError> {
    let prefs = payload.preferences;
    sqlx::query(
        r#"
        update push_subscriptions set
            notify_booking_reminder = coalesce($3, notify_booking_reminder),
            notify_class_cancelled = coalesce($4, notify_class_cancelled),
            notify_contract_expiry = coalesce($5, notify_contract_expiry),
            notify_promotions = coalesce($6, notify_promotions),
            updated_at = now()
        where member_id = $1 and endpoint = $2 and is_active = true
        "#,
    )
    .bind(auth.member_id)
    .bind(payload.endpoint)
    .bind(prefs.notify_booking_reminder)
    .bind(prefs.notify_class_cancelled)
    .bind(prefs.notify_contract_expiry)
    .bind(prefs.notify_promotions)
    .execute(&state.db)
    .await?;
    Ok((StatusCode::OK, Json(json!({ "success": true }))))
}

async fn ensure_preferences(state: &AppState, auth: &MemberAuthContext) -> Result<NotificationPreferencesRow, AppError> {
    sqlx::query(
        r#"
        insert into member_notification_preferences (id, member_id, tenant_id)
        values (gen_random_uuid(), $1, $2)
        on conflict (member_id) do nothing
        "#,
    )
    .bind(auth.member_id)
    .bind(auth.tenant_id)
    .execute(&state.db)
    .await?;
    fetch_preferences(state, auth.member_id).await
}

async fn fetch_preferences(state: &AppState, member_id: Uuid) -> Result<NotificationPreferencesRow, AppError> {
    sqlx::query_as::<_, NotificationPreferencesRow>(
        r#"
        select enable_line, enable_push, enable_email, enable_sms,
            notify_booking_confirmation, notify_booking_reminder, notify_booking_cancelled,
            notify_contract_expiry, notify_payment_confirmation, notify_promotions,
            notify_system, quiet_hours_enabled, quiet_hours_start, quiet_hours_end,
            sms_fallback_enabled, sms_otp_only
        from member_notification_preferences
        where member_id = $1
        "#,
    )
    .bind(member_id)
    .fetch_optional(&state.db)
    .await?
    .ok_or(AppError::NotFound)
}

async fn member_channels(state: &AppState, member_id: Uuid) -> Result<MemberChannelRow, AppError> {
    sqlx::query_as::<_, MemberChannelRow>("select email, phone from members where id = $1")
        .bind(member_id)
        .fetch_optional(&state.db)
        .await?
        .ok_or(AppError::NotFound)
}

async fn active_push(state: &AppState, member_id: Uuid) -> Result<Option<Value>, AppError> {
    let row = sqlx::query_as::<_, PushRow>(
        r#"
        select user_agent, created_at
        from push_subscriptions
        where member_id = $1 and is_active = true
        order by updated_at desc nulls last, created_at desc
        limit 1
        "#,
    )
    .bind(member_id)
    .fetch_optional(&state.db)
    .await?;
    Ok(row.map(|row| json!({ "deviceName": row.user_agent, "subscribedAt": row.created_at })))
}

#[derive(Debug, FromRow)]
struct PushRow {
    user_agent: Option<String>,
    created_at: Option<DateTime<Utc>>,
}

async fn available_channels(state: &AppState, auth: &MemberAuthContext) -> Result<Value, AppError> {
    let member = member_channels(state, auth.member_id).await?;
    let push = active_push(state, auth.member_id).await?.is_some();
    Ok(json!({
        "line": false,
        "push": push,
        "email": member.email.is_some(),
        "sms": member.phone.is_some()
    }))
}

fn merge_preferences(mut current: NotificationPreferencesRow, updates: &Value) -> NotificationPreferencesRow {
    macro_rules! merge_bool {
        ($field:ident) => {
            if let Some(value) = updates.get(stringify!($field)).and_then(Value::as_bool) {
                current.$field = value;
            }
        };
    }
    merge_bool!(enable_line);
    merge_bool!(enable_push);
    merge_bool!(enable_email);
    merge_bool!(enable_sms);
    merge_bool!(notify_booking_confirmation);
    merge_bool!(notify_booking_reminder);
    merge_bool!(notify_booking_cancelled);
    merge_bool!(notify_contract_expiry);
    merge_bool!(notify_payment_confirmation);
    merge_bool!(notify_promotions);
    merge_bool!(notify_system);
    merge_bool!(quiet_hours_enabled);
    merge_bool!(sms_fallback_enabled);
    merge_bool!(sms_otp_only);
    if let Some(value) = updates.get("quiet_hours_start").and_then(Value::as_str) {
        current.quiet_hours_start = value.to_string();
    }
    if let Some(value) = updates.get("quiet_hours_end").and_then(Value::as_str) {
        current.quiet_hours_end = value.to_string();
    }
    current
}

impl Default for PushPreferences {
    fn default() -> Self {
        Self {
            notify_booking_reminder: Some(true),
            notify_contract_expiry: Some(true),
            notify_class_cancelled: Some(true),
            notify_promotions: Some(true),
        }
    }
}
