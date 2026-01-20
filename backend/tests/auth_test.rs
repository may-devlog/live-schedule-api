// 認証機能のテスト

mod common;

use axum::{
    body::Body,
    http::{Request, StatusCode},
};
use tower::ServiceExt;
use sqlx::{Pool, Sqlite};
use crate::common::{get_test_pool, create_test_user, create_test_token};

// テスト用のアプリケーションを作成
async fn create_test_app(pool: Pool<Sqlite>) -> axum::Router {
    // 環境変数を設定（テスト用）
    std::env::set_var("ALLOW_USER_REGISTRATION", "1");
    std::env::set_var("JWT_SECRET", "test-secret-key-for-testing-only");
    
    // 実際のモジュールを使用（lib.rsで公開されている必要がある）
    // 注意: 現在は直接インポートできないため、簡易版を使用
    let cors = tower_http::cors::CorsLayer::permissive();
    
    // 実際のハンドラーを使用するには、lib.rsで公開する必要がある
    // ここでは簡易版のルーターを作成
    axum::Router::new()
        .route("/health", axum::routing::get(|| async { "OK" }))
        .layer(cors)
        .layer(axum::extract::Extension(pool))
}

// 注意: 実際のハンドラーを使用するには、lib.rsでモジュールを公開する必要があります
// 現在は簡易版のテストのみ実装

#[tokio::test]
async fn test_health_check() {
    let pool = get_test_pool().await;
    let app = create_test_app(pool).await;
    
    let request = Request::builder()
        .method("GET")
        .uri("/health")
        .body(Body::empty())
        .unwrap();
    
    let response = app.oneshot(request).await.unwrap();
    
    assert_eq!(response.status(), StatusCode::OK);
}

#[tokio::test]
async fn test_create_test_user() {
    let pool = get_test_pool().await;
    
    // テストユーザーを作成
    let user_id = create_test_user(&pool, "test@example.com", "password123").await;
    
    // データベースにユーザーが作成されたか確認
    let user = sqlx::query("SELECT email FROM users WHERE id = ?")
        .bind(user_id)
        .fetch_optional(&pool)
        .await
        .unwrap();
    
    assert!(user.is_some());
    let row = user.unwrap();
    let email: String = row.get(0);
    assert_eq!(email, "test@example.com");
}

#[tokio::test]
async fn test_create_test_token() {
    let token = create_test_token(1);
    assert!(!token.is_empty());
    assert!(token.len() > 10); // JWTトークンは長い文字列
}

