mod config;
mod error;
mod http;
mod state;
mod validation;

use axum::{
    http::{header, Method},
    Router,
};
use sqlx::postgres::PgPoolOptions;
use tokio::net::TcpListener;
use tower_http::{
    cors::{AllowCredentials, AllowOrigin, CorsLayer},
    trace::TraceLayer,
};
use tracing_subscriber::{layer::SubscriberExt, util::SubscriberInitExt};

use crate::{config::Settings, state::AppState};

#[tokio::main]
async fn main() -> Result<(), error::AppError> {
    dotenvy::dotenv().ok();
    init_tracing();

    let settings = Settings::from_env()?;
    let state = build_state(&settings).await?;
    let app = build_app(state);

    let listener = TcpListener::bind(settings.bind_address).await?;
    tracing::info!(address = %settings.bind_address, "rust backend listening");

    axum::serve(listener, app)
        .with_graceful_shutdown(shutdown_signal())
        .await?;

    Ok(())
}

fn init_tracing() {
    tracing_subscriber::registry()
        .with(
            tracing_subscriber::EnvFilter::try_from_default_env()
                .unwrap_or_else(|_| "gym_rust_backend=info,tower_http=info".into()),
        )
        .with(tracing_subscriber::fmt::layer())
        .init();
}

async fn build_state(settings: &Settings) -> Result<AppState, error::AppError> {
    let db = PgPoolOptions::new()
        .max_connections(settings.db_max_connections)
        .connect(&settings.database_url)
        .await?;

    Ok(AppState {
        db,
        jwt_secret: settings.jwt_secret.clone(),
        jwt_ttl_seconds: settings.jwt_ttl_seconds,
    })
}

fn build_app(state: AppState) -> Router {
    http::router(state)
        .layer(
            CorsLayer::new()
                .allow_origin(AllowOrigin::mirror_request())
                .allow_credentials(AllowCredentials::yes())
                .allow_methods([Method::GET, Method::POST, Method::PATCH, Method::DELETE])
                .allow_headers([header::AUTHORIZATION, header::CONTENT_TYPE, header::ACCEPT]),
        )
        .layer(TraceLayer::new_for_http())
}

async fn shutdown_signal() {
    let ctrl_c = async {
        tokio::signal::ctrl_c()
            .await
            .expect("failed to install Ctrl+C handler");
    };

    #[cfg(unix)]
    let terminate = async {
        tokio::signal::unix::signal(tokio::signal::unix::SignalKind::terminate())
            .expect("failed to install signal handler")
            .recv()
            .await;
    };

    #[cfg(not(unix))]
    let terminate = std::future::pending::<()>();

    tokio::select! {
        _ = ctrl_c => {},
        _ = terminate => {},
    }
}

#[cfg(test)]
mod tests {
    use axum::{
        body::{to_bytes, Body},
        http::{Request, StatusCode},
    };
    use bcrypt::hash;
    use serde_json::{json, Value};
    use tower::ServiceExt;
    use uuid::Uuid;

    use super::*;

    #[tokio::test]
    async fn health_route_returns_success_envelope() {
        let pool = sqlx::PgPool::connect_lazy("postgresql://user:pass@localhost/db").unwrap();
        let app = build_app(AppState {
            db: pool,
            jwt_secret: "test-secret".into(),
            jwt_ttl_seconds: 60,
        });

        let response = app
            .oneshot(Request::builder().uri("/health").body(Body::empty()).unwrap())
            .await
            .unwrap();

        assert_eq!(response.status(), StatusCode::OK);
    }

    #[tokio::test]
    async fn unknown_route_returns_json_404() {
        let pool = sqlx::PgPool::connect_lazy("postgresql://user:pass@localhost/db").unwrap();
        let app = build_app(AppState {
            db: pool,
            jwt_secret: "test-secret".into(),
            jwt_ttl_seconds: 60,
        });

        let response = app
            .oneshot(Request::builder().uri("/missing").body(Body::empty()).unwrap())
            .await
            .unwrap();

        assert_eq!(response.status(), StatusCode::NOT_FOUND);
    }

    #[tokio::test]
    async fn auth_me_without_bearer_token_returns_401() {
        let pool = sqlx::PgPool::connect_lazy("postgresql://user:pass@localhost/db").unwrap();
        let app = build_app(AppState {
            db: pool,
            jwt_secret: "test-secret".into(),
            jwt_ttl_seconds: 60,
        });

        let response = app
            .oneshot(Request::builder().uri("/api/auth/me").body(Body::empty()).unwrap())
            .await
            .unwrap();

        assert_eq!(response.status(), StatusCode::UNAUTHORIZED);
    }

    #[tokio::test]
    async fn auth_login_to_me_round_trip_with_seed_user() {
        if std::env::var("RUN_DB_TESTS").ok().as_deref() != Some("1") {
            return;
        }

        let database_url = std::env::var("DATABASE_URL")
            .expect("DATABASE_URL is required when RUN_DB_TESTS=1");
        let pool = sqlx::PgPool::connect(&database_url).await.unwrap();

        let tenant_id = Uuid::new_v4();
        let branch_id = Uuid::new_v4();
        let job_title_id = Uuid::new_v4();
        let user_id = Uuid::new_v4();
        let employee_id = Uuid::new_v4();
        let suffix = user_id.simple().to_string();
        let email = format!("rust-auth-{suffix}@example.com");
        let password = "Passw0rd!";
        let password_hash = hash(password, 4).unwrap();
        let permissions = json!({"members":["read"],"plans":["write"]});

        sqlx::query(
            "insert into tenants (id, name, slug, email, status) values ($1, $2, $3, $4, 'ACTIVE')",
        )
        .bind(tenant_id)
        .bind(format!("Rust Tenant {suffix}"))
        .bind(format!("rust-tenant-{suffix}"))
        .bind(format!("tenant-{suffix}@example.com"))
        .execute(&pool)
        .await
        .unwrap();

        sqlx::query(
            "insert into branches (id, name, code, type, tenant_id, status) values ($1, $2, $3, 'MAIN', $4, 'ACTIVE')",
        )
        .bind(branch_id)
        .bind(format!("Rust Branch {suffix}"))
        .bind(format!("RB{}", &suffix[..8]))
        .bind(tenant_id)
        .execute(&pool)
        .await
        .unwrap();

        sqlx::query(
            "insert into job_titles (id, name, code, permissions_config, tenant_id) values ($1, $2, $3, $4::jsonb, $5)",
        )
        .bind(job_title_id)
        .bind(format!("Rust Admin {suffix}"))
        .bind(format!("RA{}", &suffix[..8]))
        .bind(permissions.to_string())
        .bind(tenant_id)
        .execute(&pool)
        .await
        .unwrap();

        sqlx::query(
            "insert into users (id, email, password_hash, role, tenant_id, is_active, email_verified) values ($1, $2, $3, 'ADMIN', $4, true, true)",
        )
        .bind(user_id)
        .bind(&email)
        .bind(password_hash)
        .bind(tenant_id)
        .execute(&pool)
        .await
        .unwrap();

        sqlx::query(
            "insert into employees (id, user_id, branch_id, job_title_id, employee_code, full_name, email, status, employment_type, hire_date, tenant_id) values ($1, $2, $3, $4, $5, $6, $7, 'ACTIVE', 'FULL_TIME', '2026-01-01'::date, $8)",
        )
        .bind(employee_id)
        .bind(user_id)
        .bind(branch_id)
        .bind(job_title_id)
        .bind(format!("RE{}", &suffix[..8]))
        .bind("Rust Auth User")
        .bind(&email)
        .bind(tenant_id)
        .execute(&pool)
        .await
        .unwrap();

        let app = build_app(AppState {
            db: pool.clone(),
            jwt_secret: "test-secret".into(),
            jwt_ttl_seconds: 3600,
        });

        let login_response = app
            .clone()
            .oneshot(
                Request::builder()
                    .method("POST")
                    .uri("/api/auth/login")
                    .header("content-type", "application/json")
                    .body(Body::from(
                        json!({"email": email, "password": password}).to_string(),
                    ))
                    .unwrap(),
            )
            .await
            .unwrap();

        assert_eq!(login_response.status(), StatusCode::OK);
        let login_body = to_bytes(login_response.into_body(), usize::MAX).await.unwrap();
        let login_json: Value = serde_json::from_slice(&login_body).unwrap();
        let token = login_json["data"]["token"].as_str().unwrap();

        let me_response = app
            .oneshot(
                Request::builder()
                    .uri("/api/auth/me")
                    .header("authorization", format!("Bearer {token}"))
                    .body(Body::empty())
                    .unwrap(),
            )
            .await
            .unwrap();

        assert_eq!(me_response.status(), StatusCode::OK);
        let me_body = to_bytes(me_response.into_body(), usize::MAX).await.unwrap();
        let me_json: Value = serde_json::from_slice(&me_body).unwrap();

        assert_eq!(me_json["data"]["user"]["id"], user_id.to_string());
        assert_eq!(me_json["data"]["user"]["tenantId"], tenant_id.to_string());
        assert_eq!(me_json["data"]["user"]["branchId"], branch_id.to_string());
        assert_eq!(me_json["data"]["user"]["employeeId"], employee_id.to_string());
        assert_eq!(me_json["data"]["user"]["role"], "ADMIN");
        assert_eq!(me_json["data"]["user"]["permissions"], permissions);
        assert_eq!(me_json["data"]["employee"]["id"], employee_id.to_string());
        assert_eq!(me_json["data"]["employee"]["branchId"], branch_id.to_string());

        sqlx::query("delete from employees where id = $1")
            .bind(employee_id)
            .execute(&pool)
            .await
            .unwrap();
        sqlx::query("delete from users where id = $1")
            .bind(user_id)
            .execute(&pool)
            .await
            .unwrap();
        sqlx::query("delete from job_titles where id = $1")
            .bind(job_title_id)
            .execute(&pool)
            .await
            .unwrap();
        sqlx::query("delete from branches where id = $1")
            .bind(branch_id)
            .execute(&pool)
            .await
            .unwrap();
        sqlx::query("delete from tenants where id = $1")
            .bind(tenant_id)
            .execute(&pool)
            .await
            .unwrap();
    }

    #[tokio::test]
    async fn membership_plans_crud_round_trip_with_seed_user() {
        if std::env::var("RUN_DB_TESTS").ok().as_deref() != Some("1") {
            return;
        }

        let database_url = std::env::var("DATABASE_URL")
            .expect("DATABASE_URL is required when RUN_DB_TESTS=1");
        let pool = sqlx::PgPool::connect(&database_url).await.unwrap();

        let tenant_id = Uuid::new_v4();
        let branch_id = Uuid::new_v4();
        let job_title_id = Uuid::new_v4();
        let user_id = Uuid::new_v4();
        let employee_id = Uuid::new_v4();
        let suffix = user_id.simple().to_string();
        let email = format!("rust-plan-{suffix}@example.com");
        let password = "Passw0rd!";
        let password_hash = hash(password, 4).unwrap();

        sqlx::query(
            "insert into tenants (id, name, slug, email, status) values ($1, $2, $3, $4, 'ACTIVE')",
        )
        .bind(tenant_id)
        .bind(format!("Rust Plan Tenant {suffix}"))
        .bind(format!("rust-plan-tenant-{suffix}"))
        .bind(format!("plan-tenant-{suffix}@example.com"))
        .execute(&pool)
        .await
        .unwrap();

        sqlx::query(
            "insert into branches (id, name, code, type, tenant_id, status) values ($1, $2, $3, 'MAIN', $4, 'ACTIVE')",
        )
        .bind(branch_id)
        .bind(format!("Rust Plan Branch {suffix}"))
        .bind(format!("PB{}", &suffix[..8]))
        .bind(tenant_id)
        .execute(&pool)
        .await
        .unwrap();

        sqlx::query(
            "insert into job_titles (id, name, code, permissions_config, tenant_id) values ($1, $2, $3, '{\"plans\":[\"read\",\"write\"]}'::jsonb, $4)",
        )
        .bind(job_title_id)
        .bind(format!("Rust Plan Admin {suffix}"))
        .bind(format!("PA{}", &suffix[..8]))
        .bind(tenant_id)
        .execute(&pool)
        .await
        .unwrap();

        sqlx::query(
            "insert into users (id, email, password_hash, role, tenant_id, is_active, email_verified) values ($1, $2, $3, 'ADMIN', $4, true, true)",
        )
        .bind(user_id)
        .bind(&email)
        .bind(password_hash)
        .bind(tenant_id)
        .execute(&pool)
        .await
        .unwrap();

        sqlx::query(
            "insert into employees (id, user_id, branch_id, job_title_id, employee_code, full_name, email, status, employment_type, hire_date, tenant_id) values ($1, $2, $3, $4, $5, $6, $7, 'ACTIVE', 'FULL_TIME', '2026-01-01'::date, $8)",
        )
        .bind(employee_id)
        .bind(user_id)
        .bind(branch_id)
        .bind(job_title_id)
        .bind(format!("PE{}", &suffix[..8]))
        .bind("Rust Plan User")
        .bind(&email)
        .bind(tenant_id)
        .execute(&pool)
        .await
        .unwrap();

        let app = build_app(AppState {
            db: pool.clone(),
            jwt_secret: "test-secret".into(),
            jwt_ttl_seconds: 3600,
        });

        let login_response = app
            .clone()
            .oneshot(
                Request::builder()
                    .method("POST")
                    .uri("/api/auth/login")
                    .header("content-type", "application/json")
                    .body(Body::from(
                        json!({"email": email, "password": password}).to_string(),
                    ))
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(login_response.status(), StatusCode::OK);
        let login_body = to_bytes(login_response.into_body(), usize::MAX).await.unwrap();
        let login_json: Value = serde_json::from_slice(&login_body).unwrap();
        let token = login_json["data"]["token"].as_str().unwrap();

        let create_response = app
            .clone()
            .oneshot(
                Request::builder()
                    .method("POST")
                    .uri("/api/membership-plans")
                    .header("authorization", format!("Bearer {token}"))
                    .header("content-type", "application/json")
                    .body(Body::from(
                        json!({
                            "name": "Rust Monthly",
                            "code": format!("RM{}", &suffix[..8]),
                            "type": "TIME_BASED",
                            "durationMonths": 1,
                            "price": 1200.0,
                            "branchId": branch_id
                        })
                        .to_string(),
                    ))
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(create_response.status(), StatusCode::CREATED);
        let create_body = to_bytes(create_response.into_body(), usize::MAX).await.unwrap();
        let create_json: Value = serde_json::from_slice(&create_body).unwrap();
        let plan_id = create_json["data"]["id"].as_str().unwrap().to_string();
        assert_eq!(create_json["data"]["tenantId"], tenant_id.to_string());
        assert_eq!(create_json["data"]["branchId"], branch_id.to_string());

        let get_response = app
            .clone()
            .oneshot(
                Request::builder()
                    .uri(format!("/api/membership-plans/{plan_id}"))
                    .header("authorization", format!("Bearer {token}"))
                    .body(Body::empty())
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(get_response.status(), StatusCode::OK);

        let list_response = app
            .clone()
            .oneshot(
                Request::builder()
                    .uri("/api/membership-plans?activeOnly=true")
                    .header("authorization", format!("Bearer {token}"))
                    .body(Body::empty())
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(list_response.status(), StatusCode::OK);
        let list_body = to_bytes(list_response.into_body(), usize::MAX).await.unwrap();
        let list_json: Value = serde_json::from_slice(&list_body).unwrap();
        assert!(list_json["data"].as_array().unwrap().iter().any(|plan| {
            plan["id"] == plan_id
        }));

        let update_response = app
            .clone()
            .oneshot(
                Request::builder()
                    .method("PATCH")
                    .uri(format!("/api/membership-plans/{plan_id}"))
                    .header("authorization", format!("Bearer {token}"))
                    .header("content-type", "application/json")
                    .body(Body::from(json!({"price": 1500.0}).to_string()))
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(update_response.status(), StatusCode::OK);
        let update_body = to_bytes(update_response.into_body(), usize::MAX).await.unwrap();
        let update_json: Value = serde_json::from_slice(&update_body).unwrap();
        assert_eq!(update_json["data"]["price"], 1500.0);

        let delete_response = app
            .clone()
            .oneshot(
                Request::builder()
                    .method("DELETE")
                    .uri(format!("/api/membership-plans/{plan_id}"))
                    .header("authorization", format!("Bearer {token}"))
                    .body(Body::empty())
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(delete_response.status(), StatusCode::OK);
        let delete_body = to_bytes(delete_response.into_body(), usize::MAX).await.unwrap();
        let delete_json: Value = serde_json::from_slice(&delete_body).unwrap();
        assert_eq!(delete_json["data"]["isActive"], false);

        let plan_uuid = Uuid::parse_str(&plan_id).unwrap();
        sqlx::query("delete from membership_plans where id = $1")
            .bind(plan_uuid)
            .execute(&pool)
            .await
            .unwrap();
        sqlx::query("delete from employees where id = $1")
            .bind(employee_id)
            .execute(&pool)
            .await
            .unwrap();
        sqlx::query("delete from users where id = $1")
            .bind(user_id)
            .execute(&pool)
            .await
            .unwrap();
        sqlx::query("delete from job_titles where id = $1")
            .bind(job_title_id)
            .execute(&pool)
            .await
            .unwrap();
        sqlx::query("delete from branches where id = $1")
            .bind(branch_id)
            .execute(&pool)
            .await
            .unwrap();
        sqlx::query("delete from tenants where id = $1")
            .bind(tenant_id)
            .execute(&pool)
            .await
            .unwrap();
    }

    #[tokio::test]
    async fn members_crud_round_trip_with_seed_user() {
        if std::env::var("RUN_DB_TESTS").ok().as_deref() != Some("1") {
            return;
        }

        let database_url = std::env::var("DATABASE_URL")
            .expect("DATABASE_URL is required when RUN_DB_TESTS=1");
        let pool = sqlx::PgPool::connect(&database_url).await.unwrap();

        let tenant_id = Uuid::new_v4();
        let branch_id = Uuid::new_v4();
        let job_title_id = Uuid::new_v4();
        let user_id = Uuid::new_v4();
        let employee_id = Uuid::new_v4();
        let suffix = user_id.simple().to_string();
        let email = format!("rust-member-{suffix}@example.com");
        let password = "Passw0rd!";
        let password_hash = hash(password, 4).unwrap();

        sqlx::query(
            "insert into tenants (id, name, slug, email, status) values ($1, $2, $3, $4, 'ACTIVE')",
        )
        .bind(tenant_id)
        .bind(format!("Rust Member Tenant {suffix}"))
        .bind(format!("rust-member-tenant-{suffix}"))
        .bind(format!("member-tenant-{suffix}@example.com"))
        .execute(&pool)
        .await
        .unwrap();

        sqlx::query(
            "insert into branches (id, name, code, type, tenant_id, status) values ($1, $2, $3, 'MAIN', $4, 'ACTIVE')",
        )
        .bind(branch_id)
        .bind(format!("Rust Member Branch {suffix}"))
        .bind(format!("MB{}", &suffix[..8]))
        .bind(tenant_id)
        .execute(&pool)
        .await
        .unwrap();

        sqlx::query(
            "insert into job_titles (id, name, code, permissions_config, tenant_id) values ($1, $2, $3, '{\"members\":[\"read\",\"write\"]}'::jsonb, $4)",
        )
        .bind(job_title_id)
        .bind(format!("Rust Member Admin {suffix}"))
        .bind(format!("MA{}", &suffix[..8]))
        .bind(tenant_id)
        .execute(&pool)
        .await
        .unwrap();

        sqlx::query(
            "insert into users (id, email, password_hash, role, tenant_id, is_active, email_verified) values ($1, $2, $3, 'ADMIN', $4, true, true)",
        )
        .bind(user_id)
        .bind(&email)
        .bind(password_hash)
        .bind(tenant_id)
        .execute(&pool)
        .await
        .unwrap();

        sqlx::query(
            "insert into employees (id, user_id, branch_id, job_title_id, employee_code, full_name, email, status, employment_type, hire_date, tenant_id) values ($1, $2, $3, $4, $5, $6, $7, 'ACTIVE', 'FULL_TIME', '2026-01-01'::date, $8)",
        )
        .bind(employee_id)
        .bind(user_id)
        .bind(branch_id)
        .bind(job_title_id)
        .bind(format!("ME{}", &suffix[..8]))
        .bind("Rust Member User")
        .bind(&email)
        .bind(tenant_id)
        .execute(&pool)
        .await
        .unwrap();

        let app = build_app(AppState {
            db: pool.clone(),
            jwt_secret: "test-secret".into(),
            jwt_ttl_seconds: 3600,
        });

        let login_response = app
            .clone()
            .oneshot(
                Request::builder()
                    .method("POST")
                    .uri("/api/auth/login")
                    .header("content-type", "application/json")
                    .body(Body::from(
                        json!({"email": email, "password": password}).to_string(),
                    ))
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(login_response.status(), StatusCode::OK);
        let login_body = to_bytes(login_response.into_body(), usize::MAX).await.unwrap();
        let login_json: Value = serde_json::from_slice(&login_body).unwrap();
        let token = login_json["data"]["token"].as_str().unwrap();

        let member_code = format!("RMC{}", &suffix[..8]);
        let create_response = app
            .clone()
            .oneshot(
                Request::builder()
                    .method("POST")
                    .uri("/api/members")
                    .header("authorization", format!("Bearer {token}"))
                    .header("content-type", "application/json")
                    .body(Body::from(
                        json!({
                            "memberCode": member_code,
                            "fullName": "Rust Member",
                            "phone": "0912345678",
                            "email": format!("member-{suffix}@example.com"),
                            "branchId": branch_id,
                            "salesPersonId": employee_id,
                            "joinDate": "2026-01-02",
                            "tags": ["rust", "crud"]
                        })
                        .to_string(),
                    ))
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(create_response.status(), StatusCode::CREATED);
        let create_body = to_bytes(create_response.into_body(), usize::MAX).await.unwrap();
        let create_json: Value = serde_json::from_slice(&create_body).unwrap();
        let member_id = create_json["data"]["id"].as_str().unwrap().to_string();
        assert_eq!(create_json["data"]["tenantId"], tenant_id.to_string());
        assert_eq!(create_json["data"]["branchId"], branch_id.to_string());

        let get_response = app
            .clone()
            .oneshot(
                Request::builder()
                    .uri(format!("/api/members/{member_id}"))
                    .header("authorization", format!("Bearer {token}"))
                    .body(Body::empty())
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(get_response.status(), StatusCode::OK);

        let list_response = app
            .clone()
            .oneshot(
                Request::builder()
                    .uri("/api/members?status=ACTIVE&q=Rust")
                    .header("authorization", format!("Bearer {token}"))
                    .body(Body::empty())
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(list_response.status(), StatusCode::OK);
        let list_body = to_bytes(list_response.into_body(), usize::MAX).await.unwrap();
        let list_json: Value = serde_json::from_slice(&list_body).unwrap();
        assert!(list_json["data"].as_array().unwrap().iter().any(|member| {
            member["id"] == member_id
        }));

        let update_response = app
            .clone()
            .oneshot(
                Request::builder()
                    .method("PATCH")
                    .uri(format!("/api/members/{member_id}"))
                    .header("authorization", format!("Bearer {token}"))
                    .header("content-type", "application/json")
                    .body(Body::from(json!({"phone": "0987654321"}).to_string()))
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(update_response.status(), StatusCode::OK);
        let update_body = to_bytes(update_response.into_body(), usize::MAX).await.unwrap();
        let update_json: Value = serde_json::from_slice(&update_body).unwrap();
        assert_eq!(update_json["data"]["phone"], "0987654321");

        let delete_response = app
            .clone()
            .oneshot(
                Request::builder()
                    .method("DELETE")
                    .uri(format!("/api/members/{member_id}"))
                    .header("authorization", format!("Bearer {token}"))
                    .body(Body::empty())
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(delete_response.status(), StatusCode::OK);
        let delete_body = to_bytes(delete_response.into_body(), usize::MAX).await.unwrap();
        let delete_json: Value = serde_json::from_slice(&delete_body).unwrap();
        assert_eq!(delete_json["data"]["status"], "INACTIVE");

        let member_uuid = Uuid::parse_str(&member_id).unwrap();
        sqlx::query("delete from members where id = $1")
            .bind(member_uuid)
            .execute(&pool)
            .await
            .unwrap();
        sqlx::query("delete from employees where id = $1")
            .bind(employee_id)
            .execute(&pool)
            .await
            .unwrap();
        sqlx::query("delete from users where id = $1")
            .bind(user_id)
            .execute(&pool)
            .await
            .unwrap();
        sqlx::query("delete from job_titles where id = $1")
            .bind(job_title_id)
            .execute(&pool)
            .await
            .unwrap();
        sqlx::query("delete from branches where id = $1")
            .bind(branch_id)
            .execute(&pool)
            .await
            .unwrap();
        sqlx::query("delete from tenants where id = $1")
            .bind(tenant_id)
            .execute(&pool)
            .await
            .unwrap();
    }

    #[tokio::test]
    async fn contracts_crud_round_trip_with_seed_user() {
        if std::env::var("RUN_DB_TESTS").ok().as_deref() != Some("1") {
            return;
        }

        let database_url = std::env::var("DATABASE_URL")
            .expect("DATABASE_URL is required when RUN_DB_TESTS=1");
        let pool = sqlx::PgPool::connect(&database_url).await.unwrap();

        let tenant_id = Uuid::new_v4();
        let branch_id = Uuid::new_v4();
        let job_title_id = Uuid::new_v4();
        let user_id = Uuid::new_v4();
        let employee_id = Uuid::new_v4();
        let member_id = Uuid::new_v4();
        let plan_id = Uuid::new_v4();
        let suffix = user_id.simple().to_string();
        let email = format!("rust-contract-{suffix}@example.com");
        let password = "Passw0rd!";
        let password_hash = hash(password, 4).unwrap();

        sqlx::query(
            "insert into tenants (id, name, slug, email, status) values ($1, $2, $3, $4, 'ACTIVE')",
        )
        .bind(tenant_id)
        .bind(format!("Rust Contract Tenant {suffix}"))
        .bind(format!("rust-contract-tenant-{suffix}"))
        .bind(format!("contract-tenant-{suffix}@example.com"))
        .execute(&pool)
        .await
        .unwrap();

        sqlx::query(
            "insert into branches (id, name, code, type, tenant_id, status) values ($1, $2, $3, 'MAIN', $4, 'ACTIVE')",
        )
        .bind(branch_id)
        .bind(format!("Rust Contract Branch {suffix}"))
        .bind(format!("CB{}", &suffix[..8]))
        .bind(tenant_id)
        .execute(&pool)
        .await
        .unwrap();

        sqlx::query(
            "insert into job_titles (id, name, code, permissions_config, tenant_id) values ($1, $2, $3, '{\"contracts\":[\"read\",\"write\"]}'::jsonb, $4)",
        )
        .bind(job_title_id)
        .bind(format!("Rust Contract Admin {suffix}"))
        .bind(format!("CA{}", &suffix[..8]))
        .bind(tenant_id)
        .execute(&pool)
        .await
        .unwrap();

        sqlx::query(
            "insert into users (id, email, password_hash, role, tenant_id, is_active, email_verified) values ($1, $2, $3, 'ADMIN', $4, true, true)",
        )
        .bind(user_id)
        .bind(&email)
        .bind(password_hash)
        .bind(tenant_id)
        .execute(&pool)
        .await
        .unwrap();

        sqlx::query(
            "insert into employees (id, user_id, branch_id, job_title_id, employee_code, full_name, email, status, employment_type, hire_date, tenant_id) values ($1, $2, $3, $4, $5, $6, $7, 'ACTIVE', 'FULL_TIME', '2026-01-01'::date, $8)",
        )
        .bind(employee_id)
        .bind(user_id)
        .bind(branch_id)
        .bind(job_title_id)
        .bind(format!("CE{}", &suffix[..8]))
        .bind("Rust Contract User")
        .bind(&email)
        .bind(tenant_id)
        .execute(&pool)
        .await
        .unwrap();

        sqlx::query(
            "insert into members (id, member_code, full_name, phone, branch_id, sales_person_id, status, join_date, tenant_id) values ($1, $2, 'Rust Contract Member', '0912345678', $3, $4, 'ACTIVE', '2026-01-01'::date, $5)",
        )
        .bind(member_id)
        .bind(format!("RCM{}", &suffix[..8]))
        .bind(branch_id)
        .bind(employee_id)
        .bind(tenant_id)
        .execute(&pool)
        .await
        .unwrap();

        sqlx::query(
            "insert into membership_plans (id, name, code, type, class_counts, price, allow_pause, allow_transfer, is_active, tenant_id, branch_id) values ($1, 'Rust Count Plan', $2, 'COUNT_BASED', 10, 3000, false, false, true, $3, $4)",
        )
        .bind(plan_id)
        .bind(format!("RCP{}", &suffix[..8]))
        .bind(tenant_id)
        .bind(branch_id)
        .execute(&pool)
        .await
        .unwrap();

        let app = build_app(AppState {
            db: pool.clone(),
            jwt_secret: "test-secret".into(),
            jwt_ttl_seconds: 3600,
        });

        let login_response = app
            .clone()
            .oneshot(
                Request::builder()
                    .method("POST")
                    .uri("/api/auth/login")
                    .header("content-type", "application/json")
                    .body(Body::from(
                        json!({"email": email, "password": password}).to_string(),
                    ))
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(login_response.status(), StatusCode::OK);
        let login_body = to_bytes(login_response.into_body(), usize::MAX).await.unwrap();
        let login_json: Value = serde_json::from_slice(&login_body).unwrap();
        let token = login_json["data"]["token"].as_str().unwrap();

        let contract_no = format!("RC{}", &suffix[..10]);
        let create_response = app
            .clone()
            .oneshot(
                Request::builder()
                    .method("POST")
                    .uri("/api/contracts")
                    .header("authorization", format!("Bearer {token}"))
                    .header("content-type", "application/json")
                    .body(Body::from(
                        json!({
                            "contractNo": contract_no,
                            "memberId": member_id,
                            "planId": plan_id,
                            "branchId": branch_id,
                            "salesPersonId": employee_id,
                            "status": "ACTIVE",
                            "signDate": "2026-01-01",
                            "startDate": "2026-01-01",
                            "originalEndDate": "2026-12-31",
                            "endDate": "2026-12-31",
                            "totalAmount": 3000.0,
                            "paidAmount": 0.0,
                            "paymentStatus": "UNPAID",
                            "termsAccepted": true
                        })
                        .to_string(),
                    ))
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(create_response.status(), StatusCode::CREATED);
        let create_body = to_bytes(create_response.into_body(), usize::MAX).await.unwrap();
        let create_json: Value = serde_json::from_slice(&create_body).unwrap();
        let contract_id = create_json["data"]["id"].as_str().unwrap().to_string();
        assert_eq!(create_json["data"]["remainingCounts"], 10);

        let list_response = app
            .clone()
            .oneshot(
                Request::builder()
                    .uri(format!("/api/contracts?member_id={member_id}&limit=1"))
                    .header("authorization", format!("Bearer {token}"))
                    .body(Body::empty())
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(list_response.status(), StatusCode::OK);

        let update_response = app
            .clone()
            .oneshot(
                Request::builder()
                    .method("PATCH")
                    .uri(format!("/api/contracts/{contract_id}"))
                    .header("authorization", format!("Bearer {token}"))
                    .header("content-type", "application/json")
                    .body(Body::from(json!({"paidAmount": 1500.0, "paymentStatus": "PARTIAL"}).to_string()))
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(update_response.status(), StatusCode::OK);
        let update_body = to_bytes(update_response.into_body(), usize::MAX).await.unwrap();
        let update_json: Value = serde_json::from_slice(&update_body).unwrap();
        assert_eq!(update_json["data"]["paidAmount"], 1500.0);
        assert_eq!(update_json["data"]["paymentStatus"], "PARTIAL");

        let delete_response = app
            .clone()
            .oneshot(
                Request::builder()
                    .method("DELETE")
                    .uri(format!("/api/contracts/{contract_id}"))
                    .header("authorization", format!("Bearer {token}"))
                    .body(Body::empty())
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(delete_response.status(), StatusCode::OK);
        let delete_body = to_bytes(delete_response.into_body(), usize::MAX).await.unwrap();
        let delete_json: Value = serde_json::from_slice(&delete_body).unwrap();
        assert_eq!(delete_json["data"]["status"], "CANCELLED");

        let contract_uuid = Uuid::parse_str(&contract_id).unwrap();
        sqlx::query("delete from contracts where id = $1")
            .bind(contract_uuid)
            .execute(&pool)
            .await
            .unwrap();
        sqlx::query("delete from membership_plans where id = $1")
            .bind(plan_id)
            .execute(&pool)
            .await
            .unwrap();
        sqlx::query("delete from members where id = $1")
            .bind(member_id)
            .execute(&pool)
            .await
            .unwrap();
        sqlx::query("delete from employees where id = $1")
            .bind(employee_id)
            .execute(&pool)
            .await
            .unwrap();
        sqlx::query("delete from users where id = $1")
            .bind(user_id)
            .execute(&pool)
            .await
            .unwrap();
        sqlx::query("delete from job_titles where id = $1")
            .bind(job_title_id)
            .execute(&pool)
            .await
            .unwrap();
        sqlx::query("delete from branches where id = $1")
            .bind(branch_id)
            .execute(&pool)
            .await
            .unwrap();
        sqlx::query("delete from tenants where id = $1")
            .bind(tenant_id)
            .execute(&pool)
            .await
            .unwrap();
    }

    #[tokio::test]
    async fn payments_round_trip_updates_contract_payment_status() {
        if std::env::var("RUN_DB_TESTS").ok().as_deref() != Some("1") {
            return;
        }

        let database_url = std::env::var("DATABASE_URL")
            .expect("DATABASE_URL is required when RUN_DB_TESTS=1");
        let pool = sqlx::PgPool::connect(&database_url).await.unwrap();

        let tenant_id = Uuid::new_v4();
        let branch_id = Uuid::new_v4();
        let job_title_id = Uuid::new_v4();
        let user_id = Uuid::new_v4();
        let employee_id = Uuid::new_v4();
        let member_id = Uuid::new_v4();
        let plan_id = Uuid::new_v4();
        let contract_id = Uuid::new_v4();
        let suffix = user_id.simple().to_string();
        let email = format!("rust-payment-{suffix}@example.com");
        let password = "Passw0rd!";
        let password_hash = hash(password, 4).unwrap();

        sqlx::query(
            "insert into tenants (id, name, slug, email, status) values ($1, $2, $3, $4, 'ACTIVE')",
        )
        .bind(tenant_id)
        .bind(format!("Rust Payment Tenant {suffix}"))
        .bind(format!("rust-payment-tenant-{suffix}"))
        .bind(format!("payment-tenant-{suffix}@example.com"))
        .execute(&pool)
        .await
        .unwrap();

        sqlx::query(
            "insert into branches (id, name, code, type, tenant_id, status) values ($1, $2, $3, 'MAIN', $4, 'ACTIVE')",
        )
        .bind(branch_id)
        .bind(format!("Rust Payment Branch {suffix}"))
        .bind(format!("PYB{}", &suffix[..8]))
        .bind(tenant_id)
        .execute(&pool)
        .await
        .unwrap();

        sqlx::query(
            "insert into job_titles (id, name, code, permissions_config, tenant_id) values ($1, $2, $3, '{\"payments\":[\"read\",\"write\"]}'::jsonb, $4)",
        )
        .bind(job_title_id)
        .bind(format!("Rust Payment Admin {suffix}"))
        .bind(format!("PYA{}", &suffix[..8]))
        .bind(tenant_id)
        .execute(&pool)
        .await
        .unwrap();

        sqlx::query(
            "insert into users (id, email, password_hash, role, tenant_id, is_active, email_verified) values ($1, $2, $3, 'ADMIN', $4, true, true)",
        )
        .bind(user_id)
        .bind(&email)
        .bind(password_hash)
        .bind(tenant_id)
        .execute(&pool)
        .await
        .unwrap();

        sqlx::query(
            "insert into employees (id, user_id, branch_id, job_title_id, employee_code, full_name, email, status, employment_type, hire_date, tenant_id) values ($1, $2, $3, $4, $5, $6, $7, 'ACTIVE', 'FULL_TIME', '2026-01-01'::date, $8)",
        )
        .bind(employee_id)
        .bind(user_id)
        .bind(branch_id)
        .bind(job_title_id)
        .bind(format!("PYE{}", &suffix[..8]))
        .bind("Rust Payment User")
        .bind(&email)
        .bind(tenant_id)
        .execute(&pool)
        .await
        .unwrap();

        sqlx::query(
            "insert into members (id, member_code, full_name, phone, branch_id, sales_person_id, status, join_date, tenant_id) values ($1, $2, 'Rust Payment Member', '0912345678', $3, $4, 'ACTIVE', '2026-01-01'::date, $5)",
        )
        .bind(member_id)
        .bind(format!("PYM{}", &suffix[..8]))
        .bind(branch_id)
        .bind(employee_id)
        .bind(tenant_id)
        .execute(&pool)
        .await
        .unwrap();

        sqlx::query(
            "insert into membership_plans (id, name, code, type, duration_months, price, allow_pause, allow_transfer, is_active, tenant_id, branch_id) values ($1, 'Rust Month Plan', $2, 'TIME_BASED', 12, 3000, false, false, true, $3, $4)",
        )
        .bind(plan_id)
        .bind(format!("PYP{}", &suffix[..8]))
        .bind(tenant_id)
        .bind(branch_id)
        .execute(&pool)
        .await
        .unwrap();

        sqlx::query(
            "insert into contracts (id, contract_no, member_id, plan_id, branch_id, sales_person_id, status, start_date, original_end_date, end_date, total_amount, paid_amount, payment_status, terms_accepted, created_by, tenant_id) values ($1, $2, $3, $4, $5, $6, 'ACTIVE', '2026-01-01'::date, '2026-12-31'::date, '2026-12-31'::date, 3000, 0, 'UNPAID', true, $6, $7)",
        )
        .bind(contract_id)
        .bind(format!("PYC{}", &suffix[..8]))
        .bind(member_id)
        .bind(plan_id)
        .bind(branch_id)
        .bind(employee_id)
        .bind(tenant_id)
        .execute(&pool)
        .await
        .unwrap();

        let app = build_app(AppState {
            db: pool.clone(),
            jwt_secret: "test-secret".into(),
            jwt_ttl_seconds: 3600,
        });

        let login_response = app
            .clone()
            .oneshot(
                Request::builder()
                    .method("POST")
                    .uri("/api/auth/login")
                    .header("content-type", "application/json")
                    .body(Body::from(
                        json!({"email": email, "password": password}).to_string(),
                    ))
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(login_response.status(), StatusCode::OK);
        let login_body = to_bytes(login_response.into_body(), usize::MAX).await.unwrap();
        let login_json: Value = serde_json::from_slice(&login_body).unwrap();
        let token = login_json["data"]["token"].as_str().unwrap();

        let create_response = app
            .clone()
            .oneshot(
                Request::builder()
                    .method("POST")
                    .uri("/api/payments")
                    .header("authorization", format!("Bearer {token}"))
                    .header("content-type", "application/json")
                    .body(Body::from(
                        json!({
                            "contractId": contract_id,
                            "amount": 1000.0,
                            "paymentMethod": "CASH",
                            "type": "INCOME",
                            "receiptNo": format!("R{}", &suffix[..8])
                        })
                        .to_string(),
                    ))
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(create_response.status(), StatusCode::CREATED);
        let create_body = to_bytes(create_response.into_body(), usize::MAX).await.unwrap();
        let create_json: Value = serde_json::from_slice(&create_body).unwrap();
        let payment_id = create_json["data"]["id"].as_str().unwrap().to_string();

        let contract_status: (f64, String) = sqlx::query_as(
            "select paid_amount::float8, payment_status from contracts where id = $1",
        )
        .bind(contract_id)
        .fetch_one(&pool)
        .await
        .unwrap();
        assert_eq!(contract_status.0, 1000.0);
        assert_eq!(contract_status.1, "PARTIAL");

        let update_response = app
            .clone()
            .oneshot(
                Request::builder()
                    .method("PATCH")
                    .uri(format!("/api/payments/{payment_id}"))
                    .header("authorization", format!("Bearer {token}"))
                    .header("content-type", "application/json")
                    .body(Body::from(json!({"amount": 3000.0}).to_string()))
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(update_response.status(), StatusCode::OK);

        let contract_status: (f64, String) = sqlx::query_as(
            "select paid_amount::float8, payment_status from contracts where id = $1",
        )
        .bind(contract_id)
        .fetch_one(&pool)
        .await
        .unwrap();
        assert_eq!(contract_status.0, 3000.0);
        assert_eq!(contract_status.1, "PAID");

        let delete_response = app
            .clone()
            .oneshot(
                Request::builder()
                    .method("DELETE")
                    .uri(format!("/api/payments/{payment_id}"))
                    .header("authorization", format!("Bearer {token}"))
                    .body(Body::empty())
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(delete_response.status(), StatusCode::OK);

        let contract_status: (f64, String) = sqlx::query_as(
            "select paid_amount::float8, payment_status from contracts where id = $1",
        )
        .bind(contract_id)
        .fetch_one(&pool)
        .await
        .unwrap();
        assert_eq!(contract_status.0, 0.0);
        assert_eq!(contract_status.1, "UNPAID");

        sqlx::query("delete from contracts where id = $1")
            .bind(contract_id)
            .execute(&pool)
            .await
            .unwrap();
        sqlx::query("delete from membership_plans where id = $1")
            .bind(plan_id)
            .execute(&pool)
            .await
            .unwrap();
        sqlx::query("delete from members where id = $1")
            .bind(member_id)
            .execute(&pool)
            .await
            .unwrap();
        sqlx::query("delete from employees where id = $1")
            .bind(employee_id)
            .execute(&pool)
            .await
            .unwrap();
        sqlx::query("delete from users where id = $1")
            .bind(user_id)
            .execute(&pool)
            .await
            .unwrap();
        sqlx::query("delete from job_titles where id = $1")
            .bind(job_title_id)
            .execute(&pool)
            .await
            .unwrap();
        sqlx::query("delete from branches where id = $1")
            .bind(branch_id)
            .execute(&pool)
            .await
            .unwrap();
        sqlx::query("delete from tenants where id = $1")
            .bind(tenant_id)
            .execute(&pool)
            .await
            .unwrap();
    }

    #[tokio::test]
    async fn check_ins_round_trip_deducts_count_contract() {
        if std::env::var("RUN_DB_TESTS").ok().as_deref() != Some("1") {
            return;
        }

        let database_url = std::env::var("DATABASE_URL")
            .expect("DATABASE_URL is required when RUN_DB_TESTS=1");
        let pool = sqlx::PgPool::connect(&database_url).await.unwrap();

        let tenant_id = Uuid::new_v4();
        let branch_id = Uuid::new_v4();
        let job_title_id = Uuid::new_v4();
        let user_id = Uuid::new_v4();
        let employee_id = Uuid::new_v4();
        let member_id = Uuid::new_v4();
        let plan_id = Uuid::new_v4();
        let contract_id = Uuid::new_v4();
        let suffix = user_id.simple().to_string();
        let email = format!("rust-checkin-{suffix}@example.com");
        let password = "Passw0rd!";
        let password_hash = hash(password, 4).unwrap();

        sqlx::query("insert into tenants (id, name, slug, email, status) values ($1, $2, $3, $4, 'ACTIVE')")
            .bind(tenant_id)
            .bind(format!("Rust Checkin Tenant {suffix}"))
            .bind(format!("rust-checkin-tenant-{suffix}"))
            .bind(format!("checkin-tenant-{suffix}@example.com"))
            .execute(&pool)
            .await
            .unwrap();

        sqlx::query("insert into branches (id, name, code, type, tenant_id, status) values ($1, $2, $3, 'MAIN', $4, 'ACTIVE')")
            .bind(branch_id)
            .bind(format!("Rust Checkin Branch {suffix}"))
            .bind(format!("CIB{}", &suffix[..8]))
            .bind(tenant_id)
            .execute(&pool)
            .await
            .unwrap();

        sqlx::query("insert into job_titles (id, name, code, permissions_config, tenant_id) values ($1, $2, $3, '{\"checkin\":[\"read\",\"write\"]}'::jsonb, $4)")
            .bind(job_title_id)
            .bind(format!("Rust Checkin Admin {suffix}"))
            .bind(format!("CIA{}", &suffix[..8]))
            .bind(tenant_id)
            .execute(&pool)
            .await
            .unwrap();

        sqlx::query("insert into users (id, email, password_hash, role, tenant_id, is_active, email_verified) values ($1, $2, $3, 'ADMIN', $4, true, true)")
            .bind(user_id)
            .bind(&email)
            .bind(password_hash)
            .bind(tenant_id)
            .execute(&pool)
            .await
            .unwrap();

        sqlx::query("insert into employees (id, user_id, branch_id, job_title_id, employee_code, full_name, email, status, employment_type, hire_date, tenant_id) values ($1, $2, $3, $4, $5, $6, $7, 'ACTIVE', 'FULL_TIME', '2026-01-01'::date, $8)")
            .bind(employee_id)
            .bind(user_id)
            .bind(branch_id)
            .bind(job_title_id)
            .bind(format!("CIE{}", &suffix[..8]))
            .bind("Rust Checkin User")
            .bind(&email)
            .bind(tenant_id)
            .execute(&pool)
            .await
            .unwrap();

        sqlx::query("insert into members (id, member_code, full_name, phone, branch_id, sales_person_id, status, join_date, tenant_id) values ($1, $2, 'Rust Checkin Member', '0912345678', $3, $4, 'ACTIVE', '2026-01-01'::date, $5)")
            .bind(member_id)
            .bind(format!("CIM{}", &suffix[..8]))
            .bind(branch_id)
            .bind(employee_id)
            .bind(tenant_id)
            .execute(&pool)
            .await
            .unwrap();

        sqlx::query("insert into membership_plans (id, name, code, type, class_counts, price, allow_pause, allow_transfer, is_active, tenant_id, branch_id) values ($1, 'Rust Checkin Plan', $2, 'COUNT_BASED', 5, 3000, false, false, true, $3, $4)")
            .bind(plan_id)
            .bind(format!("CIP{}", &suffix[..8]))
            .bind(tenant_id)
            .bind(branch_id)
            .execute(&pool)
            .await
            .unwrap();

        sqlx::query("insert into contracts (id, contract_no, member_id, plan_id, branch_id, sales_person_id, status, start_date, original_end_date, end_date, remaining_counts, total_amount, paid_amount, payment_status, terms_accepted, created_by, tenant_id) values ($1, $2, $3, $4, $5, $6, 'ACTIVE', '2026-01-01'::date, '2026-12-31'::date, '2026-12-31'::date, 5, 3000, 3000, 'PAID', true, $6, $7)")
            .bind(contract_id)
            .bind(format!("CIC{}", &suffix[..8]))
            .bind(member_id)
            .bind(plan_id)
            .bind(branch_id)
            .bind(employee_id)
            .bind(tenant_id)
            .execute(&pool)
            .await
            .unwrap();

        let app = build_app(AppState {
            db: pool.clone(),
            jwt_secret: "test-secret".into(),
            jwt_ttl_seconds: 3600,
        });

        let login_response = app
            .clone()
            .oneshot(
                Request::builder()
                    .method("POST")
                    .uri("/api/auth/login")
                    .header("content-type", "application/json")
                    .body(Body::from(json!({"email": email, "password": password}).to_string()))
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(login_response.status(), StatusCode::OK);
        let login_body = to_bytes(login_response.into_body(), usize::MAX).await.unwrap();
        let login_json: Value = serde_json::from_slice(&login_body).unwrap();
        let token = login_json["data"]["token"].as_str().unwrap();

        let create_response = app
            .clone()
            .oneshot(
                Request::builder()
                    .method("POST")
                    .uri("/api/check-ins")
                    .header("authorization", format!("Bearer {token}"))
                    .header("content-type", "application/json")
                    .body(Body::from(
                        json!({
                            "memberId": member_id,
                            "branchId": branch_id,
                            "contractId": contract_id,
                            "checkInType": "ENTRY",
                            "checkInMethod": "MANUAL"
                        })
                        .to_string(),
                    ))
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(create_response.status(), StatusCode::CREATED);
        let create_body = to_bytes(create_response.into_body(), usize::MAX).await.unwrap();
        let create_json: Value = serde_json::from_slice(&create_body).unwrap();
        let check_in_id = create_json["data"]["id"].as_str().unwrap().to_string();
        assert_eq!(create_json["data"]["member"]["id"], member_id.to_string());

        let remaining: i32 = sqlx::query_scalar("select remaining_counts from contracts where id = $1")
            .bind(contract_id)
            .fetch_one(&pool)
            .await
            .unwrap();
        assert_eq!(remaining, 4);

        let list_response = app
            .clone()
            .oneshot(
                Request::builder()
                    .uri(format!("/api/check-ins?member_id={member_id}&limit=1"))
                    .header("authorization", format!("Bearer {token}"))
                    .body(Body::empty())
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(list_response.status(), StatusCode::OK);

        let check_in_uuid = Uuid::parse_str(&check_in_id).unwrap();
        sqlx::query("delete from check_ins where id = $1").bind(check_in_uuid).execute(&pool).await.unwrap();
        sqlx::query("delete from contracts where id = $1").bind(contract_id).execute(&pool).await.unwrap();
        sqlx::query("delete from membership_plans where id = $1").bind(plan_id).execute(&pool).await.unwrap();
        sqlx::query("delete from members where id = $1").bind(member_id).execute(&pool).await.unwrap();
        sqlx::query("delete from employees where id = $1").bind(employee_id).execute(&pool).await.unwrap();
        sqlx::query("delete from users where id = $1").bind(user_id).execute(&pool).await.unwrap();
        sqlx::query("delete from job_titles where id = $1").bind(job_title_id).execute(&pool).await.unwrap();
        sqlx::query("delete from branches where id = $1").bind(branch_id).execute(&pool).await.unwrap();
        sqlx::query("delete from tenants where id = $1").bind(tenant_id).execute(&pool).await.unwrap();
    }

    #[tokio::test]
    async fn classes_crud_round_trip_with_seed_user() {
        if std::env::var("RUN_DB_TESTS").ok().as_deref() != Some("1") {
            return;
        }

        let database_url = std::env::var("DATABASE_URL")
            .expect("DATABASE_URL is required when RUN_DB_TESTS=1");
        let pool = sqlx::PgPool::connect(&database_url).await.unwrap();

        let tenant_id = Uuid::new_v4();
        let branch_id = Uuid::new_v4();
        let job_title_id = Uuid::new_v4();
        let user_id = Uuid::new_v4();
        let employee_id = Uuid::new_v4();
        let suffix = user_id.simple().to_string();
        let email = format!("rust-class-{suffix}@example.com");
        let password = "Passw0rd!";
        let password_hash = hash(password, 4).unwrap();

        sqlx::query("insert into tenants (id, name, slug, email, status) values ($1, $2, $3, $4, 'ACTIVE')")
            .bind(tenant_id)
            .bind(format!("Rust Class Tenant {suffix}"))
            .bind(format!("rust-class-tenant-{suffix}"))
            .bind(format!("class-tenant-{suffix}@example.com"))
            .execute(&pool)
            .await
            .unwrap();

        sqlx::query("insert into branches (id, name, code, type, tenant_id, status) values ($1, $2, $3, 'MAIN', $4, 'ACTIVE')")
            .bind(branch_id)
            .bind(format!("Rust Class Branch {suffix}"))
            .bind(format!("CLB{}", &suffix[..8]))
            .bind(tenant_id)
            .execute(&pool)
            .await
            .unwrap();

        sqlx::query("insert into job_titles (id, name, code, permissions_config, tenant_id) values ($1, $2, $3, '{\"classes\":[\"read\",\"write\"]}'::jsonb, $4)")
            .bind(job_title_id)
            .bind(format!("Rust Class Coach {suffix}"))
            .bind(format!("CLA{}", &suffix[..8]))
            .bind(tenant_id)
            .execute(&pool)
            .await
            .unwrap();

        sqlx::query("insert into users (id, email, password_hash, role, tenant_id, is_active, email_verified) values ($1, $2, $3, 'ADMIN', $4, true, true)")
            .bind(user_id)
            .bind(&email)
            .bind(password_hash)
            .bind(tenant_id)
            .execute(&pool)
            .await
            .unwrap();

        sqlx::query("insert into employees (id, user_id, branch_id, job_title_id, employee_code, full_name, email, status, employment_type, hire_date, tenant_id) values ($1, $2, $3, $4, $5, $6, $7, 'ACTIVE', 'FULL_TIME', '2026-01-01'::date, $8)")
            .bind(employee_id)
            .bind(user_id)
            .bind(branch_id)
            .bind(job_title_id)
            .bind(format!("CLE{}", &suffix[..8]))
            .bind("Rust Class Coach")
            .bind(&email)
            .bind(tenant_id)
            .execute(&pool)
            .await
            .unwrap();

        let app = build_app(AppState {
            db: pool.clone(),
            jwt_secret: "test-secret".into(),
            jwt_ttl_seconds: 3600,
        });

        let login_response = app
            .clone()
            .oneshot(
                Request::builder()
                    .method("POST")
                    .uri("/api/auth/login")
                    .header("content-type", "application/json")
                    .body(Body::from(json!({"email": email, "password": password}).to_string()))
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(login_response.status(), StatusCode::OK);
        let login_body = to_bytes(login_response.into_body(), usize::MAX).await.unwrap();
        let login_json: Value = serde_json::from_slice(&login_body).unwrap();
        let token = login_json["data"]["token"].as_str().unwrap();

        let create_response = app
            .clone()
            .oneshot(
                Request::builder()
                    .method("POST")
                    .uri("/api/classes")
                    .header("authorization", format!("Bearer {token}"))
                    .header("content-type", "application/json")
                    .body(Body::from(
                        json!({
                            "name": "Rust Yoga",
                            "description": "Stretch and strength",
                            "durationMinutes": 60,
                            "maxCapacity": 12,
                            "instructorId": employee_id,
                            "branchId": branch_id,
                            "category": "YOGA",
                            "difficultyLevel": "BEGINNER",
                            "requiresCount": true,
                            "countDeduction": 1
                        })
                        .to_string(),
                    ))
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(create_response.status(), StatusCode::CREATED);
        let create_body = to_bytes(create_response.into_body(), usize::MAX).await.unwrap();
        let create_json: Value = serde_json::from_slice(&create_body).unwrap();
        let class_id = create_json["data"]["id"].as_str().unwrap().to_string();
        assert_eq!(create_json["data"]["branchId"], branch_id.to_string());

        let list_response = app
            .clone()
            .oneshot(
                Request::builder()
                    .uri("/api/classes?activeOnly=true&search=Rust")
                    .header("authorization", format!("Bearer {token}"))
                    .body(Body::empty())
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(list_response.status(), StatusCode::OK);

        let update_response = app
            .clone()
            .oneshot(
                Request::builder()
                    .method("PATCH")
                    .uri(format!("/api/classes/{class_id}"))
                    .header("authorization", format!("Bearer {token}"))
                    .header("content-type", "application/json")
                    .body(Body::from(json!({"maxCapacity": 20}).to_string()))
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(update_response.status(), StatusCode::OK);
        let update_body = to_bytes(update_response.into_body(), usize::MAX).await.unwrap();
        let update_json: Value = serde_json::from_slice(&update_body).unwrap();
        assert_eq!(update_json["data"]["maxCapacity"], 20);

        let delete_response = app
            .clone()
            .oneshot(
                Request::builder()
                    .method("DELETE")
                    .uri(format!("/api/classes/{class_id}"))
                    .header("authorization", format!("Bearer {token}"))
                    .body(Body::empty())
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(delete_response.status(), StatusCode::OK);
        let delete_body = to_bytes(delete_response.into_body(), usize::MAX).await.unwrap();
        let delete_json: Value = serde_json::from_slice(&delete_body).unwrap();
        assert_eq!(delete_json["data"]["isActive"], false);

        let class_uuid = Uuid::parse_str(&class_id).unwrap();
        sqlx::query("delete from classes where id = $1").bind(class_uuid).execute(&pool).await.unwrap();
        sqlx::query("delete from employees where id = $1").bind(employee_id).execute(&pool).await.unwrap();
        sqlx::query("delete from users where id = $1").bind(user_id).execute(&pool).await.unwrap();
        sqlx::query("delete from job_titles where id = $1").bind(job_title_id).execute(&pool).await.unwrap();
        sqlx::query("delete from branches where id = $1").bind(branch_id).execute(&pool).await.unwrap();
        sqlx::query("delete from tenants where id = $1").bind(tenant_id).execute(&pool).await.unwrap();
    }

    #[tokio::test]
    async fn class_booking_round_trip_updates_session_count() {
        if std::env::var("RUN_DB_TESTS").ok().as_deref() != Some("1") {
            return;
        }

        let database_url = std::env::var("DATABASE_URL")
            .expect("DATABASE_URL is required when RUN_DB_TESTS=1");
        let pool = sqlx::PgPool::connect(&database_url).await.unwrap();

        let tenant_id = Uuid::new_v4();
        let branch_id = Uuid::new_v4();
        let job_title_id = Uuid::new_v4();
        let user_id = Uuid::new_v4();
        let employee_id = Uuid::new_v4();
        let member_id = Uuid::new_v4();
        let plan_id = Uuid::new_v4();
        let contract_id = Uuid::new_v4();
        let class_id = Uuid::new_v4();
        let suffix = user_id.simple().to_string();
        let email = format!("rust-booking-{suffix}@example.com");
        let password = "Passw0rd!";
        let password_hash = hash(password, 4).unwrap();

        sqlx::query("insert into tenants (id, name, slug, email, status) values ($1, $2, $3, $4, 'ACTIVE')")
            .bind(tenant_id)
            .bind(format!("Rust Booking Tenant {suffix}"))
            .bind(format!("rust-booking-tenant-{suffix}"))
            .bind(format!("booking-tenant-{suffix}@example.com"))
            .execute(&pool).await.unwrap();

        sqlx::query("insert into branches (id, name, code, type, tenant_id, status) values ($1, $2, $3, 'MAIN', $4, 'ACTIVE')")
            .bind(branch_id)
            .bind(format!("Rust Booking Branch {suffix}"))
            .bind(format!("BKB{}", &suffix[..8]))
            .bind(tenant_id)
            .execute(&pool).await.unwrap();

        sqlx::query("insert into job_titles (id, name, code, permissions_config, tenant_id) values ($1, $2, $3, '{\"bookings\":[\"read\",\"write\"]}'::jsonb, $4)")
            .bind(job_title_id)
            .bind(format!("Rust Booking Coach {suffix}"))
            .bind(format!("BKA{}", &suffix[..8]))
            .bind(tenant_id)
            .execute(&pool).await.unwrap();

        sqlx::query("insert into users (id, email, password_hash, role, tenant_id, is_active, email_verified) values ($1, $2, $3, 'ADMIN', $4, true, true)")
            .bind(user_id)
            .bind(&email)
            .bind(password_hash)
            .bind(tenant_id)
            .execute(&pool).await.unwrap();

        sqlx::query("insert into employees (id, user_id, branch_id, job_title_id, employee_code, full_name, email, status, employment_type, hire_date, tenant_id) values ($1, $2, $3, $4, $5, $6, $7, 'ACTIVE', 'FULL_TIME', '2026-01-01'::date, $8)")
            .bind(employee_id)
            .bind(user_id)
            .bind(branch_id)
            .bind(job_title_id)
            .bind(format!("BKE{}", &suffix[..8]))
            .bind("Rust Booking Coach")
            .bind(&email)
            .bind(tenant_id)
            .execute(&pool).await.unwrap();

        sqlx::query("insert into members (id, member_code, full_name, phone, branch_id, sales_person_id, status, join_date, tenant_id) values ($1, $2, 'Rust Booking Member', '0912345678', $3, $4, 'ACTIVE', '2026-01-01'::date, $5)")
            .bind(member_id)
            .bind(format!("BKM{}", &suffix[..8]))
            .bind(branch_id)
            .bind(employee_id)
            .bind(tenant_id)
            .execute(&pool).await.unwrap();

        sqlx::query("insert into membership_plans (id, name, code, type, class_counts, price, allow_pause, allow_transfer, is_active, tenant_id, branch_id) values ($1, 'Rust Booking Plan', $2, 'COUNT_BASED', 5, 3000, false, false, true, $3, $4)")
            .bind(plan_id)
            .bind(format!("BKP{}", &suffix[..8]))
            .bind(tenant_id)
            .bind(branch_id)
            .execute(&pool).await.unwrap();

        sqlx::query("insert into contracts (id, contract_no, member_id, plan_id, branch_id, sales_person_id, status, start_date, original_end_date, end_date, remaining_counts, total_amount, paid_amount, payment_status, terms_accepted, created_by, tenant_id) values ($1, $2, $3, $4, $5, $6, 'ACTIVE', '2026-01-01'::date, '2026-12-31'::date, '2026-12-31'::date, 5, 3000, 3000, 'PAID', true, $6, $7)")
            .bind(contract_id)
            .bind(format!("BKC{}", &suffix[..8]))
            .bind(member_id)
            .bind(plan_id)
            .bind(branch_id)
            .bind(employee_id)
            .bind(tenant_id)
            .execute(&pool).await.unwrap();

        sqlx::query("insert into classes (id, name, duration_minutes, max_capacity, instructor_id, branch_id, category, is_active, requires_count, count_deduction) values ($1, 'Rust Booking Class', 60, 5, $2, $3, 'YOGA', true, true, 1)")
            .bind(class_id)
            .bind(employee_id)
            .bind(branch_id)
            .execute(&pool).await.unwrap();

        let app = build_app(AppState {
            db: pool.clone(),
            jwt_secret: "test-secret".into(),
            jwt_ttl_seconds: 3600,
        });

        let login_response = app.clone().oneshot(
            Request::builder()
                .method("POST")
                .uri("/api/auth/login")
                .header("content-type", "application/json")
                .body(Body::from(json!({"email": email, "password": password}).to_string()))
                .unwrap(),
        ).await.unwrap();
        assert_eq!(login_response.status(), StatusCode::OK);
        let login_body = to_bytes(login_response.into_body(), usize::MAX).await.unwrap();
        let login_json: Value = serde_json::from_slice(&login_body).unwrap();
        let token = login_json["data"]["token"].as_str().unwrap();

        let session_response = app.clone().oneshot(
            Request::builder()
                .method("POST")
                .uri("/api/class-sessions")
                .header("authorization", format!("Bearer {token}"))
                .header("content-type", "application/json")
                .body(Body::from(json!({
                    "classId": class_id,
                    "branchId": branch_id,
                    "instructorId": employee_id,
                    "sessionDate": "2026-02-01",
                    "startTime": "10:00:00",
                    "endTime": "11:00:00",
                    "maxCapacity": 2
                }).to_string()))
                .unwrap(),
        ).await.unwrap();
        assert_eq!(session_response.status(), StatusCode::CREATED);
        let session_body = to_bytes(session_response.into_body(), usize::MAX).await.unwrap();
        let session_json: Value = serde_json::from_slice(&session_body).unwrap();
        let session_id = session_json["data"]["id"].as_str().unwrap().to_string();

        let booking_response = app.clone().oneshot(
            Request::builder()
                .method("POST")
                .uri("/api/bookings")
                .header("authorization", format!("Bearer {token}"))
                .header("content-type", "application/json")
                .body(Body::from(json!({
                    "sessionId": session_id,
                    "memberId": member_id,
                    "contractId": contract_id
                }).to_string()))
                .unwrap(),
        ).await.unwrap();
        assert_eq!(booking_response.status(), StatusCode::CREATED);
        let booking_body = to_bytes(booking_response.into_body(), usize::MAX).await.unwrap();
        let booking_json: Value = serde_json::from_slice(&booking_body).unwrap();
        let booking_id = booking_json["data"]["id"].as_str().unwrap().to_string();

        let session_uuid = Uuid::parse_str(&session_id).unwrap();
        let current_count: i32 = sqlx::query_scalar("select current_count from class_sessions where id = $1")
            .bind(session_uuid).fetch_one(&pool).await.unwrap();
        assert_eq!(current_count, 1);

        let cancel_response = app.clone().oneshot(
            Request::builder()
                .method("DELETE")
                .uri(format!("/api/bookings/{booking_id}"))
                .header("authorization", format!("Bearer {token}"))
                .body(Body::empty())
                .unwrap(),
        ).await.unwrap();
        assert_eq!(cancel_response.status(), StatusCode::OK);

        let current_count: i32 = sqlx::query_scalar("select current_count from class_sessions where id = $1")
            .bind(session_uuid).fetch_one(&pool).await.unwrap();
        assert_eq!(current_count, 0);

        let booking_uuid = Uuid::parse_str(&booking_id).unwrap();
        sqlx::query("delete from bookings where id = $1").bind(booking_uuid).execute(&pool).await.unwrap();
        sqlx::query("delete from class_sessions where id = $1").bind(session_uuid).execute(&pool).await.unwrap();
        sqlx::query("delete from classes where id = $1").bind(class_id).execute(&pool).await.unwrap();
        sqlx::query("delete from contracts where id = $1").bind(contract_id).execute(&pool).await.unwrap();
        sqlx::query("delete from membership_plans where id = $1").bind(plan_id).execute(&pool).await.unwrap();
        sqlx::query("delete from members where id = $1").bind(member_id).execute(&pool).await.unwrap();
        sqlx::query("delete from employees where id = $1").bind(employee_id).execute(&pool).await.unwrap();
        sqlx::query("delete from users where id = $1").bind(user_id).execute(&pool).await.unwrap();
        sqlx::query("delete from job_titles where id = $1").bind(job_title_id).execute(&pool).await.unwrap();
        sqlx::query("delete from branches where id = $1").bind(branch_id).execute(&pool).await.unwrap();
        sqlx::query("delete from tenants where id = $1").bind(tenant_id).execute(&pool).await.unwrap();
    }
}
