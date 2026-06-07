use axum::{extract::State, http::StatusCode, response::IntoResponse, Json};
use bcrypt::{hash, verify};
use chrono::NaiveDate;
use serde::{Deserialize, Serialize};
use serde_json::json;
use sqlx::FromRow;
use uuid::Uuid;

use crate::{
    error::AppError,
    http::member_app::{make_member_token, refresh_member_token, MemberAuthContext},
    state::AppState,
    validation,
};

const DEV_OTP_CODE: &str = "123456";

#[derive(Debug, Deserialize)]
pub struct OtpRequest {
    identifier: String,
    #[serde(rename = "type")]
    identifier_type: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct VerifyOtpRequest {
    identifier: String,
    #[serde(rename = "type")]
    identifier_type: Option<String>,
    code: String,
}

#[derive(Debug, Deserialize)]
pub struct RefreshRequest {
    #[serde(rename = "refreshToken")]
    refresh_token: String,
}

#[derive(Debug, Deserialize)]
pub struct ForgotPasswordRequest {
    email: String,
}

#[derive(Debug, Deserialize)]
pub struct ResetPasswordRequest {
    token: String,
    password: String,
}

#[derive(Debug, Deserialize)]
pub struct ChangePasswordRequest {
    #[serde(rename = "currentPassword")]
    current_password: String,
    #[serde(rename = "newPassword")]
    new_password: String,
}

#[derive(Debug, Deserialize)]
pub struct CompleteProfileRequest {
    full_name: Option<String>,
    #[serde(rename = "fullName")]
    full_name_camel: Option<String>,
    phone: Option<String>,
    gender: Option<String>,
    birthday: Option<NaiveDate>,
    branch_id: Option<Uuid>,
    #[serde(rename = "branchId")]
    branch_id_camel: Option<Uuid>,
    emergency_contact: Option<String>,
    #[serde(rename = "emergencyContact")]
    emergency_contact_camel: Option<String>,
    emergency_phone: Option<String>,
    #[serde(rename = "emergencyPhone")]
    emergency_phone_camel: Option<String>,
}

#[derive(Debug, FromRow)]
struct MemberAuthLookup {
    id: Uuid,
    member_code: String,
    full_name: String,
    branch_id: Uuid,
    tenant_id: Option<Uuid>,
}

#[derive(Debug, FromRow)]
struct CredentialRow {
    id: Uuid,
    password_hash: String,
}

#[derive(Debug, Serialize)]
struct LoginMemberData {
    id: Uuid,
    #[serde(rename = "memberCode")]
    member_code: String,
    #[serde(rename = "fullName")]
    full_name: String,
    #[serde(rename = "branchId")]
    branch_id: Uuid,
}

pub async fn send_otp(
    State(state): State<AppState>,
    Json(payload): Json<OtpRequest>,
) -> Result<impl IntoResponse, AppError> {
    validation::required_text("identifier", &payload.identifier)?;
    let member = find_member_by_identifier(&state, &payload.identifier, payload.identifier_type.as_deref()).await?;
    if let Some(member) = member {
        sqlx::query(
            r#"
            insert into member_otps (id, member_id, identifier, code, expires_at, consumed_at)
            values (gen_random_uuid(), $1, $2, $3, now() + interval '10 minutes', null)
            "#,
        )
        .bind(member.id)
        .bind(normalize_identifier(&payload.identifier))
        .bind(DEV_OTP_CODE)
        .execute(&state.db)
        .await?;
    }

    Ok((StatusCode::OK, Json(json!({
        "success": true,
        "message": "驗證碼已發送",
        "data": { "expiresIn": 600, "otp": DEV_OTP_CODE }
    }))))
}

pub async fn verify_otp(
    State(state): State<AppState>,
    Json(payload): Json<VerifyOtpRequest>,
) -> Result<impl IntoResponse, AppError> {
    let member = verify_otp_member(&state, &payload).await?;
    let tenant_id = member.tenant_id.ok_or(AppError::Unauthorized)?;
    let token = make_member_token(&state, member.id, Some(tenant_id), member.branch_id)?;

    Ok((StatusCode::OK, Json(json!({
        "success": true,
        "message": "驗證成功",
        "data": {
            "member": LoginMemberData {
                id: member.id,
                member_code: member.member_code,
                full_name: member.full_name,
                branch_id: member.branch_id,
            },
            "accessToken": token,
            "refreshToken": token,
            "expiresIn": state.jwt_ttl_seconds
        }
    }))))
}

pub async fn verify_otp_only(
    State(state): State<AppState>,
    Json(payload): Json<VerifyOtpRequest>,
) -> Result<impl IntoResponse, AppError> {
    verify_otp_member(&state, &payload).await?;
    Ok((StatusCode::OK, Json(json!({ "success": true, "message": "驗證成功" }))))
}

pub async fn refresh(
    State(state): State<AppState>,
    Json(payload): Json<RefreshRequest>,
) -> Result<impl IntoResponse, AppError> {
    let (access_token, refresh_token) = refresh_member_token(&state, &payload.refresh_token).await?;
    Ok((StatusCode::OK, Json(json!({
        "success": true,
        "data": { "accessToken": access_token, "refreshToken": refresh_token }
    }))))
}

pub async fn forgot_password(
    State(state): State<AppState>,
    Json(payload): Json<ForgotPasswordRequest>,
) -> Result<impl IntoResponse, AppError> {
    validation::required_text("email", &payload.email)?;
    let token = Uuid::new_v4().simple().to_string();
    sqlx::query(
        r#"
        update member_credentials set
            password_reset_token_hash = $2,
            password_reset_expires_at = now() + interval '30 minutes',
            updated_at = now()
        where member_id in (select id from members where lower(email) = lower($1))
        "#,
    )
    .bind(payload.email)
    .bind(&token)
    .execute(&state.db)
    .await?;

    Ok((StatusCode::OK, Json(json!({
        "success": true,
        "message": "若帳號存在，重設連結已建立",
        "data": { "resetUrl": format!("/auth/reset-password?token={token}") }
    }))))
}

pub async fn reset_password(
    State(state): State<AppState>,
    Json(payload): Json<ResetPasswordRequest>,
) -> Result<impl IntoResponse, AppError> {
    validation::required_text("token", &payload.token)?;
    validation::required_text("password", &payload.password)?;
    let password_hash = hash(payload.password, 4).map_err(|_| AppError::Unauthorized)?;
    let affected = sqlx::query(
        r#"
        update member_credentials set
            password_hash = $2,
            password_reset_token_hash = null,
            password_reset_expires_at = null,
            last_password_change_at = now(),
            updated_at = now()
        where password_reset_token_hash = $1
          and password_reset_expires_at is not null
          and password_reset_expires_at > now()
        "#,
    )
    .bind(payload.token)
    .bind(password_hash)
    .execute(&state.db)
    .await?
    .rows_affected();
    if affected == 0 {
        return Err(AppError::Unauthorized);
    }
    Ok((StatusCode::OK, Json(json!({ "success": true, "message": "密碼已重設" }))))
}

pub async fn change_password(
    auth: MemberAuthContext,
    State(state): State<AppState>,
    Json(payload): Json<ChangePasswordRequest>,
) -> Result<impl IntoResponse, AppError> {
    validation::required_text("currentPassword", &payload.current_password)?;
    validation::required_text("newPassword", &payload.new_password)?;
    let credential = sqlx::query_as::<_, CredentialRow>(
        "select id, password_hash from member_credentials where member_id = $1",
    )
    .bind(auth.member_id)
    .fetch_optional(&state.db)
    .await?
    .ok_or(AppError::Unauthorized)?;
    if !verify(payload.current_password, &credential.password_hash).unwrap_or(false) {
        return Err(AppError::Unauthorized);
    }
    let password_hash = hash(payload.new_password, 4).map_err(|_| AppError::Unauthorized)?;
    sqlx::query(
        "update member_credentials set password_hash = $2, last_password_change_at = now(), updated_at = now() where id = $1",
    )
    .bind(credential.id)
    .bind(password_hash)
    .execute(&state.db)
    .await?;
    Ok((StatusCode::OK, Json(json!({ "success": true, "message": "密碼已更新" }))))
}

pub async fn complete_profile(
    auth: MemberAuthContext,
    State(state): State<AppState>,
    Json(payload): Json<CompleteProfileRequest>,
) -> Result<impl IntoResponse, AppError> {
    let full_name = payload.full_name.or(payload.full_name_camel);
    let branch_id = payload.branch_id.or(payload.branch_id_camel);
    let emergency_contact = payload.emergency_contact.or(payload.emergency_contact_camel);
    let emergency_phone = payload.emergency_phone.or(payload.emergency_phone_camel);
    if let Some(name) = &full_name {
        validation::required_text("full_name", name)?;
    }

    sqlx::query(
        r#"
        update members set
            full_name = coalesce($3, full_name),
            phone = coalesce($4, phone),
            gender = coalesce($5, gender),
            birthday = coalesce($6, birthday),
            branch_id = coalesce($7, branch_id),
            emergency_contact = coalesce($8, emergency_contact),
            emergency_phone = coalesce($9, emergency_phone),
            updated_at = now()
        where id = $1 and tenant_id = $2
        "#,
    )
    .bind(auth.member_id)
    .bind(auth.tenant_id)
    .bind(full_name)
    .bind(payload.phone)
    .bind(payload.gender)
    .bind(payload.birthday)
    .bind(branch_id)
    .bind(emergency_contact)
    .bind(emergency_phone)
    .execute(&state.db)
    .await?;

    Ok((StatusCode::OK, Json(json!({
        "success": true,
        "message": "資料已更新",
        "data": { "member": { "id": auth.member_id } }
    }))))
}

async fn verify_otp_member(state: &AppState, payload: &VerifyOtpRequest) -> Result<MemberAuthLookup, AppError> {
    validation::required_text("identifier", &payload.identifier)?;
    validation::required_text("code", &payload.code)?;
    let identifier = normalize_identifier(&payload.identifier);
    let member = find_member_by_identifier(state, &identifier, payload.identifier_type.as_deref())
        .await?
        .ok_or(AppError::Unauthorized)?;
    let otp_id = sqlx::query_scalar::<_, Uuid>(
        r#"
        select id from member_otps
        where member_id = $1 and identifier = $2 and code = $3
          and consumed_at is null and expires_at > now()
        order by created_at desc
        limit 1
        "#,
    )
    .bind(member.id)
    .bind(identifier)
    .bind(&payload.code)
    .fetch_optional(&state.db)
    .await?
    .ok_or(AppError::Unauthorized)?;
    sqlx::query("update member_otps set consumed_at = now() where id = $1")
        .bind(otp_id)
        .execute(&state.db)
        .await?;
    Ok(member)
}

async fn find_member_by_identifier(
    state: &AppState,
    identifier: &str,
    identifier_type: Option<&str>,
) -> Result<Option<MemberAuthLookup>, AppError> {
    let identifier = normalize_identifier(identifier);
    let is_email = identifier_type == Some("email") || identifier.contains('@');
    let sql = if is_email {
        r#"
        select id, member_code, full_name, branch_id, tenant_id
        from members
        where lower(email) = lower($1) and status = 'ACTIVE'
        "#
    } else {
        r#"
        select id, member_code, full_name, branch_id, tenant_id
        from members
        where phone = $1 and status = 'ACTIVE'
        "#
    };
    sqlx::query_as::<_, MemberAuthLookup>(sql)
        .bind(identifier)
        .fetch_optional(&state.db)
        .await
        .map_err(AppError::from)
}

fn normalize_identifier(identifier: &str) -> String {
    identifier.trim().replace(['-', ' '], "").to_lowercase()
}
