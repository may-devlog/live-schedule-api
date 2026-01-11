// 認証ミドルウェア

use axum::async_trait;
use axum::extract::FromRequestParts;
use axum::http::request::Parts;
use axum::http::{header::AUTHORIZATION, StatusCode, HeaderMap};
use crate::auth::jwt::{extract_token_from_header, verify_token};

pub struct AuthenticatedUser {
    pub user_id: i32,
}

#[async_trait]
impl<S> FromRequestParts<S> for AuthenticatedUser
where
    S: Send + Sync,
{
    type Rejection = StatusCode;

    async fn from_request_parts(
        parts: &mut Parts,
        _state: &S,
    ) -> Result<Self, Self::Rejection> {
        // 認証を一時的に無効化（環境変数DISABLE_AUTHが設定されている場合）
        // TODO: エラーが解消したら、この条件を削除して認証を有効化する
        if std::env::var("DISABLE_AUTH").is_ok() {
            // 認証をスキップして、環境変数DEFAULT_USER_IDまたはDEFAULT_USER_EMAILからユーザーIDを取得
            // まずDEFAULT_USER_IDを確認、なければDEFAULT_USER_EMAILから取得を試みる
            // どちらも設定されていない場合は、デフォルトの1を使用（データベースから取得は後で実装）
            let default_user_id = if let Ok(user_id_str) = std::env::var("DEFAULT_USER_ID") {
                user_id_str.parse::<i32>().ok().unwrap_or(1)
            } else if let Ok(email) = std::env::var("DEFAULT_USER_EMAIL") {
                // メールアドレスからユーザーIDを取得（この関数は後で実装）
                // 今はデフォルトの1を使用
                println!("[AUTH DISABLED] DEFAULT_USER_EMAIL is set to: {}", email);
                println!("[AUTH DISABLED] Note: User ID lookup by email is not yet implemented, using default user_id=1");
                1
            } else {
                1 // デフォルトは1
            };
            println!("[AUTH DISABLED] Skipping authentication, using user_id={}", default_user_id);
            return Ok(AuthenticatedUser { user_id: default_user_id });
        }
        
        // 通常の認証処理（コードは残しておく）
        let headers = &parts.headers;
        let token = extract_token_from_header(headers)?;
        let user_id = verify_token(&token)?;
        Ok(AuthenticatedUser { user_id })
    }
}

