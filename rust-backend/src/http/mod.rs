use axum::{
    extract::State,
    http::StatusCode,
    response::IntoResponse,
    routing::{get, post},
    Json, Router,
};
use serde::Serialize;

use crate::{error, error::AppError, state::AppState};

mod auth;
mod check_ins;
mod contracts;
mod members;
mod membership_plans;
mod payments;

#[derive(Debug, Serialize)]
struct ApiResponse<T> {
    success: bool,
    data: T,
}

#[derive(Debug, Serialize)]
struct Pagination {
    total: i64,
    page: i64,
    limit: i64,
    #[serde(rename = "totalPages")]
    total_pages: i64,
}

#[derive(Debug, Serialize)]
struct PaginatedResponse<T> {
    success: bool,
    data: T,
    pagination: Pagination,
}

#[derive(Debug, Serialize)]
struct HealthData {
    status: &'static str,
    service: &'static str,
}

#[derive(Debug, Serialize)]
struct DbHealthData {
    status: &'static str,
    database: &'static str,
}

pub fn router(state: AppState) -> Router {
    Router::new()
        .route("/health", get(health).post(error::method_not_allowed))
        .route("/health/db", get(health_db).post(error::method_not_allowed))
        .route("/api/auth/login", post(auth::login).get(error::method_not_allowed))
        .route("/api/auth/logout", post(auth::logout))
        .route("/api/auth/refresh", post(auth::refresh))
        .route("/api/auth/me", get(auth::me).post(error::method_not_allowed))
        .route(
            "/api/membership-plans",
            get(membership_plans::list).post(membership_plans::create),
        )
        .route(
            "/api/membership-plans/{id}",
            get(membership_plans::get)
                .patch(membership_plans::update)
                .delete(membership_plans::delete),
        )
        .route("/api/members", get(members::list).post(members::create))
        .route(
            "/api/members/{id}",
            get(members::get)
                .patch(members::update)
                .delete(members::delete),
        )
        .route("/api/contracts", get(contracts::list).post(contracts::create))
        .route(
            "/api/contracts/{id}",
            get(contracts::get)
                .patch(contracts::update)
                .delete(contracts::delete),
        )
        .route("/api/payments", get(payments::list).post(payments::create))
        .route(
            "/api/payments/{id}",
            get(payments::get)
                .patch(payments::update)
                .delete(payments::delete),
        )
        .route("/api/check-ins", get(check_ins::list).post(check_ins::create))
        .route("/api/check-ins/{id}", get(check_ins::get))
        .fallback(error::not_found)
        .with_state(state)
}

async fn health() -> impl IntoResponse {
    (
        StatusCode::OK,
        Json(ApiResponse {
            success: true,
            data: HealthData {
                status: "ok",
                service: "gym-rust-backend",
            },
        }),
    )
}

async fn health_db(State(state): State<AppState>) -> Result<impl IntoResponse, AppError> {
    sqlx::query_scalar::<_, i32>("select 1")
        .fetch_one(&state.db)
        .await?;

    Ok((
        StatusCode::OK,
        Json(ApiResponse {
            success: true,
            data: DbHealthData {
                status: "ok",
                database: "postgres",
            },
        }),
    ))
}
