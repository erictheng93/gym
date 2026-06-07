use axum::{
    extract::{Path, Query, State},
    http::StatusCode,
    response::IntoResponse,
    Json,
};
use serde::Deserialize;
use serde_json::json;
use uuid::Uuid;

use crate::{
    error::AppError,
    http::member_app::MemberAuthContext,
    state::AppState,
};

#[derive(Debug, Deserialize)]
pub struct InitQuery {
    redirect: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct CallbackRequest {
    code: String,
    state: Option<String>,
    user: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct LinkRequest {
    provider: String,
    code: String,
}

pub async fn providers() -> impl IntoResponse {
    (StatusCode::OK, Json(json!({
        "success": true,
        "data": {
            "providers": [
                { "provider": "line", "enabled": true },
                { "provider": "google", "enabled": true },
                { "provider": "apple", "enabled": true }
            ]
        }
    })))
}

pub async fn init(
    Path(provider): Path<String>,
    Query(query): Query<InitQuery>,
) -> Result<impl IntoResponse, AppError> {
    validate_provider(&provider)?;
    let state = Uuid::new_v4().simple().to_string();
    let redirect = query.redirect.unwrap_or_else(|| "/auth/callback".into());
    let auth_url = format!(
        "{redirect}?provider={provider}&state={state}&oauth=not_configured"
    );

    Ok((StatusCode::OK, Json(json!({
        "success": true,
        "data": {
            "provider": provider,
            "state": state,
            "authUrl": auth_url
        }
    }))))
}

pub async fn callback(
    Path(provider): Path<String>,
    Json(payload): Json<CallbackRequest>,
) -> Result<impl IntoResponse, AppError> {
    validate_provider(&provider)?;
    if payload.code.trim().is_empty() {
        return Err(AppError::Validation("code is required".into()));
    }

    Ok((StatusCode::OK, Json(json!({
        "success": true,
        "data": {
            "isNewMember": true,
            "needsRegistration": true,
            "accessToken": null,
            "refreshToken": null,
            "expiresIn": 0,
            "member": null,
            "branch": null,
            "socialInfo": {
                "provider": provider,
                "providerUserId": format!("pending-{}", payload.state.unwrap_or_else(|| Uuid::new_v4().simple().to_string())),
                "email": null,
                "displayName": null,
                "avatarUrl": null,
                "rawUser": payload.user
            }
        }
    }))))
}

pub async fn link(
    auth: MemberAuthContext,
    State(_state): State<AppState>,
    Json(payload): Json<LinkRequest>,
) -> Result<impl IntoResponse, AppError> {
    validate_provider(&payload.provider)?;
    if payload.code.trim().is_empty() {
        return Err(AppError::Validation("code is required".into()));
    }

    Ok((StatusCode::OK, Json(json!({
        "success": true,
        "data": {
            "memberId": auth.member_id,
            "provider": payload.provider,
            "linked": true
        }
    }))))
}

pub async fn unlink(
    auth: MemberAuthContext,
    Path(provider): Path<String>,
) -> Result<impl IntoResponse, AppError> {
    validate_provider(&provider)?;
    Ok((StatusCode::OK, Json(json!({
        "success": true,
        "data": {
            "memberId": auth.member_id,
            "provider": provider,
            "linked": false
        }
    }))))
}

fn validate_provider(provider: &str) -> Result<(), AppError> {
    match provider {
        "line" | "google" | "apple" => Ok(()),
        _ => Err(AppError::Validation("provider is invalid".into())),
    }
}

