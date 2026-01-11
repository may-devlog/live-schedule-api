// 認証ハンドラー

use axum::{
    extract::Extension,
    http::StatusCode,
    response::Json,
};
use chrono::{DateTime, Utc};
use sqlx::{Pool, Sqlite};
use crate::auth::{
    types::*,
    middleware::AuthenticatedUser,
    jwt::create_token,
};
use crate::utils::{
    email::{send_verification_email, send_password_reset_email, send_email_change_verification_email},
    helpers::generate_token,
    validation::is_valid_email,
};
use crate::lib::ErrorResponse;

// POST /auth/register
pub async fn register(
    Extension(pool): Extension<Pool<Sqlite>>,
    Json(payload): Json<RegisterRequest>,
) -> Result<Json<AuthResponse>, (StatusCode, Json<ErrorResponse>)> {
    println!("[REGISTER] Received registration request for email: {}", payload.email);
    
    // 環境変数で新規ユーザー登録を制御
    let allow_registration = std::env::var("ALLOW_USER_REGISTRATION")
        .unwrap_or_else(|_| "0".to_string())
        .to_lowercase();
    
    if allow_registration != "1" && allow_registration != "true" && allow_registration != "yes" {
        println!("[REGISTER] User registration is disabled (ALLOW_USER_REGISTRATION={})", allow_registration);
        return Err((
            StatusCode::FORBIDDEN,
            Json(ErrorResponse {
                error: "新規ユーザー登録は現在受け付けていません".to_string(),
            }),
        ));
    }
    
    // バリデーション
    if payload.email.is_empty() || payload.password.is_empty() {
        println!("[REGISTER] Validation failed: empty email or password");
        return Err((
            StatusCode::BAD_REQUEST,
            Json(ErrorResponse {
                error: "メールアドレスとパスワードは必須です".to_string(),
            }),
        ));
    }

    if !is_valid_email(&payload.email) {
        println!("[REGISTER] Validation failed: invalid email format");
        return Err((
            StatusCode::BAD_REQUEST,
            Json(ErrorResponse {
                error: "有効なメールアドレスを入力してください".to_string(),
            }),
        ));
    }

    if payload.password.len() < 6 {
        println!("[REGISTER] Validation failed: password too short");
        return Err((
            StatusCode::BAD_REQUEST,
            Json(ErrorResponse {
                error: "パスワードは6文字以上で入力してください".to_string(),
            }),
        ));
    }
    
    // share_idのバリデーション
    let share_id = if let Some(ref sid) = payload.share_id {
        let sid = sid.trim();
        if sid.is_empty() {
            return Err((
                StatusCode::BAD_REQUEST,
                Json(ErrorResponse {
                    error: "ユーザーIDは必須です".to_string(),
                }),
            ));
        }
        
        // ユーザーIDの形式チェック（英数字、ハイフン、アンダースコアのみ、3-20文字）
        if sid.len() < 3 || sid.len() > 20 {
            return Err((
                StatusCode::BAD_REQUEST,
                Json(ErrorResponse {
                    error: "ユーザーIDは3文字以上20文字以下で入力してください".to_string(),
                }),
            ));
        }
        
        if !sid.chars().all(|c| c.is_alphanumeric() || c == '-' || c == '_') {
            return Err((
                StatusCode::BAD_REQUEST,
                Json(ErrorResponse {
                    error: "ユーザーIDは英数字、ハイフン、アンダースコアのみ使用できます".to_string(),
                }),
            ));
        }
        
        // ユニーク性チェック
        let existing_share_id: Option<(i64,)> = sqlx::query_as(
            "SELECT id FROM users WHERE share_id = ?"
        )
        .bind(sid)
        .fetch_optional(&pool)
        .await
        .map_err(|e| {
            println!("[REGISTER] Failed to check share_id uniqueness: {:?}", e);
            (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(ErrorResponse {
                    error: "Database error".to_string(),
                }),
            )
        })?;
        
        if existing_share_id.is_some() {
            return Err((
                StatusCode::CONFLICT,
                Json(ErrorResponse {
                    error: "このユーザーIDは既に使用されています".to_string(),
                }),
            ));
        }
        
        Some(sid.to_string())
    } else {
        return Err((
            StatusCode::BAD_REQUEST,
            Json(ErrorResponse {
                error: "ユーザーIDは必須です".to_string(),
            }),
        ));
    };
    
    println!("[REGISTER] Validation passed");

    // 既存ユーザーのチェック
    let existing_user: Option<UserRow> = sqlx::query_as::<_, UserRow>(
        "SELECT id, email, password_hash, email_verified, verification_token, password_reset_token, password_reset_expires, email_change_token, email_change_expires, new_email, share_id, sharing_enabled, created_at, updated_at FROM users WHERE email = ?",
    )
    .bind(&payload.email)
    .fetch_optional(&pool)
    .await
    .map_err(|_| {
        (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(ErrorResponse {
                error: "Database error".to_string(),
            }),
        )
    })?;

    if existing_user.is_some() {
        println!("[REGISTER] User already exists");
        return Err((
            StatusCode::CONFLICT,
            Json(ErrorResponse {
                error: "このメールアドレスは既に登録されています".to_string(),
            }),
        ));
    }
    
    println!("[REGISTER] User does not exist, proceeding with registration");

    // パスワードをハッシュ化
    println!("[REGISTER] Hashing password...");
    let password_hash = bcrypt::hash(&payload.password, bcrypt::DEFAULT_COST)
        .map_err(|e| {
            println!("[REGISTER] Failed to hash password: {:?}", e);
            (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(ErrorResponse {
                    error: "Failed to hash password".to_string(),
                }),
            )
        })?;
    println!("[REGISTER] Password hashed successfully");

    // 確認トークンを生成
    let verification_token = generate_token();
    println!("[REGISTER] Generated verification token: {}", verification_token);
    let now = Utc::now().to_rfc3339();

    // ユーザーを作成（メール未確認状態）
    println!("[REGISTER] Inserting user into database...");
    let _result = sqlx::query(
        "INSERT INTO users (email, password_hash, email_verified, verification_token, share_id, sharing_enabled, created_at, updated_at) VALUES (?, ?, 0, ?, ?, 0, ?, ?)",
    )
    .bind(&payload.email)
    .bind(&password_hash)
    .bind(&verification_token)
    .bind(&share_id)
    .bind(&now)
    .bind(&now)
    .execute(&pool)
    .await
    .map_err(|e| {
        println!("[REGISTER] Failed to insert user: {:?}", e);
        (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(ErrorResponse {
                error: format!("Failed to create user: {:?}", e),
            }),
        )
    })?;
    println!("[REGISTER] User inserted successfully");

    // メール送信
    println!("[REGISTER] Sending verification email...");
    send_verification_email(&payload.email, &verification_token).await;
    println!("[REGISTER] Verification email sent");

    let response = AuthResponse {
        token: None, // メール未確認のためトークンは発行しない
        email: payload.email.clone(),
        email_verified: false,
    };
    println!("[REGISTER] Returning success response");
    Ok(Json(response))
}

// POST /auth/login
pub async fn login(
    Extension(pool): Extension<Pool<Sqlite>>,
    Json(payload): Json<LoginRequest>,
) -> Result<Json<AuthResponse>, (StatusCode, Json<ErrorResponse>)> {
    // ユーザーを検索
    eprintln!("[LOGIN] Attempting to login with email: {}", payload.email);
    let user: Option<UserRow> = sqlx::query_as::<_, UserRow>(
        "SELECT id, email, password_hash, email_verified, verification_token, password_reset_token, password_reset_expires, email_change_token, email_change_expires, new_email, share_id, sharing_enabled, created_at, updated_at FROM users WHERE email = ?",
    )
    .bind(&payload.email)
    .fetch_optional(&pool)
    .await
    .map_err(|e| {
        eprintln!("[LOGIN] Database error: {:?}", e);
        (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(ErrorResponse {
                error: format!("Database error: {}", e),
            }),
        )
    })?;
    
    eprintln!("[LOGIN] User lookup result: {:?}", user.as_ref().map(|u| (u.id, &u.email)));

    let user = user.ok_or((
        StatusCode::UNAUTHORIZED,
        Json(ErrorResponse {
            error: "メールアドレスまたはパスワードが正しくありません".to_string(),
        }),
    ))?;

    // パスワードを検証
    let valid = bcrypt::verify(&payload.password, &user.password_hash)
        .map_err(|_| {
            (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(ErrorResponse {
                    error: "Failed to verify password".to_string(),
                }),
            )
        })?;

    if !valid {
        return Err((
            StatusCode::UNAUTHORIZED,
            Json(ErrorResponse {
                error: "メールアドレスまたはパスワードが正しくありません".to_string(),
            }),
        ));
    }

    // メール確認済みかチェック
    if user.email_verified == 0 {
        return Ok(Json(AuthResponse {
            token: None,
            email: user.email,
            email_verified: false,
        }));
    }

    let token = create_token(user.id as i32);

    Ok(Json(AuthResponse {
        token: Some(token),
        email: user.email,
        email_verified: true,
    }))
}

// POST /auth/verify-email - メールアドレス確認
pub async fn verify_email(
    Extension(pool): Extension<Pool<Sqlite>>,
    Json(payload): Json<VerifyEmailRequest>,
) -> Result<Json<VerifyEmailResponse>, (StatusCode, Json<ErrorResponse>)> {
    // トークンでユーザーを検索
    let user: Option<UserRow> = sqlx::query_as::<_, UserRow>(
        "SELECT id, email, password_hash, email_verified, verification_token, password_reset_token, password_reset_expires, email_change_token, email_change_expires, new_email, share_id, sharing_enabled, created_at, updated_at FROM users WHERE verification_token = ?",
    )
    .bind(&payload.token)
    .fetch_optional(&pool)
    .await
    .map_err(|_| {
        (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(ErrorResponse {
                error: "Database error".to_string(),
            }),
        )
    })?;

    let user = user.ok_or((
        StatusCode::NOT_FOUND,
        Json(ErrorResponse {
            error: "無効な確認トークンです".to_string(),
        }),
    ))?;

    // 既に確認済みかチェック
    if user.email_verified != 0 {
        return Ok(Json(VerifyEmailResponse {
            success: true,
            message: "メールアドレスは既に確認済みです".to_string(),
        }));
    }

    // メール確認を完了
    let now = Utc::now().to_rfc3339();
    sqlx::query(
        "UPDATE users SET email_verified = 1, verification_token = NULL, updated_at = ? WHERE id = ?",
    )
    .bind(&now)
    .bind(user.id)
    .execute(&pool)
    .await
    .map_err(|_| {
        (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(ErrorResponse {
                error: "Failed to verify email".to_string(),
            }),
        )
    })?;

    Ok(Json(VerifyEmailResponse {
        success: true,
        message: "メールアドレスの確認が完了しました".to_string(),
    }))
}

// POST /auth/request-password-reset - パスワードリセット要求
pub async fn request_password_reset(
    Extension(pool): Extension<Pool<Sqlite>>,
    Json(payload): Json<RequestPasswordResetRequest>,
) -> Result<Json<PasswordResetResponse>, (StatusCode, Json<ErrorResponse>)> {
    eprintln!("[PASSWORD_RESET] ===== Request received =====");
    eprintln!("[PASSWORD_RESET] Request received for email: {}", payload.email);
    
    // ユーザーを検索
    eprintln!("[PASSWORD_RESET] Querying database for user with email: {}", payload.email);
    let user: Option<UserRow> = sqlx::query_as::<_, UserRow>(
        "SELECT id, email, password_hash, email_verified, verification_token, password_reset_token, password_reset_expires, email_change_token, email_change_expires, new_email, share_id, sharing_enabled, created_at, updated_at FROM users WHERE email = ?",
    )
    .bind(&payload.email)
    .fetch_optional(&pool)
    .await
    .map_err(|e| {
        eprintln!("[PASSWORD_RESET] Database error: {:?}", e);
        (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(ErrorResponse {
                error: "Database error".to_string(),
            }),
        )
    })?;

    // ユーザーが存在しない場合はエラーを返す
    if user.is_none() {
        eprintln!("[PASSWORD_RESET] User not found for email: {}", payload.email);
        eprintln!("[PASSWORD_RESET] Returning 404 NOT_FOUND for unregistered email: {}", payload.email);
        eprintln!("[PASSWORD_RESET] ===== Request END (404) =====");
        // 明示的にContent-Typeヘッダーを設定してJSONレスポンスを返す
        return Err((
            StatusCode::NOT_FOUND,
            Json(ErrorResponse {
                error: "このメールアドレスは登録されていません".to_string(),
            }),
        ));
    }

    let user = user.unwrap();
    eprintln!("[PASSWORD_RESET] User found: id={}, email={}", user.id, user.email);
    
    // データベースに保存されているメールアドレスを確認
    eprintln!("[PASSWORD_RESET] Database email: {}", user.email);
    eprintln!("[PASSWORD_RESET] Request email: {}", payload.email);

    // リセットトークンを生成
    let reset_token = generate_token();
    let expires_at = Utc::now()
        .checked_add_signed(chrono::Duration::hours(24))
        .expect("valid timestamp")
        .to_rfc3339();
    let now = Utc::now().to_rfc3339();

    // トークンを保存
    sqlx::query(
        "UPDATE users SET password_reset_token = ?, password_reset_expires = ?, updated_at = ? WHERE id = ?",
    )
    .bind(&reset_token)
    .bind(&expires_at)
    .bind(&now)
    .bind(user.id)
    .execute(&pool)
    .await
    .map_err(|_| {
        (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(ErrorResponse {
                error: "Failed to save reset token".to_string(),
            }),
        )
    })?;

    // メール送信をバックグラウンドで実行（レスポンスを先に返す）
    println!("[PASSWORD_RESET] Sending password reset email to: {}", user.email);
    println!("[PASSWORD_RESET] Reset token generated: {}", reset_token);
    eprintln!("[PASSWORD_RESET] About to call send_password_reset_email in background");
    
    // APIキーを取得（エラー時は早期リターン）
    let api_key = match std::env::var("RESEND_API_KEY") {
        Ok(key) => key,
        Err(_) => {
            eprintln!("[PASSWORD_RESET] RESEND_API_KEY not found");
            return Err((
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(ErrorResponse {
                    error: "メール送信の設定が正しくありません".to_string(),
                }),
            ));
        }
    };
    
    // バックグラウンドタスクとしてメール送信を実行
    let email = user.email.clone();
    let token = reset_token.clone();
    tokio::spawn(async move {
        if let Err(e) = send_password_reset_email(&email, &token, &api_key).await {
            eprintln!("[PASSWORD_RESET] Failed to send password reset email in background: {:?}", e);
        } else {
            eprintln!("[PASSWORD_RESET] Password reset email sent successfully in background");
        }
    });
    eprintln!("[PASSWORD_RESET] Email sending task spawned, returning response immediately");

    Ok(Json(PasswordResetResponse {
        success: true,
        message: "パスワードリセット用のメールを送信しました".to_string(),
    }))
}

// POST /auth/reset-password - パスワードリセット実行
pub async fn reset_password(
    Extension(pool): Extension<Pool<Sqlite>>,
    Json(payload): Json<ResetPasswordRequest>,
) -> Result<Json<PasswordResetResponse>, (StatusCode, Json<ErrorResponse>)> {
    // トークンでユーザーを検索
    let user: Option<UserRow> = sqlx::query_as::<_, UserRow>(
        "SELECT id, email, password_hash, email_verified, verification_token, password_reset_token, password_reset_expires, email_change_token, email_change_expires, new_email, share_id, sharing_enabled, created_at, updated_at FROM users WHERE password_reset_token = ?",
    )
    .bind(&payload.token)
    .fetch_optional(&pool)
    .await
    .map_err(|_| {
        (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(ErrorResponse {
                error: "Database error".to_string(),
            }),
        )
    })?;

    let user = user.ok_or((
        StatusCode::NOT_FOUND,
        Json(ErrorResponse {
            error: "無効なリセットトークンです".to_string(),
        }),
    ))?;

    // トークンの有効期限をチェック
    if let Some(expires_str) = &user.password_reset_expires {
        if let Ok(expires) = expires_str.parse::<DateTime<Utc>>() {
            if expires < Utc::now() {
                return Err((
                    StatusCode::BAD_REQUEST,
                    Json(ErrorResponse {
                        error: "リセットトークンの有効期限が切れています".to_string(),
                    }),
                ));
            }
        }
    }

    // パスワードのバリデーション
    if payload.new_password.len() < 6 {
        return Err((
            StatusCode::BAD_REQUEST,
            Json(ErrorResponse {
                error: "パスワードは6文字以上で入力してください".to_string(),
            }),
        ));
    }

    // パスワードをハッシュ化
    let password_hash = bcrypt::hash(&payload.new_password, bcrypt::DEFAULT_COST)
        .map_err(|_| {
            (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(ErrorResponse {
                    error: "Failed to hash password".to_string(),
                }),
            )
        })?;

    // パスワードを更新し、リセットトークンを削除
    let now = Utc::now().to_rfc3339();
    sqlx::query(
        "UPDATE users SET password_hash = ?, password_reset_token = NULL, password_reset_expires = NULL, updated_at = ? WHERE id = ?",
    )
    .bind(&password_hash)
    .bind(&now)
    .bind(user.id)
    .execute(&pool)
    .await
    .map_err(|_| {
        (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(ErrorResponse {
                error: "Failed to reset password".to_string(),
            }),
        )
    })?;

    Ok(Json(PasswordResetResponse {
        success: true,
        message: "パスワードのリセットが完了しました".to_string(),
    }))
}

// POST /auth/change-email - メールアドレス変更リクエスト
pub async fn change_email_request(
    user: AuthenticatedUser,
    Extension(pool): Extension<Pool<Sqlite>>,
    Json(payload): Json<ChangeEmailRequest>,
) -> Result<Json<PasswordResetResponse>, (StatusCode, Json<ErrorResponse>)> {
    // 新しいメールアドレスのバリデーション
    if !payload.new_email.contains('@') {
        return Err((
            StatusCode::BAD_REQUEST,
            Json(ErrorResponse {
                error: "有効なメールアドレスを入力してください".to_string(),
            }),
        ));
    }

    // 既に使用されているメールアドレスかチェック
    let existing_user: Option<UserRow> = sqlx::query_as::<_, UserRow>(
        "SELECT id, email, password_hash, email_verified, verification_token, password_reset_token, password_reset_expires, email_change_token, email_change_expires, new_email, share_id, sharing_enabled, created_at, updated_at FROM users WHERE email = ?",
    )
    .bind(&payload.new_email)
    .fetch_optional(&pool)
    .await
    .map_err(|_| {
        (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(ErrorResponse {
                error: "Database error".to_string(),
            }),
        )
    })?;

    if existing_user.is_some() {
        return Err((
            StatusCode::CONFLICT,
            Json(ErrorResponse {
                error: "このメールアドレスは既に使用されています".to_string(),
            }),
        ));
    }

    // ユーザーが存在するか確認（メールアドレス変更の権限チェック）
    let _user_exists: Option<i64> = sqlx::query_scalar("SELECT id FROM users WHERE id = ?")
        .bind(user.user_id as i64)
        .fetch_optional(&pool)
        .await
        .map_err(|_| {
            (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(ErrorResponse {
                    error: "Database error".to_string(),
                }),
            )
        })?;

    if _user_exists.is_none() {
        return Err((
            StatusCode::NOT_FOUND,
            Json(ErrorResponse {
                error: "ユーザーが見つかりません".to_string(),
            }),
        ));
    }

    // 変更トークンを生成
    let change_token = generate_token();
    let expires_at = Utc::now()
        .checked_add_signed(chrono::Duration::hours(24))
        .expect("valid timestamp")
        .to_rfc3339();
    let now = Utc::now().to_rfc3339();

    // トークンを保存
    sqlx::query(
        "UPDATE users SET email_change_token = ?, email_change_expires = ?, new_email = ?, updated_at = ? WHERE id = ?",
    )
    .bind(&change_token)
    .bind(&expires_at)
    .bind(&payload.new_email)
    .bind(&now)
    .bind(user.user_id as i64)
    .execute(&pool)
    .await
    .map_err(|_| {
        (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(ErrorResponse {
                error: "Failed to save change token".to_string(),
            }),
        )
    })?;

    // メール送信
    send_email_change_verification_email(&payload.new_email, &change_token).await;

    Ok(Json(PasswordResetResponse {
        success: true,
        message: "メールアドレス変更確認用のメールを送信しました".to_string(),
    }))
}

// POST /auth/verify-email-change - メールアドレス変更確認
pub async fn verify_email_change(
    Extension(pool): Extension<Pool<Sqlite>>,
    Json(payload): Json<VerifyEmailChangeRequest>,
) -> Result<Json<VerifyEmailChangeResponse>, (StatusCode, Json<ErrorResponse>)> {
    // トークンでユーザーを検索
    let user: Option<UserRow> = sqlx::query_as::<_, UserRow>(
        "SELECT id, email, password_hash, email_verified, verification_token, password_reset_token, password_reset_expires, email_change_token, email_change_expires, new_email, share_id, sharing_enabled, created_at, updated_at FROM users WHERE email_change_token = ?",
    )
    .bind(&payload.token)
    .fetch_optional(&pool)
    .await
    .map_err(|_| {
        (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(ErrorResponse {
                error: "Database error".to_string(),
            }),
        )
    })?;

    let user = user.ok_or((
        StatusCode::NOT_FOUND,
        Json(ErrorResponse {
            error: "無効な確認トークンです".to_string(),
        }),
    ))?;

    // トークンの有効期限をチェック
    if let Some(expires_str) = &user.email_change_expires {
        if let Ok(expires) = expires_str.parse::<DateTime<Utc>>() {
            if expires < Utc::now() {
                return Err((
                    StatusCode::BAD_REQUEST,
                    Json(ErrorResponse {
                        error: "確認トークンの有効期限が切れています".to_string(),
                    }),
                ));
            }
        }
    }

    // 新しいメールアドレスが設定されているかチェック
    let new_email = user.new_email.ok_or((
        StatusCode::BAD_REQUEST,
        Json(ErrorResponse {
            error: "新しいメールアドレスが設定されていません".to_string(),
        }),
    ))?;

    // 既に使用されているメールアドレスかチェック
    let existing_user: Option<UserRow> = sqlx::query_as::<_, UserRow>(
        "SELECT id, email, password_hash, email_verified, verification_token, password_reset_token, password_reset_expires, email_change_token, email_change_expires, new_email, created_at, updated_at FROM users WHERE email = ? AND id != ?",
    )
    .bind(&new_email)
    .bind(user.id)
    .fetch_optional(&pool)
    .await
    .map_err(|_| {
        (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(ErrorResponse {
                error: "Database error".to_string(),
            }),
        )
    })?;

    if existing_user.is_some() {
        return Err((
            StatusCode::CONFLICT,
            Json(ErrorResponse {
                error: "このメールアドレスは既に使用されています".to_string(),
            }),
        ));
    }

    // メールアドレスを更新
    let now = Utc::now().to_rfc3339();
    sqlx::query(
        "UPDATE users SET email = ?, email_change_token = NULL, email_change_expires = NULL, new_email = NULL, updated_at = ? WHERE id = ?",
    )
    .bind(&new_email)
    .bind(&now)
    .bind(user.id)
    .execute(&pool)
    .await
    .map_err(|_| {
        (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(ErrorResponse {
                error: "Failed to update email".to_string(),
            }),
        )
    })?;

    Ok(Json(VerifyEmailChangeResponse {
        success: true,
        message: "メールアドレスの変更が完了しました".to_string(),
        new_email: Some(new_email.clone()),
    }))
}

// POST /auth/change-share-id - ユーザーID変更
pub async fn change_share_id(
    user: AuthenticatedUser,
    Extension(pool): Extension<Pool<Sqlite>>,
    Json(payload): Json<ChangeShareIdRequest>,
) -> Result<Json<serde_json::Value>, (StatusCode, Json<ErrorResponse>)> {
    let share_id = payload.share_id.trim();
    
    // バリデーション
    if share_id.is_empty() {
        return Err((
            StatusCode::BAD_REQUEST,
            Json(ErrorResponse {
                error: "ユーザーIDは必須です".to_string(),
            }),
        ));
    }
    
    if share_id.len() < 3 || share_id.len() > 20 {
        return Err((
            StatusCode::BAD_REQUEST,
            Json(ErrorResponse {
                error: "ユーザーIDは3文字以上20文字以下で入力してください".to_string(),
            }),
        ));
    }
    
    if !share_id.chars().all(|c| c.is_alphanumeric() || c == '-' || c == '_') {
        return Err((
            StatusCode::BAD_REQUEST,
            Json(ErrorResponse {
                error: "ユーザーIDは英数字、ハイフン、アンダースコアのみ使用できます".to_string(),
            }),
        ));
    }
    
    // ユニーク性チェック（自分自身のshare_idは除外）
    let existing: Option<(i64,)> = sqlx::query_as(
        "SELECT id FROM users WHERE share_id = ? AND id != ?"
    )
    .bind(&share_id)
    .bind(user.user_id as i64)
    .fetch_optional(&pool)
    .await
    .map_err(|e| {
        eprintln!("[ChangeShareId] Database error: {}", e);
        (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(ErrorResponse {
                error: "Database error".to_string(),
            }),
        )
    })?;
    
    if existing.is_some() {
        return Err((
            StatusCode::CONFLICT,
            Json(ErrorResponse {
                error: "このユーザーIDは既に使用されています".to_string(),
            }),
        ));
    }
    
    // ユーザーIDを更新
    let now = Utc::now().to_rfc3339();
    sqlx::query(
        "UPDATE users SET share_id = ?, updated_at = ? WHERE id = ?"
    )
    .bind(&share_id)
    .bind(&now)
    .bind(user.user_id as i64)
    .execute(&pool)
    .await
    .map_err(|e| {
        eprintln!("[ChangeShareId] Failed to update share_id: {}", e);
        (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(ErrorResponse {
                error: "Failed to update share_id".to_string(),
            }),
        )
    })?;
    
    Ok(Json(serde_json::json!({
        "success": true,
        "message": "ユーザーIDが変更されました",
        "share_id": share_id
    })))
}

// POST /auth/toggle-sharing - 共有化のON/OFF切り替え
pub async fn toggle_sharing(
    user: AuthenticatedUser,
    Extension(pool): Extension<Pool<Sqlite>>,
    Json(payload): Json<ToggleSharingRequest>,
) -> Result<Json<serde_json::Value>, (StatusCode, Json<ErrorResponse>)> {
    eprintln!("[ToggleSharing] Received request from user_id: {}", user.user_id);
    eprintln!("[ToggleSharing] Request payload: enabled={}", payload.enabled);
    
    // まず、ユーザーが存在するか確認（全カラムを取得してデバッグ）
    let user_row_full: Option<(i64, String, Option<String>, i32)> = sqlx::query_as(
        "SELECT id, email, share_id, sharing_enabled FROM users WHERE id = ?"
    )
    .bind(user.user_id as i64)
    .fetch_optional(&pool)
    .await
    .map_err(|e| {
        eprintln!("[ToggleSharing] Database error: {}", e);
        (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(ErrorResponse {
                error: "Database error".to_string(),
            }),
        )
    })?;
    
    if let Some((id, email, share_id, sharing_enabled)) = user_row_full {
        eprintln!("[ToggleSharing] Found user: id={}, email={}, share_id={:?}, sharing_enabled={}", 
                 id, email, share_id, sharing_enabled);
        
        if share_id.is_none() {
            return Err((
                StatusCode::BAD_REQUEST,
                Json(ErrorResponse {
                    error: "ユーザーIDが設定されていません。まずユーザーIDを設定してください".to_string(),
                }),
            ));
        }
    } else {
        eprintln!("[ToggleSharing] User not found with user_id: {}", user.user_id);
        
        // デバッグ: データベース内の全ユーザーを確認
        let all_users: Vec<(i64, String, Option<String>)> = sqlx::query_as(
            "SELECT id, email, share_id FROM users"
        )
        .fetch_all(&pool)
        .await
        .unwrap_or_default();
        eprintln!("[ToggleSharing] All users in database: {:?}", all_users);
        
        return Err((
            StatusCode::NOT_FOUND,
            Json(ErrorResponse {
                error: "ユーザーが見つかりません".to_string(),
            }),
        ));
    }
    
    // 共有化フラグを更新
    let now = Utc::now().to_rfc3339();
    let sharing_enabled = if payload.enabled { 1 } else { 0 };
    sqlx::query(
        "UPDATE users SET sharing_enabled = ?, updated_at = ? WHERE id = ?"
    )
    .bind(sharing_enabled)
    .bind(&now)
    .bind(user.user_id as i64)
    .execute(&pool)
    .await
    .map_err(|e| {
        eprintln!("[ToggleSharing] Failed to update sharing_enabled: {}", e);
        (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(ErrorResponse {
                error: "Failed to update sharing status".to_string(),
            }),
        )
    })?;
    
    Ok(Json(serde_json::json!({
        "success": true,
        "sharing_enabled": payload.enabled
    })))
}

// GET /auth/sharing-status - 共有化の状態とURL取得
pub async fn get_sharing_status(
    user: AuthenticatedUser,
    Extension(pool): Extension<Pool<Sqlite>>,
) -> Result<Json<serde_json::Value>, (StatusCode, Json<ErrorResponse>)> {
    let row: Option<(Option<String>, i32)> = sqlx::query_as(
        "SELECT share_id, sharing_enabled FROM users WHERE id = ?"
    )
    .bind(user.user_id as i64)
    .fetch_optional(&pool)
    .await
    .map_err(|e| {
        eprintln!("[GetSharingStatus] Database error: {}", e);
        (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(ErrorResponse {
                error: "Database error".to_string(),
            }),
        )
    })?;
    
    if let Some((share_id, sharing_enabled)) = row {
        let sharing_url = if let Some(ref sid) = share_id {
            let frontend_url = std::env::var("FRONTEND_URL")
                .unwrap_or_else(|_| "https://live-schedule-api.pages.dev".to_string());
            Some(format!("{}/share/{}", frontend_url.trim_end_matches('/'), sid))
        } else {
            None
        };
        
        Ok(Json(serde_json::json!({
            "share_id": share_id,
            "sharing_enabled": sharing_enabled != 0,
            "sharing_url": sharing_url
        })))
    } else {
        Err((
            StatusCode::NOT_FOUND,
            Json(ErrorResponse {
                error: "ユーザーが見つかりません".to_string(),
            }),
        ))
    }
}


