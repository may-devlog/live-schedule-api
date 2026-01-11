// 設定関連（環境変数読み込み、CORS設定など）

use axum::http::HeaderValue;
use tower_http::cors::{Any, AllowOrigin, CorsLayer};
use std::str::FromStr;

// JWT秘密鍵（環境変数から読み込む、未設定の場合はデフォルト値）
pub fn get_jwt_secret() -> String {
    std::env::var("JWT_SECRET")
        .unwrap_or_else(|_| "your-secret-key-change-in-production".to_string())
}

// メール確認URLのベースURL（環境変数から読み込む、未設定の場合はデフォルト値）
pub fn get_base_url() -> String {
    std::env::var("BASE_URL")
        .unwrap_or_else(|_| "http://localhost:8081".to_string())
}

// フロントエンドURL（環境変数から読み込む、未設定の場合はBASE_URLを使用）
#[allow(dead_code)]
pub fn get_frontend_url() -> String {
    match std::env::var("FRONTEND_URL") {
        Ok(url) => {
            eprintln!("[FRONTEND_URL] Using FRONTEND_URL from environment: {}", url);
            url
        }
        Err(_) => {
            // FRONTEND_URLが未設定の場合はBASE_URLを使用（後方互換性のため）
            let base_url = get_base_url();
            eprintln!("[FRONTEND_URL] WARNING: FRONTEND_URL not set, falling back to BASE_URL: {}", base_url);
            base_url
        }
    }
}

// CORS設定
pub fn create_cors_layer() -> CorsLayer {
    let allowed_origin = std::env::var("ALLOWED_ORIGIN")
        .unwrap_or_else(|_| "*".to_string());
    
    if allowed_origin == "*" {
        CorsLayer::new()
            .allow_origin(Any)
            .allow_methods(Any)
            .allow_headers(Any)
    } else {
        // カンマ区切りで複数のオリジンを許可
        let origins: Vec<HeaderValue> = allowed_origin
            .split(',')
            .map(|s| s.trim())
            .filter(|s| !s.is_empty())
            .map(|s| HeaderValue::from_str(s).unwrap())
            .collect();
        
        if origins.is_empty() {
            // オリジンが指定されていない場合は全て許可
            CorsLayer::new()
                .allow_origin(Any)
                .allow_methods(Any)
                .allow_headers(Any)
        } else if origins.len() == 1 {
            // 単一オリジンの場合
            CorsLayer::new()
                .allow_origin(AllowOrigin::exact(origins[0].clone()))
                .allow_methods(Any)
                .allow_headers(Any)
        } else {
            // 複数オリジンの場合
            CorsLayer::new()
                .allow_origin(AllowOrigin::list(origins))
                .allow_methods(Any)
                .allow_headers(Any)
        }
    }
}

