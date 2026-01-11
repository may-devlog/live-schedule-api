// 認証関連の型定義

use serde::{Deserialize, Serialize};

#[derive(Debug, Serialize, Deserialize)]
pub struct Claims {
    pub user_id: i32,
    pub exp: usize,
}

#[derive(Debug, Deserialize)]
pub struct LoginRequest {
    pub email: String,
    pub password: String,
}

#[derive(Debug, Deserialize)]
pub struct RegisterRequest {
    pub email: String,
    pub password: String,
    pub share_id: Option<String>, // ユーザーID（オプション、初回登録時）
}

#[derive(Debug, Deserialize)]
pub struct VerifyEmailRequest {
    pub token: String,
}

#[derive(Debug, Deserialize)]
pub struct RequestPasswordResetRequest {
    pub email: String,
}

#[derive(Debug, Deserialize)]
pub struct ResetPasswordRequest {
    pub token: String,
    pub new_password: String,
}

#[derive(Debug, Deserialize)]
pub struct ChangeEmailRequest {
    pub new_email: String,
}

#[derive(Debug, Deserialize)]
pub struct VerifyEmailChangeRequest {
    pub token: String,
}

#[derive(Debug, Deserialize)]
pub struct ChangeShareIdRequest {
    pub share_id: String,
}

#[derive(Debug, Deserialize)]
pub struct ToggleSharingRequest {
    pub enabled: bool,
}

#[derive(Debug, Serialize)]
pub struct AuthResponse {
    pub token: Option<String>, // メール未確認の場合はNone
    pub email: String,
    pub email_verified: bool,
}

#[derive(Debug, Serialize)]
pub struct VerifyEmailResponse {
    pub success: bool,
    pub message: String,
}

#[derive(Debug, Serialize)]
pub struct VerifyEmailChangeResponse {
    pub success: bool,
    pub message: String,
    pub new_email: Option<String>,
}

#[derive(Debug, Serialize)]
pub struct PasswordResetResponse {
    pub success: bool,
    pub message: String,
}

#[derive(sqlx::FromRow)]
#[allow(dead_code)] // 一部のフィールドは将来使用する可能性があるため
pub struct UserRow {
    pub id: i64,
    pub email: String,
    pub password_hash: String,
    pub email_verified: i32, // 0/1
    pub verification_token: Option<String>,
    pub password_reset_token: Option<String>,
    pub password_reset_expires: Option<String>,
    pub email_change_token: Option<String>,
    pub email_change_expires: Option<String>,
    pub new_email: Option<String>,
    pub share_id: Option<String>,
    pub sharing_enabled: i32, // 0/1
    pub created_at: Option<String>,
    pub updated_at: Option<String>,
}


