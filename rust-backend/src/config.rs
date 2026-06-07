use std::{env, net::SocketAddr};

use crate::error::AppError;

#[derive(Debug, Clone)]
pub struct Settings {
    pub bind_address: SocketAddr,
    pub database_url: String,
    pub db_max_connections: u32,
    pub jwt_secret: String,
    pub jwt_ttl_seconds: u64,
}

impl Settings {
    pub fn from_env() -> Result<Self, AppError> {
        let bind_address = env::var("BIND_ADDRESS")
            .unwrap_or_else(|_| "127.0.0.1:8056".to_string())
            .parse()
            .map_err(|_| AppError::Config("BIND_ADDRESS must be a host:port socket address".into()))?;

        let database_url = env::var("DATABASE_URL").unwrap_or_else(|_| {
            "postgresql://gym_nexus:gym_nexus_dev@localhost:15432/gym_nexus".to_string()
        });

        let db_max_connections = env::var("DB_MAX_CONNECTIONS")
            .unwrap_or_else(|_| "5".to_string())
            .parse::<u32>()
            .map_err(|_| AppError::Config("DB_MAX_CONNECTIONS must be a positive integer".into()))?;

        if db_max_connections == 0 {
            return Err(AppError::Config(
                "DB_MAX_CONNECTIONS must be greater than zero".into(),
            ));
        }

        let jwt_secret = env::var("JWT_SECRET").unwrap_or_else(|_| "dev-only-secret".to_string());
        if jwt_secret.trim().is_empty() {
            return Err(AppError::Config("JWT_SECRET must not be empty".into()));
        }

        let jwt_ttl_seconds = env::var("JWT_TTL_SECONDS")
            .unwrap_or_else(|_| "86400".to_string())
            .parse::<u64>()
            .map_err(|_| AppError::Config("JWT_TTL_SECONDS must be a positive integer".into()))?;

        if jwt_ttl_seconds == 0 {
            return Err(AppError::Config(
                "JWT_TTL_SECONDS must be greater than zero".into(),
            ));
        }

        Ok(Self {
            bind_address,
            database_url,
            db_max_connections,
            jwt_secret,
            jwt_ttl_seconds,
        })
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn rejects_zero_db_connections() {
        env::set_var("DB_MAX_CONNECTIONS", "0");
        env::set_var("BIND_ADDRESS", "127.0.0.1:8056");
        env::set_var("DATABASE_URL", "postgresql://user:pass@localhost/db");

        let result = Settings::from_env();

        assert!(result.is_err());

        env::remove_var("DB_MAX_CONNECTIONS");
        env::remove_var("BIND_ADDRESS");
        env::remove_var("DATABASE_URL");
    }
}
