// API統合テスト

mod common;

use axum::{
    body::Body,
    http::{Request, StatusCode, header::AUTHORIZATION},
};
use tower::ServiceExt;
use sqlx::{Pool, Sqlite};
use crate::common::{get_test_pool, create_test_user, create_test_token};

// テスト用のアプリケーションを作成（簡易版）
async fn create_test_app(pool: Pool<Sqlite>) -> axum::Router {
    // 環境変数を設定（テスト用）
    std::env::set_var("JWT_SECRET", "test-secret-key-for-testing-only");
    
    let cors = tower_http::cors::CorsLayer::permissive();
    
    axum::Router::new()
        .route("/health", axum::routing::get(|| async { "OK" }))
        .layer(cors)
        .layer(axum::extract::Extension(pool))
}

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
    
    let body = hyper::body::to_bytes(response.into_body()).await.unwrap();
    assert_eq!(body, "OK");
}

#[tokio::test]
async fn test_schedules_endpoint_requires_auth() {
    let pool = get_test_pool().await;
    let app = create_test_app(pool).await;
    
    // 認証なしでアクセス
    let request = Request::builder()
        .method("GET")
        .uri("/schedules")
        .body(Body::empty())
        .unwrap();
    
    let response = app.oneshot(request).await.unwrap();
    
    // 認証が必要なエンドポイントなので401が返される
    assert_eq!(response.status(), StatusCode::UNAUTHORIZED);
}

// 注意: 実際のエンドポイントをテストするには、lib.rsでモジュールを公開する必要があります
// 現在は簡易版のテストのみ実装

