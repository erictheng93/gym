mod config;
mod error;
mod http;
mod state;
mod validation;

use axum::{
    http::{header, HeaderName, Method},
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
                .allow_methods([Method::GET, Method::POST, Method::PUT, Method::PATCH, Method::DELETE])
                .allow_headers([
                    header::AUTHORIZATION,
                    header::CONTENT_TYPE,
                    header::ACCEPT,
                    HeaderName::from_static("x-member-token"),
                ]),
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
            .clone()
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

        let permissions_response = app
            .clone()
            .oneshot(
                Request::builder()
                    .uri("/api/auth/me/permissions")
                    .header("authorization", format!("Bearer {token}"))
                    .body(Body::empty())
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(permissions_response.status(), StatusCode::OK);
        let permissions_body = to_bytes(permissions_response.into_body(), usize::MAX).await.unwrap();
        let permissions_json: Value = serde_json::from_slice(&permissions_body).unwrap();
        assert_eq!(permissions_json["data"]["permissions"], permissions);
        assert_eq!(permissions_json["data"]["role"], "ADMIN");
        assert_eq!(permissions_json["data"]["jobTitleName"], format!("Rust Admin {suffix}"));
        assert_eq!(permissions_json["data"]["hasEmployee"], true);

        let change_password_response = app
            .clone()
            .oneshot(
                Request::builder()
                    .method("POST")
                    .uri("/api/auth/change-password")
                    .header("authorization", format!("Bearer {token}"))
                    .header("content-type", "application/json")
                    .body(Body::from(
                        json!({"currentPassword": password, "newPassword": "NextPassw0rd!"}).to_string(),
                    ))
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(change_password_response.status(), StatusCode::OK);

        let old_password_response = app
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
        assert_eq!(old_password_response.status(), StatusCode::UNAUTHORIZED);

        let new_password_response = app
            .clone()
            .oneshot(
                Request::builder()
                    .method("POST")
                    .uri("/api/auth/login")
                    .header("content-type", "application/json")
                    .body(Body::from(
                        json!({"email": email, "password": "NextPassw0rd!"}).to_string(),
                    ))
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(new_password_response.status(), StatusCode::OK);

        let tenant_response = app
            .clone()
            .oneshot(
                Request::builder()
                    .uri("/api/tenant")
                    .header("authorization", format!("Bearer {token}"))
                    .body(Body::empty())
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(tenant_response.status(), StatusCode::OK);
        let tenant_body = to_bytes(tenant_response.into_body(), usize::MAX).await.unwrap();
        let tenant_json: Value = serde_json::from_slice(&tenant_body).unwrap();
        assert_eq!(tenant_json["data"]["id"], tenant_id.to_string());
        assert_eq!(tenant_json["data"]["slug"], format!("rust-tenant-{suffix}"));
        assert_eq!(tenant_json["data"]["status"], "active");
        assert_eq!(tenant_json["data"]["planType"], "starter");

        let quota_response = app
            .clone()
            .oneshot(
                Request::builder()
                    .uri("/api/tenant/quota")
                    .header("authorization", format!("Bearer {token}"))
                    .body(Body::empty())
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(quota_response.status(), StatusCode::OK);
        let quota_body = to_bytes(quota_response.into_body(), usize::MAX).await.unwrap();
        let quota_json: Value = serde_json::from_slice(&quota_body).unwrap();
        assert_eq!(quota_json["data"]["branches"]["current"], 1);
        assert_eq!(quota_json["data"]["employees"]["current"], 1);
        assert_eq!(quota_json["data"]["members"]["current"], 0);

        let update_settings_response = app
            .clone()
            .oneshot(
                Request::builder()
                    .method("PATCH")
                    .uri("/tenant/settings")
                    .header("authorization", format!("Bearer {token}"))
                    .header("content-type", "application/json")
                    .body(Body::from(json!({
                        "branding": {
                            "brandName": "Rust Gym",
                            "appSuffix": { "admin": "Admin" },
                            "colors": { "admin": { "start": "#111111", "end": "#222222" } }
                        }
                    }).to_string()))
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(update_settings_response.status(), StatusCode::OK);

        let branding_response = app
            .clone()
            .oneshot(
                Request::builder()
                    .uri("/tenant/settings/branding")
                    .header("authorization", format!("Bearer {token}"))
                    .body(Body::empty())
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(branding_response.status(), StatusCode::OK);
        let branding_body = to_bytes(branding_response.into_body(), usize::MAX).await.unwrap();
        let branding_json: Value = serde_json::from_slice(&branding_body).unwrap();
        assert_eq!(branding_json["data"]["brandName"], "Rust Gym");
        assert_eq!(branding_json["data"]["appSuffix"]["admin"], "Admin");
        assert_eq!(branding_json["data"]["appSuffix"]["coach"], "Coach");
        assert_eq!(branding_json["data"]["colors"]["admin"]["start"], "#111111");
        assert_eq!(branding_json["data"]["colors"]["member"]["start"], "#30d158");

        let public_branding_response = app
            .clone()
            .oneshot(
                Request::builder()
                    .uri(format!("/api/public/branding?slug=rust-tenant-{suffix}"))
                    .body(Body::empty())
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(public_branding_response.status(), StatusCode::OK);
        let public_branding_body = to_bytes(public_branding_response.into_body(), usize::MAX).await.unwrap();
        let public_branding_json: Value = serde_json::from_slice(&public_branding_body).unwrap();
        assert_eq!(public_branding_json["data"]["brandName"], "Rust Gym");

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
                            "member_id": member_id,
                            "plan_id": plan_id,
                            "branch_id": branch_id,
                            "sales_person_id": employee_id,
                            "contract_status": "ACTIVE",
                            "sign_date": "2026-01-01",
                            "start_date": "2026-01-01",
                            "original_end_date": "2026-12-31",
                            "end_date": "2026-12-31",
                            "total_amount": 3000.0,
                            "paid_amount": 0.0,
                            "payment_status": "UNPAID",
                            "terms_accepted": true
                        })
                        .to_string(),
                    ))
                    .unwrap(),
            )
            .await
            .unwrap();
        let create_status = create_response.status();
        let create_body = to_bytes(create_response.into_body(), usize::MAX).await.unwrap();
        if create_status != StatusCode::CREATED {
            panic!("create contract status {create_status}, body: {}", String::from_utf8_lossy(&create_body));
        }
        let create_json: Value = serde_json::from_slice(&create_body).unwrap();
        let contract_id = create_json["data"]["id"].as_str().unwrap().to_string();
        assert!(create_json["data"]["contract_no"].as_str().unwrap().starts_with('C'));
        assert_eq!(create_json["data"]["contract_status"], "ACTIVE");
        assert_eq!(create_json["data"]["remaining_counts"], 10);

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
        let list_body = to_bytes(list_response.into_body(), usize::MAX).await.unwrap();
        let list_json: Value = serde_json::from_slice(&list_body).unwrap();
        assert_eq!(list_json["data"][0]["plan"]["planType"], "COUNT_BASED");
        assert_eq!(list_json["data"][0]["contract_status"], "ACTIVE");

        let search_sort_response = app
            .clone()
            .oneshot(
                Request::builder()
                    .uri("/api/contracts?search=Rust%20Contract%20Member&sortBy=contract_no&sortOrder=asc&page=1&limit=1")
                    .header("authorization", format!("Bearer {token}"))
                    .body(Body::empty())
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(search_sort_response.status(), StatusCode::OK);
        let search_sort_body = to_bytes(search_sort_response.into_body(), usize::MAX).await.unwrap();
        let search_sort_json: Value = serde_json::from_slice(&search_sort_body).unwrap();
        assert_eq!(search_sort_json["pagination"]["total"], 1);
        assert_eq!(search_sort_json["pagination"]["limit"], 1);
        assert_eq!(search_sort_json["data"][0]["id"], contract_id);
        assert_eq!(search_sort_json["data"][0]["member"]["full_name"], "Rust Contract Member");

        let status_filter_response = app
            .clone()
            .oneshot(
                Request::builder()
                    .uri(format!("/api/contracts?id={contract_id}&contract_status=ACTIVE&limit=1"))
                    .header("authorization", format!("Bearer {token}"))
                    .body(Body::empty())
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(status_filter_response.status(), StatusCode::OK);
        let status_filter_body = to_bytes(status_filter_response.into_body(), usize::MAX).await.unwrap();
        let status_filter_json: Value = serde_json::from_slice(&status_filter_body).unwrap();
        assert_eq!(status_filter_json["pagination"]["total"], 1);

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
        assert_eq!(update_json["data"]["paid_amount"], 1500.0);
        assert_eq!(update_json["data"]["payment_status"], "PARTIAL");

        let draft_response = app
            .clone()
            .oneshot(
                Request::builder()
                    .method("POST")
                    .uri("/api/contracts")
                    .header("authorization", format!("Bearer {token}"))
                    .header("content-type", "application/json")
                    .body(Body::from(
                        json!({
                            "member_id": member_id,
                            "plan_id": plan_id,
                            "branch_id": branch_id,
                            "sales_person_id": employee_id,
                            "contract_status": "DRAFT",
                            "start_date": "2026-02-01",
                            "original_end_date": "2026-08-31",
                            "end_date": "2026-08-31",
                            "total_amount": 1200.0
                        })
                        .to_string(),
                    ))
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(draft_response.status(), StatusCode::CREATED);
        let draft_body = to_bytes(draft_response.into_body(), usize::MAX).await.unwrap();
        let draft_json: Value = serde_json::from_slice(&draft_body).unwrap();
        let draft_contract_id = draft_json["data"]["id"].as_str().unwrap().to_string();

        let activate_response = app
            .clone()
            .oneshot(
                Request::builder()
                    .method("POST")
                    .uri(format!("/api/contracts/{draft_contract_id}/activate"))
                    .header("authorization", format!("Bearer {token}"))
                    .body(Body::empty())
                    .unwrap(),
            )
            .await
            .unwrap();
        let activate_status = activate_response.status();
        let activate_body = to_bytes(activate_response.into_body(), usize::MAX).await.unwrap();
        assert_eq!(activate_status, StatusCode::OK, "activate contract: {}", String::from_utf8_lossy(&activate_body));
        let activate_json: Value = serde_json::from_slice(&activate_body).unwrap();
        assert_eq!(activate_json["data"]["contract_status"], "ACTIVE");

        let pause_response = app
            .clone()
            .oneshot(
                Request::builder()
                    .method("POST")
                    .uri(format!("/api/contracts/{contract_id}/pause"))
                    .header("authorization", format!("Bearer {token}"))
                    .header("content-type", "application/json")
                    .body(Body::from(json!({
                        "startDate": "2026-03-01",
                        "endDate": "2026-03-08",
                        "reason": "Vacation"
                    }).to_string()))
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(pause_response.status(), StatusCode::OK);
        let pause_body = to_bytes(pause_response.into_body(), usize::MAX).await.unwrap();
        let pause_json: Value = serde_json::from_slice(&pause_body).unwrap();
        assert_eq!(pause_json["data"]["contract_status"], "PAUSED");
        assert_eq!(pause_json["data"]["end_date"], "2027-01-07");

        let resume_response = app
            .clone()
            .oneshot(
                Request::builder()
                    .method("POST")
                    .uri(format!("/api/contracts/{contract_id}/resume"))
                    .header("authorization", format!("Bearer {token}"))
                    .body(Body::empty())
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(resume_response.status(), StatusCode::OK);
        let resume_body = to_bytes(resume_response.into_body(), usize::MAX).await.unwrap();
        let resume_json: Value = serde_json::from_slice(&resume_body).unwrap();
        assert_eq!(resume_json["data"]["contract_status"], "ACTIVE");

        let log_create_response = app
            .clone()
            .oneshot(
                Request::builder()
                    .method("POST")
                    .uri("/api/contract-logs")
                    .header("authorization", format!("Bearer {token}"))
                    .header("content-type", "application/json")
                    .body(Body::from(json!({
                        "contractId": contract_id,
                        "logType": "TRANSFER",
                        "startDate": "2026-04-01",
                        "endDate": "2026-04-01",
                        "days": 0,
                        "reason": "Smoke transfer",
                        "originalMemberId": member_id
                    }).to_string()))
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(log_create_response.status(), StatusCode::CREATED);
        let log_create_body = to_bytes(log_create_response.into_body(), usize::MAX).await.unwrap();
        let log_create_json: Value = serde_json::from_slice(&log_create_body).unwrap();
        let explicit_log_id = log_create_json["data"]["id"].as_str().unwrap().to_string();
        assert_eq!(log_create_json["data"]["log_type"], "TRANSFER");
        assert_eq!(log_create_json["data"]["days_affected"], 0);

        let log_list_response = app
            .clone()
            .oneshot(
                Request::builder()
                    .uri(format!("/api/contract-logs?contractId={contract_id}&logType=PAUSE"))
                    .header("authorization", format!("Bearer {token}"))
                    .body(Body::empty())
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(log_list_response.status(), StatusCode::OK);
        let log_list_body = to_bytes(log_list_response.into_body(), usize::MAX).await.unwrap();
        let log_list_json: Value = serde_json::from_slice(&log_list_body).unwrap();
        assert_eq!(log_list_json["pagination"]["total"], 1);
        assert_eq!(log_list_json["data"][0]["log_type"], "PAUSE");
        assert_eq!(log_list_json["data"][0]["days_affected"], 7);
        assert_eq!(log_list_json["data"][0]["reason"], "Vacation");

        let contract_logs_response = app
            .clone()
            .oneshot(
                Request::builder()
                    .uri(format!("/api/contract_logs/contract/{contract_id}"))
                    .header("authorization", format!("Bearer {token}"))
                    .body(Body::empty())
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(contract_logs_response.status(), StatusCode::OK);
        let contract_logs_body = to_bytes(contract_logs_response.into_body(), usize::MAX).await.unwrap();
        let contract_logs_json: Value = serde_json::from_slice(&contract_logs_body).unwrap();
        assert!(contract_logs_json["data"].as_array().unwrap().iter().any(|log| log["log_type"] == "RESUME"));

        let log_get_response = app
            .clone()
            .oneshot(
                Request::builder()
                    .uri(format!("/api/contract-logs/{explicit_log_id}"))
                    .header("authorization", format!("Bearer {token}"))
                    .body(Body::empty())
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(log_get_response.status(), StatusCode::OK);
        let log_get_body = to_bytes(log_get_response.into_body(), usize::MAX).await.unwrap();
        let log_get_json: Value = serde_json::from_slice(&log_get_body).unwrap();
        assert_eq!(log_get_json["data"]["id"], explicit_log_id);
        assert_eq!(log_get_json["data"]["contract"]["id"], contract_id);
        assert_eq!(log_get_json["data"]["member"]["id"], member_id.to_string());

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
        assert_eq!(delete_json["data"]["contract_status"], "TERMINATED");

        let contract_uuid = Uuid::parse_str(&contract_id).unwrap();
        let draft_contract_uuid = Uuid::parse_str(&draft_contract_id).unwrap();
        sqlx::query("delete from contract_logs where contract_id in ($1, $2)")
            .bind(contract_uuid)
            .bind(draft_contract_uuid)
            .execute(&pool)
            .await
            .unwrap();
        sqlx::query("delete from contracts where id = $1")
            .bind(contract_uuid)
            .execute(&pool)
            .await
            .unwrap();
        sqlx::query("delete from contracts where id = $1")
            .bind(draft_contract_uuid)
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
                            "contract_id": contract_id,
                            "amount": 1000.0,
                            "payment_method": "CASH",
                            "payment_type": "INCOME",
                            "payment_date": "2026-01-01",
                            "receipt_no": format!("R{}", &suffix[..8])
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
        assert_eq!(create_json["data"]["payment_type"], "INCOME");
        assert_eq!(create_json["data"]["payment_method"], "CASH");

        let list_response = app
            .clone()
            .oneshot(
                Request::builder()
                    .uri(format!(
                        "/api/payments?id={payment_id}&payment_type=INCOME&start_date=2026-01-01&end_date=2026-01-31"
                    ))
                    .header("authorization", format!("Bearer {token}"))
                    .body(Body::empty())
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(list_response.status(), StatusCode::OK);
        let list_body = to_bytes(list_response.into_body(), usize::MAX).await.unwrap();
        let list_json: Value = serde_json::from_slice(&list_body).unwrap();
        assert_eq!(list_json["pagination"]["total"], 1);

        let receipt_no = format!("R{}", &suffix[..8]);
        let search_sort_response = app
            .clone()
            .oneshot(
                Request::builder()
                    .uri(format!("/api/payments?search={receipt_no}&sortBy=amount&sortOrder=desc&page=1&limit=1"))
                    .header("authorization", format!("Bearer {token}"))
                    .body(Body::empty())
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(search_sort_response.status(), StatusCode::OK);
        let search_sort_body = to_bytes(search_sort_response.into_body(), usize::MAX).await.unwrap();
        let search_sort_json: Value = serde_json::from_slice(&search_sort_body).unwrap();
        assert_eq!(search_sort_json["pagination"]["total"], 1);
        assert_eq!(search_sort_json["pagination"]["limit"], 1);
        assert_eq!(search_sort_json["data"][0]["id"], payment_id);
        assert_eq!(search_sort_json["data"][0]["contract"]["contract_no"], format!("PYC{}", &suffix[..8]));
        assert_eq!(search_sort_json["data"][0]["member"]["full_name"], "Rust Payment Member");

        let summary_response = app
            .clone()
            .oneshot(
                Request::builder()
                    .uri(format!("/api/payments/summary?branchId={branch_id}&startDate=2026-01-01&endDate=2026-01-31"))
                    .header("authorization", format!("Bearer {token}"))
                    .body(Body::empty())
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(summary_response.status(), StatusCode::OK);
        let summary_body = to_bytes(summary_response.into_body(), usize::MAX).await.unwrap();
        let summary_json: Value = serde_json::from_slice(&summary_body).unwrap();
        assert_eq!(summary_json["data"]["totalIncome"], 1000.0);
        assert_eq!(summary_json["data"]["totalRefund"], 0.0);
        assert_eq!(summary_json["data"]["netIncome"], 1000.0);
        assert_eq!(summary_json["data"]["paymentCount"], 1);

        let export_response = app
            .clone()
            .oneshot(
                Request::builder()
                    .uri(format!("/api/payments/export?branchId={branch_id}&startDate=2026-01-01&endDate=2026-01-31&format=csv"))
                    .header("authorization", format!("Bearer {token}"))
                    .body(Body::empty())
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(export_response.status(), StatusCode::OK);
        let export_body = to_bytes(export_response.into_body(), usize::MAX).await.unwrap();
        let export_csv = String::from_utf8_lossy(&export_body);
        assert!(export_csv.contains("receiptNo,memberName,memberCode,amount,paymentMethod,paymentDate,type"));
        assert!(export_csv.contains(&format!("R{}", &suffix[..8])));
        assert!(export_csv.contains("Rust Payment Member"));
        assert!(export_csv.contains(",1000,CASH,2026-01-01,INCOME"));

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
                            "member_id": member_id,
                            "branch_id": branch_id,
                            "contract_id": contract_id,
                            "check_in_type": "ENTRY",
                            "check_in_method": "MANUAL"
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
        assert_eq!(create_json["data"]["branch"]["id"], branch_id.to_string());
        assert_eq!(create_json["data"]["branch"]["name"], format!("Rust Checkin Branch {suffix}"));
        assert_eq!(create_json["data"]["processedBy"]["id"], employee_id.to_string());
        assert_eq!(create_json["data"]["processedBy"]["fullName"], "Rust Checkin User");

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
        let list_body = to_bytes(list_response.into_body(), usize::MAX).await.unwrap();
        let list_json: Value = serde_json::from_slice(&list_body).unwrap();
        assert!(list_json["data"].as_array().unwrap().iter().any(|row| {
            row["id"] == check_in_id
                && row["branch"]["id"] == branch_id.to_string()
                && row["processedBy"]["id"] == employee_id.to_string()
        }));

        let stats_response = app
            .clone()
            .oneshot(
                Request::builder()
                    .uri(format!("/api/check-ins/stats/today?branchId={branch_id}"))
                    .header("authorization", format!("Bearer {token}"))
                    .body(Body::empty())
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(stats_response.status(), StatusCode::OK);
        let stats_body = to_bytes(stats_response.into_body(), usize::MAX).await.unwrap();
        let stats_json: Value = serde_json::from_slice(&stats_body).unwrap();
        assert_eq!(stats_json["data"]["total"], 1);
        assert_eq!(stats_json["data"]["uniqueMembers"], 1);
        assert!(stats_json["data"]["hourlyBreakdown"].as_array().unwrap().iter().any(|row| {
            row["count"] == 1
        }));

        let get_response = app
            .clone()
            .oneshot(
                Request::builder()
                    .uri(format!("/api/check-ins/{check_in_id}"))
                    .header("authorization", format!("Bearer {token}"))
                    .body(Body::empty())
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(get_response.status(), StatusCode::OK);
        let get_body = to_bytes(get_response.into_body(), usize::MAX).await.unwrap();
        let get_json: Value = serde_json::from_slice(&get_body).unwrap();
        assert_eq!(get_json["data"]["branch"]["id"], branch_id.to_string());
        assert_eq!(get_json["data"]["processedBy"]["fullName"], "Rust Checkin User");

        let branch_list_response = app
            .clone()
            .oneshot(
                Request::builder()
                    .uri("/api/branches?status=active")
                    .header("authorization", format!("Bearer {token}"))
                    .body(Body::empty())
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(branch_list_response.status(), StatusCode::OK);
        let branch_list_body = to_bytes(branch_list_response.into_body(), usize::MAX).await.unwrap();
        let branch_list_json: Value = serde_json::from_slice(&branch_list_body).unwrap();
        assert!(branch_list_json["data"].as_array().unwrap().iter().any(|branch| {
            branch["id"] == branch_id.to_string()
        }));

        let branch_get_response = app
            .clone()
            .oneshot(
                Request::builder()
                    .uri(format!("/api/branches/{branch_id}"))
                    .header("authorization", format!("Bearer {token}"))
                    .body(Body::empty())
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(branch_get_response.status(), StatusCode::OK);

        let branch_create_response = app
            .clone()
            .oneshot(
                Request::builder()
                    .method("POST")
                    .uri("/api/branches")
                    .header("authorization", format!("Bearer {token}"))
                    .header("content-type", "application/json")
                    .body(Body::from(
                        json!({
                            "name": format!("Rust Checkin Secondary {suffix}"),
                            "code": format!("CIS{}", &suffix[..8]),
                            "type": "BRANCH",
                            "address": "Rust Street"
                        })
                        .to_string(),
                    ))
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(branch_create_response.status(), StatusCode::CREATED);
        let branch_create_body = to_bytes(branch_create_response.into_body(), usize::MAX).await.unwrap();
        let branch_create_json: Value = serde_json::from_slice(&branch_create_body).unwrap();
        let created_branch_id = branch_create_json["data"]["id"].as_str().unwrap().to_string();

        let branch_update_response = app
            .clone()
            .oneshot(
                Request::builder()
                    .method("PATCH")
                    .uri(format!("/api/branches/{created_branch_id}"))
                    .header("authorization", format!("Bearer {token}"))
                    .header("content-type", "application/json")
                    .body(Body::from(json!({"phone": "0223456789"}).to_string()))
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(branch_update_response.status(), StatusCode::OK);
        let branch_update_body = to_bytes(branch_update_response.into_body(), usize::MAX).await.unwrap();
        let branch_update_json: Value = serde_json::from_slice(&branch_update_body).unwrap();
        assert_eq!(branch_update_json["data"]["phone"], "0223456789");

        let branch_delete_response = app
            .clone()
            .oneshot(
                Request::builder()
                    .method("DELETE")
                    .uri(format!("/api/branches/{created_branch_id}"))
                    .header("authorization", format!("Bearer {token}"))
                    .body(Body::empty())
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(branch_delete_response.status(), StatusCode::OK);

        let qr_response = app
            .clone()
            .oneshot(
                Request::builder()
                    .method("POST")
                    .uri("/api/admin/checkin/qr-verify")
                    .header("authorization", format!("Bearer {token}"))
                    .header("content-type", "application/json")
                    .body(Body::from(
                        json!({
                            "payload": {
                                "m": format!("CIM{}", &suffix[..8]),
                                "t": chrono::Utc::now().timestamp_millis(),
                                "c": contract_id.to_string()
                            },
                            "branch_id": branch_id,
                            "verified_by": employee_id
                        })
                        .to_string(),
                    ))
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(qr_response.status(), StatusCode::OK);
        let qr_body = to_bytes(qr_response.into_body(), usize::MAX).await.unwrap();
        let qr_json: Value = serde_json::from_slice(&qr_body).unwrap();
        let qr_check_in_id = qr_json["checkin_id"].as_str().unwrap().to_string();
        assert_eq!(qr_json["success"], true);
        assert_eq!(qr_json["member"]["id"], member_id.to_string());
        assert_eq!(qr_json["contract"]["remaining_counts"], 3);

        let remaining_after_qr: i32 = sqlx::query_scalar("select remaining_counts from contracts where id = $1")
            .bind(contract_id)
            .fetch_one(&pool)
            .await
            .unwrap();
        assert_eq!(remaining_after_qr, 3);

        let created_branch_uuid = Uuid::parse_str(&created_branch_id).unwrap();
        let check_in_uuid = Uuid::parse_str(&check_in_id).unwrap();
        let qr_check_in_uuid = Uuid::parse_str(&qr_check_in_id).unwrap();
        sqlx::query("delete from check_ins where id = $1").bind(qr_check_in_uuid).execute(&pool).await.unwrap();
        sqlx::query("delete from check_ins where id = $1").bind(check_in_uuid).execute(&pool).await.unwrap();
        sqlx::query("delete from contracts where id = $1").bind(contract_id).execute(&pool).await.unwrap();
        sqlx::query("delete from membership_plans where id = $1").bind(plan_id).execute(&pool).await.unwrap();
        sqlx::query("delete from members where id = $1").bind(member_id).execute(&pool).await.unwrap();
        sqlx::query("delete from employees where id = $1").bind(employee_id).execute(&pool).await.unwrap();
        sqlx::query("delete from users where id = $1").bind(user_id).execute(&pool).await.unwrap();
        sqlx::query("delete from job_titles where id = $1").bind(job_title_id).execute(&pool).await.unwrap();
        sqlx::query("delete from branches where id = $1").bind(created_branch_uuid).execute(&pool).await.unwrap();
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
        let category_id = Uuid::new_v4();
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

        sqlx::query("insert into class_categories (id, tenant_id, code, name, color, status, is_active) values ($1, $2, 'yoga', 'Yoga', '#123456', 'published', true)")
            .bind(category_id)
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
                            "duration_minutes": 60,
                            "max_capacity": 12,
                            "instructor_id": employee_id,
                            "branch_id": branch_id,
                            "category_id": category_id,
                            "difficulty_level": "BEGINNER",
                            "requires_count": true,
                            "count_deduction": 1
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
        assert_eq!(create_json["data"]["branch_id"], branch_id.to_string());
        assert_eq!(create_json["data"]["duration_minutes"], 60);

        let list_response = app
            .clone()
            .oneshot(
                Request::builder()
                    .uri(format!("/api/classes?is_active=true&category_id={category_id}&branch_id={branch_id}&search=Rust&page=1&limit=1"))
                    .header("authorization", format!("Bearer {token}"))
                    .body(Body::empty())
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(list_response.status(), StatusCode::OK);
        let list_body = to_bytes(list_response.into_body(), usize::MAX).await.unwrap();
        let list_json: Value = serde_json::from_slice(&list_body).unwrap();
        assert!(list_json["data"].as_array().unwrap().iter().any(|row| {
            row["id"] == class_id
                && row["is_active"] == true
                && row["category"] == "yoga"
                && row["category_id"] == category_id.to_string()
                && row["class_category"]["name"] == "Yoga"
                && row["branch"]["id"] == branch_id.to_string()
                && row["instructor"]["id"] == employee_id.to_string()
        }));
        assert_eq!(list_json["pagination"]["limit"], 1);

        let update_response = app
            .clone()
            .oneshot(
                Request::builder()
                    .method("PATCH")
                    .uri(format!("/api/classes/{class_id}"))
                    .header("authorization", format!("Bearer {token}"))
                    .header("content-type", "application/json")
                    .body(Body::from(json!({"max_capacity": 20}).to_string()))
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(update_response.status(), StatusCode::OK);
        let update_body = to_bytes(update_response.into_body(), usize::MAX).await.unwrap();
        let update_json: Value = serde_json::from_slice(&update_body).unwrap();
        assert_eq!(update_json["data"]["max_capacity"], 20);

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
        assert_eq!(delete_json["data"]["is_active"], false);

        let class_uuid = Uuid::parse_str(&class_id).unwrap();
        sqlx::query("delete from classes where id = $1").bind(class_uuid).execute(&pool).await.unwrap();
        sqlx::query("delete from class_categories where id = $1").bind(category_id).execute(&pool).await.unwrap();
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
        let waitlist_member_id = Uuid::new_v4();
        let plan_id = Uuid::new_v4();
        let contract_id = Uuid::new_v4();
        let waitlist_contract_id = Uuid::new_v4();
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
        sqlx::query("insert into members (id, member_code, full_name, phone, branch_id, sales_person_id, status, join_date, tenant_id) values ($1, $2, 'Rust Booking Waitlist Member', '0912345679', $3, $4, 'ACTIVE', '2026-01-01'::date, $5)")
            .bind(waitlist_member_id)
            .bind(format!("BKW{}", &suffix[..8]))
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
        sqlx::query("insert into contracts (id, contract_no, member_id, plan_id, branch_id, sales_person_id, status, start_date, original_end_date, end_date, remaining_counts, total_amount, paid_amount, payment_status, terms_accepted, created_by, tenant_id) values ($1, $2, $3, $4, $5, $6, 'ACTIVE', '2026-01-01'::date, '2026-12-31'::date, '2026-12-31'::date, 5, 3000, 3000, 'PAID', true, $6, $7)")
            .bind(waitlist_contract_id)
            .bind(format!("BKW{}", &suffix[..8]))
            .bind(waitlist_member_id)
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
        let schedule_id = Uuid::new_v4();
        sqlx::query("insert into class_schedules (id, class_id, branch_id, instructor_id, day_of_week, start_time, end_time, room, max_capacity, is_recurring, valid_from, valid_until) values ($1, $2, $3, $4, 1, '08:00'::time, '09:00'::time, 'B', 2, true, '2026-02-01'::date, '2026-02-28'::date)")
            .bind(schedule_id)
            .bind(class_id)
            .bind(branch_id)
            .bind(employee_id)
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
                .uri("/api/class_sessions")
                .header("authorization", format!("Bearer {token}"))
                .header("content-type", "application/json")
                .body(Body::from(json!({
                    "class_id": class_id,
                    "branch_id": branch_id,
                    "instructor_id": employee_id,
                    "session_date": "2026-02-01",
                    "start_time": "10:00:00",
                    "end_time": "11:00:00",
                    "max_capacity": 2
                }).to_string()))
                .unwrap(),
        ).await.unwrap();
        assert_eq!(session_response.status(), StatusCode::CREATED);
        let session_body = to_bytes(session_response.into_body(), usize::MAX).await.unwrap();
        let session_json: Value = serde_json::from_slice(&session_body).unwrap();
        let session_id = session_json["data"]["id"].as_str().unwrap().to_string();

        let get_schedule_response = app.clone().oneshot(
            Request::builder()
                .uri(format!("/api/class_schedules/{schedule_id}"))
                .header("authorization", format!("Bearer {token}"))
                .body(Body::empty())
                .unwrap(),
        ).await.unwrap();
        assert_eq!(get_schedule_response.status(), StatusCode::OK);

        let update_schedule_response = app.clone().oneshot(
            Request::builder()
                .method("PATCH")
                .uri(format!("/api/class_schedules/{schedule_id}"))
                .header("authorization", format!("Bearer {token}"))
                .header("content-type", "application/json")
                .body(Body::from(json!({
                    "room": "Legacy Room",
                    "max_capacity": 3
                }).to_string()))
                .unwrap(),
        ).await.unwrap();
        assert_eq!(update_schedule_response.status(), StatusCode::OK);
        let update_schedule_body = to_bytes(update_schedule_response.into_body(), usize::MAX).await.unwrap();
        let update_schedule_json: Value = serde_json::from_slice(&update_schedule_body).unwrap();
        assert_eq!(update_schedule_json["data"]["room"], "Legacy Room");
        assert_eq!(update_schedule_json["data"]["max_capacity"], 3);

        let get_session_response = app.clone().oneshot(
            Request::builder()
                .uri(format!("/api/class-sessions/{session_id}"))
                .header("authorization", format!("Bearer {token}"))
                .body(Body::empty())
                .unwrap(),
        ).await.unwrap();
        assert_eq!(get_session_response.status(), StatusCode::OK);

        let update_session_response = app.clone().oneshot(
            Request::builder()
                .method("PATCH")
                .uri(format!("/api/class_sessions/{session_id}"))
                .header("authorization", format!("Bearer {token}"))
                .header("content-type", "application/json")
                .body(Body::from(json!({
                    "room": "Updated Session Room",
                    "session_status": "SCHEDULED",
                    "max_capacity": 4
                }).to_string()))
                .unwrap(),
        ).await.unwrap();
        assert_eq!(update_session_response.status(), StatusCode::OK);
        let update_session_body = to_bytes(update_session_response.into_body(), usize::MAX).await.unwrap();
        let update_session_json: Value = serde_json::from_slice(&update_session_body).unwrap();
        assert_eq!(update_session_json["data"]["room"], "Updated Session Room");
        assert_eq!(update_session_json["data"]["max_capacity"], 4);

        let session_list_response = app.clone().oneshot(
            Request::builder()
                .uri(format!(
                    "/api/class_sessions?branch_id={branch_id}&instructor_id={employee_id}&session_status=SCHEDULED&start_date=2026-02-01&end_date=2026-02-01"
                ))
                .header("authorization", format!("Bearer {token}"))
                .body(Body::empty())
                .unwrap(),
        ).await.unwrap();
        assert_eq!(session_list_response.status(), StatusCode::OK);
        let session_list_body = to_bytes(session_list_response.into_body(), usize::MAX).await.unwrap();
        let session_list_json: Value = serde_json::from_slice(&session_list_body).unwrap();
        assert!(session_list_json["data"].as_array().unwrap().iter().any(|row| {
            row["id"] == session_id
                && row["session_date"] == "2026-02-01"
                && row["session_status"] == "SCHEDULED"
                && row["current_count"].as_i64().is_some()
                && row["class"]["id"] == class_id.to_string()
                && row["instructor"]["id"] == employee_id.to_string()
        }));

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

        let update_booking_response = app.clone().oneshot(
            Request::builder()
                .method("PATCH")
                .uri(format!("/api/bookings/{booking_id}"))
                .header("authorization", format!("Bearer {token}"))
                .header("content-type", "application/json")
                .body(Body::from(json!({
                    "booking_status": "WAITLIST",
                    "waitlist_position": 1
                }).to_string()))
                .unwrap(),
        ).await.unwrap();
        assert_eq!(update_booking_response.status(), StatusCode::OK);
        let update_booking_body = to_bytes(update_booking_response.into_body(), usize::MAX).await.unwrap();
        let update_booking_json: Value = serde_json::from_slice(&update_booking_body).unwrap();
        assert_eq!(update_booking_json["data"]["booking_status"], "WAITLIST");
        assert_eq!(update_booking_json["data"]["waitlist_position"], 1);

        let current_count: i32 = sqlx::query_scalar("select current_count from class_sessions where id = $1")
            .bind(session_uuid).fetch_one(&pool).await.unwrap();
        assert_eq!(current_count, 0);

        let confirm_booking_response = app.clone().oneshot(
            Request::builder()
                .method("PATCH")
                .uri(format!("/api/bookings/{booking_id}"))
                .header("authorization", format!("Bearer {token}"))
                .header("content-type", "application/json")
                .body(Body::from(json!({
                    "bookingStatus": "CONFIRMED",
                    "waitlistPosition": null
                }).to_string()))
                .unwrap(),
        ).await.unwrap();
        assert_eq!(confirm_booking_response.status(), StatusCode::OK);
        let confirm_booking_body = to_bytes(confirm_booking_response.into_body(), usize::MAX).await.unwrap();
        let confirm_booking_json: Value = serde_json::from_slice(&confirm_booking_body).unwrap();
        assert_eq!(confirm_booking_json["data"]["booking_status"], "CONFIRMED");
        assert!(confirm_booking_json["data"]["waitlist_position"].is_null());

        let booking_list_response = app.clone().oneshot(
            Request::builder()
                .uri(format!(
                    "/api/bookings?booking_status=CONFIRMED,WAITLIST&branch_id={branch_id}&start_date=2026-02-01&end_date=2026-02-01&page=1&limit=1"
                ))
                .header("authorization", format!("Bearer {token}"))
                .body(Body::empty())
                .unwrap(),
        ).await.unwrap();
        assert_eq!(booking_list_response.status(), StatusCode::OK);
        let booking_list_body = to_bytes(booking_list_response.into_body(), usize::MAX).await.unwrap();
        let booking_list_json: Value = serde_json::from_slice(&booking_list_body).unwrap();
        assert!(booking_list_json["data"].as_array().unwrap().iter().any(|row| {
            row["id"] == booking_id
                && row["booking_status"] == "CONFIRMED"
                && row["booked_at"].as_str().is_some()
                && row["member"]["id"] == member_id.to_string()
                && row["session"]["id"] == session_id
                && row["session"]["branch"]["id"] == branch_id.to_string()
                && row["session"]["class"]["id"] == class_id.to_string()
        }));
        assert_eq!(booking_list_json["pagination"]["limit"], 1);

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

        let generate_response = app.clone().oneshot(
            Request::builder()
                .method("POST")
                .uri("/api/admin/classes/generate-sessions")
                .header("authorization", format!("Bearer {token}"))
                .header("content-type", "application/json")
                .body(Body::from(json!({
                    "branch_id": branch_id,
                    "start_date": "2026-02-02",
                    "end_date": "2026-02-02"
                }).to_string()))
                .unwrap(),
        ).await.unwrap();
        assert_eq!(generate_response.status(), StatusCode::OK);
        let generate_body = to_bytes(generate_response.into_body(), usize::MAX).await.unwrap();
        let generate_json: Value = serde_json::from_slice(&generate_body).unwrap();
        assert_eq!(generate_json["created"], 1);

        let generated_session_id: Uuid = sqlx::query_scalar("select id from class_sessions where schedule_id = $1 and session_date = '2026-02-02'::date")
            .bind(schedule_id).fetch_one(&pool).await.unwrap();
        let admin_book_response = app.clone().oneshot(
            Request::builder()
                .method("POST")
                .uri("/api/admin/classes/book")
                .header("authorization", format!("Bearer {token}"))
                .header("content-type", "application/json")
                .body(Body::from(json!({
                    "session_id": generated_session_id,
                    "member_id": member_id,
                    "contract_id": contract_id
                }).to_string()))
                .unwrap(),
        ).await.unwrap();
        assert_eq!(admin_book_response.status(), StatusCode::OK);
        let admin_book_body = to_bytes(admin_book_response.into_body(), usize::MAX).await.unwrap();
        let admin_book_json: Value = serde_json::from_slice(&admin_book_body).unwrap();
        let admin_booking_id = admin_book_json["booking_id"].as_str().unwrap().to_string();
        assert_eq!(admin_book_json["booking_status"], "CONFIRMED");

        let attend_response = app.clone().oneshot(
            Request::builder()
                .method("POST")
                .uri("/api/admin/classes/attend")
                .header("authorization", format!("Bearer {token}"))
                .header("content-type", "application/json")
                .body(Body::from(json!({ "booking_id": admin_booking_id }).to_string()))
                .unwrap(),
        ).await.unwrap();
        assert_eq!(attend_response.status(), StatusCode::OK);
        let attend_body = to_bytes(attend_response.into_body(), usize::MAX).await.unwrap();
        let attend_json: Value = serde_json::from_slice(&attend_body).unwrap();
        assert_eq!(attend_json["remaining_counts"], 4);

        let admin_cancel_response = app.clone().oneshot(
            Request::builder()
                .method("POST")
                .uri("/api/admin/classes/cancel-booking")
                .header("authorization", format!("Bearer {token}"))
                .header("content-type", "application/json")
                .body(Body::from(json!({ "booking_id": admin_booking_id, "reason": "test" }).to_string()))
                .unwrap(),
        ).await.unwrap();
        assert_eq!(admin_cancel_response.status(), StatusCode::OK);

        let promotion_session_id = Uuid::new_v4();
        let confirmed_booking_id = Uuid::new_v4();
        let waitlist_booking_id = Uuid::new_v4();
        sqlx::query("insert into class_sessions (id, class_id, branch_id, instructor_id, session_date, start_time, end_time, room, max_capacity, current_count, waitlist_count, session_status) values ($1, $2, $3, $4, '2026-02-03'::date, '10:00'::time, '11:00'::time, 'C', 1, 1, 1, 'SCHEDULED')")
            .bind(promotion_session_id)
            .bind(class_id)
            .bind(branch_id)
            .bind(employee_id)
            .execute(&pool)
            .await
            .unwrap();
        sqlx::query("insert into bookings (id, session_id, member_id, contract_id, booking_status) values ($1, $2, $3, $4, 'CONFIRMED')")
            .bind(confirmed_booking_id)
            .bind(promotion_session_id)
            .bind(member_id)
            .bind(contract_id)
            .execute(&pool)
            .await
            .unwrap();
        sqlx::query("insert into bookings (id, session_id, member_id, contract_id, booking_status, waitlist_position) values ($1, $2, $3, $4, 'WAITLIST', 1)")
            .bind(waitlist_booking_id)
            .bind(promotion_session_id)
            .bind(waitlist_member_id)
            .bind(waitlist_contract_id)
            .execute(&pool)
            .await
            .unwrap();

        let legacy_cancel_response = app.clone().oneshot(
            Request::builder()
                .method("POST")
                .uri(format!("/api/bookings/{confirmed_booking_id}/cancel"))
                .header("authorization", format!("Bearer {token}"))
                .header("content-type", "application/json")
                .body(Body::from(json!({ "reason": "promote waitlist" }).to_string()))
                .unwrap(),
        ).await.unwrap();
        assert_eq!(legacy_cancel_response.status(), StatusCode::OK);
        let legacy_cancel_body = to_bytes(legacy_cancel_response.into_body(), usize::MAX).await.unwrap();
        let legacy_cancel_json: Value = serde_json::from_slice(&legacy_cancel_body).unwrap();
        assert_eq!(legacy_cancel_json["promoted_booking_id"], waitlist_booking_id.to_string());
        assert_eq!(legacy_cancel_json["promoted_member_id"], waitlist_member_id.to_string());

        let promoted: (String, Option<i32>) = sqlx::query_as("select booking_status, waitlist_position from bookings where id = $1")
            .bind(waitlist_booking_id)
            .fetch_one(&pool)
            .await
            .unwrap();
        assert_eq!(promoted.0, "CONFIRMED");
        assert!(promoted.1.is_none());
        let promotion_counts: (i32, i32) = sqlx::query_as("select current_count, waitlist_count from class_sessions where id = $1")
            .bind(promotion_session_id)
            .fetch_one(&pool)
            .await
            .unwrap();
        assert_eq!(promotion_counts, (1, 0));

        let legacy_attend_response = app.clone().oneshot(
            Request::builder()
                .method("POST")
                .uri(format!("/api/bookings/{waitlist_booking_id}/attend"))
                .header("authorization", format!("Bearer {token}"))
                .body(Body::empty())
                .unwrap(),
        ).await.unwrap();
        assert_eq!(legacy_attend_response.status(), StatusCode::OK);
        let legacy_attend_body = to_bytes(legacy_attend_response.into_body(), usize::MAX).await.unwrap();
        let legacy_attend_json: Value = serde_json::from_slice(&legacy_attend_body).unwrap();
        assert_eq!(legacy_attend_json["remaining_counts"], 4);

        let duplicate_attend_response = app.clone().oneshot(
            Request::builder()
                .method("POST")
                .uri(format!("/api/bookings/{waitlist_booking_id}/attend"))
                .header("authorization", format!("Bearer {token}"))
                .body(Body::empty())
                .unwrap(),
        ).await.unwrap();
        assert_eq!(duplicate_attend_response.status(), StatusCode::BAD_REQUEST);

        let booking_uuid = Uuid::parse_str(&booking_id).unwrap();
        let admin_booking_uuid = Uuid::parse_str(&admin_booking_id).unwrap();
        sqlx::query("delete from bookings where id = $1").bind(waitlist_booking_id).execute(&pool).await.unwrap();
        sqlx::query("delete from bookings where id = $1").bind(confirmed_booking_id).execute(&pool).await.unwrap();
        sqlx::query("delete from bookings where id = $1").bind(admin_booking_uuid).execute(&pool).await.unwrap();
        sqlx::query("delete from bookings where id = $1").bind(booking_uuid).execute(&pool).await.unwrap();
        sqlx::query("delete from class_sessions where id = $1").bind(promotion_session_id).execute(&pool).await.unwrap();
        sqlx::query("delete from class_sessions where id = $1").bind(generated_session_id).execute(&pool).await.unwrap();
        sqlx::query("delete from class_sessions where id = $1").bind(session_uuid).execute(&pool).await.unwrap();
        sqlx::query("delete from class_schedules where id = $1").bind(schedule_id).execute(&pool).await.unwrap();
        sqlx::query("delete from classes where id = $1").bind(class_id).execute(&pool).await.unwrap();
        sqlx::query("delete from contracts where id = $1").bind(waitlist_contract_id).execute(&pool).await.unwrap();
        sqlx::query("delete from contracts where id = $1").bind(contract_id).execute(&pool).await.unwrap();
        sqlx::query("delete from membership_plans where id = $1").bind(plan_id).execute(&pool).await.unwrap();
        sqlx::query("delete from members where id = $1").bind(waitlist_member_id).execute(&pool).await.unwrap();
        sqlx::query("delete from members where id = $1").bind(member_id).execute(&pool).await.unwrap();
        sqlx::query("delete from employees where id = $1").bind(employee_id).execute(&pool).await.unwrap();
        sqlx::query("delete from users where id = $1").bind(user_id).execute(&pool).await.unwrap();
        sqlx::query("delete from job_titles where id = $1").bind(job_title_id).execute(&pool).await.unwrap();
        sqlx::query("delete from branches where id = $1").bind(branch_id).execute(&pool).await.unwrap();
        sqlx::query("delete from tenants where id = $1").bind(tenant_id).execute(&pool).await.unwrap();
    }

    #[tokio::test]
    async fn dashboard_reports_smoke_with_seed_data() {
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
        let payment_id = Uuid::new_v4();
        let check_in_id = Uuid::new_v4();
        let class_id = Uuid::new_v4();
        let session_id = Uuid::new_v4();
        let booking_id = Uuid::new_v4();
        let review_id = Uuid::new_v4();
        let suffix = user_id.simple().to_string();
        let email = format!("rust-report-{suffix}@example.com");
        let password = "Passw0rd!";
        let password_hash = hash(password, 4).unwrap();

        sqlx::query("insert into tenants (id, name, slug, email, status) values ($1, $2, $3, $4, 'ACTIVE')")
            .bind(tenant_id).bind(format!("Rust Report Tenant {suffix}"))
            .bind(format!("rust-report-tenant-{suffix}"))
            .bind(format!("report-tenant-{suffix}@example.com"))
            .execute(&pool).await.unwrap();
        sqlx::query("insert into branches (id, name, code, type, tenant_id, status) values ($1, $2, $3, 'MAIN', $4, 'ACTIVE')")
            .bind(branch_id).bind(format!("Rust Report Branch {suffix}"))
            .bind(format!("RPB{}", &suffix[..8])).bind(tenant_id)
            .execute(&pool).await.unwrap();
        sqlx::query("insert into job_titles (id, name, code, permissions_config, tenant_id) values ($1, $2, $3, '{\"reports\":[\"read\"]}'::jsonb, $4)")
            .bind(job_title_id).bind(format!("Rust Report Admin {suffix}"))
            .bind(format!("RPA{}", &suffix[..8])).bind(tenant_id)
            .execute(&pool).await.unwrap();
        sqlx::query("insert into users (id, email, password_hash, role, tenant_id, is_active, email_verified) values ($1, $2, $3, 'ADMIN', $4, true, true)")
            .bind(user_id).bind(&email).bind(password_hash).bind(tenant_id)
            .execute(&pool).await.unwrap();
        sqlx::query("insert into employees (id, user_id, branch_id, job_title_id, employee_code, full_name, email, status, employment_type, hire_date, tenant_id) values ($1, $2, $3, $4, $5, 'Rust Report Admin', $6, 'ACTIVE', 'FULL_TIME', '2026-01-01'::date, $7)")
            .bind(employee_id).bind(user_id).bind(branch_id).bind(job_title_id)
            .bind(format!("RPE{}", &suffix[..8])).bind(&email).bind(tenant_id)
            .execute(&pool).await.unwrap();
        sqlx::query("insert into members (id, member_code, full_name, phone, branch_id, sales_person_id, status, join_date, tenant_id) values ($1, $2, 'Rust Report Member', '0912345678', $3, $4, 'ACTIVE', current_date, $5)")
            .bind(member_id).bind(format!("RPM{}", &suffix[..8])).bind(branch_id).bind(employee_id).bind(tenant_id)
            .execute(&pool).await.unwrap();
        sqlx::query("insert into membership_plans (id, name, code, type, duration_months, price, allow_pause, allow_transfer, is_active, tenant_id, branch_id) values ($1, 'Rust Report Plan', $2, 'TIME_BASED', 12, 3000, false, false, true, $3, $4)")
            .bind(plan_id).bind(format!("RPP{}", &suffix[..8])).bind(tenant_id).bind(branch_id)
            .execute(&pool).await.unwrap();
        sqlx::query("insert into contracts (id, contract_no, member_id, plan_id, branch_id, sales_person_id, status, start_date, original_end_date, end_date, total_amount, paid_amount, payment_status, terms_accepted, created_by, tenant_id) values ($1, $2, $3, $4, $5, $6, 'ACTIVE', current_date, current_date + interval '30 days', current_date + interval '30 days', 3000, 3000, 'PAID', true, $6, $7)")
            .bind(contract_id).bind(format!("RPC{}", &suffix[..8])).bind(member_id).bind(plan_id).bind(branch_id).bind(employee_id).bind(tenant_id)
            .execute(&pool).await.unwrap();
        sqlx::query("insert into payments (id, contract_id, member_id, branch_id, amount, payment_method, payment_date, type, created_by, tenant_id) values ($1, $2, $3, $4, 3000, 'CASH', now(), 'INCOME', $5, $6)")
            .bind(payment_id).bind(contract_id).bind(member_id).bind(branch_id).bind(employee_id).bind(tenant_id)
            .execute(&pool).await.unwrap();
        sqlx::query("insert into check_ins (id, member_id, branch_id, contract_id, check_in_time, check_in_type, check_in_method, processed_by_id) values ($1, $2, $3, $4, now(), 'ENTRY', 'MANUAL', $5)")
            .bind(check_in_id).bind(member_id).bind(branch_id).bind(contract_id).bind(employee_id)
            .execute(&pool).await.unwrap();
        sqlx::query("insert into classes (id, name, duration_minutes, max_capacity, instructor_id, branch_id, category, is_active) values ($1, 'Rust Report Class', 60, 20, $2, $3, 'YOGA', true)")
            .bind(class_id).bind(employee_id).bind(branch_id)
            .execute(&pool).await.unwrap();
        sqlx::query("insert into class_sessions (id, class_id, branch_id, instructor_id, session_date, start_time, end_time, room, max_capacity, current_count, session_status) values ($1, $2, $3, $4, current_date, '09:00'::time, '10:00'::time, 'A', 20, 1, 'COMPLETED')")
            .bind(session_id).bind(class_id).bind(branch_id).bind(employee_id)
            .execute(&pool).await.unwrap();
        sqlx::query("insert into bookings (id, session_id, member_id, contract_id, booking_status, attended_at) values ($1, $2, $3, $4, 'ATTENDED', now())")
            .bind(booking_id).bind(session_id).bind(member_id).bind(contract_id)
            .execute(&pool).await.unwrap();
        sqlx::query("insert into class_reviews (id, member_id, class_id, session_id, booking_id, coach_id, rating, comment, tenant_id) values ($1, $2, $3, $4, $5, $6, 5, 'Great', $7)")
            .bind(review_id).bind(member_id).bind(class_id).bind(session_id).bind(booking_id).bind(employee_id).bind(tenant_id)
            .execute(&pool).await.unwrap();

        let app = build_app(AppState { db: pool.clone(), jwt_secret: "test-secret".into(), jwt_ttl_seconds: 3600 });
        let login_response = app.clone().oneshot(
            Request::builder().method("POST").uri("/api/auth/login")
                .header("content-type", "application/json")
                .body(Body::from(json!({"email": email, "password": password}).to_string())).unwrap()
        ).await.unwrap();
        assert_eq!(login_response.status(), StatusCode::OK);
        let login_body = to_bytes(login_response.into_body(), usize::MAX).await.unwrap();
        let login_json: Value = serde_json::from_slice(&login_body).unwrap();
        let token = login_json["data"]["token"].as_str().unwrap();

        for uri in [
            "/api/admin/dashboard/kpis?days=30",
            "/api/admin/dashboard/contract-alerts?days_ahead=45&limit=10",
            "/api/admin/dashboard/revenue-targets",
            "/api/admin/dashboard/export?type=kpis&format=csv&days=30",
            "/api/admin/analytics/member-demographics?days=30",
            "/api/admin/analytics/contract-analytics?days=30",
            "/api/admin/analytics/revenue-breakdown?days=30",
            "/api/admin/analytics/checkin-heatmap?weeks=4",
            "/api/admin/reports/member-growth?days=30",
            "/api/gym/analytics/api-stats?timeRange=24h",
            "/api/reports/revenue?days=30",
            "/api/reports/revenue/export?days=30&format=csv",
            "/api/reports/member-growth?days=30",
            "/api/reports/member-growth/export?days=30&format=csv",
            "/api/reports/contract-expiry?days=45",
            "/api/reports/contract-expiry/export?days=45&format=csv",
            "/api/reports/member-activity?days=30",
            "/api/reports/member-activity/export?days=30&format=csv",
            "/api/reports/branch-performance?period=month",
            "/api/reports/coach-performance?period=month",
            "/api/reports/branch-performance/export?period=month&format=csv",
            "/api/reports/coach-performance/export?period=month&format=csv",
        ] {
            let response = app.clone().oneshot(
                Request::builder().uri(uri)
                    .header("authorization", format!("Bearer {token}"))
                    .body(Body::empty()).unwrap()
            ).await.unwrap();
            assert_eq!(response.status(), StatusCode::OK, "{uri}");
            if uri.starts_with("/api/admin/dashboard/kpis") {
                let body = to_bytes(response.into_body(), usize::MAX).await.unwrap();
                let json: Value = serde_json::from_slice(&body).unwrap();
                assert_eq!(json["success"], true);
                assert!(json["revenue"]["period"].as_f64().unwrap() >= 3000.0);
                assert!(json["operations"]["today_checkins"].as_i64().unwrap() >= 1);
                let hourly_distribution = json["operations"]["hourly_distribution"].as_array().unwrap();
                assert_eq!(hourly_distribution.len(), 24);
                assert!(hourly_distribution.iter().any(|hour| hour.as_i64().unwrap() >= 1));
            }
            else if uri.starts_with("/api/admin/analytics/member-demographics") {
                let body = to_bytes(response.into_body(), usize::MAX).await.unwrap();
                let json: Value = serde_json::from_slice(&body).unwrap();
                assert_eq!(json["success"], true);
                assert!(json["data"]["status_distribution"].as_array().unwrap().iter().any(|row| {
                    row["status"] == "ACTIVE" && row["count"].as_i64().unwrap() >= 1
                }));
                assert!(json["data"]["gender_distribution"].as_array().is_some());
                assert!(json["data"]["age_distribution"].as_array().is_some());
            }
            else if uri.starts_with("/api/admin/analytics/contract-analytics") {
                let body = to_bytes(response.into_body(), usize::MAX).await.unwrap();
                let json: Value = serde_json::from_slice(&body).unwrap();
                assert_eq!(json["success"], true);
                assert!(json["data"]["type_distribution"].as_array().unwrap().iter().any(|row| {
                    row["contract_type"] == "TIME_BASED" && row["count"].as_i64().unwrap() >= 1
                }));
                assert!(json["data"]["plan_stats"].as_array().unwrap().iter().any(|row| {
                    row["plan_id"] == plan_id.to_string() && row["contract_count"].as_i64().unwrap() >= 1
                }));
            }
            else if uri.starts_with("/api/admin/analytics/revenue-breakdown") {
                let body = to_bytes(response.into_body(), usize::MAX).await.unwrap();
                let json: Value = serde_json::from_slice(&body).unwrap();
                assert_eq!(json["success"], true);
                assert!(json["data"]["total_revenue"].as_f64().unwrap() >= 3000.0);
                assert!(json["data"]["by_month"].as_array().unwrap().iter().any(|row| {
                    row["revenue"].as_f64().unwrap() >= 3000.0
                }));
            }
            else if uri.starts_with("/api/admin/analytics/checkin-heatmap") {
                let body = to_bytes(response.into_body(), usize::MAX).await.unwrap();
                let json: Value = serde_json::from_slice(&body).unwrap();
                assert_eq!(json["success"], true);
                let heatmap = json["data"]["heatmap"].as_array().unwrap();
                assert_eq!(heatmap.len(), 7);
                assert!(heatmap.iter().any(|day| day.as_array().unwrap().iter().any(|hour| hour.as_i64().unwrap() >= 1)));
            }
            else if uri.starts_with("/api/admin/reports/member-growth") {
                let body = to_bytes(response.into_body(), usize::MAX).await.unwrap();
                let json: Value = serde_json::from_slice(&body).unwrap();
                assert_eq!(json["success"], true);
                assert!(json["data"]["newMembers"].as_i64().unwrap() >= 1);
                assert!(json["data"]["growth"].as_array().unwrap().iter().any(|row| {
                    row["total"].as_i64().unwrap() >= 1
                }));
            }
            else if uri.starts_with("/api/gym/analytics/api-stats") {
                let body = to_bytes(response.into_body(), usize::MAX).await.unwrap();
                let json: Value = serde_json::from_slice(&body).unwrap();
                assert_eq!(json["success"], true);
                assert!(json["data"]["totalRequests"].as_i64().is_some());
                assert!(json["data"]["topEndpoints"].as_array().is_some());
            }
            else if uri.starts_with("/api/reports/revenue?") {
                let body = to_bytes(response.into_body(), usize::MAX).await.unwrap();
                let json: Value = serde_json::from_slice(&body).unwrap();
                assert_eq!(json["success"], true);
                assert!(json["summary"]["net_revenue"].as_f64().unwrap() >= 3000.0);
                assert!(json["summary"]["total_transactions"].as_i64().unwrap() >= 1);
                assert!(json["data"].as_array().unwrap().iter().any(|row| {
                    row["branch_id"] == branch_id.to_string()
                        && row["payment_day"].as_str().is_some()
                        && row["net_revenue"].as_str().is_some()
                }));
            }
            else if uri.starts_with("/api/reports/member-growth?") {
                let body = to_bytes(response.into_body(), usize::MAX).await.unwrap();
                let json: Value = serde_json::from_slice(&body).unwrap();
                assert_eq!(json["success"], true);
                assert!(json["summary"]["total_new_members"].as_i64().unwrap() >= 1);
                assert!(json["summary"]["average_daily_growth"].as_str().is_some());
                assert!(json["data"].as_array().unwrap().iter().any(|row| {
                    row["branch_id"] == branch_id.to_string()
                        && row["join_day"].as_str().is_some()
                        && row["new_members"].as_str().is_some()
                }));
            }
            else if uri.starts_with("/api/reports/contract-expiry?") {
                let body = to_bytes(response.into_body(), usize::MAX).await.unwrap();
                let json: Value = serde_json::from_slice(&body).unwrap();
                assert_eq!(json["success"], true);
                assert!(json["summary"]["total_expiring"].as_i64().unwrap() >= 1);
                assert!(json["summary"]["soon_count"].as_i64().unwrap() >= 1);
                assert!(json["grouped"]["soon"].as_array().unwrap().iter().any(|row| {
                    row["contract_id"] == contract_id.to_string()
                        && row["member_name"] == "Rust Report Member"
                        && row["branch_id"] == branch_id.to_string()
                }));
            }
            else if uri.starts_with("/api/reports/member-activity?") {
                let body = to_bytes(response.into_body(), usize::MAX).await.unwrap();
                let json: Value = serde_json::from_slice(&body).unwrap();
                assert_eq!(json["success"], true);
                assert!(json["summary"]["total_check_ins"].as_i64().unwrap() >= 1);
                assert!(json["summary"]["method_distribution"]["manual"].as_i64().unwrap() >= 1);
                assert!(json["data"].as_array().unwrap().iter().any(|row| {
                    row["branch_id"] == branch_id.to_string()
                        && row["activity_day"].as_str().is_some()
                        && row["total_check_ins"].as_str().is_some()
                }));
            }
            else if uri.starts_with("/api/reports/branch-performance?") {
                let body = to_bytes(response.into_body(), usize::MAX).await.unwrap();
                let json: Value = serde_json::from_slice(&body).unwrap();
                assert_eq!(json["success"], true);
                assert!(json["summary"]["total_revenue"].as_f64().unwrap() >= 3000.0);
                assert!(json["data"].as_array().unwrap().iter().any(|row| row["branch_id"] == branch_id.to_string()));
            }
            else if uri.starts_with("/api/reports/coach-performance?") {
                let body = to_bytes(response.into_body(), usize::MAX).await.unwrap();
                let json: Value = serde_json::from_slice(&body).unwrap();
                assert_eq!(json["success"], true);
                assert!(json["summary"]["total_classes_taught"].as_i64().unwrap() >= 1);
                assert!(json["data"].as_array().unwrap().iter().any(|row| row["coach_id"] == employee_id.to_string()));
            }
            else if uri.starts_with("/api/admin/dashboard/export")
                || uri.starts_with("/api/reports/branch-performance/export")
                || uri.starts_with("/api/reports/coach-performance/export")
                || uri.starts_with("/api/reports/revenue/export")
                || uri.starts_with("/api/reports/member-growth/export")
                || uri.starts_with("/api/reports/contract-expiry/export")
                || uri.starts_with("/api/reports/member-activity/export")
            {
                assert_eq!(
                    response.headers().get("content-type").unwrap(),
                    "text/csv; charset=utf-8"
                );
                assert!(response.headers().get("content-disposition").is_some());
                let body = to_bytes(response.into_body(), usize::MAX).await.unwrap();
                let csv = String::from_utf8_lossy(&body);
                assert!(csv.contains(','));
            }
        }

        let set_target_response = app.clone().oneshot(
            Request::builder().method("POST").uri("/api/admin/dashboard/revenue-targets")
                .header("authorization", format!("Bearer {token}"))
                .header("content-type", "application/json")
                .body(Body::from(json!({
                    "branch_id": branch_id,
                    "year": 2026,
                    "month": 6,
                    "target_amount": 100000.0
                }).to_string())).unwrap()
        ).await.unwrap();
        assert_eq!(set_target_response.status(), StatusCode::OK);

        let refresh_response = app.clone().oneshot(
            Request::builder().method("POST").uri("/api/reports/refresh")
                .header("authorization", format!("Bearer {token}"))
                .body(Body::empty()).unwrap()
        ).await.unwrap();
        assert_eq!(refresh_response.status(), StatusCode::OK);

        sqlx::query("delete from class_reviews where id = $1").bind(review_id).execute(&pool).await.unwrap();
        sqlx::query("delete from bookings where id = $1").bind(booking_id).execute(&pool).await.unwrap();
        sqlx::query("delete from class_sessions where id = $1").bind(session_id).execute(&pool).await.unwrap();
        sqlx::query("delete from classes where id = $1").bind(class_id).execute(&pool).await.unwrap();
        sqlx::query("delete from check_ins where id = $1").bind(check_in_id).execute(&pool).await.unwrap();
        sqlx::query("delete from payments where id = $1").bind(payment_id).execute(&pool).await.unwrap();
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
    async fn member_app_core_smoke_with_seed_data() {
        if std::env::var("RUN_DB_TESTS").ok().as_deref() != Some("1") {
            return;
        }

        let database_url = std::env::var("DATABASE_URL")
            .expect("DATABASE_URL is required when RUN_DB_TESTS=1");
        let pool = sqlx::PgPool::connect(&database_url).await.unwrap();

        let tenant_id = Uuid::new_v4();
        let branch_id = Uuid::new_v4();
        let member_id = Uuid::new_v4();
        let credential_id = Uuid::new_v4();
        let plan_id = Uuid::new_v4();
        let contract_id = Uuid::new_v4();
        let payment_id = Uuid::new_v4();
        let check_in_id = Uuid::new_v4();
        let class_id = Uuid::new_v4();
        let schedule_id = Uuid::new_v4();
        let session_id = Uuid::new_v4();
        let full_session_id = Uuid::new_v4();
        let booking_id = Uuid::new_v4();
        let suffix = member_id.simple().to_string();
        let email = format!("rust-member-{suffix}@example.com");
        let password = "Passw0rd!";
        let password_hash = hash(password, 4).unwrap();

        sqlx::query("insert into tenants (id, name, slug, email, status) values ($1, $2, $3, $4, 'ACTIVE')")
            .bind(tenant_id).bind(format!("Rust Member Tenant {suffix}"))
            .bind(format!("rust-member-tenant-{suffix}"))
            .bind(format!("member-tenant-{suffix}@example.com"))
            .execute(&pool).await.unwrap();
        sqlx::query("insert into branches (id, name, code, type, tenant_id, status) values ($1, $2, $3, 'MAIN', $4, 'ACTIVE')")
            .bind(branch_id).bind(format!("Rust Member Branch {suffix}"))
            .bind(format!("RMB{}", &suffix[..8])).bind(tenant_id)
            .execute(&pool).await.unwrap();
        sqlx::query("insert into members (id, member_code, full_name, phone, email, branch_id, status, join_date, tenant_id) values ($1, $2, 'Rust Member App User', '0912345678', $3, $4, 'ACTIVE', current_date, $5)")
            .bind(member_id).bind(format!("RMM{}", &suffix[..8])).bind(&email).bind(branch_id).bind(tenant_id)
            .execute(&pool).await.unwrap();
        sqlx::query("insert into member_credentials (id, member_id, password_hash) values ($1, $2, $3)")
            .bind(credential_id).bind(member_id).bind(password_hash)
            .execute(&pool).await.unwrap();
        sqlx::query("insert into membership_plans (id, name, code, type, duration_months, price, allow_pause, allow_transfer, is_active, tenant_id, branch_id) values ($1, 'Rust Member Plan', $2, 'TIME_BASED', 12, 3000, false, false, true, $3, $4)")
            .bind(plan_id).bind(format!("RMP{}", &suffix[..8])).bind(tenant_id).bind(branch_id)
            .execute(&pool).await.unwrap();
        sqlx::query("insert into contracts (id, contract_no, member_id, plan_id, branch_id, status, start_date, original_end_date, end_date, total_amount, paid_amount, payment_status, terms_accepted, tenant_id) values ($1, $2, $3, $4, $5, 'ACTIVE', current_date, current_date + interval '30 days', current_date + interval '30 days', 3000, 3000, 'PAID', true, $6)")
            .bind(contract_id).bind(format!("RMC{}", &suffix[..8])).bind(member_id).bind(plan_id).bind(branch_id).bind(tenant_id)
            .execute(&pool).await.unwrap();
        sqlx::query("insert into payments (id, contract_id, member_id, branch_id, amount, payment_method, payment_date, type, tenant_id) values ($1, $2, $3, $4, 3000, 'CASH', now(), 'INCOME', $5)")
            .bind(payment_id).bind(contract_id).bind(member_id).bind(branch_id).bind(tenant_id)
            .execute(&pool).await.unwrap();
        sqlx::query("insert into check_ins (id, member_id, branch_id, contract_id, check_in_time, check_in_type, check_in_method) values ($1, $2, $3, $4, now(), 'ENTRY', 'MANUAL')")
            .bind(check_in_id).bind(member_id).bind(branch_id).bind(contract_id)
            .execute(&pool).await.unwrap();
        sqlx::query("insert into classes (id, name, duration_minutes, max_capacity, branch_id, category, difficulty_level, is_active) values ($1, 'Rust Yoga', 60, 20, $2, 'YOGA', 'ALL_LEVELS', true)")
            .bind(class_id).bind(branch_id).execute(&pool).await.unwrap();
        sqlx::query("insert into class_schedules (id, class_id, branch_id, day_of_week, start_time, end_time, room) values ($1, $2, $3, 1, '09:00'::time, '10:00'::time, 'A')")
            .bind(schedule_id).bind(class_id).bind(branch_id).execute(&pool).await.unwrap();
        sqlx::query("insert into class_sessions (id, schedule_id, class_id, branch_id, session_date, start_time, end_time, room, max_capacity, current_count) values ($1, $2, $3, $4, current_date + interval '1 day', '09:00'::time, '10:00'::time, 'A', 20, 1)")
            .bind(session_id).bind(schedule_id).bind(class_id).bind(branch_id).execute(&pool).await.unwrap();
        sqlx::query("insert into class_sessions (id, schedule_id, class_id, branch_id, session_date, start_time, end_time, room, max_capacity, current_count, waitlist_count) values ($1, $2, $3, $4, current_date + interval '2 days', '09:00'::time, '10:00'::time, 'A', 1, 1, 0)")
            .bind(full_session_id).bind(schedule_id).bind(class_id).bind(branch_id).execute(&pool).await.unwrap();
        sqlx::query("insert into bookings (id, session_id, member_id, contract_id, booking_status) values ($1, $2, $3, $4, 'CONFIRMED')")
            .bind(booking_id).bind(session_id).bind(member_id).bind(contract_id).execute(&pool).await.unwrap();

        let app = build_app(AppState { db: pool.clone(), jwt_secret: "test-secret".into(), jwt_ttl_seconds: 3600 });
        let login_response = app.clone().oneshot(
            Request::builder().method("POST").uri("/api/member/auth/login")
                .header("content-type", "application/json")
                .body(Body::from(json!({"email": email, "password": password}).to_string())).unwrap()
        ).await.unwrap();
        assert_eq!(login_response.status(), StatusCode::OK);
        let login_body = to_bytes(login_response.into_body(), usize::MAX).await.unwrap();
        let login_json: Value = serde_json::from_slice(&login_body).unwrap();
        let token = login_json["data"]["accessToken"].as_str().unwrap();

        let me_response = app.clone().oneshot(
            Request::builder().uri("/api/member/me")
                .header("x-member-token", token)
                .body(Body::empty()).unwrap()
        ).await.unwrap();
        assert_eq!(me_response.status(), StatusCode::OK);
        let me_body = to_bytes(me_response.into_body(), usize::MAX).await.unwrap();
        let me_json: Value = serde_json::from_slice(&me_body).unwrap();
        assert_eq!(me_json["data"]["branch_id"], branch_id.to_string());
        assert_eq!(me_json["data"]["branch_name"], format!("Rust Member Branch {suffix}"));
        assert_eq!(me_json["data"]["branch"]["id"], branch_id.to_string());
        assert_eq!(me_json["data"]["branch"]["name"], format!("Rust Member Branch {suffix}"));

        let providers_response = app.clone().oneshot(
            Request::builder().uri("/api/member/oauth/providers")
                .body(Body::empty()).unwrap()
        ).await.unwrap();
        assert_eq!(providers_response.status(), StatusCode::OK);
        let providers_body = to_bytes(providers_response.into_body(), usize::MAX).await.unwrap();
        let providers_json: Value = serde_json::from_slice(&providers_body).unwrap();
        assert!(providers_json["data"]["providers"].as_array().unwrap().iter().any(|provider| {
            provider["provider"] == "google"
        }));

        let oauth_init_response = app.clone().oneshot(
            Request::builder().uri("/api/member/oauth/google/init?redirect=http%3A%2F%2Flocalhost%3A3000%2Fauth%2Fcallback%2Fgoogle")
                .body(Body::empty()).unwrap()
        ).await.unwrap();
        assert_eq!(oauth_init_response.status(), StatusCode::OK);
        let oauth_init_body = to_bytes(oauth_init_response.into_body(), usize::MAX).await.unwrap();
        let oauth_init_json: Value = serde_json::from_slice(&oauth_init_body).unwrap();
        let oauth_state = oauth_init_json["data"]["state"].as_str().unwrap();
        assert!(oauth_init_json["data"]["authUrl"].as_str().unwrap().contains(oauth_state));

        let oauth_callback_response = app.clone().oneshot(
            Request::builder().method("POST").uri("/api/member/oauth/google/callback")
                .header("content-type", "application/json")
                .body(Body::from(json!({"code": "dev-code", "state": oauth_state}).to_string())).unwrap()
        ).await.unwrap();
        assert_eq!(oauth_callback_response.status(), StatusCode::OK);
        let oauth_callback_body = to_bytes(oauth_callback_response.into_body(), usize::MAX).await.unwrap();
        let oauth_callback_json: Value = serde_json::from_slice(&oauth_callback_body).unwrap();
        assert_eq!(oauth_callback_json["data"]["needsRegistration"], true);

        let oauth_link_response = app.clone().oneshot(
            Request::builder().method("POST").uri("/api/member/oauth/link")
                .header("x-member-token", token)
                .header("content-type", "application/json")
                .body(Body::from(json!({"provider": "google", "code": "dev-code"}).to_string())).unwrap()
        ).await.unwrap();
        assert_eq!(oauth_link_response.status(), StatusCode::OK);
        let oauth_unlink_response = app.clone().oneshot(
            Request::builder().method("DELETE").uri("/api/member/oauth/google")
                .header("x-member-token", token)
                .body(Body::empty()).unwrap()
        ).await.unwrap();
        assert_eq!(oauth_unlink_response.status(), StatusCode::OK);

        let otp_send_response = app.clone().oneshot(
            Request::builder().method("POST").uri("/api/member/otp/send")
                .header("content-type", "application/json")
                .body(Body::from(json!({"identifier": "0912345678", "type": "phone"}).to_string())).unwrap()
        ).await.unwrap();
        assert_eq!(otp_send_response.status(), StatusCode::OK);
        let otp_verify_response = app.clone().oneshot(
            Request::builder().method("POST").uri("/api/member/otp/verify")
                .header("content-type", "application/json")
                .body(Body::from(json!({"identifier": "0912345678", "type": "phone", "code": "123456"}).to_string())).unwrap()
        ).await.unwrap();
        assert_eq!(otp_verify_response.status(), StatusCode::OK);
        let otp_verify_body = to_bytes(otp_verify_response.into_body(), usize::MAX).await.unwrap();
        let otp_verify_json: Value = serde_json::from_slice(&otp_verify_body).unwrap();
        let otp_token = otp_verify_json["data"]["accessToken"].as_str().unwrap();
        let refresh_response = app.clone().oneshot(
            Request::builder().method("POST").uri("/api/member/otp/refresh")
                .header("content-type", "application/json")
                .body(Body::from(json!({"refreshToken": otp_token}).to_string())).unwrap()
        ).await.unwrap();
        assert_eq!(refresh_response.status(), StatusCode::OK);

        let otp_send_only_response = app.clone().oneshot(
            Request::builder().method("POST").uri("/api/member/otp/send")
                .header("content-type", "application/json")
                .body(Body::from(json!({"identifier": "0912345678", "type": "phone"}).to_string())).unwrap()
        ).await.unwrap();
        assert_eq!(otp_send_only_response.status(), StatusCode::OK);
        let otp_verify_only_response = app.clone().oneshot(
            Request::builder().method("POST").uri("/api/member/otp/verify-only")
                .header("content-type", "application/json")
                .body(Body::from(json!({"identifier": "0912345678", "type": "phone", "code": "123456"}).to_string())).unwrap()
        ).await.unwrap();
        assert_eq!(otp_verify_only_response.status(), StatusCode::OK);

        let forgot_response = app.clone().oneshot(
            Request::builder().method("POST").uri("/api/member/auth/forgot-password")
                .header("content-type", "application/json")
                .body(Body::from(json!({"email": email}).to_string())).unwrap()
        ).await.unwrap();
        assert_eq!(forgot_response.status(), StatusCode::OK);
        let forgot_body = to_bytes(forgot_response.into_body(), usize::MAX).await.unwrap();
        let forgot_json: Value = serde_json::from_slice(&forgot_body).unwrap();
        let reset_url = forgot_json["data"]["resetUrl"].as_str().unwrap();
        let reset_token = reset_url.split("token=").nth(1).unwrap();
        let reset_response = app.clone().oneshot(
            Request::builder().method("POST").uri("/api/member/auth/reset-password")
                .header("content-type", "application/json")
                .body(Body::from(json!({"token": reset_token, "password": "NewPassw0rd!"}).to_string())).unwrap()
        ).await.unwrap();
        assert_eq!(reset_response.status(), StatusCode::OK);
        let change_password_response = app.clone().oneshot(
            Request::builder().method("POST").uri("/api/member/auth/change-password")
                .header("x-member-token", token)
                .header("content-type", "application/json")
                .body(Body::from(json!({"currentPassword": "NewPassw0rd!", "newPassword": password}).to_string())).unwrap()
        ).await.unwrap();
        assert_eq!(change_password_response.status(), StatusCode::OK);

        let complete_profile_response = app.clone().oneshot(
            Request::builder().method("POST").uri("/api/member/me/complete-profile")
                .header("x-member-token", token)
                .header("content-type", "application/json")
                .body(Body::from(json!({
                    "full_name": "Rust Member Completed",
                    "phone": "0912345678",
                    "gender": "OTHER",
                    "birthday": "1990-01-01",
                    "branch_id": branch_id,
                    "emergency_contact": "Complete Emergency",
                    "emergency_phone": "0999000111"
                }).to_string())).unwrap()
        ).await.unwrap();
        assert_eq!(complete_profile_response.status(), StatusCode::OK);

        let profile_update_response = app.clone().oneshot(
            Request::builder().method("PATCH").uri("/api/member/profile")
                .header("x-member-token", token)
                .header("content-type", "application/json")
                .body(Body::from(json!({
                    "full_name": "Rust Member Updated",
                    "phone": "0999888777",
                    "email": format!("updated-{suffix}@example.com"),
                    "emergency_contact": "Emergency Contact",
                    "emergency_phone": "0911222333"
                }).to_string())).unwrap()
        ).await.unwrap();
        assert_eq!(profile_update_response.status(), StatusCode::OK);
        let profile_update_body = to_bytes(profile_update_response.into_body(), usize::MAX).await.unwrap();
        let profile_update_json: Value = serde_json::from_slice(&profile_update_body).unwrap();
        assert_eq!(profile_update_json["data"]["full_name"], "Rust Member Updated");
        assert_eq!(profile_update_json["data"]["phone"], "0999888777");
        assert_eq!(profile_update_json["data"]["emergency_contact"], "Emergency Contact");
        assert_eq!(profile_update_json["data"]["branch"]["name"], format!("Rust Member Branch {suffix}"));

        let goal_response = app.clone().oneshot(
            Request::builder().method("POST").uri("/api/member/goals")
                .header("x-member-token", token)
                .header("content-type", "application/json")
                .body(Body::from(json!({
                    "goal_type": "WEIGHT_LOSS",
                    "target_value": { "description": "Lose weight", "value": 70, "unit": "kg" },
                    "current_value": { "value": 80, "unit": "kg" },
                    "start_date": "2026-06-01",
                    "target_date": "2026-09-01",
                    "notes": "Rust fitness smoke"
                }).to_string())).unwrap()
        ).await.unwrap();
        assert_eq!(goal_response.status(), StatusCode::CREATED);
        let goal_body = to_bytes(goal_response.into_body(), usize::MAX).await.unwrap();
        let goal_json: Value = serde_json::from_slice(&goal_body).unwrap();
        let goal_id = Uuid::parse_str(goal_json["data"]["id"].as_str().unwrap()).unwrap();
        let goal_update_response = app.clone().oneshot(
            Request::builder().method("PUT").uri(format!("/api/member/goals/{goal_id}"))
                .header("x-member-token", token)
                .header("content-type", "application/json")
                .body(Body::from(json!({"status": "ACHIEVED", "current_value": {"value": 70, "unit": "kg"}}).to_string())).unwrap()
        ).await.unwrap();
        assert_eq!(goal_update_response.status(), StatusCode::OK);

        let workout_response = app.clone().oneshot(
            Request::builder().method("POST").uri("/api/member/workouts")
                .header("x-member-token", token)
                .header("content-type", "application/json")
                .body(Body::from(json!({
                    "date": "2026-06-02",
                    "duration": 45,
                    "calories": 320,
                    "exercises": [{ "name": "跑步機", "duration": 30 }],
                    "notes": "Rust workout smoke"
                }).to_string())).unwrap()
        ).await.unwrap();
        assert_eq!(workout_response.status(), StatusCode::CREATED);
        let workout_body = to_bytes(workout_response.into_body(), usize::MAX).await.unwrap();
        let workout_json: Value = serde_json::from_slice(&workout_body).unwrap();
        let workout_id = Uuid::parse_str(workout_json["data"]["id"].as_str().unwrap()).unwrap();
        let workout_update_response = app.clone().oneshot(
            Request::builder().method("PUT").uri(format!("/api/member/workouts/{workout_id}"))
                .header("x-member-token", token)
                .header("content-type", "application/json")
                .body(Body::from(json!({"duration": 60, "calories": 400}).to_string())).unwrap()
        ).await.unwrap();
        assert_eq!(workout_update_response.status(), StatusCode::OK);

        let measurement_response = app.clone().oneshot(
            Request::builder().method("POST").uri("/api/member/measurements")
                .header("x-member-token", token)
                .header("content-type", "application/json")
                .body(Body::from(json!({
                    "date": "2026-06-03",
                    "weight": 78.5,
                    "body_fat": 22.0,
                    "muscle_mass": 35.0,
                    "bmi": 24.0,
                    "source": "MANUAL"
                }).to_string())).unwrap()
        ).await.unwrap();
        assert_eq!(measurement_response.status(), StatusCode::CREATED);
        let measurement_body = to_bytes(measurement_response.into_body(), usize::MAX).await.unwrap();
        let measurement_json: Value = serde_json::from_slice(&measurement_body).unwrap();
        let measurement_id = Uuid::parse_str(measurement_json["data"]["id"].as_str().unwrap()).unwrap();
        let measurement_get_response = app.clone().oneshot(
            Request::builder().uri(format!("/api/member/measurements/{measurement_id}"))
                .header("x-member-token", token)
                .body(Body::empty()).unwrap()
        ).await.unwrap();
        assert_eq!(measurement_get_response.status(), StatusCode::OK);
        let measurement_update_response = app.clone().oneshot(
            Request::builder().method("PUT").uri(format!("/api/member/measurements/{measurement_id}"))
                .header("x-member-token", token)
                .header("content-type", "application/json")
                .body(Body::from(json!({"weight": 77.8, "body_fat": 21.5}).to_string())).unwrap()
        ).await.unwrap();
        assert_eq!(measurement_update_response.status(), StatusCode::OK);

        let issue_response = app.clone().oneshot(
            Request::builder().method("POST").uri("/api/member/issues")
                .header("x-member-token", token)
                .header("content-type", "application/json")
                .body(Body::from(json!({
                    "type": "EQUIPMENT",
                    "title": "Rust issue smoke",
                    "content": "Treadmill display does not turn on.",
                    "attachments": [{ "id": "file-1", "filename": "photo.jpg", "type": "image/jpeg" }]
                }).to_string())).unwrap()
        ).await.unwrap();
        assert_eq!(issue_response.status(), StatusCode::CREATED);
        let issue_body = to_bytes(issue_response.into_body(), usize::MAX).await.unwrap();
        let issue_json: Value = serde_json::from_slice(&issue_body).unwrap();
        let issue_id = Uuid::parse_str(issue_json["data"]["id"].as_str().unwrap()).unwrap();
        let issue_update_response = app.clone().oneshot(
            Request::builder().method("PUT").uri(format!("/api/member/issues/{issue_id}"))
                .header("x-member-token", token)
                .header("content-type", "application/json")
                .body(Body::from(json!({
                    "title": "Rust issue smoke updated",
                    "content": "Treadmill display is still unavailable."
                }).to_string())).unwrap()
        ).await.unwrap();
        assert_eq!(issue_update_response.status(), StatusCode::OK);

        let support_response = app.clone().oneshot(
            Request::builder().method("POST").uri("/api/member/support-tickets")
                .header("x-member-token", token)
                .header("content-type", "application/json")
                .body(Body::from(json!({
                    "member_id": member_id,
                    "category": "app",
                    "subject": "Rust support smoke",
                    "description": "The member app needs assistance from support.",
                    "status": "pending",
                    "metadata": { "member_code": format!("RMM{}", &suffix[..8]) }
                }).to_string())).unwrap()
        ).await.unwrap();
        assert_eq!(support_response.status(), StatusCode::CREATED);
        let support_body = to_bytes(support_response.into_body(), usize::MAX).await.unwrap();
        let support_json: Value = serde_json::from_slice(&support_body).unwrap();
        assert_eq!(support_json["data"]["category"], "app");

        let eligibility_response = app.clone().oneshot(
            Request::builder().uri(format!("/api/member/reviews/eligibility/{booking_id}"))
                .header("x-member-token", token)
                .body(Body::empty()).unwrap()
        ).await.unwrap();
        assert_eq!(eligibility_response.status(), StatusCode::OK);
        let eligibility_body = to_bytes(eligibility_response.into_body(), usize::MAX).await.unwrap();
        let eligibility_json: Value = serde_json::from_slice(&eligibility_body).unwrap();
        assert_eq!(eligibility_json["data"]["can_review"], true);

        let review_response = app.clone().oneshot(
            Request::builder().method("POST").uri("/api/member/reviews")
                .header("x-member-token", token)
                .header("content-type", "application/json")
                .body(Body::from(json!({
                    "booking_id": booking_id,
                    "rating": 5,
                    "comment": "Excellent class from Rust smoke"
                }).to_string())).unwrap()
        ).await.unwrap();
        let review_status = review_response.status();
        let review_body = to_bytes(review_response.into_body(), usize::MAX).await.unwrap();
        assert_eq!(review_status, StatusCode::CREATED, "{}", String::from_utf8_lossy(&review_body));
        let review_json: Value = serde_json::from_slice(&review_body).unwrap();
        let review_id = Uuid::parse_str(review_json["review_id"].as_str().unwrap()).unwrap();
        let review_update_response = app.clone().oneshot(
            Request::builder().method("PUT").uri(format!("/api/member/reviews/{review_id}"))
                .header("x-member-token", token)
                .header("content-type", "application/json")
                .body(Body::from(json!({"rating": 4, "comment": "Updated Rust review"}).to_string())).unwrap()
        ).await.unwrap();
        assert_eq!(review_update_response.status(), StatusCode::OK);

        let notification_prefs_response = app.clone().oneshot(
            Request::builder().uri("/api/member/notifications/preferences")
                .header("x-member-token", token)
                .body(Body::empty()).unwrap()
        ).await.unwrap();
        assert_eq!(notification_prefs_response.status(), StatusCode::OK);
        let notification_update_response = app.clone().oneshot(
            Request::builder().method("PATCH").uri("/api/member/notifications/preferences")
                .header("x-member-token", token)
                .header("content-type", "application/json")
                .body(Body::from(json!({
                    "enable_push": true,
                    "notify_promotions": false,
                    "quiet_hours_enabled": true,
                    "quiet_hours_start": "23:00",
                    "quiet_hours_end": "07:00"
                }).to_string())).unwrap()
        ).await.unwrap();
        assert_eq!(notification_update_response.status(), StatusCode::OK);
        let notification_put_response = app.clone().oneshot(
            Request::builder().method("PUT").uri("/api/member/notifications/preferences")
                .header("x-member-token", token)
                .header("content-type", "application/json")
                .body(Body::from(json!({
                    "notify_promotions": true
                }).to_string())).unwrap()
        ).await.unwrap();
        assert_eq!(notification_put_response.status(), StatusCode::OK);

        let push_endpoint = format!("https://push.example.test/{suffix}");
        let vapid_response = app.clone().oneshot(
            Request::builder().uri("/api/member/push/vapid-public-key")
                .body(Body::empty()).unwrap()
        ).await.unwrap();
        assert_eq!(vapid_response.status(), StatusCode::OK);
        let push_subscribe_response = app.clone().oneshot(
            Request::builder().method("POST").uri("/api/member/push/subscribe")
                .header("x-member-token", token)
                .header("content-type", "application/json")
                .body(Body::from(json!({
                    "endpoint": push_endpoint,
                    "keys": { "p256dh": "p256dh-test", "auth": "auth-test" },
                    "device_name": "Rust Test Device",
                    "preferences": {
                        "notify_booking_reminder": true,
                        "notify_contract_expiry": true,
                        "notify_class_cancelled": true,
                        "notify_promotions": false
                    }
                }).to_string())).unwrap()
        ).await.unwrap();
        assert_eq!(push_subscribe_response.status(), StatusCode::OK);
        let push_preferences_response = app.clone().oneshot(
            Request::builder().method("PATCH").uri("/api/member/push/preferences")
                .header("x-member-token", token)
                .header("content-type", "application/json")
                .body(Body::from(json!({
                    "endpoint": push_endpoint,
                    "preferences": { "notify_promotions": true }
                }).to_string())).unwrap()
        ).await.unwrap();
        assert_eq!(push_preferences_response.status(), StatusCode::OK);
        let notification_test_response = app.clone().oneshot(
            Request::builder().method("POST").uri("/api/member/notifications/test")
                .header("x-member-token", token)
                .header("content-type", "application/json")
                .body(Body::from(json!({ "channel": "push", "type": "test" }).to_string())).unwrap()
        ).await.unwrap();
        assert_eq!(notification_test_response.status(), StatusCode::OK);

        let waitlisted_booking_response = app.clone().oneshot(
            Request::builder().method("POST").uri("/api/member/bookings")
                .header("x-member-token", token)
                .header("content-type", "application/json")
                .body(Body::from(json!({
                    "session_id": full_session_id,
                    "contract_id": contract_id
                }).to_string())).unwrap()
        ).await.unwrap();
        let waitlisted_booking_status = waitlisted_booking_response.status();
        let waitlisted_booking_body = to_bytes(waitlisted_booking_response.into_body(), usize::MAX).await.unwrap();
        assert_eq!(waitlisted_booking_status, StatusCode::CREATED, "member waitlisted booking: {}", String::from_utf8_lossy(&waitlisted_booking_body));
        let waitlisted_booking_json: Value = serde_json::from_slice(&waitlisted_booking_body).unwrap();
        let waitlisted_booking_id = Uuid::parse_str(waitlisted_booking_json["booking"]["id"].as_str().unwrap()).unwrap();
        assert_eq!(waitlisted_booking_json["booking"]["booking_status"], "WAITLISTED");
        assert_eq!(waitlisted_booking_json["booking"]["waitlist_position"], 1);

        let waitlisted_list_response = app.clone().oneshot(
            Request::builder().uri("/api/member/bookings?status=WAITLISTED")
                .header("x-member-token", token)
                .body(Body::empty()).unwrap()
        ).await.unwrap();
        let waitlisted_list_status = waitlisted_list_response.status();
        let waitlisted_list_body = to_bytes(waitlisted_list_response.into_body(), usize::MAX).await.unwrap();
        assert_eq!(waitlisted_list_status, StatusCode::OK, "member waitlisted list: {}", String::from_utf8_lossy(&waitlisted_list_body));
        let waitlisted_list_json: Value = serde_json::from_slice(&waitlisted_list_body).unwrap();
        assert!(waitlisted_list_json["data"].as_array().unwrap().iter().any(|booking| {
            booking["id"] == waitlisted_booking_id.to_string() && booking["booking_status"] == "WAITLISTED"
        }));

        let member_contracts_response = app.clone().oneshot(
            Request::builder().uri("/api/member/contracts")
                .header("x-member-token", token)
                .body(Body::empty()).unwrap()
        ).await.unwrap();
        assert_eq!(member_contracts_response.status(), StatusCode::OK);
        let member_contracts_body = to_bytes(member_contracts_response.into_body(), usize::MAX).await.unwrap();
        let member_contracts_json: Value = serde_json::from_slice(&member_contracts_body).unwrap();
        assert_eq!(member_contracts_json["data"][0]["id"], contract_id.to_string());
        assert_eq!(member_contracts_json["data"][0]["contract_no"], format!("RMC{}", &suffix[..8]));
        assert_eq!(member_contracts_json["data"][0]["plan"]["name"], "Rust Member Plan");
        assert_eq!(member_contracts_json["pagination"]["total"], 1);

        let member_payments_response = app.clone().oneshot(
            Request::builder().uri("/api/member/payments?page=1&limit=1&sortBy=payment_date&sortOrder=desc")
                .header("x-member-token", token)
                .body(Body::empty()).unwrap()
        ).await.unwrap();
        assert_eq!(member_payments_response.status(), StatusCode::OK);
        let member_payments_body = to_bytes(member_payments_response.into_body(), usize::MAX).await.unwrap();
        let member_payments_json: Value = serde_json::from_slice(&member_payments_body).unwrap();
        assert_eq!(member_payments_json["data"].as_array().unwrap().len(), 1);
        assert_eq!(member_payments_json["data"][0]["id"], payment_id.to_string());
        assert_eq!(member_payments_json["data"][0]["contract_id"]["contract_no"], format!("RMC{}", &suffix[..8]));
        assert_eq!(member_payments_json["data"][0]["contract_id"]["plan_id"]["name"], "Rust Member Plan");
        assert!(member_payments_json["data"][0]["payment_date"].as_str().is_some());

        let member_checkins_response = app.clone().oneshot(
            Request::builder().uri("/api/member_checkins?page=1&limit=1&sortBy=check_time&sortOrder=desc")
                .header("x-member-token", token)
                .body(Body::empty()).unwrap()
        ).await.unwrap();
        assert_eq!(member_checkins_response.status(), StatusCode::OK);
        let member_checkins_body = to_bytes(member_checkins_response.into_body(), usize::MAX).await.unwrap();
        let member_checkins_json: Value = serde_json::from_slice(&member_checkins_body).unwrap();
        assert_eq!(member_checkins_json["data"].as_array().unwrap().len(), 1);
        assert_eq!(member_checkins_json["data"][0]["id"], check_in_id.to_string());
        assert_eq!(member_checkins_json["data"][0]["member_id"], member_id.to_string());
        assert_eq!(member_checkins_json["data"][0]["branch_id"]["name"], format!("Rust Member Branch {suffix}"));
        assert_eq!(member_checkins_json["data"][0]["contract_id"]["contract_no"], format!("RMC{}", &suffix[..8]));
        assert_eq!(member_checkins_json["pagination"]["total"], 1);

        let member_checkin_detail_response = app.clone().oneshot(
            Request::builder().uri(format!("/api/member_checkins/{check_in_id}"))
                .header("x-member-token", token)
                .body(Body::empty()).unwrap()
        ).await.unwrap();
        assert_eq!(member_checkin_detail_response.status(), StatusCode::OK);
        let member_checkin_detail_body = to_bytes(member_checkin_detail_response.into_body(), usize::MAX).await.unwrap();
        let member_checkin_detail_json: Value = serde_json::from_slice(&member_checkin_detail_body).unwrap();
        assert_eq!(member_checkin_detail_json["data"]["member_id"], member_id.to_string());
        assert_eq!(member_checkin_detail_json["data"]["contract_id"]["id"], contract_id.to_string());
        assert_eq!(member_checkin_detail_json["data"]["contract_id"]["plan_id"]["name"], "Rust Member Plan");
        assert!(member_checkin_detail_json["data"]["date_created"].as_str().is_some());

        for uri in [
            "/api/member/me",
            "/api/member/profile",
            "/api/member/classes",
            "/api/member/classes/schedule",
            "/api/member/classes/sessions",
            "/api/member/bookings",
            "/api/member/contracts",
            "/api/member/payments",
            "/api/member_checkins",
            &format!("/api/member_checkins/{check_in_id}"),
            "/api/member/checkins",
            &format!("/api/member/checkins/{check_in_id}"),
            "/api/member/goals?status=ACHIEVED",
            &format!("/api/member/goals/{goal_id}"),
            "/api/member/workouts",
            &format!("/api/member/workouts/{workout_id}"),
            "/api/member/workouts/stats?period=month",
            "/api/member/measurements",
            &format!("/api/member/measurements/{measurement_id}"),
            "/api/member/measurements/latest",
            "/api/member/measurements/stats?period=30",
            "/api/member/issues?status=SUBMITTED&type=EQUIPMENT",
            &format!("/api/member/issues/{issue_id}"),
            &format!("/api/member/reviews/class/{class_id}?limit=10"),
            "/api/member/reviews/my?limit=10",
            "/api/member/notifications/preferences",
            "/api/member/notifications/channels",
            "/api/member/notifications/history?limit=20&offset=0",
        ] {
            let response = app.clone().oneshot(
                Request::builder().uri(uri)
                    .header("x-member-token", token)
                    .body(Body::empty()).unwrap()
            ).await.unwrap();
            let status = response.status();
            let body = to_bytes(response.into_body(), usize::MAX).await.unwrap();
            assert_eq!(status, StatusCode::OK, "{uri}: {}", String::from_utf8_lossy(&body));
        }

        let cookie_alias_response = app.clone().oneshot(
            Request::builder().uri(format!("/api/member_checkins/{check_in_id}"))
                .header("cookie", format!("member_access_token={token}"))
                .body(Body::empty()).unwrap()
        ).await.unwrap();
        let cookie_alias_status = cookie_alias_response.status();
        let cookie_alias_body = to_bytes(cookie_alias_response.into_body(), usize::MAX).await.unwrap();
        assert_eq!(cookie_alias_status, StatusCode::OK, "member_access_token cookie auth: {}", String::from_utf8_lossy(&cookie_alias_body));

        for (uri, id) in [
            ("/api/member/goals", goal_id),
            ("/api/member/workouts", workout_id),
            ("/api/member/measurements", measurement_id),
        ] {
            let delete_response = app.clone().oneshot(
                Request::builder().method("DELETE").uri(format!("{uri}/{id}"))
                    .header("x-member-token", token)
                    .body(Body::empty()).unwrap()
            ).await.unwrap();
            assert_eq!(delete_response.status(), StatusCode::OK, "{uri}/{id}");
        }

        let review_delete_response = app.clone().oneshot(
            Request::builder().method("DELETE").uri(format!("/api/member/reviews/{review_id}"))
                .header("x-member-token", token)
                .body(Body::empty()).unwrap()
        ).await.unwrap();
        assert_eq!(review_delete_response.status(), StatusCode::OK);
        let push_unsubscribe_response = app.clone().oneshot(
            Request::builder().method("DELETE").uri("/api/member/push/unsubscribe")
                .header("x-member-token", token)
                .header("content-type", "application/json")
                .body(Body::from(json!({ "endpoint": push_endpoint }).to_string())).unwrap()
        ).await.unwrap();
        assert_eq!(push_unsubscribe_response.status(), StatusCode::OK);

        sqlx::query("delete from class_reviews where member_id = $1").bind(member_id).execute(&pool).await.unwrap();
        sqlx::query("delete from member_otps where member_id = $1").bind(member_id).execute(&pool).await.unwrap();
        sqlx::query("delete from member_notification_history where member_id = $1").bind(member_id).execute(&pool).await.unwrap();
        sqlx::query("delete from member_notification_preferences where member_id = $1").bind(member_id).execute(&pool).await.unwrap();
        sqlx::query("delete from push_subscriptions where member_id = $1").bind(member_id).execute(&pool).await.unwrap();
        sqlx::query("delete from bookings where id = $1").bind(waitlisted_booking_id).execute(&pool).await.unwrap();
        sqlx::query("delete from bookings where id = $1").bind(booking_id).execute(&pool).await.unwrap();
        sqlx::query("delete from class_sessions where id = $1").bind(full_session_id).execute(&pool).await.unwrap();
        sqlx::query("delete from class_sessions where id = $1").bind(session_id).execute(&pool).await.unwrap();
        sqlx::query("delete from class_schedules where id = $1").bind(schedule_id).execute(&pool).await.unwrap();
        sqlx::query("delete from classes where id = $1").bind(class_id).execute(&pool).await.unwrap();
        sqlx::query("delete from check_ins where id = $1").bind(check_in_id).execute(&pool).await.unwrap();
        sqlx::query("delete from payments where id = $1").bind(payment_id).execute(&pool).await.unwrap();
        sqlx::query("delete from contracts where id = $1").bind(contract_id).execute(&pool).await.unwrap();
        sqlx::query("delete from membership_plans where id = $1").bind(plan_id).execute(&pool).await.unwrap();
        sqlx::query("delete from member_issues where member_id = $1").bind(member_id).execute(&pool).await.unwrap();
        sqlx::query("delete from support_tickets where member_id = $1").bind(member_id).execute(&pool).await.unwrap();
        sqlx::query("delete from member_credentials where id = $1").bind(credential_id).execute(&pool).await.unwrap();
        sqlx::query("delete from members where id = $1").bind(member_id).execute(&pool).await.unwrap();
        sqlx::query("delete from branches where id = $1").bind(branch_id).execute(&pool).await.unwrap();
        sqlx::query("delete from tenants where id = $1").bind(tenant_id).execute(&pool).await.unwrap();
    }

    #[tokio::test]
    async fn hr_employees_job_titles_crud_round_trip_with_seed_user() {
        if std::env::var("RUN_DB_TESTS").ok().as_deref() != Some("1") {
            return;
        }

        let database_url = std::env::var("DATABASE_URL")
            .expect("DATABASE_URL is required when RUN_DB_TESTS=1");
        let pool = sqlx::PgPool::connect(&database_url).await.unwrap();

        let tenant_id = Uuid::new_v4();
        let branch_id = Uuid::new_v4();
        let seed_job_title_id = Uuid::new_v4();
        let user_id = Uuid::new_v4();
        let seed_employee_id = Uuid::new_v4();
        let suffix = user_id.simple().to_string();
        let email = format!("rust-hr-{suffix}@example.com");
        let password = "Passw0rd!";
        let password_hash = hash(password, 4).unwrap();

        sqlx::query("insert into tenants (id, name, slug, email, status) values ($1, $2, $3, $4, 'ACTIVE')")
            .bind(tenant_id).bind(format!("Rust HR Tenant {suffix}"))
            .bind(format!("rust-hr-tenant-{suffix}"))
            .bind(format!("hr-tenant-{suffix}@example.com"))
            .execute(&pool).await.unwrap();
        sqlx::query("insert into branches (id, name, code, type, tenant_id, status) values ($1, $2, $3, 'MAIN', $4, 'ACTIVE')")
            .bind(branch_id).bind(format!("Rust HR Branch {suffix}"))
            .bind(format!("RHB{}", &suffix[..8])).bind(tenant_id)
            .execute(&pool).await.unwrap();
        sqlx::query("insert into job_titles (id, name, code, permissions_config, tenant_id) values ($1, $2, $3, '{\"hr\":[\"read\",\"write\"]}'::jsonb, $4)")
            .bind(seed_job_title_id).bind(format!("Rust HR Admin {suffix}"))
            .bind(format!("RHJA{}", &suffix[..8])).bind(tenant_id)
            .execute(&pool).await.unwrap();
        sqlx::query("insert into users (id, email, password_hash, role, tenant_id, is_active, email_verified) values ($1, $2, $3, 'ADMIN', $4, true, true)")
            .bind(user_id).bind(&email).bind(password_hash).bind(tenant_id)
            .execute(&pool).await.unwrap();
        sqlx::query("insert into employees (id, user_id, branch_id, job_title_id, employee_code, full_name, email, status, employment_type, hire_date, tenant_id) values ($1, $2, $3, $4, $5, 'Rust HR Admin', $6, 'ACTIVE', 'FULL_TIME', '2026-01-01'::date, $7)")
            .bind(seed_employee_id).bind(user_id).bind(branch_id).bind(seed_job_title_id)
            .bind(format!("RHEA{}", &suffix[..8])).bind(&email).bind(tenant_id)
            .execute(&pool).await.unwrap();

        let app = build_app(AppState { db: pool.clone(), jwt_secret: "test-secret".into(), jwt_ttl_seconds: 3600 });
        let login_response = app.clone().oneshot(
            Request::builder().method("POST").uri("/api/auth/login")
                .header("content-type", "application/json")
                .body(Body::from(json!({"email": email, "password": password}).to_string())).unwrap()
        ).await.unwrap();
        assert_eq!(login_response.status(), StatusCode::OK);
        let login_body = to_bytes(login_response.into_body(), usize::MAX).await.unwrap();
        let login_json: Value = serde_json::from_slice(&login_body).unwrap();
        let token = login_json["data"]["token"].as_str().unwrap();

        let job_create_response = app.clone().oneshot(
            Request::builder().method("POST").uri("/api/job-titles")
                .header("authorization", format!("Bearer {token}"))
                .header("content-type", "application/json")
                .body(Body::from(json!({
                    "name": "Rust HR Coach",
                    "permissions_config": {"employees": {"read": true}}
                }).to_string())).unwrap()
        ).await.unwrap();
        assert_eq!(job_create_response.status(), StatusCode::CREATED);
        let job_body = to_bytes(job_create_response.into_body(), usize::MAX).await.unwrap();
        let job_json: Value = serde_json::from_slice(&job_body).unwrap();
        let job_title_id = Uuid::parse_str(job_json["data"]["id"].as_str().unwrap()).unwrap();

        let employee_create_response = app.clone().oneshot(
            Request::builder().method("POST").uri("/api/employees")
                .header("authorization", format!("Bearer {token}"))
                .header("content-type", "application/json")
                .body(Body::from(json!({
                    "full_name": "Rust HR Coach User",
                    "employee_code": format!("RHE{}", &suffix[..8]),
                    "branch_id": branch_id,
                    "job_title_id": job_title_id,
                    "employment_type": "FULL_TIME",
                    "hire_date": "2026-02-01",
                    "basic_salary": 50000
                }).to_string())).unwrap()
        ).await.unwrap();
        assert_eq!(employee_create_response.status(), StatusCode::CREATED);
        let employee_body = to_bytes(employee_create_response.into_body(), usize::MAX).await.unwrap();
        let employee_json: Value = serde_json::from_slice(&employee_body).unwrap();
        let employee_id = Uuid::parse_str(employee_json["data"]["id"].as_str().unwrap()).unwrap();

        for uri in [
            "/api/job-titles?status=active&limit=1000",
            "/api/employees?limit=20&employment_status=ACTIVE",
        ] {
            let response = app.clone().oneshot(
                Request::builder().uri(uri)
                    .header("authorization", format!("Bearer {token}"))
                    .body(Body::empty()).unwrap()
            ).await.unwrap();
            assert_eq!(response.status(), StatusCode::OK, "{uri}");
            if uri.starts_with("/api/job-titles") {
                let body = to_bytes(response.into_body(), usize::MAX).await.unwrap();
                let json: Value = serde_json::from_slice(&body).unwrap();
                assert!(json["data"].as_array().unwrap().iter().any(|row| {
                    row["id"] == job_title_id.to_string() && row["status"] == "active"
                }));
            }
        }

        let employee_update_response = app.clone().oneshot(
            Request::builder().method("PATCH").uri(format!("/api/employees/{employee_id}"))
                .header("authorization", format!("Bearer {token}"))
                .header("content-type", "application/json")
                .body(Body::from(json!({"employment_status": "LEAVE"}).to_string())).unwrap()
        ).await.unwrap();
        assert_eq!(employee_update_response.status(), StatusCode::OK);

        let job_update_response = app.clone().oneshot(
            Request::builder().method("PATCH").uri(format!("/api/job-titles/{job_title_id}"))
                .header("authorization", format!("Bearer {token}"))
                .header("content-type", "application/json")
                .body(Body::from(json!({"description": "Updated by Rust HR smoke"}).to_string())).unwrap()
        ).await.unwrap();
        assert_eq!(job_update_response.status(), StatusCode::OK);

        let employee_delete_response = app.clone().oneshot(
            Request::builder().method("DELETE").uri(format!("/api/employees/{employee_id}"))
                .header("authorization", format!("Bearer {token}"))
                .body(Body::empty()).unwrap()
        ).await.unwrap();
        assert_eq!(employee_delete_response.status(), StatusCode::OK);
        let job_delete_response = app.clone().oneshot(
            Request::builder().method("DELETE").uri(format!("/api/job-titles/{job_title_id}"))
                .header("authorization", format!("Bearer {token}"))
                .body(Body::empty()).unwrap()
        ).await.unwrap();
        assert_eq!(job_delete_response.status(), StatusCode::OK);

        sqlx::query("delete from employees where id = $1").bind(seed_employee_id).execute(&pool).await.unwrap();
        sqlx::query("delete from users where id = $1").bind(user_id).execute(&pool).await.unwrap();
        sqlx::query("delete from job_titles where id = $1").bind(seed_job_title_id).execute(&pool).await.unwrap();
        sqlx::query("delete from branches where id = $1").bind(branch_id).execute(&pool).await.unwrap();
        sqlx::query("delete from tenants where id = $1").bind(tenant_id).execute(&pool).await.unwrap();
    }

    #[tokio::test]
    async fn hr_attendances_round_trip_with_seed_user() {
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
        let admin_employee_id = Uuid::new_v4();
        let employee_id = Uuid::new_v4();
        let suffix = user_id.simple().to_string();
        let email = format!("rust-attendance-{suffix}@example.com");
        let password = "Passw0rd!";
        let password_hash = hash(password, 4).unwrap();

        sqlx::query("insert into tenants (id, name, slug, email, status) values ($1, $2, $3, $4, 'ACTIVE')")
            .bind(tenant_id).bind(format!("Rust Attendance Tenant {suffix}"))
            .bind(format!("rust-attendance-tenant-{suffix}"))
            .bind(format!("attendance-tenant-{suffix}@example.com"))
            .execute(&pool).await.unwrap();
        sqlx::query("insert into branches (id, name, code, type, tenant_id, status) values ($1, $2, $3, 'MAIN', $4, 'ACTIVE')")
            .bind(branch_id).bind(format!("Rust Attendance Branch {suffix}"))
            .bind(format!("RAB{}", &suffix[..8])).bind(tenant_id)
            .execute(&pool).await.unwrap();
        sqlx::query("insert into job_titles (id, name, code, permissions_config, tenant_id) values ($1, $2, $3, '{\"attendance\":[\"read\",\"write\"]}'::jsonb, $4)")
            .bind(job_title_id).bind(format!("Rust Attendance Role {suffix}"))
            .bind(format!("RAJ{}", &suffix[..8])).bind(tenant_id)
            .execute(&pool).await.unwrap();
        sqlx::query("insert into users (id, email, password_hash, role, tenant_id, is_active, email_verified) values ($1, $2, $3, 'ADMIN', $4, true, true)")
            .bind(user_id).bind(&email).bind(password_hash).bind(tenant_id)
            .execute(&pool).await.unwrap();
        sqlx::query("insert into employees (id, user_id, branch_id, job_title_id, employee_code, full_name, email, status, employment_type, hire_date, tenant_id) values ($1, $2, $3, $4, $5, 'Rust Attendance Admin', $6, 'ACTIVE', 'FULL_TIME', '2026-01-01'::date, $7)")
            .bind(admin_employee_id).bind(user_id).bind(branch_id).bind(job_title_id)
            .bind(format!("RAA{}", &suffix[..8])).bind(&email).bind(tenant_id)
            .execute(&pool).await.unwrap();
        sqlx::query("insert into employees (id, branch_id, job_title_id, employee_code, full_name, status, employment_type, hire_date, tenant_id) values ($1, $2, $3, $4, 'Rust Attendance Staff', 'ACTIVE', 'FULL_TIME', '2026-01-01'::date, $5)")
            .bind(employee_id).bind(branch_id).bind(job_title_id)
            .bind(format!("RAS{}", &suffix[..8])).bind(tenant_id)
            .execute(&pool).await.unwrap();

        let app = build_app(AppState { db: pool.clone(), jwt_secret: "test-secret".into(), jwt_ttl_seconds: 3600 });
        let login_response = app.clone().oneshot(
            Request::builder().method("POST").uri("/api/auth/login")
                .header("content-type", "application/json")
                .body(Body::from(json!({"email": email, "password": password}).to_string())).unwrap()
        ).await.unwrap();
        assert_eq!(login_response.status(), StatusCode::OK);
        let login_body = to_bytes(login_response.into_body(), usize::MAX).await.unwrap();
        let login_json: Value = serde_json::from_slice(&login_body).unwrap();
        let token = login_json["data"]["token"].as_str().unwrap();

        let create_response = app.clone().oneshot(
            Request::builder().method("POST").uri("/api/attendances")
                .header("authorization", format!("Bearer {token}"))
                .header("content-type", "application/json")
                .body(Body::from(json!({
                    "employee_id": employee_id,
                    "branch_id": branch_id,
                    "attendance_date": "2026-03-01",
                    "check_in": "2026-03-01T01:05:00Z",
                    "check_type": "REGULAR",
                    "attendance_status": "LATE",
                    "late_minutes": 5
                }).to_string())).unwrap()
        ).await.unwrap();
        assert_eq!(create_response.status(), StatusCode::CREATED);
        let create_body = to_bytes(create_response.into_body(), usize::MAX).await.unwrap();
        let create_json: Value = serde_json::from_slice(&create_body).unwrap();
        let attendance_id = Uuid::parse_str(create_json["data"]["id"].as_str().unwrap()).unwrap();

        for uri in [
            format!("/api/attendances/{attendance_id}"),
            format!("/api/attendances?employee_id={employee_id}&attendance_date=2026-03-01"),
            format!("/api/hr/attendances/{attendance_id}"),
            format!("/api/hr/attendances?startDate=2026-03-01&endDate=2026-03-01"),
        ] {
            let response = app.clone().oneshot(
                Request::builder().uri(uri)
                    .header("authorization", format!("Bearer {token}"))
                    .body(Body::empty()).unwrap()
            ).await.unwrap();
            assert_eq!(response.status(), StatusCode::OK);
        }

        let update_response = app.clone().oneshot(
            Request::builder().method("PATCH").uri(format!("/api/attendances/{attendance_id}"))
                .header("authorization", format!("Bearer {token}"))
                .header("content-type", "application/json")
                .body(Body::from(json!({
                    "check_out": "2026-03-01T10:00:00Z",
                    "attendance_status": "PRESENT",
                    "early_leave_minutes": 0
                }).to_string())).unwrap()
        ).await.unwrap();
        assert_eq!(update_response.status(), StatusCode::OK);

        sqlx::query("delete from attendances where id = $1").bind(attendance_id).execute(&pool).await.unwrap();
        sqlx::query("delete from employees where id = $1").bind(employee_id).execute(&pool).await.unwrap();
        sqlx::query("delete from employees where id = $1").bind(admin_employee_id).execute(&pool).await.unwrap();
        sqlx::query("delete from users where id = $1").bind(user_id).execute(&pool).await.unwrap();
        sqlx::query("delete from job_titles where id = $1").bind(job_title_id).execute(&pool).await.unwrap();
        sqlx::query("delete from branches where id = $1").bind(branch_id).execute(&pool).await.unwrap();
        sqlx::query("delete from tenants where id = $1").bind(tenant_id).execute(&pool).await.unwrap();
    }

    #[tokio::test]
    async fn hr_leaves_round_trip_with_seed_user() {
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
        let approver_id = Uuid::new_v4();
        let employee_id = Uuid::new_v4();
        let suffix = user_id.simple().to_string();
        let email = format!("rust-leave-{suffix}@example.com");
        let password = "Passw0rd!";
        let password_hash = hash(password, 4).unwrap();

        sqlx::query("insert into tenants (id, name, slug, email, status) values ($1, $2, $3, $4, 'ACTIVE')")
            .bind(tenant_id).bind(format!("Rust Leave Tenant {suffix}"))
            .bind(format!("rust-leave-tenant-{suffix}"))
            .bind(format!("leave-tenant-{suffix}@example.com"))
            .execute(&pool).await.unwrap();
        sqlx::query("insert into branches (id, name, code, type, tenant_id, status) values ($1, $2, $3, 'MAIN', $4, 'ACTIVE')")
            .bind(branch_id).bind(format!("Rust Leave Branch {suffix}"))
            .bind(format!("RLB{}", &suffix[..8])).bind(tenant_id)
            .execute(&pool).await.unwrap();
        sqlx::query("insert into job_titles (id, name, code, permissions_config, tenant_id) values ($1, $2, $3, '{\"leaves\":[\"read\",\"write\"]}'::jsonb, $4)")
            .bind(job_title_id).bind(format!("Rust Leave Role {suffix}"))
            .bind(format!("RLJ{}", &suffix[..8])).bind(tenant_id)
            .execute(&pool).await.unwrap();
        sqlx::query("insert into users (id, email, password_hash, role, tenant_id, is_active, email_verified) values ($1, $2, $3, 'ADMIN', $4, true, true)")
            .bind(user_id).bind(&email).bind(password_hash).bind(tenant_id)
            .execute(&pool).await.unwrap();
        sqlx::query("insert into employees (id, user_id, branch_id, job_title_id, employee_code, full_name, email, status, employment_type, hire_date, tenant_id) values ($1, $2, $3, $4, $5, 'Rust Leave Approver', $6, 'ACTIVE', 'FULL_TIME', '2026-01-01'::date, $7)")
            .bind(approver_id).bind(user_id).bind(branch_id).bind(job_title_id)
            .bind(format!("RLA{}", &suffix[..8])).bind(&email).bind(tenant_id)
            .execute(&pool).await.unwrap();
        sqlx::query("insert into employees (id, branch_id, job_title_id, employee_code, full_name, status, employment_type, hire_date, tenant_id) values ($1, $2, $3, $4, 'Rust Leave Employee', 'ACTIVE', 'FULL_TIME', '2026-01-01'::date, $5)")
            .bind(employee_id).bind(branch_id).bind(job_title_id)
            .bind(format!("RLE{}", &suffix[..8])).bind(tenant_id)
            .execute(&pool).await.unwrap();

        let app = build_app(AppState { db: pool.clone(), jwt_secret: "test-secret".into(), jwt_ttl_seconds: 3600 });
        let login_response = app.clone().oneshot(
            Request::builder().method("POST").uri("/api/auth/login")
                .header("content-type", "application/json")
                .body(Body::from(json!({"email": email, "password": password}).to_string())).unwrap()
        ).await.unwrap();
        assert_eq!(login_response.status(), StatusCode::OK);
        let login_body = to_bytes(login_response.into_body(), usize::MAX).await.unwrap();
        let login_json: Value = serde_json::from_slice(&login_body).unwrap();
        let token = login_json["data"]["token"].as_str().unwrap();

        let balance_response = app.clone().oneshot(
            Request::builder().method("POST").uri("/api/leave_balances")
                .header("authorization", format!("Bearer {token}"))
                .header("content-type", "application/json")
                .body(Body::from(json!({
                    "employee_id": employee_id,
                    "leave_type": "ANNUAL",
                    "year": 2026,
                    "total_days": 14
                }).to_string())).unwrap()
        ).await.unwrap();
        assert_eq!(balance_response.status(), StatusCode::CREATED);
        let balance_body = to_bytes(balance_response.into_body(), usize::MAX).await.unwrap();
        let balance_json: Value = serde_json::from_slice(&balance_body).unwrap();
        let balance_id = Uuid::parse_str(balance_json["data"]["id"].as_str().unwrap()).unwrap();

        let leave_response = app.clone().oneshot(
            Request::builder().method("POST").uri("/api/leave_requests")
                .header("authorization", format!("Bearer {token}"))
                .header("content-type", "application/json")
                .body(Body::from(json!({
                    "employee_id": employee_id,
                    "leave_type": "ANNUAL",
                    "start_date": "2026-04-01",
                    "end_date": "2026-04-02",
                    "days_requested": 2,
                    "reason": "Rust leave smoke"
                }).to_string())).unwrap()
        ).await.unwrap();
        assert_eq!(leave_response.status(), StatusCode::CREATED);
        let leave_body = to_bytes(leave_response.into_body(), usize::MAX).await.unwrap();
        let leave_json: Value = serde_json::from_slice(&leave_body).unwrap();
        let leave_id = Uuid::parse_str(leave_json["data"]["id"].as_str().unwrap()).unwrap();

        let log_response = app.clone().oneshot(
            Request::builder().method("POST").uri("/api/leave_approval_logs")
                .header("authorization", format!("Bearer {token}"))
                .header("content-type", "application/json")
                .body(Body::from(json!({
                    "leave_request_id": leave_id,
                    "action_by": employee_id,
                    "action": "SUBMIT",
                    "previous_status": null,
                    "new_status": "PENDING",
                    "notes": "提交休假申請"
                }).to_string())).unwrap()
        ).await.unwrap();
        assert_eq!(log_response.status(), StatusCode::CREATED);
        let log_body = to_bytes(log_response.into_body(), usize::MAX).await.unwrap();
        let log_json: Value = serde_json::from_slice(&log_body).unwrap();
        let log_id = Uuid::parse_str(log_json["data"]["id"].as_str().unwrap()).unwrap();

        for uri in [
            format!("/api/leave_requests/{leave_id}"),
            format!("/api/leave_requests?employee_id={employee_id}&leave_status=PENDING"),
            format!("/api/leave_balances?employee_id={employee_id}&year=2026"),
            format!("/api/leave_approval_logs?leave_request_id={leave_id}"),
        ] {
            let response = app.clone().oneshot(
                Request::builder().uri(uri)
                    .header("authorization", format!("Bearer {token}"))
                    .body(Body::empty()).unwrap()
            ).await.unwrap();
            assert_eq!(response.status(), StatusCode::OK);
        }

        let approve_response = app.clone().oneshot(
            Request::builder().method("PATCH").uri(format!("/api/leave_requests/{leave_id}"))
                .header("authorization", format!("Bearer {token}"))
                .header("content-type", "application/json")
                .body(Body::from(json!({
                    "leave_status": "APPROVED",
                    "approver_id": approver_id,
                    "approved_at": "2026-03-01T00:00:00Z",
                    "approval_notes": "ok"
                }).to_string())).unwrap()
        ).await.unwrap();
        assert_eq!(approve_response.status(), StatusCode::OK);

        let balance_update_response = app.clone().oneshot(
            Request::builder().method("PATCH").uri(format!("/api/leave_balances/{balance_id}"))
                .header("authorization", format!("Bearer {token}"))
                .header("content-type", "application/json")
                .body(Body::from(json!({"used_days": 2, "pending_days": 0}).to_string())).unwrap()
        ).await.unwrap();
        assert_eq!(balance_update_response.status(), StatusCode::OK);

        sqlx::query("delete from leave_approval_logs where id = $1").bind(log_id).execute(&pool).await.unwrap();
        sqlx::query("delete from leave_requests where id = $1").bind(leave_id).execute(&pool).await.unwrap();
        sqlx::query("delete from leave_balances where id = $1").bind(balance_id).execute(&pool).await.unwrap();
        sqlx::query("delete from employees where id = $1").bind(employee_id).execute(&pool).await.unwrap();
        sqlx::query("delete from employees where id = $1").bind(approver_id).execute(&pool).await.unwrap();
        sqlx::query("delete from users where id = $1").bind(user_id).execute(&pool).await.unwrap();
        sqlx::query("delete from job_titles where id = $1").bind(job_title_id).execute(&pool).await.unwrap();
        sqlx::query("delete from branches where id = $1").bind(branch_id).execute(&pool).await.unwrap();
        sqlx::query("delete from tenants where id = $1").bind(tenant_id).execute(&pool).await.unwrap();
    }

    #[tokio::test]
    async fn hr_shift_schedules_round_trip_with_seed_user() {
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
        let admin_employee_id = Uuid::new_v4();
        let employee_id = Uuid::new_v4();
        let suffix = user_id.simple().to_string();
        let email = format!("rust-shift-{suffix}@example.com");
        let password = "Passw0rd!";
        let password_hash = hash(password, 4).unwrap();

        sqlx::query("insert into tenants (id, name, slug, email, status) values ($1, $2, $3, $4, 'ACTIVE')")
            .bind(tenant_id).bind(format!("Rust Shift Tenant {suffix}"))
            .bind(format!("rust-shift-tenant-{suffix}"))
            .bind(format!("shift-tenant-{suffix}@example.com"))
            .execute(&pool).await.unwrap();
        sqlx::query("insert into branches (id, name, code, type, tenant_id, status) values ($1, $2, $3, 'MAIN', $4, 'ACTIVE')")
            .bind(branch_id).bind(format!("Rust Shift Branch {suffix}"))
            .bind(format!("RSB{}", &suffix[..8])).bind(tenant_id)
            .execute(&pool).await.unwrap();
        sqlx::query("insert into job_titles (id, name, code, permissions_config, tenant_id) values ($1, $2, $3, '{\"schedules\":[\"read\",\"write\"]}'::jsonb, $4)")
            .bind(job_title_id).bind(format!("Rust Shift Role {suffix}"))
            .bind(format!("RSJ{}", &suffix[..8])).bind(tenant_id)
            .execute(&pool).await.unwrap();
        sqlx::query("insert into users (id, email, password_hash, role, tenant_id, is_active, email_verified) values ($1, $2, $3, 'ADMIN', $4, true, true)")
            .bind(user_id).bind(&email).bind(password_hash).bind(tenant_id)
            .execute(&pool).await.unwrap();
        sqlx::query("insert into employees (id, user_id, branch_id, job_title_id, employee_code, full_name, email, status, employment_type, hire_date, tenant_id) values ($1, $2, $3, $4, $5, 'Rust Shift Admin', $6, 'ACTIVE', 'FULL_TIME', '2026-01-01'::date, $7)")
            .bind(admin_employee_id).bind(user_id).bind(branch_id).bind(job_title_id)
            .bind(format!("RSA{}", &suffix[..8])).bind(&email).bind(tenant_id)
            .execute(&pool).await.unwrap();
        sqlx::query("insert into employees (id, branch_id, job_title_id, employee_code, full_name, status, employment_type, hire_date, tenant_id) values ($1, $2, $3, $4, 'Rust Shift Employee', 'ACTIVE', 'FULL_TIME', '2026-01-01'::date, $5)")
            .bind(employee_id).bind(branch_id).bind(job_title_id)
            .bind(format!("RSE{}", &suffix[..8])).bind(tenant_id)
            .execute(&pool).await.unwrap();

        let app = build_app(AppState { db: pool.clone(), jwt_secret: "test-secret".into(), jwt_ttl_seconds: 3600 });
        let login_response = app.clone().oneshot(
            Request::builder().method("POST").uri("/api/auth/login")
                .header("content-type", "application/json")
                .body(Body::from(json!({"email": email, "password": password}).to_string())).unwrap()
        ).await.unwrap();
        assert_eq!(login_response.status(), StatusCode::OK);
        let login_body = to_bytes(login_response.into_body(), usize::MAX).await.unwrap();
        let login_json: Value = serde_json::from_slice(&login_body).unwrap();
        let token = login_json["data"]["token"].as_str().unwrap();

        let schedule_response = app.clone().oneshot(
            Request::builder().method("POST").uri("/api/shift_schedules")
                .header("authorization", format!("Bearer {token}"))
                .header("content-type", "application/json")
                .body(Body::from(json!({
                    "branch_id": branch_id,
                    "name": "Rust Day Shift",
                    "start_time": "09:00:00",
                    "end_time": "18:00:00",
                    "break_start": "12:00:00",
                    "break_end": "13:00:00",
                    "grace_period_minutes": 15,
                    "early_leave_minutes": 15,
                    "overtime_start_after": "18:30:00",
                    "applicable_days": ["MON", "TUE", "WED", "THU", "FRI"]
                }).to_string())).unwrap()
        ).await.unwrap();
        assert_eq!(schedule_response.status(), StatusCode::CREATED);
        let schedule_body = to_bytes(schedule_response.into_body(), usize::MAX).await.unwrap();
        let schedule_json: Value = serde_json::from_slice(&schedule_body).unwrap();
        let schedule_id = Uuid::parse_str(schedule_json["data"]["id"].as_str().unwrap()).unwrap();

        let employee_shift_response = app.clone().oneshot(
            Request::builder().method("POST").uri("/api/employee_shifts")
                .header("authorization", format!("Bearer {token}"))
                .header("content-type", "application/json")
                .body(Body::from(json!({
                    "employee_id": employee_id,
                    "shift_schedule_id": schedule_id,
                    "effective_date": "2026-05-01"
                }).to_string())).unwrap()
        ).await.unwrap();
        assert_eq!(employee_shift_response.status(), StatusCode::CREATED);
        let employee_shift_body = to_bytes(employee_shift_response.into_body(), usize::MAX).await.unwrap();
        let employee_shift_json: Value = serde_json::from_slice(&employee_shift_body).unwrap();
        let employee_shift_id = Uuid::parse_str(employee_shift_json["data"]["id"].as_str().unwrap()).unwrap();

        for uri in [
            format!("/api/shift_schedules/{schedule_id}"),
            format!("/api/shift_schedules?branch_id={branch_id}"),
            format!("/api/employee_shifts/{employee_shift_id}"),
            format!("/api/employee_shifts?shift_schedule_id={schedule_id}&effective_date_lte=2026-05-02"),
            format!("/api/hr/shift-schedules/{schedule_id}"),
            format!("/api/hr/shift-schedules?status=active"),
            format!("/api/hr/employee-shifts/{employee_shift_id}"),
            "/api/hr/employee-shifts?startDate=2026-05-01&endDate=2026-05-02".to_string(),
        ] {
            let response = app.clone().oneshot(
                Request::builder().uri(uri)
                    .header("authorization", format!("Bearer {token}"))
                    .body(Body::empty()).unwrap()
            ).await.unwrap();
            assert_eq!(response.status(), StatusCode::OK);
        }

        let shift_update_response = app.clone().oneshot(
            Request::builder().method("PUT").uri(format!("/api/hr/employee-shifts/{employee_shift_id}"))
                .header("authorization", format!("Bearer {token}"))
                .header("content-type", "application/json")
                .body(Body::from(json!({"end_date": "2026-05-31"}).to_string())).unwrap()
        ).await.unwrap();
        assert_eq!(shift_update_response.status(), StatusCode::OK);
        let schedule_update_response = app.clone().oneshot(
            Request::builder().method("PUT").uri(format!("/api/hr/shift-schedules/{schedule_id}"))
                .header("authorization", format!("Bearer {token}"))
                .header("content-type", "application/json")
                .body(Body::from(json!({"status": "archived"}).to_string())).unwrap()
        ).await.unwrap();
        assert_eq!(schedule_update_response.status(), StatusCode::OK);

        let archived_default_list_response = app.clone().oneshot(
            Request::builder().uri(format!("/api/shift_schedules?branch_id={branch_id}"))
                .header("authorization", format!("Bearer {token}"))
                .body(Body::empty()).unwrap()
        ).await.unwrap();
        assert_eq!(archived_default_list_response.status(), StatusCode::OK);
        let archived_default_list_body = to_bytes(archived_default_list_response.into_body(), usize::MAX).await.unwrap();
        let archived_default_list_json: Value = serde_json::from_slice(&archived_default_list_body).unwrap();
        assert!(!archived_default_list_json["data"].as_array().unwrap().iter().any(|row| {
            row["id"] == schedule_id.to_string()
        }));

        let archived_explicit_list_response = app.clone().oneshot(
            Request::builder().uri(format!("/api/shift_schedules?branch_id={branch_id}&status=archived"))
                .header("authorization", format!("Bearer {token}"))
                .body(Body::empty()).unwrap()
        ).await.unwrap();
        assert_eq!(archived_explicit_list_response.status(), StatusCode::OK);
        let archived_explicit_list_body = to_bytes(archived_explicit_list_response.into_body(), usize::MAX).await.unwrap();
        let archived_explicit_list_json: Value = serde_json::from_slice(&archived_explicit_list_body).unwrap();
        assert!(archived_explicit_list_json["data"].as_array().unwrap().iter().any(|row| {
            row["id"] == schedule_id.to_string() && row["status"] == "archived"
        }));

        sqlx::query("delete from employee_shifts where id = $1").bind(employee_shift_id).execute(&pool).await.unwrap();
        sqlx::query("delete from shift_schedules where id = $1").bind(schedule_id).execute(&pool).await.unwrap();
        sqlx::query("delete from employees where id = $1").bind(employee_id).execute(&pool).await.unwrap();
        sqlx::query("delete from employees where id = $1").bind(admin_employee_id).execute(&pool).await.unwrap();
        sqlx::query("delete from users where id = $1").bind(user_id).execute(&pool).await.unwrap();
        sqlx::query("delete from job_titles where id = $1").bind(job_title_id).execute(&pool).await.unwrap();
        sqlx::query("delete from branches where id = $1").bind(branch_id).execute(&pool).await.unwrap();
        sqlx::query("delete from tenants where id = $1").bind(tenant_id).execute(&pool).await.unwrap();
    }

    #[tokio::test]
    async fn hr_makeup_requests_round_trip_with_seed_user() {
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
        let approver_id = Uuid::new_v4();
        let employee_id = Uuid::new_v4();
        let suffix = user_id.simple().to_string();
        let email = format!("rust-makeup-{suffix}@example.com");
        let password = "Passw0rd!";
        let password_hash = hash(password, 4).unwrap();

        sqlx::query("insert into tenants (id, name, slug, email, status) values ($1, $2, $3, $4, 'ACTIVE')")
            .bind(tenant_id).bind(format!("Rust Makeup Tenant {suffix}"))
            .bind(format!("rust-makeup-tenant-{suffix}"))
            .bind(format!("makeup-tenant-{suffix}@example.com"))
            .execute(&pool).await.unwrap();
        sqlx::query("insert into branches (id, name, code, type, tenant_id, status) values ($1, $2, $3, 'MAIN', $4, 'ACTIVE')")
            .bind(branch_id).bind(format!("Rust Makeup Branch {suffix}"))
            .bind(format!("RMB{}", &suffix[..8])).bind(tenant_id)
            .execute(&pool).await.unwrap();
        sqlx::query("insert into job_titles (id, name, code, permissions_config, tenant_id) values ($1, $2, $3, '{\"makeup\":[\"read\",\"write\"]}'::jsonb, $4)")
            .bind(job_title_id).bind(format!("Rust Makeup Role {suffix}"))
            .bind(format!("RMJ{}", &suffix[..8])).bind(tenant_id)
            .execute(&pool).await.unwrap();
        sqlx::query("insert into users (id, email, password_hash, role, tenant_id, is_active, email_verified) values ($1, $2, $3, 'ADMIN', $4, true, true)")
            .bind(user_id).bind(&email).bind(password_hash).bind(tenant_id)
            .execute(&pool).await.unwrap();
        sqlx::query("insert into employees (id, user_id, branch_id, job_title_id, employee_code, full_name, email, status, employment_type, hire_date, tenant_id) values ($1, $2, $3, $4, $5, 'Rust Makeup Approver', $6, 'ACTIVE', 'FULL_TIME', '2026-01-01'::date, $7)")
            .bind(approver_id).bind(user_id).bind(branch_id).bind(job_title_id)
            .bind(format!("RMA{}", &suffix[..8])).bind(&email).bind(tenant_id)
            .execute(&pool).await.unwrap();
        sqlx::query("insert into employees (id, branch_id, job_title_id, employee_code, full_name, status, employment_type, hire_date, tenant_id) values ($1, $2, $3, $4, 'Rust Makeup Employee', 'ACTIVE', 'FULL_TIME', '2026-01-01'::date, $5)")
            .bind(employee_id).bind(branch_id).bind(job_title_id)
            .bind(format!("RME{}", &suffix[..8])).bind(tenant_id)
            .execute(&pool).await.unwrap();

        let app = build_app(AppState { db: pool.clone(), jwt_secret: "test-secret".into(), jwt_ttl_seconds: 3600 });
        let login_response = app.clone().oneshot(
            Request::builder().method("POST").uri("/api/auth/login")
                .header("content-type", "application/json")
                .body(Body::from(json!({"email": email, "password": password}).to_string())).unwrap()
        ).await.unwrap();
        assert_eq!(login_response.status(), StatusCode::OK);
        let login_body = to_bytes(login_response.into_body(), usize::MAX).await.unwrap();
        let login_json: Value = serde_json::from_slice(&login_body).unwrap();
        let token = login_json["data"]["token"].as_str().unwrap();

        let request_response = app.clone().oneshot(
            Request::builder().method("POST").uri("/api/makeup_requests")
                .header("authorization", format!("Bearer {token}"))
                .header("content-type", "application/json")
                .body(Body::from(json!({
                    "employee_id": employee_id,
                    "branch_id": branch_id,
                    "target_date": "2026-06-01",
                    "makeup_type": "BOTH",
                    "requested_check_in": "09:00:00",
                    "requested_check_out": "18:00:00",
                    "reason": "Rust makeup smoke",
                    "request_status": "PENDING"
                }).to_string())).unwrap()
        ).await.unwrap();
        assert_eq!(request_response.status(), StatusCode::CREATED);
        let request_body = to_bytes(request_response.into_body(), usize::MAX).await.unwrap();
        let request_json: Value = serde_json::from_slice(&request_body).unwrap();
        let request_id = Uuid::parse_str(request_json["data"]["id"].as_str().unwrap()).unwrap();

        let log_response = app.clone().oneshot(
            Request::builder().method("POST").uri("/api/makeup_approval_logs")
                .header("authorization", format!("Bearer {token}"))
                .header("content-type", "application/json")
                .body(Body::from(json!({
                    "makeup_request_id": request_id,
                    "action_by": employee_id,
                    "action": "SUBMIT",
                    "previous_status": null,
                    "new_status": "PENDING",
                    "notes": "提交補打卡申請"
                }).to_string())).unwrap()
        ).await.unwrap();
        assert_eq!(log_response.status(), StatusCode::CREATED);
        let log_body = to_bytes(log_response.into_body(), usize::MAX).await.unwrap();
        let log_json: Value = serde_json::from_slice(&log_body).unwrap();
        let log_id = Uuid::parse_str(log_json["data"]["id"].as_str().unwrap()).unwrap();

        for uri in [
            format!("/api/makeup_requests/{request_id}"),
            format!("/api/makeup_requests?employee_id={employee_id}&request_status=PENDING"),
            format!("/api/makeup_approval_logs?makeup_request_id={request_id}"),
        ] {
            let response = app.clone().oneshot(
                Request::builder().uri(uri)
                    .header("authorization", format!("Bearer {token}"))
                    .body(Body::empty()).unwrap()
            ).await.unwrap();
            assert_eq!(response.status(), StatusCode::OK);
        }

        let review_response = app.clone().oneshot(
            Request::builder().method("PATCH").uri(format!("/api/makeup_requests/{request_id}"))
                .header("authorization", format!("Bearer {token}"))
                .header("content-type", "application/json")
                .body(Body::from(json!({
                    "request_status": "APPROVED",
                    "approver_id": approver_id,
                    "approved_at": "2026-06-02T00:00:00Z",
                    "approval_notes": "ok"
                }).to_string())).unwrap()
        ).await.unwrap();
        assert_eq!(review_response.status(), StatusCode::OK);

        sqlx::query("delete from makeup_approval_logs where id = $1").bind(log_id).execute(&pool).await.unwrap();
        sqlx::query("delete from makeup_requests where id = $1").bind(request_id).execute(&pool).await.unwrap();
        sqlx::query("delete from employees where id = $1").bind(employee_id).execute(&pool).await.unwrap();
        sqlx::query("delete from employees where id = $1").bind(approver_id).execute(&pool).await.unwrap();
        sqlx::query("delete from users where id = $1").bind(user_id).execute(&pool).await.unwrap();
        sqlx::query("delete from job_titles where id = $1").bind(job_title_id).execute(&pool).await.unwrap();
        sqlx::query("delete from branches where id = $1").bind(branch_id).execute(&pool).await.unwrap();
        sqlx::query("delete from tenants where id = $1").bind(tenant_id).execute(&pool).await.unwrap();
    }

    #[tokio::test]
    async fn hr_payroll_round_trip_with_seed_user() {
        if std::env::var("RUN_DB_TESTS").ok().as_deref() != Some("1") {
            return;
        }

        let database_url = std::env::var("DATABASE_URL")
            .expect("DATABASE_URL is required when RUN_DB_TESTS=1");
        let pool = sqlx::PgPool::connect(&database_url).await.unwrap();

        let tenant_id = Uuid::new_v4();
        let branch_id = Uuid::new_v4();
        let job_title_id = Uuid::new_v4();
        let to_job_title_id = Uuid::new_v4();
        let user_id = Uuid::new_v4();
        let admin_employee_id = Uuid::new_v4();
        let employee_id = Uuid::new_v4();
        let suffix = user_id.simple().to_string();
        let email = format!("rust-payroll-{suffix}@example.com");
        let password = "Passw0rd!";
        let password_hash = hash(password, 4).unwrap();

        sqlx::query("insert into tenants (id, name, slug, email, status) values ($1, $2, $3, $4, 'ACTIVE')")
            .bind(tenant_id).bind(format!("Rust Payroll Tenant {suffix}"))
            .bind(format!("rust-payroll-tenant-{suffix}"))
            .bind(format!("payroll-tenant-{suffix}@example.com"))
            .execute(&pool).await.unwrap();
        sqlx::query("insert into branches (id, name, code, type, tenant_id, status) values ($1, $2, $3, 'MAIN', $4, 'ACTIVE')")
            .bind(branch_id).bind(format!("Rust Payroll Branch {suffix}"))
            .bind(format!("RPB{}", &suffix[..8])).bind(tenant_id)
            .execute(&pool).await.unwrap();
        sqlx::query("insert into job_titles (id, name, code, permissions_config, tenant_id) values ($1, $2, $3, '{\"payroll\":[\"read\",\"write\"]}'::jsonb, $4)")
            .bind(job_title_id).bind(format!("Rust Payroll Role {suffix}"))
            .bind(format!("RPJ{}", &suffix[..8])).bind(tenant_id)
            .execute(&pool).await.unwrap();
        sqlx::query("insert into job_titles (id, name, code, permissions_config, tenant_id) values ($1, $2, $3, '{\"payroll\":[\"read\"]}'::jsonb, $4)")
            .bind(to_job_title_id).bind(format!("Rust Payroll Senior Role {suffix}"))
            .bind(format!("RPS{}", &suffix[..8])).bind(tenant_id)
            .execute(&pool).await.unwrap();
        sqlx::query("insert into users (id, email, password_hash, role, tenant_id, is_active, email_verified) values ($1, $2, $3, 'ADMIN', $4, true, true)")
            .bind(user_id).bind(&email).bind(password_hash).bind(tenant_id)
            .execute(&pool).await.unwrap();
        sqlx::query("insert into employees (id, user_id, branch_id, job_title_id, employee_code, full_name, email, status, employment_type, hire_date, basic_salary, tenant_id) values ($1, $2, $3, $4, $5, 'Rust Payroll Admin', $6, 'ACTIVE', 'FULL_TIME', '2026-01-01'::date, 80000, $7)")
            .bind(admin_employee_id).bind(user_id).bind(branch_id).bind(job_title_id)
            .bind(format!("RPA{}", &suffix[..8])).bind(&email).bind(tenant_id)
            .execute(&pool).await.unwrap();
        sqlx::query("insert into employees (id, branch_id, job_title_id, employee_code, full_name, status, employment_type, hire_date, basic_salary, tenant_id) values ($1, $2, $3, $4, 'Rust Payroll Employee', 'ACTIVE', 'FULL_TIME', '2026-01-01'::date, 50000, $5)")
            .bind(employee_id).bind(branch_id).bind(job_title_id)
            .bind(format!("RPE{}", &suffix[..8])).bind(tenant_id)
            .execute(&pool).await.unwrap();

        let app = build_app(AppState { db: pool.clone(), jwt_secret: "test-secret".into(), jwt_ttl_seconds: 3600 });
        let login_response = app.clone().oneshot(
            Request::builder().method("POST").uri("/api/auth/login")
                .header("content-type", "application/json")
                .body(Body::from(json!({"email": email, "password": password}).to_string())).unwrap()
        ).await.unwrap();
        assert_eq!(login_response.status(), StatusCode::OK);
        let login_body = to_bytes(login_response.into_body(), usize::MAX).await.unwrap();
        let login_json: Value = serde_json::from_slice(&login_body).unwrap();
        let token = login_json["data"]["token"].as_str().unwrap();

        let generate_response = app.clone().oneshot(
            Request::builder().method("POST").uri("/api/payroll/generate")
                .header("authorization", format!("Bearer {token}"))
                .header("content-type", "application/json")
                .body(Body::from(json!({
                    "period": "2026-07",
                    "employee_ids": [employee_id]
                }).to_string())).unwrap()
        ).await.unwrap();
        assert_eq!(generate_response.status(), StatusCode::OK);
        let generate_body = to_bytes(generate_response.into_body(), usize::MAX).await.unwrap();
        let generate_json: Value = serde_json::from_slice(&generate_body).unwrap();
        let salary_id = Uuid::parse_str(generate_json["data"]["records"][0]["id"].as_str().unwrap()).unwrap();

        for uri in [
            format!("/api/payroll/salary-records/{salary_id}"),
            "/api/payroll/salary-records?period=2026-07".to_string(),
            "/api/payroll/export?period=2026-07".to_string(),
        ] {
            let response = app.clone().oneshot(
                Request::builder().uri(uri)
                    .header("authorization", format!("Bearer {token}"))
                    .body(Body::empty()).unwrap()
            ).await.unwrap();
            assert_eq!(response.status(), StatusCode::OK);
        }

        let update_response = app.clone().oneshot(
            Request::builder().method("PATCH").uri(format!("/api/payroll/salary-records/{salary_id}"))
                .header("authorization", format!("Bearer {token}"))
                .header("content-type", "application/json")
                .body(Body::from(json!({"bonus": 1000, "deductions": 100, "notes": "smoke"}).to_string())).unwrap()
        ).await.unwrap();
        assert_eq!(update_response.status(), StatusCode::OK);
        let approve_response = app.clone().oneshot(
            Request::builder().method("POST").uri(format!("/api/payroll/salary-records/{salary_id}/approve"))
                .header("authorization", format!("Bearer {token}"))
                .body(Body::empty()).unwrap()
        ).await.unwrap();
        assert_eq!(approve_response.status(), StatusCode::OK);
        let paid_response = app.clone().oneshot(
            Request::builder().method("POST").uri(format!("/api/payroll/salary-records/{salary_id}/pay"))
                .header("authorization", format!("Bearer {token}"))
                .body(Body::empty()).unwrap()
        ).await.unwrap();
        assert_eq!(paid_response.status(), StatusCode::OK);
        let batch_response = app.clone().oneshot(
            Request::builder().method("POST").uri("/api/payroll/batch-approve")
                .header("authorization", format!("Bearer {token}"))
                .header("content-type", "application/json")
                .body(Body::from(json!({"ids": [salary_id]}).to_string())).unwrap()
        ).await.unwrap();
        assert_eq!(batch_response.status(), StatusCode::OK);

        let promotion_response = app.clone().oneshot(
            Request::builder().method("POST").uri("/api/payroll/promotions")
                .header("authorization", format!("Bearer {token}"))
                .header("content-type", "application/json")
                .body(Body::from(json!({
                    "employee_id": employee_id,
                    "type": "PROMOTION",
                    "effective_date": "2026-08-01",
                    "to_job_title_id": to_job_title_id,
                    "new_base_salary": 60000,
                    "reason": "Rust payroll smoke"
                }).to_string())).unwrap()
        ).await.unwrap();
        assert_eq!(promotion_response.status(), StatusCode::CREATED);
        let promotion_body = to_bytes(promotion_response.into_body(), usize::MAX).await.unwrap();
        let promotion_json: Value = serde_json::from_slice(&promotion_body).unwrap();
        let promotion_id = Uuid::parse_str(promotion_json["data"]["id"].as_str().unwrap()).unwrap();
        assert_eq!(promotion_json["data"]["type"], "PROMOTION");
        let promotions_list_response = app.clone().oneshot(
            Request::builder().uri(format!("/api/payroll/promotions?employee_id={employee_id}"))
                .header("authorization", format!("Bearer {token}"))
                .body(Body::empty()).unwrap()
        ).await.unwrap();
        assert_eq!(promotions_list_response.status(), StatusCode::OK);
        let promotions_list_body = to_bytes(promotions_list_response.into_body(), usize::MAX).await.unwrap();
        let promotions_list_json: Value = serde_json::from_slice(&promotions_list_body).unwrap();
        assert!(promotions_list_json["data"].as_array().unwrap().iter().any(|row| {
            row["id"] == promotion_id.to_string() && row["type"] == "PROMOTION"
        }));

        sqlx::query("delete from payroll_promotions where id = $1").bind(promotion_id).execute(&pool).await.unwrap();
        sqlx::query("delete from payroll_salary_records where id = $1").bind(salary_id).execute(&pool).await.unwrap();
        sqlx::query("delete from employees where id = $1").bind(employee_id).execute(&pool).await.unwrap();
        sqlx::query("delete from employees where id = $1").bind(admin_employee_id).execute(&pool).await.unwrap();
        sqlx::query("delete from users where id = $1").bind(user_id).execute(&pool).await.unwrap();
        sqlx::query("delete from job_titles where id = $1").bind(to_job_title_id).execute(&pool).await.unwrap();
        sqlx::query("delete from job_titles where id = $1").bind(job_title_id).execute(&pool).await.unwrap();
        sqlx::query("delete from branches where id = $1").bind(branch_id).execute(&pool).await.unwrap();
        sqlx::query("delete from tenants where id = $1").bind(tenant_id).execute(&pool).await.unwrap();
    }

    #[tokio::test]
    async fn hr_performance_round_trip() {
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
        let email = format!("rust-performance-{suffix}@example.com");
        let password = "Passw0rd!";
        let password_hash = hash(password, 4).unwrap();

        sqlx::query(
            "insert into tenants (id, name, slug, email, status) values ($1, $2, $3, $4, 'ACTIVE')",
        )
        .bind(tenant_id)
        .bind(format!("Rust Performance Tenant {suffix}"))
        .bind(format!("rust-performance-tenant-{suffix}"))
        .bind(format!("performance-tenant-{suffix}@example.com"))
        .execute(&pool)
        .await
        .unwrap();

        sqlx::query(
            "insert into branches (id, name, code, type, tenant_id, status) values ($1, $2, $3, 'MAIN', $4, 'ACTIVE')",
        )
        .bind(branch_id)
        .bind(format!("Rust Performance Branch {suffix}"))
        .bind(format!("RP{}", &suffix[..8]))
        .bind(tenant_id)
        .execute(&pool)
        .await
        .unwrap();

        sqlx::query(
            "insert into job_titles (id, name, code, permissions_config, tenant_id) values ($1, $2, $3, '{}'::jsonb, $4)",
        )
        .bind(job_title_id)
        .bind(format!("Rust Performance Reviewer {suffix}"))
        .bind(format!("RPR{}", &suffix[..8]))
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
            "insert into employees (id, user_id, branch_id, job_title_id, employee_code, full_name, email, status, employment_type, hire_date, basic_salary, tenant_id) values ($1, $2, $3, $4, $5, $6, $7, 'ACTIVE', 'FULL_TIME', '2026-01-01'::date, 60000, $8)",
        )
        .bind(employee_id)
        .bind(user_id)
        .bind(branch_id)
        .bind(job_title_id)
        .bind(format!("RPE{}", &suffix[..8]))
        .bind("Rust Performance User")
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
                    .body(Body::from(json!({ "email": email, "password": password }).to_string()))
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(login_response.status(), StatusCode::OK);
        let login_body = to_bytes(login_response.into_body(), usize::MAX).await.unwrap();
        let login_json: Value = serde_json::from_slice(&login_body).unwrap();
        let token = login_json["data"]["token"].as_str().unwrap();

        let template_response = app
            .clone()
            .oneshot(
                Request::builder()
                    .method("POST")
                    .uri("/api/performance/kpi-templates")
                    .header("authorization", format!("Bearer {token}"))
                    .header("content-type", "application/json")
                    .body(Body::from(json!({
                        "name": "Monthly Coaching KPI",
                        "description": "Rust performance smoke template",
                        "review_type": "MONTHLY",
                        "kpis": [{ "id": "kpi_1", "name": "Retention", "weight": 100, "target": 90 }]
                    }).to_string()))
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(template_response.status(), StatusCode::CREATED);
        let template_body = to_bytes(template_response.into_body(), usize::MAX).await.unwrap();
        let template_json: Value = serde_json::from_slice(&template_body).unwrap();
        let template_id = template_json["data"]["id"].as_str().unwrap();

        let review_response = app
            .clone()
            .oneshot(
                Request::builder()
                    .method("POST")
                    .uri("/api/performance/reviews")
                    .header("authorization", format!("Bearer {token}"))
                    .header("content-type", "application/json")
                    .body(Body::from(json!({
                        "employee_id": employee_id,
                        "review_period": "2026-06",
                        "review_type": "MONTHLY",
                        "template_id": template_id,
                        "score": 88,
                        "comments": "On track"
                    }).to_string()))
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(review_response.status(), StatusCode::CREATED);
        let review_body = to_bytes(review_response.into_body(), usize::MAX).await.unwrap();
        let review_json: Value = serde_json::from_slice(&review_body).unwrap();
        let review_id = review_json["data"]["id"].as_str().unwrap();
        assert_eq!(review_json["data"]["status"], "DRAFT");
        assert_eq!(review_json["data"]["score"], 88.0);
        assert_eq!(review_json["data"]["kpi_data"].as_array().unwrap().len(), 1);

        let list_response = app
            .clone()
            .oneshot(
                Request::builder()
                    .uri("/api/performance/reviews?status=DRAFT&period=2026-06")
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
                    .uri(format!("/api/performance/reviews/{review_id}"))
                    .header("authorization", format!("Bearer {token}"))
                    .header("content-type", "application/json")
                    .body(Body::from(json!({
                        "score": 91,
                        "comments": "Exceeded target",
                        "improvement_plan": "Keep mentoring new members"
                    }).to_string()))
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(update_response.status(), StatusCode::OK);

        let submit_response = app
            .clone()
            .oneshot(
                Request::builder()
                    .method("POST")
                    .uri(format!("/api/performance/reviews/{review_id}/submit"))
                    .header("authorization", format!("Bearer {token}"))
                    .body(Body::empty())
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(submit_response.status(), StatusCode::OK);
        let submit_body = to_bytes(submit_response.into_body(), usize::MAX).await.unwrap();
        let submit_json: Value = serde_json::from_slice(&submit_body).unwrap();
        assert_eq!(submit_json["data"]["status"], "SUBMITTED");

        let approve_response = app
            .clone()
            .oneshot(
                Request::builder()
                    .method("POST")
                    .uri(format!("/api/performance/reviews/{review_id}/approve"))
                    .header("authorization", format!("Bearer {token}"))
                    .body(Body::empty())
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(approve_response.status(), StatusCode::OK);
        let approve_body = to_bytes(approve_response.into_body(), usize::MAX).await.unwrap();
        let approve_json: Value = serde_json::from_slice(&approve_body).unwrap();
        assert_eq!(approve_json["data"]["status"], "APPROVED");

        let dashboard_response = app
            .clone()
            .oneshot(
                Request::builder()
                    .uri("/api/performance/team-dashboard?period=2026-06")
                    .header("authorization", format!("Bearer {token}"))
                    .body(Body::empty())
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(dashboard_response.status(), StatusCode::OK);
        let dashboard_body = to_bytes(dashboard_response.into_body(), usize::MAX).await.unwrap();
        let dashboard_json: Value = serde_json::from_slice(&dashboard_body).unwrap();
        assert!(dashboard_json["data"]["total_reviews"].as_i64().unwrap() >= 1);
        assert!(dashboard_json["data"]["completed_reviews"].as_i64().unwrap() >= 1);

        let delete_template_response = app
            .clone()
            .oneshot(
                Request::builder()
                    .method("DELETE")
                    .uri(format!("/api/performance/kpi-templates/{template_id}"))
                    .header("authorization", format!("Bearer {token}"))
                    .body(Body::empty())
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(delete_template_response.status(), StatusCode::OK);
    }

    #[tokio::test]
    async fn admin_users_round_trip_with_seed_user() {
        if std::env::var("RUN_DB_TESTS").ok().as_deref() != Some("1") {
            return;
        }

        let database_url = std::env::var("DATABASE_URL")
            .expect("DATABASE_URL is required when RUN_DB_TESTS=1");
        let pool = sqlx::PgPool::connect(&database_url).await.unwrap();

        let tenant_id = Uuid::new_v4();
        let branch_id = Uuid::new_v4();
        let job_title_id = Uuid::new_v4();
        let admin_user_id = Uuid::new_v4();
        let admin_employee_id = Uuid::new_v4();
        let available_employee_id = Uuid::new_v4();
        let suffix = admin_user_id.simple().to_string();
        let admin_email = format!("rust-user-admin-{suffix}@example.com");
        let created_email = format!("rust-user-created-{suffix}@example.com");
        let password = "Passw0rd!";
        let password_hash = hash(password, 4).unwrap();

        sqlx::query(
            "insert into tenants (id, name, slug, email, status) values ($1, $2, $3, $4, 'ACTIVE')",
        )
        .bind(tenant_id)
        .bind(format!("Rust User Tenant {suffix}"))
        .bind(format!("rust-user-tenant-{suffix}"))
        .bind(format!("user-tenant-{suffix}@example.com"))
        .execute(&pool)
        .await
        .unwrap();

        sqlx::query(
            "insert into branches (id, name, code, type, tenant_id, status) values ($1, $2, $3, 'MAIN', $4, 'ACTIVE')",
        )
        .bind(branch_id)
        .bind(format!("Rust User Branch {suffix}"))
        .bind(format!("UB{}", &suffix[..8]))
        .bind(tenant_id)
        .execute(&pool)
        .await
        .unwrap();

        sqlx::query(
            "insert into job_titles (id, name, code, permissions_config, tenant_id) values ($1, $2, $3, '{\"users\":[\"read\",\"write\"]}'::jsonb, $4)",
        )
        .bind(job_title_id)
        .bind(format!("Rust User Admin {suffix}"))
        .bind(format!("UA{}", &suffix[..8]))
        .bind(tenant_id)
        .execute(&pool)
        .await
        .unwrap();

        sqlx::query(
            "insert into users (id, email, password_hash, role, tenant_id, is_active, email_verified) values ($1, $2, $3, 'ADMIN', $4, true, true)",
        )
        .bind(admin_user_id)
        .bind(&admin_email)
        .bind(password_hash)
        .bind(tenant_id)
        .execute(&pool)
        .await
        .unwrap();

        sqlx::query(
            "insert into employees (id, user_id, branch_id, job_title_id, employee_code, full_name, email, status, employment_type, hire_date, tenant_id) values ($1, $2, $3, $4, $5, $6, $7, 'ACTIVE', 'FULL_TIME', '2026-01-01'::date, $8)",
        )
        .bind(admin_employee_id)
        .bind(admin_user_id)
        .bind(branch_id)
        .bind(job_title_id)
        .bind(format!("UAE{}", &suffix[..8]))
        .bind("Rust User Admin")
        .bind(&admin_email)
        .bind(tenant_id)
        .execute(&pool)
        .await
        .unwrap();

        sqlx::query(
            "insert into employees (id, branch_id, job_title_id, employee_code, full_name, email, status, employment_type, hire_date, tenant_id) values ($1, $2, $3, $4, $5, $6, 'ACTIVE', 'FULL_TIME', '2026-01-01'::date, $7)",
        )
        .bind(available_employee_id)
        .bind(branch_id)
        .bind(job_title_id)
        .bind(format!("UVE{}", &suffix[..8]))
        .bind("Rust Available Employee")
        .bind(format!("available-{suffix}@example.com"))
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
                    .body(Body::from(json!({ "email": admin_email, "password": password }).to_string()))
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(login_response.status(), StatusCode::OK);
        let login_body = to_bytes(login_response.into_body(), usize::MAX).await.unwrap();
        let login_json: Value = serde_json::from_slice(&login_body).unwrap();
        let token = login_json["data"]["token"].as_str().unwrap();

        let available_response = app
            .clone()
            .oneshot(
                Request::builder()
                    .uri("/api/users/available-employees")
                    .header("authorization", format!("Bearer {token}"))
                    .body(Body::empty())
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(available_response.status(), StatusCode::OK);
        let available_body = to_bytes(available_response.into_body(), usize::MAX).await.unwrap();
        let available_json: Value = serde_json::from_slice(&available_body).unwrap();
        assert!(available_json["data"].as_array().unwrap().iter().any(|employee| {
            employee["id"] == available_employee_id.to_string()
        }));

        let create_response = app
            .clone()
            .oneshot(
                Request::builder()
                    .method("POST")
                    .uri("/api/users")
                    .header("authorization", format!("Bearer {token}"))
                    .header("content-type", "application/json")
                    .body(Body::from(json!({
                        "email": created_email,
                        "password": "NewPassw0rd!",
                        "role": "staff",
                        "employeeId": available_employee_id
                    }).to_string()))
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(create_response.status(), StatusCode::CREATED);
        let create_body = to_bytes(create_response.into_body(), usize::MAX).await.unwrap();
        let create_json: Value = serde_json::from_slice(&create_body).unwrap();
        let created_user_id = create_json["data"]["id"].as_str().unwrap().to_string();
        assert_eq!(create_json["data"]["role"], "STAFF");
        assert_eq!(create_json["data"]["employeeId"], available_employee_id.to_string());

        let list_response = app
            .clone()
            .oneshot(
                Request::builder()
                    .uri(format!("/api/users?search=created-{suffix}&role=STAFF&isActive=true"))
                    .header("authorization", format!("Bearer {token}"))
                    .body(Body::empty())
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(list_response.status(), StatusCode::OK);
        let list_body = to_bytes(list_response.into_body(), usize::MAX).await.unwrap();
        let list_json: Value = serde_json::from_slice(&list_body).unwrap();
        assert_eq!(list_json["pagination"]["total"], 1);
        assert_eq!(list_json["data"][0]["id"], created_user_id);

        let get_response = app
            .clone()
            .oneshot(
                Request::builder()
                    .uri(format!("/api/users/{created_user_id}"))
                    .header("authorization", format!("Bearer {token}"))
                    .body(Body::empty())
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(get_response.status(), StatusCode::OK);

        let update_response = app
            .clone()
            .oneshot(
                Request::builder()
                    .method("PATCH")
                    .uri(format!("/api/users/{created_user_id}"))
                    .header("authorization", format!("Bearer {token}"))
                    .header("content-type", "application/json")
                    .body(Body::from(json!({ "role": "manager", "isActive": false }).to_string()))
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(update_response.status(), StatusCode::OK);
        let update_body = to_bytes(update_response.into_body(), usize::MAX).await.unwrap();
        let update_json: Value = serde_json::from_slice(&update_body).unwrap();
        assert_eq!(update_json["data"]["role"], "MANAGER");
        assert_eq!(update_json["data"]["isActive"], false);

        let reset_response = app
            .clone()
            .oneshot(
                Request::builder()
                    .method("POST")
                    .uri(format!("/api/users/{created_user_id}/reset-password"))
                    .header("authorization", format!("Bearer {token}"))
                    .header("content-type", "application/json")
                    .body(Body::from(json!({ "newPassword": "ResetPassw0rd!" }).to_string()))
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(reset_response.status(), StatusCode::OK);

        let delete_response = app
            .clone()
            .oneshot(
                Request::builder()
                    .method("DELETE")
                    .uri(format!("/api/users/{created_user_id}"))
                    .header("authorization", format!("Bearer {token}"))
                    .body(Body::empty())
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(delete_response.status(), StatusCode::OK);

        let created_user_uuid = Uuid::parse_str(&created_user_id).unwrap();
        sqlx::query("update employees set user_id = null where id in ($1, $2)")
            .bind(admin_employee_id)
            .bind(available_employee_id)
            .execute(&pool)
            .await
            .unwrap();
        sqlx::query("delete from users where id in ($1, $2)")
            .bind(admin_user_id)
            .bind(created_user_uuid)
            .execute(&pool)
            .await
            .unwrap();
        sqlx::query("delete from employees where id in ($1, $2)")
            .bind(admin_employee_id)
            .bind(available_employee_id)
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
    async fn admin_tenants_management_round_trip_with_seed_user() {
        if std::env::var("RUN_DB_TESTS").ok().as_deref() != Some("1") {
            return;
        }

        let database_url = std::env::var("DATABASE_URL")
            .expect("DATABASE_URL is required when RUN_DB_TESTS=1");
        let pool = sqlx::PgPool::connect(&database_url).await.unwrap();

        let admin_tenant_id = Uuid::new_v4();
        let branch_id = Uuid::new_v4();
        let job_title_id = Uuid::new_v4();
        let admin_user_id = Uuid::new_v4();
        let admin_employee_id = Uuid::new_v4();
        let suffix = admin_user_id.simple().to_string();
        let admin_email = format!("rust-admin-tenants-{suffix}@example.com");
        let password = "Passw0rd!";
        let password_hash = hash(password, 4).unwrap();

        sqlx::query(
            "insert into tenants (id, name, slug, email, status, tenant_status) values ($1, $2, $3, $4, 'ACTIVE', 'active')",
        )
        .bind(admin_tenant_id)
        .bind(format!("Rust Admin Tenants Host {suffix}"))
        .bind(format!("rust-admin-tenants-host-{suffix}"))
        .bind(format!("admin-tenants-host-{suffix}@example.com"))
        .execute(&pool)
        .await
        .unwrap();

        sqlx::query(
            "insert into branches (id, name, code, type, tenant_id, status) values ($1, $2, $3, 'MAIN', $4, 'ACTIVE')",
        )
        .bind(branch_id)
        .bind(format!("Rust Admin Tenants Branch {suffix}"))
        .bind(format!("AT{}", &suffix[..8]))
        .bind(admin_tenant_id)
        .execute(&pool)
        .await
        .unwrap();

        sqlx::query(
            "insert into job_titles (id, name, code, permissions_config, tenant_id) values ($1, $2, $3, '{\"adminTenants\":[\"read\",\"write\"]}'::jsonb, $4)",
        )
        .bind(job_title_id)
        .bind(format!("Rust Admin Tenants Role {suffix}"))
        .bind(format!("ATR{}", &suffix[..8]))
        .bind(admin_tenant_id)
        .execute(&pool)
        .await
        .unwrap();

        sqlx::query(
            "insert into users (id, email, password_hash, role, tenant_id, is_active, email_verified) values ($1, $2, $3, 'ADMIN', $4, true, true)",
        )
        .bind(admin_user_id)
        .bind(&admin_email)
        .bind(password_hash)
        .bind(admin_tenant_id)
        .execute(&pool)
        .await
        .unwrap();

        sqlx::query(
            "insert into employees (id, user_id, branch_id, job_title_id, employee_code, full_name, email, status, employment_type, hire_date, tenant_id) values ($1, $2, $3, $4, $5, $6, $7, 'ACTIVE', 'FULL_TIME', '2026-01-01'::date, $8)",
        )
        .bind(admin_employee_id)
        .bind(admin_user_id)
        .bind(branch_id)
        .bind(job_title_id)
        .bind(format!("ATE{}", &suffix[..8]))
        .bind("Rust Admin Tenants User")
        .bind(&admin_email)
        .bind(admin_tenant_id)
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
                    .body(Body::from(json!({ "email": admin_email, "password": password }).to_string()))
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
                    .uri("/api/admin/tenants")
                    .header("authorization", format!("Bearer {token}"))
                    .header("content-type", "application/json")
                    .body(Body::from(json!({
                        "name": format!("Rust Managed Tenant {suffix}"),
                        "slug": format!("rust-managed-tenant-{suffix}"),
                        "email": format!("managed-{suffix}@example.com"),
                        "phone": "02-1234-5678",
                        "plan_type": "professional",
                        "billing_cycle": "monthly",
                        "max_members": 500,
                        "max_employees": 30,
                        "max_branches": 3,
                        "trial_days": 14
                    }).to_string()))
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(create_response.status(), StatusCode::CREATED);
        let create_body = to_bytes(create_response.into_body(), usize::MAX).await.unwrap();
        let create_json: Value = serde_json::from_slice(&create_body).unwrap();
        assert_eq!(create_json["success"], true);
        assert_eq!(create_json["tenant"]["tenant_status"], "trial");
        let managed_tenant_id = Uuid::parse_str(create_json["tenant"]["id"].as_str().unwrap()).unwrap();

        let list_response = app
            .clone()
            .oneshot(
                Request::builder()
                    .uri("/api/admin/tenants")
                    .header("authorization", format!("Bearer {token}"))
                    .body(Body::empty())
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(list_response.status(), StatusCode::OK);
        let list_body = to_bytes(list_response.into_body(), usize::MAX).await.unwrap();
        let list_json: Value = serde_json::from_slice(&list_body).unwrap();
        assert_eq!(list_json["success"], true);
        assert!(list_json["stats"]["totalTenants"].as_i64().unwrap() >= 2);
        assert!(list_json["tenants"].as_array().unwrap().iter().any(|tenant| {
            tenant["id"] == managed_tenant_id.to_string()
        }));

        let get_response = app
            .clone()
            .oneshot(
                Request::builder()
                    .uri(format!("/api/admin/tenants/{managed_tenant_id}"))
                    .header("authorization", format!("Bearer {token}"))
                    .body(Body::empty())
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(get_response.status(), StatusCode::OK);
        let get_body = to_bytes(get_response.into_body(), usize::MAX).await.unwrap();
        let get_json: Value = serde_json::from_slice(&get_body).unwrap();
        assert_eq!(get_json["tenant"]["usage"]["members"]["current"], 0);

        let update_response = app
            .clone()
            .oneshot(
                Request::builder()
                    .method("PATCH")
                    .uri(format!("/api/admin/tenants/{managed_tenant_id}"))
                    .header("authorization", format!("Bearer {token}"))
                    .header("content-type", "application/json")
                    .body(Body::from(json!({
                        "name": format!("Rust Managed Tenant Updated {suffix}"),
                        "email": format!("managed-updated-{suffix}@example.com"),
                        "phone": "02-8765-4321",
                        "billing_cycle": "yearly",
                        "max_members": 600,
                        "max_employees": 40,
                        "max_branches": 4
                    }).to_string()))
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(update_response.status(), StatusCode::OK);
        let update_body = to_bytes(update_response.into_body(), usize::MAX).await.unwrap();
        let update_json: Value = serde_json::from_slice(&update_body).unwrap();
        assert_eq!(update_json["tenant"]["billing_cycle"], "yearly");
        assert_eq!(update_json["tenant"]["max_members"], 600);

        let status_response = app
            .clone()
            .oneshot(
                Request::builder()
                    .method("PATCH")
                    .uri(format!("/api/admin/tenants/{managed_tenant_id}/status"))
                    .header("authorization", format!("Bearer {token}"))
                    .header("content-type", "application/json")
                    .body(Body::from(json!({ "status": "suspended" }).to_string()))
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(status_response.status(), StatusCode::OK);
        let status_body = to_bytes(status_response.into_body(), usize::MAX).await.unwrap();
        let status_json: Value = serde_json::from_slice(&status_body).unwrap();
        assert_eq!(status_json["tenant"]["tenant_status"], "suspended");

        sqlx::query("update employees set user_id = null where id = $1")
            .bind(admin_employee_id)
            .execute(&pool)
            .await
            .unwrap();
        sqlx::query("delete from users where id = $1")
            .bind(admin_user_id)
            .execute(&pool)
            .await
            .unwrap();
        sqlx::query("delete from employees where id = $1")
            .bind(admin_employee_id)
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
        sqlx::query("delete from tenants where id in ($1, $2)")
            .bind(admin_tenant_id)
            .bind(managed_tenant_id)
            .execute(&pool)
            .await
            .unwrap();
    }

    #[tokio::test]
    async fn admin_notification_config_and_usage_round_trip_with_seed_user() {
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
        let suffix = user_id.simple().to_string();
        let email = format!("rust-notification-admin-{suffix}@example.com");
        let password = "Passw0rd!";
        let password_hash = hash(password, 4).unwrap();

        sqlx::query("insert into tenants (id, name, slug, email, status) values ($1, $2, $3, $4, 'ACTIVE')")
            .bind(tenant_id)
            .bind(format!("Rust Notification Tenant {suffix}"))
            .bind(format!("rust-notification-{suffix}"))
            .bind(format!("notification-{suffix}@example.com"))
            .execute(&pool)
            .await
            .unwrap();
        sqlx::query("insert into branches (id, name, code, type, tenant_id, status) values ($1, $2, $3, 'MAIN', $4, 'ACTIVE')")
            .bind(branch_id)
            .bind(format!("Rust Notification Branch {suffix}"))
            .bind(format!("NB{}", &suffix[..8]))
            .bind(tenant_id)
            .execute(&pool)
            .await
            .unwrap();
        sqlx::query("insert into job_titles (id, name, code, permissions_config, tenant_id) values ($1, $2, $3, '{}'::jsonb, $4)")
            .bind(job_title_id)
            .bind(format!("Rust Notification Admin {suffix}"))
            .bind(format!("NA{}", &suffix[..8]))
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
        sqlx::query("insert into employees (id, user_id, branch_id, job_title_id, employee_code, full_name, email, status, employment_type, hire_date, tenant_id) values ($1, $2, $3, $4, $5, 'Rust Notification Admin', $6, 'ACTIVE', 'FULL_TIME', '2026-01-01'::date, $7)")
            .bind(employee_id)
            .bind(user_id)
            .bind(branch_id)
            .bind(job_title_id)
            .bind(format!("NAA{}", &suffix[..8]))
            .bind(&email)
            .bind(tenant_id)
            .execute(&pool)
            .await
            .unwrap();
        sqlx::query("insert into members (id, member_code, full_name, phone, email, branch_id, status, join_date, tenant_id) values ($1, $2, 'Rust Notification Member', '0912345678', $3, $4, 'ACTIVE', current_date, $5)")
            .bind(member_id)
            .bind(format!("NM{}", &suffix[..8]))
            .bind(format!("member-notification-{suffix}@example.com"))
            .bind(branch_id)
            .bind(tenant_id)
            .execute(&pool)
            .await
            .unwrap();
        sqlx::query("insert into member_notification_history (id, member_id, notification_type, title, body, successful_channel, overall_status, sent_at, tenant_id) values (gen_random_uuid(), $1, 'booking_reminder', 'Reminder', 'Class starts soon', 'sms', 'sent', '2026-06-01T10:00:00Z'::timestamptz, $2), (gen_random_uuid(), $1, 'system', 'System', 'Welcome', 'line', 'failed', '2026-06-01T11:00:00Z'::timestamptz, $2)")
            .bind(member_id)
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
                    .body(Body::from(json!({ "email": email, "password": password }).to_string()))
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(login_response.status(), StatusCode::OK);
        let login_body = to_bytes(login_response.into_body(), usize::MAX).await.unwrap();
        let login_json: Value = serde_json::from_slice(&login_body).unwrap();
        let token = login_json["data"]["token"].as_str().unwrap();

        let branches_response = app
            .clone()
            .oneshot(
                Request::builder()
                    .uri("/api/admin/notification-config")
                    .header("authorization", format!("Bearer {token}"))
                    .body(Body::empty())
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(branches_response.status(), StatusCode::OK);
        let branches_body = to_bytes(branches_response.into_body(), usize::MAX).await.unwrap();
        let branches_json: Value = serde_json::from_slice(&branches_body).unwrap();
        assert_eq!(branches_json["config"]["branch_id"], branch_id.to_string());

        let update_response = app
            .clone()
            .oneshot(
                Request::builder()
                    .method("PATCH")
                    .uri("/api/admin/notification-config")
                    .header("authorization", format!("Bearer {token}"))
                    .header("content-type", "application/json")
                    .body(Body::from(json!({
                        "branch_id": branch_id,
                        "line_channel_access_token": "line-token-1234567890",
                        "line_channel_secret": "line-secret",
                        "mitake_username": "mitake-user",
                        "mitake_password": "mitake-pass",
                        "sms_sender_name": "GymNexus",
                        "is_active": true
                    }).to_string()))
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(update_response.status(), StatusCode::OK);
        let update_body = to_bytes(update_response.into_body(), usize::MAX).await.unwrap();
        let update_json: Value = serde_json::from_slice(&update_body).unwrap();
        assert_eq!(update_json["config"]["has_line_config"], true);
        assert_eq!(update_json["config"]["has_sms_config"], true);
        assert_eq!(update_json["config"]["mitake_username"], "mitake-user");
        assert_eq!(update_json["config"]["sms_sender_name"], "GymNexus");

        let get_config_response = app
            .clone()
            .oneshot(
                Request::builder()
                    .uri(format!("/api/admin/notification-config?branch_id={branch_id}"))
                    .header("authorization", format!("Bearer {token}"))
                    .body(Body::empty())
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(get_config_response.status(), StatusCode::OK);

        let test_response = app
            .clone()
            .oneshot(
                Request::builder()
                    .method("POST")
                    .uri("/api/admin/notification-config/test")
                    .header("authorization", format!("Bearer {token}"))
                    .header("content-type", "application/json")
                    .body(Body::from(json!({ "branch_id": branch_id, "channel": "sms" }).to_string()))
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(test_response.status(), StatusCode::OK);
        let test_body = to_bytes(test_response.into_body(), usize::MAX).await.unwrap();
        let test_json: Value = serde_json::from_slice(&test_body).unwrap();
        assert_eq!(test_json["success"], true);

        let usage_response = app
            .clone()
            .oneshot(
                Request::builder()
                    .uri(format!("/api/admin/notification-usage?start_date=2026-06-01&end_date=2026-06-30&group_by=day&branch_id={branch_id}"))
                    .header("authorization", format!("Bearer {token}"))
                    .body(Body::empty())
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(usage_response.status(), StatusCode::OK);
        let usage_body = to_bytes(usage_response.into_body(), usize::MAX).await.unwrap();
        let usage_json: Value = serde_json::from_slice(&usage_body).unwrap();
        assert_eq!(usage_json["summary"]["sms"]["total_sent"], 1);
        assert_eq!(usage_json["summary"]["line"]["total_sent"], 1);
        assert_eq!(usage_json["details"]["notifications"].as_array().unwrap().len(), 2);

        let export_response = app
            .clone()
            .oneshot(
                Request::builder()
                    .uri(format!("/api/admin/notification-usage/export?start_date=2026-06-01&end_date=2026-06-30&branch_id={branch_id}&format=csv"))
                    .header("authorization", format!("Bearer {token}"))
                    .body(Body::empty())
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(export_response.status(), StatusCode::OK);
        assert_eq!(
            export_response.headers().get("content-type").unwrap(),
            "text/csv; charset=utf-8"
        );

        sqlx::query("delete from member_notification_history where member_id = $1").bind(member_id).execute(&pool).await.unwrap();
        sqlx::query("delete from members where id = $1").bind(member_id).execute(&pool).await.unwrap();
        sqlx::query("delete from employees where id = $1").bind(employee_id).execute(&pool).await.unwrap();
        sqlx::query("delete from users where id = $1").bind(user_id).execute(&pool).await.unwrap();
        sqlx::query("delete from job_titles where id = $1").bind(job_title_id).execute(&pool).await.unwrap();
        sqlx::query("delete from branches where id = $1").bind(branch_id).execute(&pool).await.unwrap();
        sqlx::query("delete from tenants where id = $1").bind(tenant_id).execute(&pool).await.unwrap();
    }

    #[tokio::test]
    async fn marketing_crm_round_trip_with_seed_user() {
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
        let suffix = user_id.simple().to_string();
        let email = format!("rust-marketing-{suffix}@example.com");
        let password = "Passw0rd!";
        let password_hash = hash(password, 4).unwrap();

        sqlx::query("insert into tenants (id, name, slug, email, status) values ($1, $2, $3, $4, 'ACTIVE')")
            .bind(tenant_id)
            .bind(format!("Rust Marketing Tenant {suffix}"))
            .bind(format!("rust-marketing-tenant-{suffix}"))
            .bind(format!("marketing-tenant-{suffix}@example.com"))
            .execute(&pool).await.unwrap();
        sqlx::query("insert into branches (id, name, code, type, tenant_id, status) values ($1, $2, $3, 'MAIN', $4, 'ACTIVE')")
            .bind(branch_id)
            .bind(format!("Rust Marketing Branch {suffix}"))
            .bind(format!("MB{}", &suffix[..8]))
            .bind(tenant_id)
            .execute(&pool).await.unwrap();
        sqlx::query("insert into job_titles (id, name, code, permissions_config, tenant_id) values ($1, $2, $3, '{\"crm\":[\"read\",\"write\"]}'::jsonb, $4)")
            .bind(job_title_id)
            .bind(format!("Rust Marketing Admin {suffix}"))
            .bind(format!("MA{}", &suffix[..8]))
            .bind(tenant_id)
            .execute(&pool).await.unwrap();
        sqlx::query("insert into users (id, email, password_hash, role, tenant_id, is_active, email_verified) values ($1, $2, $3, 'ADMIN', $4, true, true)")
            .bind(user_id).bind(&email).bind(password_hash).bind(tenant_id).execute(&pool).await.unwrap();
        sqlx::query("insert into employees (id, user_id, branch_id, job_title_id, employee_code, full_name, email, status, employment_type, hire_date, tenant_id) values ($1, $2, $3, $4, $5, $6, $7, 'ACTIVE', 'FULL_TIME', '2026-01-01'::date, $8)")
            .bind(employee_id).bind(user_id).bind(branch_id).bind(job_title_id).bind(format!("ME{}", &suffix[..8])).bind("Rust Marketing User").bind(&email).bind(tenant_id).execute(&pool).await.unwrap();
        sqlx::query("insert into members (id, member_code, full_name, phone, email, branch_id, sales_person_id, status, join_date, tenant_id) values ($1, $2, $3, $4, $5, $6, $7, 'ACTIVE', '2026-01-15'::date, $8)")
            .bind(member_id).bind(format!("MM{}", &suffix[..8])).bind("Rust Coupon Member").bind("0911000000").bind(format!("member-{suffix}@example.com")).bind(branch_id).bind(employee_id).bind(tenant_id).execute(&pool).await.unwrap();

        let app = build_app(AppState { db: pool.clone(), jwt_secret: "test-secret".into(), jwt_ttl_seconds: 3600 });
        let login_response = app.clone().oneshot(Request::builder().method("POST").uri("/api/auth/login").header("content-type", "application/json").body(Body::from(json!({"email": email, "password": password}).to_string())).unwrap()).await.unwrap();
        assert_eq!(login_response.status(), StatusCode::OK);
        let login_body = to_bytes(login_response.into_body(), usize::MAX).await.unwrap();
        let login_json: Value = serde_json::from_slice(&login_body).unwrap();
        let token = login_json["data"]["token"].as_str().unwrap();

        let lead_response = app.clone().oneshot(Request::builder().method("POST").uri("/api/leads").header("authorization", format!("Bearer {token}")).header("content-type", "application/json").body(Body::from(json!({"name":"Rust Lead","phone":"0922000000","email":"lead@example.com","source":"WEBSITE","branch_id":branch_id,"assigned_to":employee_id}).to_string())).unwrap()).await.unwrap();
        let lead_status = lead_response.status();
        let lead_body = to_bytes(lead_response.into_body(), usize::MAX).await.unwrap();
        assert_eq!(lead_status, StatusCode::CREATED, "{}", String::from_utf8_lossy(&lead_body));
        let lead_json: Value = serde_json::from_slice(&lead_body).unwrap();
        let lead_id = lead_json["data"]["id"].as_str().unwrap().to_string();
        assert_eq!(lead_json["data"]["branch_id"], branch_id.to_string());

        let list_leads = app.clone().oneshot(Request::builder().uri("/api/leads?limit=20&offset=0").header("authorization", format!("Bearer {token}")).body(Body::empty()).unwrap()).await.unwrap();
        assert_eq!(list_leads.status(), StatusCode::OK);
        let list_json: Value = serde_json::from_slice(&to_bytes(list_leads.into_body(), usize::MAX).await.unwrap()).unwrap();
        assert!(list_json["meta"]["total"].as_i64().unwrap() >= 1);

        let activity_response = app.clone().oneshot(Request::builder().method("POST").uri(format!("/api/leads/{lead_id}/activities")).header("authorization", format!("Bearer {token}")).header("content-type", "application/json").body(Body::from(json!({"activity_type":"CALL","content":"Called lead"}).to_string())).unwrap()).await.unwrap();
        assert_eq!(activity_response.status(), StatusCode::CREATED);

        let convert_response = app.clone().oneshot(Request::builder().method("POST").uri(format!("/api/leads/{lead_id}/convert")).header("authorization", format!("Bearer {token}")).header("content-type", "application/json").body(Body::from("{}" )).unwrap()).await.unwrap();
        assert_eq!(convert_response.status(), StatusCode::OK);
        let convert_json: Value = serde_json::from_slice(&to_bytes(convert_response.into_body(), usize::MAX).await.unwrap()).unwrap();
        let converted_member_id = convert_json["data"]["member_id"].as_str().unwrap().to_string();

        let campaign_response = app.clone().oneshot(Request::builder().method("POST").uri("/api/campaigns").header("authorization", format!("Bearer {token}")).header("content-type", "application/json").body(Body::from(json!({"name":"Rust Campaign","type":"PROMOTION","start_date":"2026-06-01","end_date":"2026-06-30","budget":1000,"status":"ACTIVE"}).to_string())).unwrap()).await.unwrap();
        assert_eq!(campaign_response.status(), StatusCode::CREATED);
        let campaign_json: Value = serde_json::from_slice(&to_bytes(campaign_response.into_body(), usize::MAX).await.unwrap()).unwrap();
        let campaign_id = campaign_json["data"]["id"].as_str().unwrap().to_string();
        let metrics_response = app.clone().oneshot(Request::builder().method("POST").uri(format!("/api/campaigns/{campaign_id}/update-metrics")).header("authorization", format!("Bearer {token}")).header("content-type", "application/json").body(Body::from(json!({"impressions":100,"clicks":10,"conversions":2,"revenue":2500,"actual_cost":900}).to_string())).unwrap()).await.unwrap();
        assert_eq!(metrics_response.status(), StatusCode::OK);
        let roi_response = app.clone().oneshot(Request::builder().uri("/api/campaigns/roi-report").header("authorization", format!("Bearer {token}")).body(Body::empty()).unwrap()).await.unwrap();
        assert_eq!(roi_response.status(), StatusCode::OK);

        let coupon_response = app.clone().oneshot(Request::builder().method("POST").uri("/api/coupons").header("authorization", format!("Bearer {token}")).header("content-type", "application/json").body(Body::from(json!({"code":format!("CP{}", &suffix[..8]),"name":"Rust Coupon","discount_type":"FIXED_AMOUNT","discount_value":100,"min_purchase":500,"usage_limit":10,"usage_per_member":1,"start_date":"2026-06-01","end_date":"2026-12-31"}).to_string())).unwrap()).await.unwrap();
        assert_eq!(coupon_response.status(), StatusCode::CREATED);
        let coupon_json: Value = serde_json::from_slice(&to_bytes(coupon_response.into_body(), usize::MAX).await.unwrap()).unwrap();
        let coupon_id = coupon_json["data"]["id"].as_str().unwrap().to_string();
        let coupon_code = coupon_json["data"]["code"].as_str().unwrap().to_string();
        let validate_response = app.clone().oneshot(Request::builder().method("POST").uri("/api/coupons/validate").header("authorization", format!("Bearer {token}")).header("content-type", "application/json").body(Body::from(json!({"code":coupon_code,"member_id":member_id,"amount":1000}).to_string())).unwrap()).await.unwrap();
        assert_eq!(validate_response.status(), StatusCode::OK);
        let validate_json: Value = serde_json::from_slice(&to_bytes(validate_response.into_body(), usize::MAX).await.unwrap()).unwrap();
        assert_eq!(validate_json["data"]["valid"], true);
        let apply_response = app.clone().oneshot(Request::builder().method("POST").uri("/api/coupons/apply").header("authorization", format!("Bearer {token}")).header("content-type", "application/json").body(Body::from(json!({"coupon_id":coupon_id,"member_id":member_id,"discount_amount":100}).to_string())).unwrap()).await.unwrap();
        assert_eq!(apply_response.status(), StatusCode::CREATED);

        let calculate_response = app.clone().oneshot(Request::builder().method("POST").uri("/api/segmentation/calculate").header("authorization", format!("Bearer {token}")).header("content-type", "application/json").body(Body::from(json!({"branch_id":branch_id}).to_string())).unwrap()).await.unwrap();
        assert_eq!(calculate_response.status(), StatusCode::OK);
        let segments_response = app.clone().oneshot(Request::builder().uri(format!("/api/segmentation/segments?branch_id={branch_id}")).header("authorization", format!("Bearer {token}")).body(Body::empty()).unwrap()).await.unwrap();
        assert_eq!(segments_response.status(), StatusCode::OK);
        let export_response = app.clone().oneshot(Request::builder().uri("/api/segmentation/export/ALL").header("authorization", format!("Bearer {token}")).body(Body::empty()).unwrap()).await.unwrap();
        assert_eq!(export_response.status(), StatusCode::OK);

        let lead_uuid = Uuid::parse_str(&lead_id).unwrap();
        let campaign_uuid = Uuid::parse_str(&campaign_id).unwrap();
        let coupon_uuid = Uuid::parse_str(&coupon_id).unwrap();
        let converted_member_uuid = Uuid::parse_str(&converted_member_id).unwrap();
        sqlx::query("delete from coupon_usages where coupon_id = $1").bind(coupon_uuid).execute(&pool).await.unwrap();
        sqlx::query("delete from rfm_scores where tenant_id = $1").bind(tenant_id).execute(&pool).await.unwrap();
        sqlx::query("delete from lead_activities where lead_id = $1").bind(lead_uuid).execute(&pool).await.unwrap();
        sqlx::query("delete from leads where id = $1").bind(lead_uuid).execute(&pool).await.unwrap();
        sqlx::query("delete from coupons where id = $1").bind(coupon_uuid).execute(&pool).await.unwrap();
        sqlx::query("delete from campaign_assets where campaign_id = $1").bind(campaign_uuid).execute(&pool).await.unwrap();
        sqlx::query("delete from campaigns where id = $1").bind(campaign_uuid).execute(&pool).await.unwrap();
        sqlx::query("delete from members where id = $1").bind(converted_member_uuid).execute(&pool).await.unwrap();
        sqlx::query("delete from members where id = $1").bind(member_id).execute(&pool).await.unwrap();
        sqlx::query("delete from employees where id = $1").bind(employee_id).execute(&pool).await.unwrap();
        sqlx::query("delete from users where id = $1").bind(user_id).execute(&pool).await.unwrap();
        sqlx::query("delete from job_titles where id = $1").bind(job_title_id).execute(&pool).await.unwrap();
        sqlx::query("delete from branches where id = $1").bind(branch_id).execute(&pool).await.unwrap();
        sqlx::query("delete from tenants where id = $1").bind(tenant_id).execute(&pool).await.unwrap();
    }

}
