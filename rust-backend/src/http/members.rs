use axum::{
    extract::{Path, Query, State},
    http::StatusCode,
    response::IntoResponse,
    Json,
};
use chrono::NaiveDate;
use serde::{Deserialize, Serialize};
use serde_json::Value;
use sqlx::FromRow;
use uuid::Uuid;

use crate::{
    error::AppError,
    http::{auth::AuthContext, ApiResponse},
    state::AppState,
    validation,
};

#[derive(Debug, Deserialize)]
pub struct MemberFilters {
    #[serde(rename = "branchId")]
    branch_id: Option<Uuid>,
    status: Option<String>,
    q: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct CreateMemberRequest {
    #[serde(rename = "memberCode")]
    member_code: String,
    #[serde(rename = "fullName")]
    full_name: String,
    phone: String,
    email: Option<String>,
    gender: Option<String>,
    birthday: Option<NaiveDate>,
    #[serde(rename = "idNumber")]
    id_number: Option<String>,
    address: Option<String>,
    #[serde(rename = "emergencyContact")]
    emergency_contact: Option<String>,
    #[serde(rename = "emergencyPhone")]
    emergency_phone: Option<String>,
    #[serde(rename = "branchId")]
    branch_id: Uuid,
    #[serde(rename = "salesPersonId")]
    sales_person_id: Option<Uuid>,
    #[serde(default = "default_active")]
    status: String,
    #[serde(rename = "joinDate")]
    join_date: NaiveDate,
    tags: Option<Value>,
    notes: Option<String>,
    height: Option<f32>,
}

#[derive(Debug, Deserialize)]
pub struct UpdateMemberRequest {
    #[serde(rename = "memberCode")]
    member_code: Option<String>,
    #[serde(rename = "fullName")]
    full_name: Option<String>,
    phone: Option<String>,
    email: Option<String>,
    gender: Option<String>,
    birthday: Option<NaiveDate>,
    #[serde(rename = "idNumber")]
    id_number: Option<String>,
    address: Option<String>,
    #[serde(rename = "emergencyContact")]
    emergency_contact: Option<String>,
    #[serde(rename = "emergencyPhone")]
    emergency_phone: Option<String>,
    #[serde(rename = "branchId")]
    branch_id: Option<Uuid>,
    #[serde(rename = "salesPersonId")]
    sales_person_id: Option<Uuid>,
    status: Option<String>,
    #[serde(rename = "joinDate")]
    join_date: Option<NaiveDate>,
    tags: Option<Value>,
    notes: Option<String>,
    height: Option<f32>,
}

#[derive(Debug, Serialize, FromRow)]
pub struct Member {
    id: Uuid,
    #[serde(rename = "memberCode")]
    member_code: String,
    #[serde(rename = "fullName")]
    full_name: String,
    phone: String,
    email: Option<String>,
    gender: Option<String>,
    birthday: Option<NaiveDate>,
    #[serde(rename = "idNumber")]
    id_number: Option<String>,
    address: Option<String>,
    #[serde(rename = "emergencyContact")]
    emergency_contact: Option<String>,
    #[serde(rename = "emergencyPhone")]
    emergency_phone: Option<String>,
    #[serde(rename = "branchId")]
    branch_id: Uuid,
    #[serde(rename = "salesPersonId")]
    sales_person_id: Option<Uuid>,
    status: String,
    #[serde(rename = "joinDate")]
    join_date: NaiveDate,
    tags: Option<Value>,
    notes: Option<String>,
    height: Option<f32>,
    #[serde(rename = "tenantId")]
    tenant_id: Option<Uuid>,
}

fn default_active() -> String {
    "ACTIVE".into()
}

pub async fn list(
    auth: AuthContext,
    State(state): State<AppState>,
    Query(filters): Query<MemberFilters>,
) -> Result<impl IntoResponse, AppError> {
    let tenant_id = require_tenant(&auth)?;
    let members = sqlx::query_as::<_, Member>(
        r#"
        select
            id, member_code, full_name, phone, email, gender, birthday, id_number, address,
            emergency_contact, emergency_phone, branch_id, sales_person_id, status, join_date,
            tags, notes, height, tenant_id
        from members
        where tenant_id = $1
          and ($2::uuid is null or branch_id = $2)
          and ($3::text is null or status = $3)
          and (
            $4::text is null
            or full_name ilike '%' || $4 || '%'
            or member_code ilike '%' || $4 || '%'
            or phone ilike '%' || $4 || '%'
            or email ilike '%' || $4 || '%'
          )
        order by created_at desc
        "#,
    )
    .bind(tenant_id)
    .bind(filters.branch_id)
    .bind(filters.status)
    .bind(filters.q.map(|q| q.trim().to_string()).filter(|q| !q.is_empty()))
    .fetch_all(&state.db)
    .await?;

    Ok((StatusCode::OK, Json(ApiResponse { success: true, data: members })))
}

pub async fn get(
    auth: AuthContext,
    State(state): State<AppState>,
    Path(id): Path<Uuid>,
) -> Result<impl IntoResponse, AppError> {
    let tenant_id = require_tenant(&auth)?;
    let member = fetch_member(&state, tenant_id, id).await?;

    Ok((StatusCode::OK, Json(ApiResponse { success: true, data: member })))
}

pub async fn create(
    auth: AuthContext,
    State(state): State<AppState>,
    Json(payload): Json<CreateMemberRequest>,
) -> Result<impl IntoResponse, AppError> {
    let tenant_id = require_tenant(&auth)?;
    validate_create(&payload)?;
    ensure_branch_scope(&state, tenant_id, payload.branch_id).await?;
    ensure_sales_person_scope(&state, tenant_id, payload.sales_person_id).await?;

    let member = sqlx::query_as::<_, Member>(
        r#"
        insert into members (
            id, member_code, full_name, phone, email, gender, birthday, id_number, address,
            emergency_contact, emergency_phone, branch_id, sales_person_id, status, join_date,
            tags, notes, height, tenant_id
        )
        values (
            gen_random_uuid(), $1, $2, $3, $4, $5, $6, $7, $8,
            $9, $10, $11, $12, $13, $14, $15, $16, $17, $18
        )
        returning
            id, member_code, full_name, phone, email, gender, birthday, id_number, address,
            emergency_contact, emergency_phone, branch_id, sales_person_id, status, join_date,
            tags, notes, height, tenant_id
        "#,
    )
    .bind(payload.member_code.trim())
    .bind(payload.full_name.trim())
    .bind(payload.phone.trim())
    .bind(payload.email)
    .bind(payload.gender)
    .bind(payload.birthday)
    .bind(payload.id_number)
    .bind(payload.address)
    .bind(payload.emergency_contact)
    .bind(payload.emergency_phone)
    .bind(payload.branch_id)
    .bind(payload.sales_person_id)
    .bind(payload.status.trim())
    .bind(payload.join_date)
    .bind(payload.tags)
    .bind(payload.notes)
    .bind(payload.height)
    .bind(tenant_id)
    .fetch_one(&state.db)
    .await?;

    Ok((StatusCode::CREATED, Json(ApiResponse { success: true, data: member })))
}

pub async fn update(
    auth: AuthContext,
    State(state): State<AppState>,
    Path(id): Path<Uuid>,
    Json(payload): Json<UpdateMemberRequest>,
) -> Result<impl IntoResponse, AppError> {
    let tenant_id = require_tenant(&auth)?;
    validate_update(&payload)?;
    if let Some(branch_id) = payload.branch_id {
        ensure_branch_scope(&state, tenant_id, branch_id).await?;
    }
    ensure_sales_person_scope(&state, tenant_id, payload.sales_person_id).await?;

    let member = sqlx::query_as::<_, Member>(
        r#"
        update members
        set
            member_code = coalesce($3, member_code),
            full_name = coalesce($4, full_name),
            phone = coalesce($5, phone),
            email = coalesce($6, email),
            gender = coalesce($7, gender),
            birthday = coalesce($8, birthday),
            id_number = coalesce($9, id_number),
            address = coalesce($10, address),
            emergency_contact = coalesce($11, emergency_contact),
            emergency_phone = coalesce($12, emergency_phone),
            branch_id = coalesce($13, branch_id),
            sales_person_id = coalesce($14, sales_person_id),
            status = coalesce($15, status),
            join_date = coalesce($16, join_date),
            tags = coalesce($17, tags),
            notes = coalesce($18, notes),
            height = coalesce($19, height),
            updated_at = now()
        where id = $1 and tenant_id = $2
        returning
            id, member_code, full_name, phone, email, gender, birthday, id_number, address,
            emergency_contact, emergency_phone, branch_id, sales_person_id, status, join_date,
            tags, notes, height, tenant_id
        "#,
    )
    .bind(id)
    .bind(tenant_id)
    .bind(payload.member_code.as_deref().map(str::trim))
    .bind(payload.full_name.as_deref().map(str::trim))
    .bind(payload.phone.as_deref().map(str::trim))
    .bind(payload.email)
    .bind(payload.gender)
    .bind(payload.birthday)
    .bind(payload.id_number)
    .bind(payload.address)
    .bind(payload.emergency_contact)
    .bind(payload.emergency_phone)
    .bind(payload.branch_id)
    .bind(payload.sales_person_id)
    .bind(payload.status.as_deref().map(str::trim))
    .bind(payload.join_date)
    .bind(payload.tags)
    .bind(payload.notes)
    .bind(payload.height)
    .fetch_optional(&state.db)
    .await?
    .ok_or(AppError::NotFound)?;

    Ok((StatusCode::OK, Json(ApiResponse { success: true, data: member })))
}

pub async fn delete(
    auth: AuthContext,
    State(state): State<AppState>,
    Path(id): Path<Uuid>,
) -> Result<impl IntoResponse, AppError> {
    let tenant_id = require_tenant(&auth)?;
    let member = sqlx::query_as::<_, Member>(
        r#"
        update members
        set status = 'INACTIVE', updated_at = now()
        where id = $1 and tenant_id = $2
        returning
            id, member_code, full_name, phone, email, gender, birthday, id_number, address,
            emergency_contact, emergency_phone, branch_id, sales_person_id, status, join_date,
            tags, notes, height, tenant_id
        "#,
    )
    .bind(id)
    .bind(tenant_id)
    .fetch_optional(&state.db)
    .await?
    .ok_or(AppError::NotFound)?;

    Ok((StatusCode::OK, Json(ApiResponse { success: true, data: member })))
}

async fn fetch_member(state: &AppState, tenant_id: Uuid, id: Uuid) -> Result<Member, AppError> {
    sqlx::query_as::<_, Member>(
        r#"
        select
            id, member_code, full_name, phone, email, gender, birthday, id_number, address,
            emergency_contact, emergency_phone, branch_id, sales_person_id, status, join_date,
            tags, notes, height, tenant_id
        from members
        where id = $1 and tenant_id = $2
        "#,
    )
    .bind(id)
    .bind(tenant_id)
    .fetch_optional(&state.db)
    .await?
    .ok_or(AppError::NotFound)
}

fn require_tenant(auth: &AuthContext) -> Result<Uuid, AppError> {
    auth.user.tenant_id.ok_or(AppError::Unauthorized)
}

fn validate_create(payload: &CreateMemberRequest) -> Result<(), AppError> {
    validation::required_text("memberCode", &payload.member_code)?;
    validation::required_text("fullName", &payload.full_name)?;
    validation::required_text("phone", &payload.phone)?;
    validate_status(&payload.status)
}

fn validate_update(payload: &UpdateMemberRequest) -> Result<(), AppError> {
    if let Some(member_code) = &payload.member_code {
        validation::required_text("memberCode", member_code)?;
    }
    if let Some(full_name) = &payload.full_name {
        validation::required_text("fullName", full_name)?;
    }
    if let Some(phone) = &payload.phone {
        validation::required_text("phone", phone)?;
    }
    if let Some(status) = &payload.status {
        validate_status(status)?;
    }

    Ok(())
}

fn validate_status(status: &str) -> Result<(), AppError> {
    match status {
        "ACTIVE" | "INACTIVE" | "SUSPENDED" => Ok(()),
        _ => Err(AppError::Validation(
            "status must be ACTIVE, INACTIVE, or SUSPENDED".into(),
        )),
    }
}

async fn ensure_branch_scope(
    state: &AppState,
    tenant_id: Uuid,
    branch_id: Uuid,
) -> Result<(), AppError> {
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
        Err(AppError::Validation("branchId is invalid for this tenant".into()))
    }
}

async fn ensure_sales_person_scope(
    state: &AppState,
    tenant_id: Uuid,
    employee_id: Option<Uuid>,
) -> Result<(), AppError> {
    let Some(employee_id) = employee_id else {
        return Ok(());
    };

    let exists = sqlx::query_scalar::<_, bool>(
        "select exists(select 1 from employees where id = $1 and tenant_id = $2)",
    )
    .bind(employee_id)
    .bind(tenant_id)
    .fetch_one(&state.db)
    .await?;

    if exists {
        Ok(())
    } else {
        Err(AppError::Validation(
            "salesPersonId is invalid for this tenant".into(),
        ))
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn rejects_blank_member_name() {
        let payload = CreateMemberRequest {
            member_code: "M001".into(),
            full_name: " ".into(),
            phone: "0912345678".into(),
            email: None,
            gender: None,
            birthday: None,
            id_number: None,
            address: None,
            emergency_contact: None,
            emergency_phone: None,
            branch_id: Uuid::new_v4(),
            sales_person_id: None,
            status: "ACTIVE".into(),
            join_date: NaiveDate::from_ymd_opt(2026, 1, 1).unwrap(),
            tags: None,
            notes: None,
            height: None,
        };

        assert!(validate_create(&payload).is_err());
    }

    #[test]
    fn rejects_unknown_member_status() {
        assert!(validate_status("PENDING").is_err());
    }
}
