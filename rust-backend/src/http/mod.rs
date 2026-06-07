use axum::{
    extract::State,
    http::StatusCode,
    response::IntoResponse,
    routing::{delete, get, patch, post, put},
    Json, Router,
};
use serde::Serialize;

use crate::{error, error::AppError, state::AppState};

mod auth;
mod attendances;
mod admin_notifications;
mod admin_tenants;
mod branches;
mod check_ins;
mod classes;
mod class_categories;
mod class_scheduling;
mod contracts;
mod contract_logs;
mod dashboard_reports;
mod hr;
mod leaves;
mod makeup;
mod marketing;
mod members;
mod membership_plans;
mod member_app;
mod member_auth_extra;
mod member_fitness;
mod member_notifications;
mod member_oauth;
mod member_reviews;
mod member_support;
mod payments;
mod payroll;
mod performance;
mod shifts;
mod tenant;
mod users;

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
        .route("/api/auth/me/permissions", get(auth::permissions))
        .route("/api/auth/change-password", post(auth::change_password))
        .route("/api/tenant", get(tenant::get_tenant))
        .route("/api/tenant/quota", get(tenant::get_quota))
        .route("/api/public/branding", get(tenant::public_branding))
        .route("/tenant/settings/branding", get(tenant::get_branding))
        .route("/tenant/settings", patch(tenant::update_settings))
        .route(
            "/api/admin/notification-config",
            get(admin_notifications::get_config).patch(admin_notifications::update_config),
        )
        .route("/api/admin/notification-config/test", post(admin_notifications::test_config))
        .route("/api/admin/notification-usage", get(admin_notifications::usage))
        .route("/api/admin/notification-usage/export", get(admin_notifications::export_usage))
        .route("/api/admin/tenants", get(admin_tenants::list).post(admin_tenants::create))
        .route(
            "/api/admin/tenants/{tenantId}",
            get(admin_tenants::get).patch(admin_tenants::update),
        )
        .route("/api/admin/tenants/{tenantId}/status", patch(admin_tenants::update_status))
        .route("/api/branches", get(branches::list).post(branches::create))
        .route(
            "/api/branches/{id}",
            get(branches::get).patch(branches::update).delete(branches::delete),
        )
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
        .route("/api/users", get(users::list).post(users::create))
        .route("/api/users/available-employees", get(users::available_employees))
        .route(
            "/api/users/{id}",
            get(users::get).patch(users::update).delete(users::delete),
        )
        .route("/api/users/{id}/reset-password", post(users::reset_password))
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
        .route("/api/admin/checkin/qr-verify", post(check_ins::qr_verify))
        .route("/api/classes", get(classes::list).post(classes::create))
        .route(
            "/api/classes/{id}",
            get(classes::get)
                .patch(classes::update)
                .delete(classes::delete),
        )
        .route("/api/class_categories", get(class_categories::list).post(class_categories::create))
        .route(
            "/api/class_categories/{id}",
            get(class_categories::get)
                .patch(class_categories::update)
                .delete(class_categories::delete),
        )
        .route("/api/contract_logs", post(contract_logs::create))
        .route(
            "/api/class-schedules",
            get(class_scheduling::list_schedules).post(class_scheduling::create_schedule),
        )
        .route(
            "/api/class-schedules/{id}",
            get(class_scheduling::get_schedule)
                .patch(class_scheduling::update_schedule)
                .delete(class_scheduling::delete_schedule),
        )
        .route(
            "/api/class_schedules",
            get(class_scheduling::list_schedules).post(class_scheduling::create_schedule),
        )
        .route(
            "/api/class_schedules/{id}",
            get(class_scheduling::get_schedule)
                .patch(class_scheduling::update_schedule)
                .delete(class_scheduling::delete_schedule),
        )
        .route(
            "/api/class-sessions",
            get(class_scheduling::list_sessions).post(class_scheduling::create_session),
        )
        .route(
            "/api/class-sessions/{id}",
            get(class_scheduling::get_session)
                .patch(class_scheduling::update_session)
                .delete(class_scheduling::delete_session),
        )
        .route(
            "/api/class_sessions",
            get(class_scheduling::list_sessions).post(class_scheduling::create_session),
        )
        .route(
            "/api/class_sessions/{id}",
            get(class_scheduling::get_session)
                .patch(class_scheduling::update_session)
                .delete(class_scheduling::delete_session),
        )
        .route(
            "/api/bookings",
            get(class_scheduling::list_bookings).post(class_scheduling::create_booking),
        )
        .route(
            "/api/bookings/{id}",
            get(class_scheduling::get_booking)
                .patch(class_scheduling::update_booking)
                .delete(class_scheduling::cancel_booking),
        )
        .route("/api/admin/classes/generate-sessions", post(class_scheduling::generate_sessions))
        .route("/api/admin/classes/book", post(class_scheduling::admin_book))
        .route("/api/admin/classes/cancel-booking", post(class_scheduling::admin_cancel_booking))
        .route("/api/admin/classes/attend", post(class_scheduling::admin_attend))
        .route("/api/leads/analytics", get(marketing::lead_analytics))
        .route("/api/leads", get(marketing::list_leads).post(marketing::create_lead))
        .route(
            "/api/leads/{id}",
            get(marketing::get_lead)
                .patch(marketing::update_lead)
                .delete(marketing::delete_lead),
        )
        .route("/api/leads/{id}/activities", post(marketing::add_lead_activity))
        .route("/api/leads/{id}/assign", post(marketing::assign_lead))
        .route("/api/leads/{id}/convert", post(marketing::convert_lead))
        .route("/api/campaigns/roi-report", get(marketing::campaign_roi_report))
        .route("/api/campaigns", get(marketing::list_campaigns).post(marketing::create_campaign))
        .route(
            "/api/campaigns/{id}",
            get(marketing::get_campaign)
                .patch(marketing::update_campaign)
                .delete(marketing::delete_campaign),
        )
        .route("/api/campaigns/{id}/metrics", get(marketing::campaign_metrics))
        .route("/api/campaigns/{id}/update-metrics", post(marketing::update_campaign_metrics))
        .route("/api/campaigns/{id}/assets", post(marketing::add_campaign_asset))
        .route("/api/coupons/validate", post(marketing::validate_coupon))
        .route("/api/coupons/generate-batch", post(marketing::generate_batch_coupons))
        .route("/api/coupons/apply", post(marketing::apply_coupon))
        .route("/api/coupons", get(marketing::list_coupons).post(marketing::create_coupon))
        .route(
            "/api/coupons/{id}",
            get(marketing::get_coupon)
                .patch(marketing::update_coupon)
                .delete(marketing::delete_coupon),
        )
        .route("/api/coupons/{id}/usages", get(marketing::coupon_usages))
        .route("/api/segmentation/rfm", get(marketing::list_rfm))
        .route("/api/segmentation/rfm/{member_id}", get(marketing::get_member_rfm))
        .route("/api/segmentation/calculate", post(marketing::calculate_rfm))
        .route("/api/segmentation/segments", get(marketing::segments))
        .route("/api/segmentation/segments/{segment}/members", get(marketing::segment_members))
        .route("/api/segmentation/auto-tag", post(marketing::auto_tag))
        .route("/api/segmentation/export/{segment}", get(marketing::export_segment))
        .route("/api/admin/dashboard/kpis", get(dashboard_reports::dashboard_kpis))
        .route("/api/admin/dashboard/contract-alerts", get(dashboard_reports::contract_alerts))
        .route(
            "/api/admin/dashboard/revenue-targets",
            get(dashboard_reports::revenue_targets).post(dashboard_reports::set_revenue_target),
        )
        .route("/api/admin/dashboard/export", get(dashboard_reports::dashboard_export))
        .route("/api/admin/analytics/member-demographics", get(dashboard_reports::admin_member_demographics))
        .route("/api/admin/analytics/contract-analytics", get(dashboard_reports::admin_contract_analytics))
        .route("/api/admin/analytics/revenue-breakdown", get(dashboard_reports::admin_revenue_breakdown))
        .route("/api/admin/analytics/checkin-heatmap", get(dashboard_reports::admin_checkin_heatmap))
        .route("/api/admin/reports/member-growth", get(dashboard_reports::admin_member_growth_report))
        .route("/api/gym/analytics/api-stats", get(dashboard_reports::api_stats))
        .route("/api/reports/revenue", get(dashboard_reports::revenue_report))
        .route("/api/reports/member-growth", get(dashboard_reports::member_growth_report))
        .route("/api/reports/contract-expiry", get(dashboard_reports::contract_expiry_report))
        .route("/api/reports/member-activity", get(dashboard_reports::member_activity_report))
        .route("/api/reports/refresh", post(dashboard_reports::refresh_reports))
        .route("/api/reports/branch-performance", get(dashboard_reports::branch_performance_report))
        .route("/api/reports/branch-performance/export", get(dashboard_reports::performance_export))
        .route("/api/reports/coach-performance", get(dashboard_reports::coach_performance_report))
        .route("/api/reports/coach-performance/export", get(dashboard_reports::performance_export))
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
        .route("/api/hr/attendances", get(attendances::list).post(attendances::create))
        .route(
            "/api/hr/attendances/{id}",
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
            get(shifts::get_schedule).patch(shifts::update_schedule).put(shifts::update_schedule),
        )
        .route("/api/employee_shifts", get(shifts::list_employee_shifts).post(shifts::create_employee_shift))
        .route(
            "/api/employee_shifts/{id}",
            get(shifts::get_employee_shift).patch(shifts::update_employee_shift).put(shifts::update_employee_shift),
        )
        .route("/api/hr/shift-schedules", get(shifts::list_schedules).post(shifts::create_schedule))
        .route(
            "/api/hr/shift-schedules/{id}",
            get(shifts::get_schedule).patch(shifts::update_schedule).put(shifts::update_schedule),
        )
        .route("/api/hr/employee-shifts", get(shifts::list_employee_shifts).post(shifts::create_employee_shift))
        .route(
            "/api/hr/employee-shifts/{id}",
            get(shifts::get_employee_shift).patch(shifts::update_employee_shift).put(shifts::update_employee_shift),
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
        .route("/api/member/auth/forgot-password", post(member_auth_extra::forgot_password))
        .route("/api/member/auth/reset-password", post(member_auth_extra::reset_password))
        .route("/api/member/auth/change-password", post(member_auth_extra::change_password))
        .route("/api/member/oauth/providers", get(member_oauth::providers))
        .route("/api/member/oauth/{provider}/init", get(member_oauth::init))
        .route("/api/member/oauth/{provider}/callback", post(member_oauth::callback))
        .route("/api/member/oauth/link", post(member_oauth::link))
        .route("/api/member/oauth/{provider}", delete(member_oauth::unlink))
        .route("/api/member/otp/send", post(member_auth_extra::send_otp))
        .route("/api/member/otp/verify", post(member_auth_extra::verify_otp))
        .route("/api/member/otp/verify-only", post(member_auth_extra::verify_otp_only))
        .route("/api/member/otp/refresh", post(member_auth_extra::refresh))
        .route("/api/member/me", get(member_app::me))
        .route("/api/member/me/complete-profile", post(member_auth_extra::complete_profile))
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
        .route("/api/member_checkins/{id}", get(member_app::get_checkin))
        .route("/api/member/checkins", get(member_app::list_checkins))
        .route("/api/member/checkins/{id}", get(member_app::get_checkin))
        .route("/api/member/goals", get(member_fitness::list_goals).post(member_fitness::create_goal))
        .route(
            "/api/member/goals/{id}",
            get(member_fitness::get_goal).put(member_fitness::update_goal).delete(member_fitness::delete_goal),
        )
        .route("/api/member/workouts", get(member_fitness::list_workouts).post(member_fitness::create_workout))
        .route("/api/member/workouts/stats", get(member_fitness::workout_stats))
        .route(
            "/api/member/workouts/{id}",
            get(member_fitness::get_workout).put(member_fitness::update_workout).delete(member_fitness::delete_workout),
        )
        .route("/api/member/measurements", get(member_fitness::list_measurements).post(member_fitness::create_measurement))
        .route("/api/member/measurements/latest", get(member_fitness::latest_measurement))
        .route("/api/member/measurements/stats", get(member_fitness::measurement_stats))
        .route("/api/member/measurements/{id}", delete(member_fitness::delete_measurement))
        .route("/api/member/reviews/eligibility/{booking_id}", get(member_reviews::eligibility))
        .route("/api/member/reviews", post(member_reviews::submit_review))
        .route(
            "/api/member/reviews/{id}",
            put(member_reviews::update_review).delete(member_reviews::delete_review),
        )
        .route("/api/member/reviews/class/{class_id}", get(member_reviews::class_reviews))
        .route("/api/member/reviews/my", get(member_reviews::my_reviews))
        .route("/api/member/notifications/preferences", get(member_notifications::get_preferences).patch(member_notifications::update_preferences))
        .route("/api/member/notifications/channels", get(member_notifications::channels))
        .route("/api/member/notifications/history", get(member_notifications::history))
        .route("/api/member/notifications/test", post(member_notifications::test_notification))
        .route("/api/member/push/vapid-public-key", get(member_notifications::vapid_public_key))
        .route("/api/member/push/subscribe", post(member_notifications::subscribe))
        .route("/api/member/push/unsubscribe", delete(member_notifications::unsubscribe))
        .route("/api/member/push/preferences", patch(member_notifications::update_push_preferences))
        .route("/api/member/issues", get(member_support::list_issues).post(member_support::create_issue))
        .route(
            "/api/member/issues/{id}",
            get(member_support::get_issue).put(member_support::update_issue),
        )
        .route("/api/member/support-tickets", post(member_support::create_support_ticket))
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
