use axum::{
    extract::State,
    http::StatusCode,
    response::IntoResponse,
    routing::{delete, get, patch, post},
    Json, Router,
};
use serde::Serialize;

use crate::{error, error::AppError, state::AppState};

mod auth;
mod attendances;
mod check_ins;
mod classes;
mod class_scheduling;
mod contracts;
mod dashboard_reports;
mod hr;
mod leaves;
mod makeup;
mod members;
mod membership_plans;
mod member_app;
mod payments;
mod payroll;
mod performance;
mod shifts;

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
        .route("/api/classes", get(classes::list).post(classes::create))
        .route(
            "/api/classes/{id}",
            get(classes::get)
                .patch(classes::update)
                .delete(classes::delete),
        )
        .route(
            "/api/class-schedules",
            get(class_scheduling::list_schedules).post(class_scheduling::create_schedule),
        )
        .route(
            "/api/class-sessions",
            get(class_scheduling::list_sessions).post(class_scheduling::create_session),
        )
        .route(
            "/api/bookings",
            get(class_scheduling::list_bookings).post(class_scheduling::create_booking),
        )
        .route(
            "/api/bookings/{id}",
            get(class_scheduling::get_booking).delete(class_scheduling::cancel_booking),
        )
        .route("/api/admin/dashboard/kpis", get(dashboard_reports::dashboard_kpis))
        .route("/api/reports/revenue", get(dashboard_reports::revenue_report))
        .route("/api/reports/member-growth", get(dashboard_reports::member_growth_report))
        .route("/api/reports/contract-expiry", get(dashboard_reports::contract_expiry_report))
        .route("/api/reports/member-activity", get(dashboard_reports::member_activity_report))
        .route("/api/employees", get(hr::list_employees).post(hr::create_employee))
        .route(
            "/api/employees/{id}",
            get(hr::get_employee)
                .patch(hr::update_employee)
                .delete(hr::delete_employee),
        )
        .route("/api/job-titles", get(hr::list_job_titles).post(hr::create_job_title))
        .route(
            "/api/job-titles/{id}",
            get(hr::get_job_title)
                .patch(hr::update_job_title)
                .delete(hr::delete_job_title),
        )
        .route("/api/attendances", get(attendances::list).post(attendances::create))
        .route(
            "/api/attendances/{id}",
            get(attendances::get).patch(attendances::update),
        )
        .route("/api/leave_requests", get(leaves::list_requests).post(leaves::create_request))
        .route(
            "/api/leave_requests/{id}",
            get(leaves::get_request).patch(leaves::update_request),
        )
        .route("/api/leave_balances", get(leaves::list_balances).post(leaves::create_balance))
        .route("/api/leave_balances/{id}", patch(leaves::update_balance))
        .route("/api/leave_approval_logs", get(leaves::list_logs).post(leaves::create_log))
        .route("/api/shift_schedules", get(shifts::list_schedules).post(shifts::create_schedule))
        .route(
            "/api/shift_schedules/{id}",
            get(shifts::get_schedule).patch(shifts::update_schedule),
        )
        .route("/api/employee_shifts", get(shifts::list_employee_shifts).post(shifts::create_employee_shift))
        .route(
            "/api/employee_shifts/{id}",
            get(shifts::get_employee_shift).patch(shifts::update_employee_shift),
        )
        .route("/api/makeup_requests", get(makeup::list_requests).post(makeup::create_request))
        .route(
            "/api/makeup_requests/{id}",
            get(makeup::get_request).patch(makeup::update_request),
        )
        .route("/api/makeup_approval_logs", get(makeup::list_logs).post(makeup::create_log))
        .route("/api/payroll/salary-records", get(payroll::list_salary_records))
        .route("/api/payroll/salary-records/{id}", get(payroll::get_salary_record).patch(payroll::update_salary_record))
        .route("/api/payroll/salary-records/{id}/approve", post(payroll::approve_salary))
        .route("/api/payroll/salary-records/{id}/pay", post(payroll::mark_salary_paid))
        .route("/api/payroll/generate", post(payroll::generate_payroll))
        .route("/api/payroll/batch-approve", post(payroll::batch_approve_salary))
        .route("/api/payroll/export", get(payroll::export_payroll))
        .route("/api/payroll/promotions", get(payroll::list_promotions).post(payroll::create_promotion))
        .route("/api/performance/reviews", get(performance::list_reviews).post(performance::create_review))
        .route(
            "/api/performance/reviews/{id}",
            get(performance::get_review).patch(performance::update_review),
        )
        .route("/api/performance/reviews/{id}/submit", post(performance::submit_review))
        .route("/api/performance/reviews/{id}/approve", post(performance::approve_review))
        .route("/api/performance/reviews/{id}/reject", post(performance::reject_review))
        .route("/api/performance/kpi-templates", get(performance::list_templates).post(performance::create_template))
        .route("/api/performance/kpi-templates/{id}", delete(performance::delete_template))
        .route("/api/performance/team-dashboard", get(performance::team_dashboard))
        .route("/api/member/auth/login", post(member_app::login))
        .route("/api/member/me", get(member_app::me))
        .route("/api/member/profile", get(member_app::profile).patch(member_app::update_profile))
        .route("/api/member/classes", get(member_app::list_classes))
        .route("/api/member/classes/schedule", get(member_app::list_schedules))
        .route("/api/member/classes/sessions", get(member_app::list_sessions))
        .route("/api/member/classes/sessions/{id}", get(member_app::get_session))
        .route("/api/member/bookings", get(member_app::list_bookings).post(member_app::create_booking))
        .route("/api/member/bookings/{id}", delete(member_app::cancel_booking))
        .route("/api/member/contracts", get(member_app::list_contracts))
        .route("/api/member/contracts/{id}/pause", post(member_app::pause_contract))
        .route("/api/member/contracts/{id}/resume", post(member_app::resume_contract))
        .route("/api/member/payments", get(member_app::list_payments))
        .route("/api/member_checkins", get(member_app::list_checkins))
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
