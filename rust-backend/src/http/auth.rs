use axum::{
    extract::{FromRequestParts, State},
    http::{
        header::{AUTHORIZATION, COOKIE, SET_COOKIE},
        request::Parts,
        HeaderMap, HeaderValue, StatusCode,
    },
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

const AUTH_COOKIE_NAME: &str = "gym-nexus-auth-token";

#[derive(Debug, Deserialize)]
pub struct LoginRequest {
    email: String,
    password: String,
}

#[derive(Debug, Serialize)]
pub struct LoginData {
    token: String,
    #[serde(rename = "tokenType")]
    token_type: &'static str,
    #[serde(rename = "expiresIn")]
    expires_in: u64,
    user: AuthUserData,
    employee: Option<EmployeeData>,
}

#[derive(Debug, Clone, Serialize)]
pub struct AuthUserData {
    pub id: Uuid,
    pub email: String,
    pub role: String,
    #[serde(rename = "tenantId")]
    pub tenant_id: Option<Uuid>,
    #[serde(rename = "branchId")]
    pub branch_id: Option<Uuid>,
    #[serde(rename = "employeeId")]
    pub employee_id: Option<Uuid>,
    #[serde(rename = "isActive")]
    pub is_active: bool,
    pub permissions: Value,
}

#[derive(Debug, Clone, Serialize)]
pub struct EmployeeData {
    pub id: Uuid,
    #[serde(rename = "fullName")]
    pub full_name: String,
    #[serde(rename = "employeeCode")]
    pub employee_code: Option<String>,
    #[serde(rename = "branchId")]
    pub branch_id: Option<Uuid>,
    #[serde(rename = "branchName")]
    pub branch_name: Option<String>,
    #[serde(rename = "jobTitleId")]
    pub job_title_id: Option<Uuid>,
    #[serde(rename = "jobTitleName")]
    pub job_title_name: Option<String>,
}

#[derive(Debug, Serialize)]
pub struct MeData {
    user: AuthUserData,
    employee: Option<EmployeeData>,
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

#[derive(Debug, Clone, FromRow)]
struct StaffAuthRow {
    id: Uuid,
    email: String,
    password_hash: Option<String>,
    role: String,
    tenant_id: Option<Uuid>,
    is_active: Option<bool>,
    branch_id: Option<Uuid>,
    branch_name: Option<String>,
    employee_id: Option<Uuid>,
    employee_full_name: Option<String>,
    employee_code: Option<String>,
    job_title_id: Option<Uuid>,
    job_title_name: Option<String>,
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

    let cookie = auth_cookie(&token, state.jwt_ttl_seconds);
    let login_data = LoginData {
        token,
        token_type: "Bearer",
        expires_in: state.jwt_ttl_seconds,
        user: AuthUserData::from(user.clone()),
        employee: EmployeeData::from_row(&user),
    };

    Ok((
        StatusCode::OK,
        [(SET_COOKIE, cookie)],
        Json(ApiResponse {
            success: true,
            data: login_data,
        }),
    ))
}

pub async fn me(auth: AuthContext) -> impl IntoResponse {
    (
        StatusCode::OK,
        Json(ApiResponse {
            success: true,
            data: MeData {
                user: auth.user,
                employee: auth.employee,
            },
        }),
    )
}

pub async fn logout() -> impl IntoResponse {
    (
        StatusCode::OK,
        [(
            SET_COOKIE,
            HeaderValue::from_static("gym-nexus-auth-token=; Path=/; Max-Age=0; HttpOnly; SameSite=Lax"),
        )],
        Json(ApiResponse {
            success: true,
            data: json!({ "message": "Logged out" }),
        }),
    )
}

pub async fn refresh(auth: AuthContext, State(state): State<AppState>) -> Result<impl IntoResponse, AppError> {
    let claims = Claims::from_user_data(&auth.user, state.jwt_ttl_seconds);
    let token = encode_token(&state.jwt_secret, &claims)?;
    let cookie = auth_cookie(&token, state.jwt_ttl_seconds);

    Ok((
        StatusCode::OK,
        [(SET_COOKIE, cookie)],
        Json(ApiResponse {
            success: true,
            data: LoginData {
                token,
                token_type: "Bearer",
                expires_in: state.jwt_ttl_seconds,
                user: auth.user,
                employee: auth.employee,
            },
        }),
    ))
}

#[derive(Debug, Clone)]
pub struct AuthContext {
    pub user: AuthUserData,
    pub employee: Option<EmployeeData>,
}

impl FromRequestParts<AppState> for AuthContext {
    type Rejection = AppError;

    async fn from_request_parts(parts: &mut Parts, state: &AppState) -> Result<Self, Self::Rejection> {
        let token = auth_token(parts)?;
        let claims = decode_token(&state.jwt_secret, token)?;
        let user = find_staff_by_id(state, claims.sub).await?;

        let Some(user) = user else {
            return Err(AppError::Unauthorized);
        };

        if user.is_active == Some(false) {
            return Err(AppError::Unauthorized);
        }

        Ok(Self {
            user: AuthUserData::from(user.clone()),
            employee: EmployeeData::from_row(&user),
        })
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

    fn from_user_data(user: &AuthUserData, ttl_seconds: u64) -> Self {
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
            is_active: value.is_active.unwrap_or(true),
            permissions: serde_json::from_str(&value.permissions_json).unwrap_or_else(|_| json!({})),
        }
    }
}

impl EmployeeData {
    fn from_row(value: &StaffAuthRow) -> Option<Self> {
        Some(Self {
            id: value.employee_id?,
            full_name: value.employee_full_name.clone().unwrap_or_default(),
            employee_code: value.employee_code.clone(),
            branch_id: value.branch_id,
            branch_name: value.branch_name.clone(),
            job_title_id: value.job_title_id,
            job_title_name: value.job_title_name.clone(),
        })
    }
}

fn invalid_login<T>() -> Result<T, AppError> {
    Err(AppError::InvalidCredentials)
}

fn auth_token(parts: &Parts) -> Result<&str, AppError> {
    bearer_token(&parts.headers).or_else(|_| cookie_token(&parts.headers))
}

fn bearer_token(headers: &HeaderMap) -> Result<&str, AppError> {
    let Some(value) = headers.get(AUTHORIZATION) else {
        return Err(AppError::Unauthorized);
    };

    let value = value.to_str().map_err(|_| AppError::Unauthorized)?;
    value
        .strip_prefix("Bearer ")
        .filter(|token| !token.trim().is_empty())
        .ok_or(AppError::Unauthorized)
}

fn cookie_token(headers: &HeaderMap) -> Result<&str, AppError> {
    let Some(value) = headers.get(COOKIE) else {
        return Err(AppError::Unauthorized);
    };

    let cookies = value.to_str().map_err(|_| AppError::Unauthorized)?;
    cookies
        .split(';')
        .filter_map(|cookie| cookie.trim().split_once('='))
        .find_map(|(name, value)| (name == AUTH_COOKIE_NAME && !value.is_empty()).then_some(value))
        .ok_or(AppError::Unauthorized)
}

fn auth_cookie(token: &str, ttl_seconds: u64) -> HeaderValue {
    HeaderValue::from_str(&format!(
        "{AUTH_COOKIE_NAME}={token}; Path=/; Max-Age={ttl_seconds}; HttpOnly; SameSite=Lax"
    ))
    .expect("JWT token must be a valid cookie value")
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
            branches.name as branch_name,
            employees.id as employee_id,
            employees.full_name as employee_full_name,
            employees.employee_code,
            employees.job_title_id,
            job_titles.name as job_title_name,
            coalesce(employees.custom_permissions, job_titles.permissions_config, '{}'::jsonb)::text as permissions_json
        from users
        left join employees on employees.user_id = users.id
        left join branches on branches.id = employees.branch_id
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
            branches.name as branch_name,
            employees.id as employee_id,
            employees.full_name as employee_full_name,
            employees.employee_code,
            employees.job_title_id,
            job_titles.name as job_title_name,
            coalesce(employees.custom_permissions, job_titles.permissions_config, '{}'::jsonb)::text as permissions_json
        from users
        left join employees on employees.user_id = users.id
        left join branches on branches.id = employees.branch_id
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
            branch_name: Some("Main".into()),
            employee_id: Some(Uuid::new_v4()),
            employee_full_name: Some("Owner".into()),
            employee_code: Some("E001".into()),
            job_title_id: Some(Uuid::new_v4()),
            job_title_name: Some("Admin".into()),
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
        let result = auth_token(&parts);

        assert!(result.is_err());
    }

    #[test]
    fn extracts_cookie_token() {
        let request = axum::http::Request::builder()
            .header(COOKIE, "other=1; gym-nexus-auth-token=abc")
            .body(())
            .unwrap();
        let (parts, _) = request.into_parts();

        assert_eq!(auth_token(&parts).unwrap(), "abc");
    }
}
