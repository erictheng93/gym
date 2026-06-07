use axum::{
    extract::{FromRequestParts, State},
    http::{request::Parts, StatusCode},
    response::IntoResponse,
    Json,
};
use bcrypt::verify;
use jsonwebtoken::{
    decode, encode, get_current_timestamp, Algorithm, DecodingKey, EncodingKey, Header, Validation,
};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use sqlx::FromRow;
use uuid::Uuid;

use crate::{
    error::AppError,
    http::ApiResponse,
    state::AppState,
    validation,
};

#[derive(Debug, Deserialize)]
pub struct LoginRequest {
    email: String,
    password: String,
}

#[derive(Debug, Serialize)]
pub struct LoginData {
    token: String,
    token_type: &'static str,
    expires_in: u64,
    user: AuthUserData,
}

#[derive(Debug, Clone, Serialize)]
pub struct AuthUserData {
    pub id: Uuid,
    pub email: String,
    pub role: String,
    pub tenant_id: Option<Uuid>,
    pub branch_id: Option<Uuid>,
    pub employee_id: Option<Uuid>,
    pub permissions: Value,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct Claims {
    sub: Uuid,
    email: String,
    role: String,
    tenant_id: Option<Uuid>,
    branch_id: Option<Uuid>,
    employee_id: Option<Uuid>,
    iat: u64,
    exp: u64,
}

#[derive(Debug, FromRow)]
struct StaffAuthRow {
    id: Uuid,
    email: String,
    password_hash: Option<String>,
    role: String,
    tenant_id: Option<Uuid>,
    is_active: Option<bool>,
    branch_id: Option<Uuid>,
    employee_id: Option<Uuid>,
    permissions_json: String,
}

pub async fn login(
    State(state): State<AppState>,
    Json(payload): Json<LoginRequest>,
) -> Result<impl IntoResponse, AppError> {
    validation::required_text("email", &payload.email)?;
    validation::required_text("password", &payload.password)?;

    let email = payload.email.trim().to_lowercase();
    let user = find_staff_by_email(&state, &email).await?;

    let Some(user) = user else {
        return invalid_login();
    };

    if user.is_active == Some(false) {
        return Err(AppError::Unauthorized);
    }

    let Some(password_hash) = user.password_hash.as_deref() else {
        return invalid_login();
    };

    if !verify(payload.password, password_hash).unwrap_or(false) {
        return invalid_login();
    }

    sqlx::query("update users set last_login_at = now(), updated_at = now() where id = $1")
        .bind(user.id)
        .execute(&state.db)
        .await?;

    let claims = Claims::from_user(&user, state.jwt_ttl_seconds);
    let token = encode_token(&state.jwt_secret, &claims)?;

    Ok((
        StatusCode::OK,
        Json(ApiResponse {
            success: true,
            data: LoginData {
                token,
                token_type: "Bearer",
                expires_in: state.jwt_ttl_seconds,
                user: user.into(),
            },
        }),
    ))
}

pub async fn me(auth: AuthContext) -> impl IntoResponse {
    (
        StatusCode::OK,
        Json(ApiResponse {
            success: true,
            data: auth.user,
        }),
    )
}

#[derive(Debug, Clone)]
pub struct AuthContext {
    pub user: AuthUserData,
}

impl FromRequestParts<AppState> for AuthContext {
    type Rejection = AppError;

    async fn from_request_parts(parts: &mut Parts, state: &AppState) -> Result<Self, Self::Rejection> {
        let token = bearer_token(parts)?;
        let claims = decode_token(&state.jwt_secret, token)?;
        let user = find_staff_by_id(state, claims.sub).await?;

        let Some(user) = user else {
            return Err(AppError::Unauthorized);
        };

        if user.is_active == Some(false) {
            return Err(AppError::Unauthorized);
        }

        Ok(Self { user: user.into() })
    }
}

impl Claims {
    fn from_user(user: &StaffAuthRow, ttl_seconds: u64) -> Self {
        let iat = get_current_timestamp();

        Self {
            sub: user.id,
            email: user.email.clone(),
            role: user.role.clone(),
            tenant_id: user.tenant_id,
            branch_id: user.branch_id,
            employee_id: user.employee_id,
            iat,
            exp: iat + ttl_seconds,
        }
    }
}

impl From<StaffAuthRow> for AuthUserData {
    fn from(value: StaffAuthRow) -> Self {
        Self {
            id: value.id,
            email: value.email,
            role: value.role,
            tenant_id: value.tenant_id,
            branch_id: value.branch_id,
            employee_id: value.employee_id,
            permissions: serde_json::from_str(&value.permissions_json).unwrap_or_else(|_| json!({})),
        }
    }
}

fn invalid_login<T>() -> Result<T, AppError> {
    Err(AppError::InvalidCredentials)
}

fn bearer_token(parts: &Parts) -> Result<&str, AppError> {
    let Some(value) = parts.headers.get(axum::http::header::AUTHORIZATION) else {
        return Err(AppError::Unauthorized);
    };

    let value = value.to_str().map_err(|_| AppError::Unauthorized)?;
    value
        .strip_prefix("Bearer ")
        .filter(|token| !token.trim().is_empty())
        .ok_or(AppError::Unauthorized)
}

fn encode_token(secret: &str, claims: &Claims) -> Result<String, AppError> {
    encode(
        &Header::new(Algorithm::HS256),
        claims,
        &EncodingKey::from_secret(secret.as_bytes()),
    )
    .map_err(|_| AppError::Unauthorized)
}

fn decode_token(secret: &str, token: &str) -> Result<Claims, AppError> {
    let validation = Validation::new(Algorithm::HS256);

    decode::<Claims>(
        token,
        &DecodingKey::from_secret(secret.as_bytes()),
        &validation,
    )
    .map(|data| data.claims)
    .map_err(|_| AppError::Unauthorized)
}

async fn find_staff_by_email(
    state: &AppState,
    email: &str,
) -> Result<Option<StaffAuthRow>, AppError> {
    sqlx::query_as::<_, StaffAuthRow>(
        r#"
        select
            users.id,
            users.email,
            users.password_hash,
            users.role,
            users.tenant_id,
            users.is_active,
            employees.branch_id,
            employees.id as employee_id,
            coalesce(employees.custom_permissions, job_titles.permissions_config, '{}'::jsonb)::text as permissions_json
        from users
        left join employees on employees.user_id = users.id
        left join job_titles on job_titles.id = employees.job_title_id
        where lower(users.email) = $1
        limit 1
        "#,
    )
    .bind(email)
    .fetch_optional(&state.db)
    .await
    .map_err(AppError::from)
}

async fn find_staff_by_id(state: &AppState, id: Uuid) -> Result<Option<StaffAuthRow>, AppError> {
    sqlx::query_as::<_, StaffAuthRow>(
        r#"
        select
            users.id,
            users.email,
            users.password_hash,
            users.role,
            users.tenant_id,
            users.is_active,
            employees.branch_id,
            employees.id as employee_id,
            coalesce(employees.custom_permissions, job_titles.permissions_config, '{}'::jsonb)::text as permissions_json
        from users
        left join employees on employees.user_id = users.id
        left join job_titles on job_titles.id = employees.job_title_id
        where users.id = $1
        limit 1
        "#,
    )
    .bind(id)
    .fetch_optional(&state.db)
    .await
    .map_err(AppError::from)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn jwt_round_trip_preserves_tenant_context() {
        let user = StaffAuthRow {
            id: Uuid::new_v4(),
            email: "owner@example.com".into(),
            password_hash: None,
            role: "ADMIN".into(),
            tenant_id: Some(Uuid::new_v4()),
            is_active: Some(true),
            branch_id: Some(Uuid::new_v4()),
            employee_id: Some(Uuid::new_v4()),
            permissions_json: r#"{"members":["read"]}"#.into(),
        };

        let claims = Claims::from_user(&user, 60);
        let token = encode_token("secret", &claims).unwrap();
        let decoded = decode_token("secret", &token).unwrap();

        assert_eq!(decoded.sub, user.id);
        assert_eq!(decoded.tenant_id, user.tenant_id);
        assert_eq!(decoded.branch_id, user.branch_id);
    }

    #[test]
    fn rejects_missing_bearer_header() {
        let request = axum::http::Request::builder().body(()).unwrap();
        let (parts, _) = request.into_parts();
        let result = bearer_token(&parts);

        assert!(result.is_err());
    }
}
