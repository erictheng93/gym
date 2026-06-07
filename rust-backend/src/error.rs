use axum::{
    extract::rejection::JsonRejection,
    http::StatusCode,
    response::{IntoResponse, Response},
    Json,
};
use serde::Serialize;

#[derive(Debug, thiserror::Error)]
pub enum AppError {
    #[error("configuration error: {0}")]
    Config(String),
    #[error("database error")]
    Database(#[from] sqlx::Error),
    #[error("network error")]
    Io(#[from] std::io::Error),
    #[error("invalid request body")]
    Json(#[from] JsonRejection),
    #[error("validation error: {0}")]
    Validation(String),
    #[error("authentication failed")]
    Unauthorized,
    #[error("invalid credentials")]
    InvalidCredentials,
    #[error("resource not found")]
    NotFound,
}

#[derive(Debug, Serialize)]
pub struct ErrorResponse {
    pub success: bool,
    pub error: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub details: Option<String>,
}

impl ErrorResponse {
    pub fn new(error: impl Into<String>) -> Self {
        Self {
            success: false,
            error: error.into(),
            details: None,
        }
    }

    pub fn with_details(error: impl Into<String>, details: impl Into<String>) -> Self {
        Self {
            success: false,
            error: error.into(),
            details: Some(details.into()),
        }
    }
}

impl IntoResponse for AppError {
    fn into_response(self) -> Response {
        let (status, body) = match self {
            AppError::Config(message) => (
                StatusCode::INTERNAL_SERVER_ERROR,
                ErrorResponse::with_details("伺服器設定錯誤", message),
            ),
            AppError::Database(error) => {
                tracing::error!(?error, "database operation failed");
                #[cfg(test)]
                let body = ErrorResponse::with_details("資料庫暫時無法使用", error.to_string());
                #[cfg(not(test))]
                let body = ErrorResponse::new("資料庫暫時無法使用");
                (
                    StatusCode::SERVICE_UNAVAILABLE,
                    body,
                )
            }
            AppError::Io(error) => (
                StatusCode::INTERNAL_SERVER_ERROR,
                ErrorResponse::with_details("伺服器網路錯誤", error.to_string()),
            ),
            AppError::Json(rejection) => (
                StatusCode::BAD_REQUEST,
                ErrorResponse::with_details("請求資料格式錯誤", rejection.to_string()),
            ),
            AppError::Validation(message) => (
                StatusCode::BAD_REQUEST,
                ErrorResponse::with_details("請求資料驗證失敗", message),
            ),
            AppError::Unauthorized => (
                StatusCode::UNAUTHORIZED,
                ErrorResponse::new("未授權或登入已失效"),
            ),
            AppError::InvalidCredentials => (
                StatusCode::UNAUTHORIZED,
                ErrorResponse::new("電子郵件或密碼錯誤"),
            ),
            AppError::NotFound => (
                StatusCode::NOT_FOUND,
                ErrorResponse::new("找不到指定的資源"),
            ),
        };

        (status, Json(body)).into_response()
    }
}

pub async fn not_found() -> impl IntoResponse {
    (
        StatusCode::NOT_FOUND,
        Json(ErrorResponse::new("找不到指定的資源")),
    )
}

pub async fn method_not_allowed() -> impl IntoResponse {
    (
        StatusCode::METHOD_NOT_ALLOWED,
        Json(ErrorResponse::new("不支援的 HTTP 方法")),
    )
}
