#[allow(unused_imports)]
use axum::{
    body::Bytes,
    extract::{ConnectInfo, Extension, Path, Query},
    http::{header::AUTHORIZATION, HeaderValue, StatusCode, HeaderMap, request::Parts},
    response::Json,
    routing::{get, post, put, delete}, // delete is used in route definitions (line 5269)
    Router,
};
use axum::async_trait;
use chrono::{DateTime, Datelike, TimeZone, Utc};
use hmac::{Hmac, Mac};
use jsonwebtoken::{decode, encode, DecodingKey, EncodingKey, Header, Validation};
use rand::Rng;
use serde::{Deserialize, Serialize};
use sha2::Sha256;
use sqlx::sqlite::SqlitePoolOptions;
use sqlx::{Connection, Pool, Sqlite};
use std::net::SocketAddr;
use tower_http::cors::{Any, AllowOrigin, CorsLayer};
use resend_rs::types::CreateEmailBaseOptions;
use resend_rs::{Resend, Result};

// ====== 認証関連の型定義 ======

#[derive(Debug, Serialize, Deserialize)]
struct Claims {
    user_id: i32,
    exp: usize,
}

#[derive(Debug, Deserialize)]
struct LoginRequest {
    email: String,
    password: String,
}

#[derive(Debug, Deserialize)]
struct RegisterRequest {
    email: String,
    password: String,
    share_id: Option<String>, // ユーザーID（オプション、初回登録時）
}

#[derive(Debug, Deserialize)]
struct VerifyEmailRequest {
    token: String,
}

#[derive(Debug, Deserialize)]
struct RequestPasswordResetRequest {
    email: String,
}

#[derive(Debug, Deserialize)]
struct ResetPasswordRequest {
    token: String,
    new_password: String,
}

#[derive(Debug, Deserialize)]
struct ChangeEmailRequest {
    new_email: String,
}

#[derive(Debug, Deserialize)]
struct VerifyEmailChangeRequest {
    token: String,
}

#[derive(Debug, Deserialize)]
struct ChangeShareIdRequest {
    share_id: String,
}

#[derive(Debug, Deserialize)]
struct ToggleSharingRequest {
    enabled: bool,
}

#[derive(Debug, Deserialize)]
struct ProfileAvatarRequest {
    avatar_data_url: Option<String>,
}

#[derive(Debug, Deserialize)]
struct UpdateProfileRequest {
    display_name: Option<String>,
}

#[derive(Debug, Deserialize)]
struct DeleteAccountRequest {
    password: String,
}

#[derive(Debug, Deserialize)]
struct SearchSharedUserQuery {
    user_id: String,
}

#[derive(Debug, Deserialize)]
struct ContactRequest {
    name: Option<String>,
    email: String,
    subject: Option<String>,
    message: String,
    website: Option<String>, // ハニーポット: 人間の利用者には見せない隠しフィールド
}

#[derive(Debug, Serialize)]
struct AuthResponse {
    token: Option<String>, // メール未確認の場合はNone
    email: String,
    email_verified: bool,
}

#[derive(Debug, Serialize)]
struct VerifyEmailResponse {
    success: bool,
    message: String,
}

#[derive(Debug, Serialize)]
struct VerifyEmailChangeResponse {
    success: bool,
    message: String,
    new_email: Option<String>,
}

#[derive(Debug, Serialize)]
struct PasswordResetResponse {
    success: bool,
    message: String,
}

#[derive(Debug, Serialize)]
struct ContactResponse {
    success: bool,
    message: String,
}

#[derive(Debug, Serialize)]
struct ErrorResponse {
    error: String,
}

#[derive(sqlx::FromRow)]
#[allow(dead_code)] // 一部のフィールドは将来使用する可能性があるため
struct UserRow {
    id: i64,
    email: String,
    password_hash: String,
    email_verified: i32, // 0/1
    verification_token: Option<String>,
    password_reset_token: Option<String>,
    password_reset_expires: Option<String>,
    email_change_token: Option<String>,
    email_change_expires: Option<String>,
    new_email: Option<String>,
    share_id: Option<String>,
    sharing_enabled: i32, // 0/1
    created_at: Option<String>,
    updated_at: Option<String>,
}

// JWT秘密鍵（環境変数から読み込む）
// 起動時のチェック（main関数内）で未設定・脆弱な値は弾いているため、
// ここでは安全に読み込めることを前提とする
fn get_jwt_secret() -> String {
    std::env::var("JWT_SECRET").expect("JWT_SECRET environment variable must be set")
}

// メール確認URLのベースURL（環境変数から読み込む、未設定の場合はデフォルト値）
fn get_base_url() -> String {
    std::env::var("BASE_URL")
        .unwrap_or_else(|_| "http://localhost:8081".to_string())
}

// フロントエンドURL（環境変数から読み込む、未設定の場合はBASE_URLを使用）
#[allow(dead_code)]
fn get_frontend_url() -> String {
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

// Stripeシークレットキー（テストモードは sk_test_、本番は sk_live_ から始まる）
fn get_stripe_secret_key() -> String {
    std::env::var("STRIPE_SECRET_KEY").unwrap_or_default()
}

// プレミアムプラン（月額）のStripe Price ID
fn get_stripe_premium_price_id() -> String {
    std::env::var("STRIPE_PREMIUM_PRICE_ID").unwrap_or_default()
}

// Webhookエンドポイントシークレット（Stripeダッシュボード、またはローカルでは`stripe listen`の出力から取得）
fn get_stripe_webhook_secret() -> String {
    std::env::var("STRIPE_WEBHOOK_SECRET").unwrap_or_default()
}

// ====== 認証ヘルパー関数 ======

// ランダムなトークンを生成
fn generate_token() -> String {
    let mut rng = rand::thread_rng();
    let bytes: Vec<u8> = (0..32).map(|_| rng.gen()).collect();
    hex::encode(bytes)
}

// 公開URL・共有URLに使う推測困難なランダムID（21文字の英数字）を生成
fn generate_public_id() -> String {
    const CHARS: &[u8] = b"abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
    let mut rng = rand::thread_rng();
    (0..21)
        .map(|_| CHARS[rng.gen_range(0..CHARS.len())] as char)
        .collect()
}

#[cfg(test)]
mod public_id_tests {
    use super::generate_public_id;
    use std::collections::HashSet;

    #[test]
    fn has_expected_length() {
        assert_eq!(generate_public_id().len(), 21);
    }

    #[test]
    fn only_contains_alphanumeric_ascii_characters() {
        let id = generate_public_id();
        assert!(id.chars().all(|c| c.is_ascii_alphanumeric()));
    }

    #[test]
    fn generates_unique_values_across_many_calls() {
        let ids: HashSet<String> = (0..10_000).map(|_| generate_public_id()).collect();
        assert_eq!(ids.len(), 10_000, "expected no duplicates among 10,000 generated ids");
    }
}

// 指定したテーブルに指定した列が既に存在するかを確認する
async fn column_exists(pool: &Pool<Sqlite>, table: &str, column: &str) -> Result<bool, sqlx::Error> {
    let count: i64 = sqlx::query_scalar(&format!(
        "SELECT COUNT(*) FROM pragma_table_info('{}') WHERE name = ?",
        table
    ))
    .bind(column)
    .fetch_one(pool)
    .await?;
    Ok(count > 0)
}

// 有料プラン相当の機能にアクセスできるかどうかを判定する
// trial_started_atがある場合、期限（開始から1ヶ月）は保存せず都度計算する
fn has_paid_access(plan: &str, trial_started_at: Option<&str>) -> bool {
    if plan == "premium" {
        return true;
    }
    let Some(started_at) = trial_started_at else {
        return false;
    };
    let Ok(started) = DateTime::parse_from_rfc3339(started_at) else {
        return false;
    };
    let Some(trial_ends_at) = started.checked_add_months(chrono::Months::new(1)) else {
        return false;
    };
    Utc::now() < trial_ends_at
}

// 指定ユーザーのplanとtrial_started_atを取得する
// （過去アーカイブの閲覧制限など、user_idしか持たないハンドラでのプラン判定に使う）
async fn fetch_user_plan(pool: &Pool<Sqlite>, user_id: i32) -> Result<(String, Option<String>), sqlx::Error> {
    sqlx::query_as("SELECT plan, trial_started_at FROM users WHERE id = ?")
        .bind(user_id as i64)
        .fetch_one(pool)
        .await
}

// 無料プランで閲覧できる過去アーカイブの下限年（暦年ベース、今年と去年の2年分）を返す
// 未来の予定はこの制限の対象外（呼び出し側で年の上限は設けない）
fn free_plan_earliest_archive_year(now: DateTime<Utc>) -> i32 {
    now.year() - 1
}

// "YYYY-MM-DD" 形式の日付文字列から年を取り出す（stays.check_inの絞り込みに使う）
fn parse_year_prefix(date: &str) -> Option<i32> {
    date.get(0..4)?.parse().ok()
}

// share_idの所有者を解決する。sharing_enabledがOFF、または所有者が無料プラン相当
// （premiumでもトライアル中でもない）の場合は、共有されていないものとして扱う
// （premium失効時にsharing_enabledのDB値を書き換えるのではなく、都度動的に判定する）
async fn resolve_active_share_owner(
    pool: &Pool<Sqlite>,
    share_id: &str,
) -> Result<i64, (StatusCode, Json<ErrorResponse>)> {
    let row: Option<(i64, i32, String, Option<String>)> = sqlx::query_as(
        "SELECT id, sharing_enabled, plan, trial_started_at FROM users WHERE share_id = ?"
    )
    .bind(share_id)
    .fetch_optional(pool)
    .await
    .map_err(|e| {
        eprintln!("[ResolveActiveShareOwner] Database error: {}", e);
        (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(ErrorResponse {
                error: "Database error".to_string(),
            }),
        )
    })?;

    let (user_id, sharing_enabled, plan, trial_started_at) = row.ok_or((
        StatusCode::NOT_FOUND,
        Json(ErrorResponse {
            error: "ユーザーが見つかりません".to_string(),
        }),
    ))?;

    if sharing_enabled == 0 || !has_paid_access(&plan, trial_started_at.as_deref()) {
        return Err((
            StatusCode::FORBIDDEN,
            Json(ErrorResponse {
                error: "このユーザーのスケジュールは共有されていません".to_string(),
            }),
        ));
    }

    Ok(user_id)
}

// public_idがNULLの既存行に、衝突しないランダムIDを1件ずつ発行してバックフィルする
async fn backfill_public_ids(pool: &Pool<Sqlite>, table: &str) -> Result<(), sqlx::Error> {
    let select_sql = format!("SELECT id FROM {} WHERE public_id IS NULL", table);
    let ids: Vec<i64> = sqlx::query_scalar(&select_sql).fetch_all(pool).await?;

    if ids.is_empty() {
        return Ok(());
    }

    let update_sql = format!("UPDATE {} SET public_id = ? WHERE id = ?", table);
    for id in ids {
        // UNIQUE制約に衝突した場合のみ再生成してリトライ（衝突確率は無視できるレベル）
        for attempt in 0..5 {
            let result = sqlx::query(&update_sql)
                .bind(generate_public_id())
                .bind(id)
                .execute(pool)
                .await;
            match result {
                Ok(_) => break,
                Err(e) if attempt < 4 => {
                    eprintln!(
                        "[Migration] Retry backfilling public_id for {}.{}: {}",
                        table, id, e
                    );
                    continue;
                }
                Err(e) => return Err(e),
            }
        }
    }

    eprintln!("[Migration] Backfilled public_id for existing {} rows", table);
    Ok(())
}

fn get_email_from() -> String {
    std::env::var("EMAIL_FROM")
        .unwrap_or_else(|_| "GenBGT <onboarding@resend.dev>".to_string())
}

// メール送信（開発環境ではコンソールに出力、本番環境ではResendを使用）
async fn send_verification_email(email: &str, token: &str) {
    let base_url = get_base_url();
    let verification_url = format!("{}/verify-email?token={}", base_url, urlencoding::encode(token));
    
    // 環境変数からResend APIキーを取得
    if let Ok(api_key) = std::env::var("RESEND_API_KEY") {
        // 本番環境: Resend APIを使用
        let email_body = format!(
            r#"<p>以下のURLをクリックしてメールアドレスを確認してください:</p><p><a href="{}">{}</a></p><p>このリンクは24時間有効です。</p>"#,
            verification_url, verification_url
        );
        
        let resend = Resend::new(&api_key);
        let from = get_email_from();
        let to = [email];
        let subject = "メールアドレスの確認";
        
        let email_options = CreateEmailBaseOptions::new(&from, to, subject)
            .with_html(&email_body);
        
        match resend.emails.send(email_options).await {
            Ok(result) => {
                println!("[EMAIL] Verification email sent successfully to {}: {:?}", email, result);
            }
            Err(e) => {
                eprintln!("[EMAIL] Failed to send verification email to {}: {:?}", email, e);
                // フォールバック: コンソールに出力
                println!("=== メール送信（フォールバック） ===");
                println!("宛先: {}", email);
                println!("件名: メールアドレスの確認");
                println!("本文:");
                println!("以下のURLをクリックしてメールアドレスを確認してください:");
                println!("{}", verification_url);
                println!("===========================");
            }
        }
    } else {
        // 開発環境: コンソールに出力
        println!("[EMAIL] RESEND_API_KEY not found, using development mode (console output)");
        println!("=== メール送信（開発環境） ===");
        println!("宛先: {}", email);
        println!("件名: メールアドレスの確認");
        println!("本文:");
        println!("以下のURLをクリックしてメールアドレスを確認してください:");
        println!("{}", verification_url);
        println!("===========================");
    }
}

async fn send_password_reset_email(email: &str, token: &str, api_key: &str) -> Result<()> {
    // FRONTEND_URLを直接確認（確実に使用するため）
    let frontend_url = std::env::var("FRONTEND_URL")
        .unwrap_or_else(|_| {
            eprintln!("[EMAIL] ERROR: FRONTEND_URL not set! Falling back to BASE_URL");
            get_base_url()
        });
    
    // URLの末尾にスラッシュがある場合は削除
    let frontend_url = frontend_url.trim_end_matches('/');
    
    let reset_url = format!("{}/reset-password?token={}", frontend_url, urlencoding::encode(token));
    
    eprintln!("[EMAIL] ===== PASSWORD RESET EMAIL =====");
    eprintln!("[EMAIL] FRONTEND_URL from env: {}", std::env::var("FRONTEND_URL").unwrap_or_else(|_| "NOT SET".to_string()));
    eprintln!("[EMAIL] Using frontend URL: {}", frontend_url);
    eprintln!("[EMAIL] Reset URL: {}", reset_url);
    eprintln!("[EMAIL] ================================");
    
    let email_body = format!(
        r#"<p>以下のURLをクリックしてパスワードをリセットしてください:</p><p><a href="{}">{}</a></p><p>このリンクは24時間有効です。</p>"#,
        reset_url, reset_url
    );
    
    eprintln!("[EMAIL] Creating Resend client with API key length: {}", api_key.len());
    let resend = Resend::new(api_key);
    let from = get_email_from();
    let to = [email];
    let subject = "パスワードリセット";
    
    eprintln!("[EMAIL] Preparing email: from={}, to={:?}, subject={}", from, to, subject);
    let email = CreateEmailBaseOptions::new(&from, to, subject)
        .with_html(&email_body);
    
    eprintln!("[EMAIL] Sending email via Resend API...");
    let email_result = resend.emails.send(email).await;
    
    match email_result {
        Ok(result) => {
            eprintln!("[EMAIL] Email sent successfully: {:?}", result);
            Ok(())
        }
        Err(e) => {
            eprintln!("[EMAIL] Failed to send email: {:?}", e);
            Err(e)
        }
    }
}

async fn send_deadline_notification_email(
    email: &str,
    hotel_name: &str,
    deadline: &str,
    schedule_title: &str,
) -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
    // 環境変数からResend APIキーを取得
    let api_key = match std::env::var("RESEND_API_KEY") {
        Ok(key) => key,
        Err(_) => {
            // 開発環境: コンソールに出力
            println!("[DEADLINE_NOTIFICATION] RESEND_API_KEY not found, using development mode (console output)");
            println!("=== キャンセル期限通知（開発環境） ===");
            println!("宛先: {}", email);
            println!("件名: キャンセル期限が近づいています");
            println!("本文:");
            println!("宿泊施設「{}」のキャンセル期限が24時間以内に迫っています。", hotel_name);
            println!("期限日時: {}", deadline);
            println!("関連イベント: {}", schedule_title);
            println!("===========================");
            return Ok(());
        }
    };

    // 本番環境: Resend APIを使用
    println!("[DEADLINE_NOTIFICATION] RESEND_API_KEY found, using Resend API");
    let email_body = format!(
        r#"<p>宿泊施設「{}」のキャンセル期限が24時間以内に迫っています。</p><p><strong>期限日時:</strong> {}</p><p><strong>関連イベント:</strong> {}</p><p>キャンセルをご検討の場合は、期限までに手続きをお願いします。</p>"#,
        hotel_name, deadline, schedule_title
    );
    
    let resend = Resend::new(&api_key);
    let from = get_email_from();
    let to = [email];
    let subject = "キャンセル期限が近づいています";
    
    let email_options = CreateEmailBaseOptions::new(&from, to, subject)
        .with_html(&email_body);
    
    match resend.emails.send(email_options).await {
        Ok(result) => {
            println!("[DEADLINE_NOTIFICATION] Deadline notification email sent successfully to {}: {:?}", email, result);
            Ok(())
        }
        Err(e) => {
            eprintln!("[DEADLINE_NOTIFICATION] Failed to send deadline notification email to {}: {:?}", email, e);
            // フォールバック: コンソールに出力
            println!("=== キャンセル期限通知（フォールバック） ===");
            println!("宛先: {}", email);
            println!("件名: キャンセル期限が近づいています");
            println!("本文:");
            println!("宿泊施設「{}」のキャンセル期限が24時間以内に迫っています。", hotel_name);
            println!("期限日時: {}", deadline);
            println!("関連イベント: {}", schedule_title);
            println!("===========================");
            Err(e.into())
        }
    }
}

// Expo Push APIを使ってアプリへプッシュ通知を送信する。
// 無効化されたトークン（DeviceNotRegistered）はpush_tokensテーブルから削除する。
// Expo APIへの通信・レスポンス解析に失敗した場合はErrを返す（一時的な障害で
// 呼び出し元がpush_sent_atを更新し、再送されなくなるのを防ぐため）。
// 個々のトークンへの配送失敗（DeviceNotRegisteredなど）はAPIへの受付自体は
// 成功しているため、Errにはしない。
async fn send_expo_push_notifications(
    pool: &Pool<Sqlite>,
    tokens: &[String],
    title: &str,
    body: &str,
    schedule_id: i64,
) -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
    if tokens.is_empty() {
        return Ok(());
    }

    let client = reqwest::Client::new();
    let messages: Vec<serde_json::Value> = tokens
        .iter()
        .map(|token| {
            serde_json::json!({
                "to": token,
                "title": title,
                "body": body,
                "data": { "schedule_id": schedule_id },
                "sound": "default",
            })
        })
        .collect();

    let response = match client
        .post("https://exp.host/--/api/v2/push/send")
        .header("Accept", "application/json")
        .header("Content-Type", "application/json")
        .json(&messages)
        .send()
        .await
    {
        Ok(res) => res,
        Err(e) => {
            eprintln!("[PUSH_NOTIFICATION] Failed to reach Expo push API: {:?}", e);
            return Err(e.into());
        }
    };

    let body_json: serde_json::Value = match response.json().await {
        Ok(json) => json,
        Err(e) => {
            eprintln!("[PUSH_NOTIFICATION] Failed to parse Expo push API response: {:?}", e);
            return Err(e.into());
        }
    };

    println!("[PUSH_NOTIFICATION] Expo push API response: {:?}", body_json);

    // レスポンスのdata配列はリクエストしたtokensと同じ並び順で返る
    if let Some(tickets) = body_json.get("data").and_then(|d| d.as_array()) {
        for (token, ticket) in tokens.iter().zip(tickets.iter()) {
            let error = ticket.get("details").and_then(|d| d.get("error")).and_then(|e| e.as_str());
            if error == Some("DeviceNotRegistered") {
                eprintln!("[PUSH_NOTIFICATION] Removing unregistered token: {}", token);
                let _ = sqlx::query("DELETE FROM push_tokens WHERE token = ?")
                    .bind(token)
                    .execute(pool)
                    .await;
            }
        }
    }

    Ok(())
}

async fn send_email_change_verification_email(new_email: &str, token: &str) {
    let base_url = get_base_url();
    let verification_url = format!("{}/verify-email-change?token={}", base_url, urlencoding::encode(token));
    
    // 環境変数からResend APIキーを取得
    if let Ok(api_key) = std::env::var("RESEND_API_KEY") {
        // 本番環境: Resend APIを使用
        println!("[EMAIL] RESEND_API_KEY found, using Resend API");
        let email_body = format!(
            r#"<p>メールアドレスの変更をリクエストしました。</p><p>以下のURLをクリックしてメールアドレスを変更してください:</p><p><a href="{}">{}</a></p><p>このリンクは24時間有効です。</p>"#,
            verification_url, verification_url
        );
        
        let resend = Resend::new(&api_key);
        let from = get_email_from();
        let to = [new_email];
        let subject = "メールアドレス変更の確認";
        
        let email_options = CreateEmailBaseOptions::new(&from, to, subject)
            .with_html(&email_body);
        
        match resend.emails.send(email_options).await {
            Ok(result) => {
                println!("[EMAIL] Email change verification email sent successfully to {}: {:?}", new_email, result);
            }
            Err(e) => {
                eprintln!("[EMAIL] Failed to send email change verification email to {}: {:?}", new_email, e);
                // フォールバック: コンソールに出力
                println!("=== メール送信（フォールバック） ===");
                println!("宛先: {}", new_email);
                println!("件名: メールアドレス変更の確認");
                println!("本文:");
                println!("メールアドレスの変更をリクエストしました。");
                println!("以下のURLをクリックしてメールアドレスを変更してください:");
                println!("{}", verification_url);
                println!("このリンクは24時間有効です。");
                println!("===========================");
            }
        }
    } else {
        // 開発環境: コンソールに出力
        println!("[EMAIL] RESEND_API_KEY not found, using development mode (console output)");
        println!("=== メール送信（開発環境） ===");
        println!("宛先: {}", new_email);
        println!("件名: メールアドレス変更の確認");
        println!("本文:");
        println!("メールアドレスの変更をリクエストしました。");
        println!("以下のURLをクリックしてメールアドレスを変更してください:");
        println!("{}", verification_url);
        println!("このリンクは24時間有効です。");
        println!("===========================");
    }
}

const CONTACT_RATE_LIMIT_MAX: usize = 5;
const CONTACT_RATE_LIMIT_WINDOW: std::time::Duration = std::time::Duration::from_secs(60 * 60);

fn contact_rate_limiter() -> &'static std::sync::Mutex<std::collections::HashMap<String, Vec<std::time::Instant>>> {
    static LIMITER: std::sync::OnceLock<std::sync::Mutex<std::collections::HashMap<String, Vec<std::time::Instant>>>> = std::sync::OnceLock::new();
    LIMITER.get_or_init(|| std::sync::Mutex::new(std::collections::HashMap::new()))
}

// IPごとに一定時間あたりの送信回数を制限する簡易レートリミット
fn check_contact_rate_limit(client_ip: &str) -> bool {
    let mut map = contact_rate_limiter().lock().unwrap();
    let now = std::time::Instant::now();
    let timestamps = map.entry(client_ip.to_string()).or_insert_with(Vec::new);
    timestamps.retain(|&t| now.duration_since(t) < CONTACT_RATE_LIMIT_WINDOW);
    if timestamps.len() >= CONTACT_RATE_LIMIT_MAX {
        false
    } else {
        timestamps.push(now);
        true
    }
}

// ログイン・新規登録用の簡易レートリミット（総当たり攻撃対策）。
// bucket名とIPの組み合わせごとに、一定時間あたりの試行回数を制限する
const AUTH_RATE_LIMIT_MAX: usize = 10;
const AUTH_RATE_LIMIT_WINDOW: std::time::Duration = std::time::Duration::from_secs(15 * 60);

fn auth_rate_limiter() -> &'static std::sync::Mutex<std::collections::HashMap<String, Vec<std::time::Instant>>> {
    static LIMITER: std::sync::OnceLock<std::sync::Mutex<std::collections::HashMap<String, Vec<std::time::Instant>>>> = std::sync::OnceLock::new();
    LIMITER.get_or_init(|| std::sync::Mutex::new(std::collections::HashMap::new()))
}

fn check_auth_rate_limit(bucket: &str, client_ip: &str) -> bool {
    let mut map = auth_rate_limiter().lock().unwrap();
    let now = std::time::Instant::now();
    let key = format!("{}:{}", bucket, client_ip);
    let timestamps = map.entry(key).or_insert_with(Vec::new);
    timestamps.retain(|&t| now.duration_since(t) < AUTH_RATE_LIMIT_WINDOW);
    if timestamps.len() >= AUTH_RATE_LIMIT_MAX {
        false
    } else {
        timestamps.push(now);
        true
    }
}

// X-Forwarded-Forは`proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;`により
// クライアントが送った値の末尾にNginxが実際の接続元IPを追記する形式のため、先頭値を
// そのまま信頼するとクライアントが任意のIPを詐称してレートリミットを回避できてしまう。
// 一方X-Real-IPは`proxy_set_header X-Real-IP $remote_addr;`によりNginxが常に上書きする
// ため、クライアントからは偽装できない。そのためX-Real-IPを優先し、リバースプロキシを
// 経由しない場合（ローカル開発など）はConnectInfoの接続元にフォールバックする。
fn client_ip_from_headers(addr: &SocketAddr, headers: &HeaderMap) -> String {
    headers
        .get("x-real-ip")
        .and_then(|v| v.to_str().ok())
        .map(|s| s.trim().to_string())
        .filter(|s| !s.is_empty())
        .unwrap_or_else(|| addr.ip().to_string())
}

fn get_contact_to_email() -> String {
    std::env::var("CONTACT_TO_EMAIL").unwrap_or_else(|_| "contact@genbgt.com".to_string())
}

fn html_escape(input: &str) -> String {
    input
        .replace('&', "&amp;")
        .replace('<', "&lt;")
        .replace('>', "&gt;")
        .replace('"', "&quot;")
}

fn html_paragraph(input: &str) -> String {
    html_escape(input).replace('\n', "<br>")
}

// お問い合わせフォームの送信内容を運営宛てに転送し、送信者にも確認メールを送る
async fn send_contact_emails(name: &str, email: &str, subject: &str, message: &str) -> std::result::Result<(), String> {
    let display_name = if name.is_empty() { "（未入力）".to_string() } else { name.to_string() };

    if let Ok(api_key) = std::env::var("RESEND_API_KEY") {
        let resend = Resend::new(&api_key);
        let from = get_email_from();
        let contact_to = get_contact_to_email();

        // 運営宛て通知メール（返信すると送信者に直接届くようreply_toを設定）
        let notify_body = format!(
            r#"<p>お問い合わせフォームから新しいメッセージが届きました。</p><p>お名前: {}<br>メールアドレス: {}<br>件名: {}</p><p>{}</p>"#,
            html_escape(&display_name), html_escape(email), html_escape(subject), html_paragraph(message)
        );
        let notify_to = [contact_to.as_str()];
        let notify_options = CreateEmailBaseOptions::new(&from, notify_to, format!("[お問い合わせ] {}", subject))
            .with_html(&notify_body)
            .with_reply(email);

        resend.emails.send(notify_options).await.map_err(|e| {
            eprintln!("[CONTACT] Failed to send notification email: {:?}", e);
            format!("{:?}", e)
        })?;

        // 送信者への確認メール
        let confirm_body = format!(
            r#"<p>{}様</p><p>以下の内容でお問い合わせを受け付けました。内容を確認のうえ、担当より返信いたします。</p><p>件名: {}</p><p>{}</p><p>---<br>このメールは送信内容の確認のため自動送信されています。</p>"#,
            html_escape(&display_name), html_escape(subject), html_paragraph(message)
        );
        let confirm_to = [email];
        let confirm_options = CreateEmailBaseOptions::new(&from, confirm_to, "【GenBGT】お問い合わせを受け付けました")
            .with_html(&confirm_body);

        if let Err(e) = resend.emails.send(confirm_options).await {
            eprintln!("[CONTACT] Failed to send confirmation email to {}: {:?}", email, e);
        }

        Ok(())
    } else {
        println!("[CONTACT] RESEND_API_KEY not found, using development mode (console output)");
        println!("=== お問い合わせ（開発環境） ===");
        println!("お名前: {}", display_name);
        println!("メールアドレス: {}", email);
        println!("件名: {}", subject);
        println!("本文:\n{}", message);
        println!("===========================");
        Ok(())
    }
}

fn create_token(user_id: i32) -> String {
    let expiration = Utc::now()
        .checked_add_signed(chrono::Duration::days(30))
        .expect("valid timestamp")
        .timestamp() as usize;

    let claims = Claims {
        user_id,
        exp: expiration,
    };

    let jwt_secret = get_jwt_secret();
    encode(
        &Header::default(),
        &claims,
        &EncodingKey::from_secret(jwt_secret.as_ref()),
    )
    .unwrap()
}

fn verify_token(token: &str) -> Result<i32, StatusCode> {
    let jwt_secret = get_jwt_secret();
    let token_data = decode::<Claims>(
        token,
        &DecodingKey::from_secret(jwt_secret.as_ref()),
        &Validation::default(),
    )
    .map_err(|e| {
        eprintln!("[VerifyToken] Token verification failed: {}", e);
        StatusCode::UNAUTHORIZED
    })?;

    eprintln!("[VerifyToken] Token verified successfully, user_id: {}", token_data.claims.user_id);
    Ok(token_data.claims.user_id)
}

fn extract_token_from_header(headers: &HeaderMap) -> Result<String, StatusCode> {
    let auth_header = headers
        .get(AUTHORIZATION)
        .ok_or(StatusCode::UNAUTHORIZED)?
        .to_str()
        .map_err(|_| StatusCode::UNAUTHORIZED)?;

    if auth_header.starts_with("Bearer ") {
        Ok(auth_header[7..].to_string())
    } else {
        Err(StatusCode::UNAUTHORIZED)
    }
}

// 認証済みユーザーIDを取得するextractor
struct AuthenticatedUser {
    user_id: i32,
}

#[async_trait]
impl<S> axum::extract::FromRequestParts<S> for AuthenticatedUser
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

// ====== Schedule 型定義（API 用） ======

#[derive(Serialize, Clone)]
struct Schedule {
    id: i32,
    title: String,
    group: Option<String>, // NULL許可（空欄の場合はNULLのまま）
    datetime: DateTime<Utc>, // date + start から生成（計算フィールド）

    // Event Info
    date: Option<String>,
    open: Option<String>,
    start: Option<String>,
    end: Option<String>,
    notes: Option<String>,
    category: Option<String>,
    area: String,
    venue: String,
    target: Option<String>,
    lineup: Option<String>,

    // Cost
    seller: Option<String>,
    ticket_fee: Option<i32>,  // チケット代
    drink_fee: Option<i32>,   // ドリンク代
    total_fare: Option<i32>,  // Traffic の合計
    stay_fee: Option<i32>,    // Stay の合計
    travel_cost: Option<i32>, // = Total fare + Stay fee
    total_cost: Option<i32>,  // = Ticket fee + Drink fee + Travel cost

    status: String, // "Canceled" / "Pending" / "Keep" / "Done"

    // Relation：他のライブ（自己リレーション）
    related_schedule_ids: Vec<i32>,

    // Traffic / Stay（複数）
    traffic_ids: Vec<String>,
    stay_ids: Vec<String>,

    // 認証・公開関連
    user_id: Option<i32>,
    is_public: bool,
}

// ====== Schedule 行定義（DB 用） ======

#[derive(sqlx::FromRow)]
#[allow(dead_code)] // 一部のフィールドは将来使用する可能性があるため
struct ScheduleRow {
    id: i64,
    title: String,
    #[sqlx(rename = "group")]
    group_name: Option<String>, // NULL許可
    date: Option<String>,
    open: Option<String>,
    start: Option<String>,
    #[sqlx(rename = "end")]
    end_time: Option<String>,
    notes: Option<String>,
    category: Option<String>,
    area: String,
    venue: String,
    target: Option<String>,
    lineup: Option<String>,
    seller: Option<String>,
    ticket_fee: Option<i32>,
    drink_fee: Option<i32>,
    total_fare: Option<i32>,
    stay_fee: Option<i32>,
    travel_cost: Option<i32>,
    total_cost: Option<i32>,
    status: String,
    related_schedule_ids: Option<String>, // JSON形式で保存
    user_id: Option<i64>,
    is_public: i32, // INTEGER型として読み込む（0または1）
    created_at: Option<String>,
    updated_at: Option<String>,
}

#[derive(Debug, Deserialize)]
struct ScheduleQuery {
    year: Option<i32>,
    include_canceled: Option<bool>,
}

// POST /schedules 用リクエストボディ
#[derive(Deserialize)]
struct NewSchedule {
    title: String,
    group: Option<String>, // NULL許可（空文字列もNULLに変換）
    date: Option<String>,
    open: Option<String>,
    start: Option<String>,
    end: Option<String>,
    notes: Option<String>,
    category: Option<String>,
    area: String,
    venue: String,
    target: Option<String>,
    lineup: Option<String>,
    seller: Option<String>,
    ticket_fee: Option<i32>,
    drink_fee: Option<i32>,
    status: Option<String>,
    related_schedule_ids: Option<Vec<i32>>, // 関連スケジュールIDの配列
    is_public: Option<bool>, // 公開フラグ
}

// ====== Traffic 型定義 ======

#[derive(Serialize, Clone)]
struct Traffic {
    id: i32,
    schedule_id: i32,
    date: String,
    order: i32,
    transportation: Option<String>,
    from: String,
    to: String,
    notes: Option<String>,
    fare: i32,
    miles: Option<i32>,
    return_flag: bool,
    total_fare: Option<i32>,
    total_miles: Option<i32>,
}

#[derive(sqlx::FromRow)]
struct TrafficRow {
    id: i64,
    schedule_id: i64,
    date: String,
    #[sqlx(rename = "order")]
    order_value: i64,
    transportation: Option<String>,
    from_place: String,
    to_place: String,
    notes: Option<String>,
    fare: i32,
    miles: Option<i32>,
    return_flag: i32, // 0/1
    total_fare: Option<i32>,
    total_miles: Option<i32>,
}

#[derive(Debug, Deserialize)]
struct TrafficQuery {
    schedule_id: i32,
}

// POST /traffic 用
#[derive(Deserialize)]
struct NewTraffic {
    schedule_id: i32,
    date: String,
    order: i32,
    transportation: Option<String>,
    from: String,
    to: String,
    notes: Option<String>,
    fare: i32,
    miles: Option<i32>,
    return_flag: bool,
}

// ====== MaskedLocation 型定義 ======

#[derive(Serialize, Clone)]
struct MaskedLocation {
    id: i32,
    user_id: i32,
    location_name: String,
    created_at: Option<String>,
    updated_at: Option<String>,
}

#[derive(sqlx::FromRow)]
struct MaskedLocationRow {
    id: i64,
    user_id: i64,
    location_name: String,
    created_at: Option<String>,
    updated_at: Option<String>,
}

#[derive(Deserialize)]
struct NewMaskedLocation {
    location_name: String,
}

#[derive(Deserialize)]
struct UpdateMaskedLocation {
    location_name: String,
}

// ====== Stay 型定義 ======

#[derive(Serialize, Clone)]
struct Stay {
    id: i32,
    schedule_id: i32,
    check_in: String,
    check_out: String,
    hotel_name: String,
    website: Option<String>,
    fee: i32,
    breakfast_flag: bool,
    deadline: Option<String>,
    penalty: Option<i32>,
    status: String,
}

#[derive(sqlx::FromRow)]
struct StayRow {
    id: i64,
    schedule_id: i64,
    check_in: String,
    check_out: String,
    hotel_name: String,
    website: Option<String>,
    fee: i32,
    breakfast_flag: i32, // 0/1
    deadline: Option<String>,
    penalty: Option<i32>,
    status: String,
}

#[derive(Debug, Deserialize)]
struct StayQuery {
    schedule_id: i32,
}

// POST /stay 用
#[derive(Deserialize)]
struct NewStay {
    schedule_id: i32,
    check_in: String,
    check_out: String,
    hotel_name: String,
    website: Option<String>,
    fee: i32,
    breakfast_flag: bool,
    deadline: Option<String>,
    penalty: Option<i32>,
    status: Option<String>,
}

// ====== 公開・共有API用の型定義 ======
// 内部の連番idの代わりに、推測困難なランダムID（public_id）をURL・レスポンスで使う

#[derive(Serialize)]
struct PublicSchedule {
    id: String, // = public_id
    title: String,
    group: Option<String>,
    datetime: DateTime<Utc>,
    date: Option<String>,
    open: Option<String>,
    start: Option<String>,
    end: Option<String>,
    notes: Option<String>,
    category: Option<String>,
    area: String,
    venue: String,
    target: Option<String>,
    lineup: Option<String>,
    seller: Option<String>,
    ticket_fee: Option<i32>,
    drink_fee: Option<i32>,
    total_fare: Option<i32>,
    stay_fee: Option<i32>,
    travel_cost: Option<i32>,
    total_cost: Option<i32>,
    status: String,
    related_schedule_ids: Vec<String>, // 関連スケジュールのpublic_id
    is_public: bool,
}

#[derive(sqlx::FromRow)]
struct PublicScheduleRow {
    id: i64, // 関連スケジュールIDの解決にのみ使用、レスポンスには含めない
    public_id: String,
    title: String,
    #[sqlx(rename = "group")]
    group_name: Option<String>,
    date: Option<String>,
    open: Option<String>,
    start: Option<String>,
    #[sqlx(rename = "end")]
    end_time: Option<String>,
    notes: Option<String>,
    category: Option<String>,
    area: String,
    venue: String,
    target: Option<String>,
    lineup: Option<String>,
    seller: Option<String>,
    ticket_fee: Option<i32>,
    drink_fee: Option<i32>,
    total_fare: Option<i32>,
    stay_fee: Option<i32>,
    travel_cost: Option<i32>,
    total_cost: Option<i32>,
    status: String,
    related_schedule_ids: Option<String>, // JSON形式（内部id）で保存
    is_public: i32,
}

#[derive(Serialize, Clone)]
struct PublicTraffic {
    id: String,          // = public_id
    schedule_id: String, // = 親スケジュールのpublic_id
    date: String,
    order: i32,
    transportation: Option<String>,
    from: String,
    to: String,
    notes: Option<String>,
    fare: i32,
    miles: Option<i32>,
    return_flag: bool,
    total_fare: Option<i32>,
    total_miles: Option<i32>,
}

#[derive(sqlx::FromRow)]
struct PublicTrafficRow {
    public_id: String,
    date: String,
    #[sqlx(rename = "order")]
    order_value: i64,
    transportation: Option<String>,
    from_place: String,
    to_place: String,
    notes: Option<String>,
    fare: i32,
    miles: Option<i32>,
    return_flag: i32,
    total_fare: Option<i32>,
    total_miles: Option<i32>,
}

#[derive(Debug, Deserialize)]
struct PublicTrafficQuery {
    schedule_id: String, // = スケジュールのpublic_id
}

// list_shared_traffics用: schedules とのJOINで親スケジュールのpublic_idも一緒に取得する
#[derive(sqlx::FromRow)]
struct SharedTrafficRow {
    public_id: String,
    date: String,
    #[sqlx(rename = "order")]
    order_value: i64,
    transportation: Option<String>,
    from_place: String,
    to_place: String,
    notes: Option<String>,
    fare: i32,
    miles: Option<i32>,
    return_flag: i32,
    total_fare: Option<i32>,
    total_miles: Option<i32>,
    schedule_public_id: String,
}

#[derive(Serialize, Clone)]
struct PublicStay {
    id: String,          // = public_id
    schedule_id: String, // = 親スケジュールのpublic_id
    check_in: String,
    check_out: String,
    hotel_name: String,
    website: Option<String>,
    fee: i32,
    breakfast_flag: bool,
    deadline: Option<String>,
    penalty: Option<i32>,
    status: String,
}

#[derive(sqlx::FromRow)]
struct PublicStayRow {
    public_id: String,
    check_in: String,
    check_out: String,
    hotel_name: String,
    website: Option<String>,
    fee: i32,
    breakfast_flag: i32,
    deadline: Option<String>,
    penalty: Option<i32>,
    status: String,
}

#[derive(Debug, Deserialize)]
struct PublicStayQuery {
    schedule_id: String, // = スケジュールのpublic_id
}

// get_shared_stay用: schedules とのJOINで親スケジュールのpublic_idも一緒に取得する
#[derive(sqlx::FromRow)]
struct SharedStayRow {
    public_id: String,
    check_in: String,
    check_out: String,
    hotel_name: String,
    website: Option<String>,
    fee: i32,
    breakfast_flag: i32,
    deadline: Option<String>,
    penalty: Option<i32>,
    status: String,
    schedule_public_id: String,
}

// ====== Row → API 用への変換 ======

fn row_to_schedule(row: ScheduleRow) -> Schedule {
    // date + start から datetime を生成
    let datetime = if let (Some(date), Some(start)) = (&row.date, &row.start) {
        // date: "YYYY-MM-DD", start: "HH:MM"
        let datetime_str = format!("{}T{}:00Z", date, start);
        datetime_str
            .parse::<DateTime<Utc>>()
            .unwrap_or_else(|_| Utc::now())
    } else if let Some(date) = &row.date {
        // date のみがある場合、00:00:00 として扱う
        let datetime_str = format!("{}T00:00:00Z", date);
        datetime_str
            .parse::<DateTime<Utc>>()
            .unwrap_or_else(|_| Utc::now())
    } else {
        // date も start もない場合、現在時刻を使用
        Utc::now()
    };

    // groupがNULLの場合はそのままNULLを返す（データとして保持）
    let group = row.group_name
        .filter(|g| !g.trim().is_empty())
        .map(|g| g.trim().to_string());

    Schedule {
        id: row.id as i32,
        title: row.title,
        group,
        datetime,
        date: row.date,
        open: row.open,
        start: row.start,
        end: row.end_time,
        notes: row.notes,
        category: row.category,
        area: row.area,
        venue: row.venue,
        target: row.target,
        lineup: row.lineup,
        seller: row.seller,
        ticket_fee: row.ticket_fee,
        drink_fee: row.drink_fee,
        total_fare: row.total_fare,
        stay_fee: row.stay_fee,
        travel_cost: row.travel_cost,
        total_cost: row.total_cost,
        status: row.status,
        // related_schedule_idsをJSONからパース
        related_schedule_ids: row.related_schedule_ids
            .as_ref()
            .and_then(|json| serde_json::from_str::<Vec<i32>>(json).ok())
            .unwrap_or_default(),
        traffic_ids: vec![],
        stay_ids: vec![],
        user_id: row.user_id.map(|id| id as i32),
        is_public: row.is_public != 0,
    }
}

fn row_to_traffic(row: TrafficRow) -> Traffic {
    Traffic {
        id: row.id as i32,
        schedule_id: row.schedule_id as i32,
        date: row.date,
        order: row.order_value as i32,
        transportation: row.transportation,
        from: row.from_place,
        to: row.to_place,
        notes: row.notes,
        fare: row.fare,
        miles: row.miles,
        return_flag: row.return_flag != 0,
        total_fare: row.total_fare,
        total_miles: row.total_miles,
    }
}

fn row_to_masked_location(row: MaskedLocationRow) -> MaskedLocation {
    MaskedLocation {
        id: row.id as i32,
        user_id: row.user_id as i32,
        location_name: row.location_name,
        created_at: row.created_at,
        updated_at: row.updated_at,
    }
}

fn row_to_stay(row: StayRow) -> Stay {
    Stay {
        id: row.id as i32,
        schedule_id: row.schedule_id as i32,
        check_in: row.check_in,
        check_out: row.check_out,
        hotel_name: row.hotel_name,
        website: row.website,
        fee: row.fee,
        breakfast_flag: row.breakfast_flag != 0,
        deadline: row.deadline,
        penalty: row.penalty,
        status: row.status,
    }
}

// ====== 公開・共有API用の変換 ======

// 内部の関連スケジュールid（Vec<i32>）を、対応するpublic_idの配列に変換する
// 削除済みなど解決できないidはスキップする
async fn resolve_schedule_public_ids(pool: &Pool<Sqlite>, ids: &[i32]) -> Vec<String> {
    let mut result = Vec::with_capacity(ids.len());
    for id in ids {
        if let Ok(Some(public_id)) = sqlx::query_scalar::<_, String>(
            "SELECT public_id FROM schedules WHERE id = ?",
        )
        .bind(id)
        .fetch_optional(pool)
        .await
        {
            result.push(public_id);
        }
    }
    result
}

async fn row_to_public_schedule(pool: &Pool<Sqlite>, row: PublicScheduleRow) -> PublicSchedule {
    let datetime = if let (Some(date), Some(start)) = (&row.date, &row.start) {
        format!("{}T{}:00Z", date, start)
            .parse::<DateTime<Utc>>()
            .unwrap_or_else(|_| Utc::now())
    } else if let Some(date) = &row.date {
        format!("{}T00:00:00Z", date)
            .parse::<DateTime<Utc>>()
            .unwrap_or_else(|_| Utc::now())
    } else {
        Utc::now()
    };

    let group = row
        .group_name
        .filter(|g| !g.trim().is_empty())
        .map(|g| g.trim().to_string());

    let related_internal_ids: Vec<i32> = row
        .related_schedule_ids
        .as_ref()
        .and_then(|json| serde_json::from_str::<Vec<i32>>(json).ok())
        .unwrap_or_default();
    let related_schedule_ids = resolve_schedule_public_ids(pool, &related_internal_ids).await;

    PublicSchedule {
        id: row.public_id,
        title: row.title,
        group,
        datetime,
        date: row.date,
        open: row.open,
        start: row.start,
        end: row.end_time,
        notes: row.notes,
        category: row.category,
        area: row.area,
        venue: row.venue,
        target: row.target,
        lineup: row.lineup,
        seller: row.seller,
        ticket_fee: row.ticket_fee,
        drink_fee: row.drink_fee,
        total_fare: row.total_fare,
        stay_fee: row.stay_fee,
        travel_cost: row.travel_cost,
        total_cost: row.total_cost,
        status: row.status,
        related_schedule_ids,
        is_public: row.is_public != 0,
    }
}

fn row_to_public_traffic(row: PublicTrafficRow, schedule_public_id: &str) -> PublicTraffic {
    PublicTraffic {
        id: row.public_id,
        schedule_id: schedule_public_id.to_string(),
        date: row.date,
        order: row.order_value as i32,
        transportation: row.transportation,
        from: row.from_place,
        to: row.to_place,
        notes: row.notes,
        fare: row.fare,
        miles: row.miles,
        return_flag: row.return_flag != 0,
        total_fare: row.total_fare,
        total_miles: row.total_miles,
    }
}

fn shared_row_to_public_traffic(row: SharedTrafficRow) -> PublicTraffic {
    PublicTraffic {
        id: row.public_id,
        schedule_id: row.schedule_public_id,
        date: row.date,
        order: row.order_value as i32,
        transportation: row.transportation,
        from: row.from_place,
        to: row.to_place,
        notes: row.notes,
        fare: row.fare,
        miles: row.miles,
        return_flag: row.return_flag != 0,
        total_fare: row.total_fare,
        total_miles: row.total_miles,
    }
}

fn row_to_public_stay(row: PublicStayRow, schedule_public_id: &str) -> PublicStay {
    PublicStay {
        id: row.public_id,
        schedule_id: schedule_public_id.to_string(),
        check_in: row.check_in,
        check_out: row.check_out,
        hotel_name: row.hotel_name,
        website: row.website,
        fee: row.fee,
        breakfast_flag: row.breakfast_flag != 0,
        deadline: row.deadline,
        penalty: row.penalty,
        status: row.status,
    }
}

fn shared_row_to_public_stay(row: SharedStayRow) -> PublicStay {
    PublicStay {
        id: row.public_id,
        schedule_id: row.schedule_public_id,
        check_in: row.check_in,
        check_out: row.check_out,
        hotel_name: row.hotel_name,
        website: row.website,
        fee: row.fee,
        breakfast_flag: row.breakfast_flag != 0,
        deadline: row.deadline,
        penalty: row.penalty,
        status: row.status,
    }
}

// ====== マスク処理ヘルパー ======

// ユーザーのマスク設定を取得
async fn get_masked_locations_for_user(
    pool: &Pool<Sqlite>,
    user_id: i64,
) -> Result<Vec<String>, sqlx::Error> {
    let rows: Vec<(String,)> = sqlx::query_as(
        "SELECT location_name FROM masked_locations WHERE user_id = ?"
    )
    .bind(user_id)
    .fetch_all(pool)
    .await?;
    
    Ok(rows.into_iter().map(|(name,)| name).collect())
}

// 交通情報にマスク処理を適用
fn apply_mask_to_public_traffic(mut traffic: PublicTraffic, masked_locations: &[String]) -> PublicTraffic {
    let mask_text = "***";

    if masked_locations.contains(&traffic.from) {
        traffic.from = mask_text.to_string();
    }
    if masked_locations.contains(&traffic.to) {
        traffic.to = mask_text.to_string();
    }

    traffic
}

// ====== ハンドラ ======

async fn health_check() -> &'static str {
    "OK"
}

// メールアドレスの簡易バリデーション
fn is_valid_email(email: &str) -> bool {
    email.contains('@') && email.contains('.') && email.len() > 5
}

fn is_valid_password(password: &str) -> bool {
    password.chars().count() >= 8
        && password.chars().any(|c| c.is_ascii_alphabetic())
        && password.chars().any(|c| c.is_ascii_digit())
}

#[cfg(test)]
mod password_policy_tests {
    use super::is_valid_password;

    #[test]
    fn accepts_eight_or_more_characters_with_letters_and_numbers() {
        assert!(is_valid_password("GenBGT12"));
        assert!(is_valid_password("Password2026!"));
    }

    #[test]
    fn rejects_short_or_single_character_class_passwords() {
        assert!(!is_valid_password("Gen12"));
        assert!(!is_valid_password("abcdefgh"));
        assert!(!is_valid_password("12345678"));
    }
}

// POST /auth/register
async fn submit_contact(
    ConnectInfo(addr): ConnectInfo<SocketAddr>,
    headers: HeaderMap,
    Json(payload): Json<ContactRequest>,
) -> Result<Json<ContactResponse>, (StatusCode, Json<ErrorResponse>)> {
    let client_ip = client_ip_from_headers(&addr, &headers);

    if !check_contact_rate_limit(&client_ip) {
        println!("[CONTACT] Rate limit exceeded for {}", client_ip);
        return Err((
            StatusCode::TOO_MANY_REQUESTS,
            Json(ErrorResponse { error: "送信回数が多すぎます。しばらく時間をおいて再度お試しください".to_string() }),
        ));
    }

    // ハニーポット: ボットは隠しフィールドまで埋めてくるため、送信済みのふりをして何もしない
    if payload.website.as_ref().is_some_and(|v| !v.trim().is_empty()) {
        println!("[CONTACT] Honeypot triggered, ignoring submission");
        return Ok(Json(ContactResponse { success: true, message: "送信しました".to_string() }));
    }

    let email = payload.email.trim().to_string();
    let name = payload.name.unwrap_or_default().trim().to_string();
    let subject = payload.subject.unwrap_or_default().trim().to_string();
    let subject = if subject.is_empty() { "お問い合わせ".to_string() } else { subject };
    let message = payload.message.trim().to_string();

    if email.is_empty() || !is_valid_email(&email) {
        return Err((
            StatusCode::BAD_REQUEST,
            Json(ErrorResponse { error: "有効なメールアドレスを入力してください".to_string() }),
        ));
    }
    if message.is_empty() {
        return Err((
            StatusCode::BAD_REQUEST,
            Json(ErrorResponse { error: "お問い合わせ内容を入力してください".to_string() }),
        ));
    }
    if message.chars().count() > 5000 {
        return Err((
            StatusCode::BAD_REQUEST,
            Json(ErrorResponse { error: "お問い合わせ内容が長すぎます".to_string() }),
        ));
    }

    send_contact_emails(&name, &email, &subject, &message)
        .await
        .map_err(|_| {
            (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(ErrorResponse { error: "送信に失敗しました。時間をおいて再度お試しください".to_string() }),
            )
        })?;

    Ok(Json(ContactResponse { success: true, message: "送信しました".to_string() }))
}

async fn register(
    ConnectInfo(addr): ConnectInfo<SocketAddr>,
    headers: HeaderMap,
    Extension(pool): Extension<Pool<Sqlite>>,
    Json(payload): Json<RegisterRequest>,
) -> Result<Json<AuthResponse>, (StatusCode, Json<ErrorResponse>)> {
    let client_ip = client_ip_from_headers(&addr, &headers);
    if !check_auth_rate_limit("register", &client_ip) {
        println!("[REGISTER] Rate limit exceeded for {}", client_ip);
        return Err((
            StatusCode::TOO_MANY_REQUESTS,
            Json(ErrorResponse { error: "試行回数が多すぎます。しばらく時間をおいて再度お試しください".to_string() }),
        ));
    }

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

    if !is_valid_password(&payload.password) {
        println!("[REGISTER] Validation failed: password does not meet policy");
        return Err((
            StatusCode::BAD_REQUEST,
            Json(ErrorResponse {
                error: "パスワードは8文字以上で、英字と数字をそれぞれ1文字以上含めてください".to_string(),
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
async fn login(
    ConnectInfo(addr): ConnectInfo<SocketAddr>,
    headers: HeaderMap,
    Extension(pool): Extension<Pool<Sqlite>>,
    Json(payload): Json<LoginRequest>,
) -> Result<Json<AuthResponse>, (StatusCode, Json<ErrorResponse>)> {
    let client_ip = client_ip_from_headers(&addr, &headers);
    if !check_auth_rate_limit("login", &client_ip) {
        eprintln!("[LOGIN] Rate limit exceeded for {}", client_ip);
        return Err((
            StatusCode::TOO_MANY_REQUESTS,
            Json(ErrorResponse { error: "試行回数が多すぎます。しばらく時間をおいて再度お試しください".to_string() }),
        ));
    }

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
async fn verify_email(
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
async fn request_password_reset(
    ConnectInfo(addr): ConnectInfo<SocketAddr>,
    headers: HeaderMap,
    Extension(pool): Extension<Pool<Sqlite>>,
    Json(payload): Json<RequestPasswordResetRequest>,
) -> Result<Json<PasswordResetResponse>, (StatusCode, Json<ErrorResponse>)> {
    // レートリミットを設けないと、登録済みメールアドレスを狙って大量にリセット要求を
    // 送りつけることで対象ユーザーへのメール大量送信やResendの送信枠消費につながるため、
    // ログイン・新規登録と同様にIPベースで制限する
    let client_ip = client_ip_from_headers(&addr, &headers);
    if !check_auth_rate_limit("password_reset", &client_ip) {
        eprintln!("[PASSWORD_RESET] Rate limit exceeded for {}", client_ip);
        return Err((
            StatusCode::TOO_MANY_REQUESTS,
            Json(ErrorResponse { error: "試行回数が多すぎます。しばらく時間をおいて再度お試しください".to_string() }),
        ));
    }

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

    // ユーザーが存在しない場合も、登録済みメールアドレスの場合と同じ成功レスポンスを返す。
    // ステータスコードやメッセージを変えると、第三者がメールアドレスの登録有無を
    // 総当たりで判別できてしまう（ユーザー列挙）ため、ここでは常に成功を装う。
    let Some(user) = user else {
        eprintln!("[PASSWORD_RESET] No account for requested email (responding with generic success)");
        eprintln!("[PASSWORD_RESET] ===== Request END (200, no account) =====");
        return Ok(Json(PasswordResetResponse {
            success: true,
            message: "パスワードリセット用のメールを送信しました".to_string(),
        }));
    };
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
async fn reset_password(
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
    if !is_valid_password(&payload.new_password) {
        return Err((
            StatusCode::BAD_REQUEST,
            Json(ErrorResponse {
                error: "パスワードは8文字以上で、英字と数字をそれぞれ1文字以上含めてください".to_string(),
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
async fn change_email_request(
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
async fn verify_email_change(
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
async fn change_share_id(
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
async fn toggle_sharing(
    user: AuthenticatedUser,
    Extension(pool): Extension<Pool<Sqlite>>,
    Json(payload): Json<ToggleSharingRequest>,
) -> Result<Json<serde_json::Value>, (StatusCode, Json<ErrorResponse>)> {
    eprintln!("[ToggleSharing] Received request from user_id: {}", user.user_id);
    eprintln!("[ToggleSharing] Request payload: enabled={}", payload.enabled);
    
    // まず、ユーザーが存在するか確認（全カラムを取得してデバッグ）
    let user_row_full: Option<(i64, String, Option<String>, i32, String, Option<String>)> = sqlx::query_as(
        "SELECT id, email, share_id, sharing_enabled, plan, trial_started_at FROM users WHERE id = ?"
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

    if let Some((id, email, share_id, sharing_enabled, plan, trial_started_at)) = user_row_full {
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

        if payload.enabled && !has_paid_access(&plan, trial_started_at.as_deref()) {
            return Err((
                StatusCode::FORBIDDEN,
                Json(ErrorResponse {
                    error: "premium_required".to_string(),
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
async fn get_sharing_status(
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

// GET /auth/plan-status - プラン種別とお試し期間の状態取得
async fn get_plan_status(
    user: AuthenticatedUser,
    Extension(pool): Extension<Pool<Sqlite>>,
) -> Result<Json<serde_json::Value>, (StatusCode, Json<ErrorResponse>)> {
    let row: Option<(String, Option<String>, i32, Option<String>)> = sqlx::query_as(
        "SELECT plan, premium_started_at, trial_used, trial_started_at FROM users WHERE id = ?"
    )
    .bind(user.user_id as i64)
    .fetch_optional(&pool)
    .await
    .map_err(|e| {
        eprintln!("[GetPlanStatus] Database error: {}", e);
        (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(ErrorResponse {
                error: "Database error".to_string(),
            }),
        )
    })?;

    let Some((plan, premium_started_at, trial_used, trial_started_at)) = row else {
        return Err((
            StatusCode::NOT_FOUND,
            Json(ErrorResponse {
                error: "ユーザーが見つかりません".to_string(),
            }),
        ));
    };

    let is_paid_effective = has_paid_access(&plan, trial_started_at.as_deref());

    // Billing Portal（解約・支払い方法変更）を案内できるのは、Stripeのサブスクリプションに
    // 紐付いているアカウントのみ。管理者が手動でplan='premium'に固定したアカウント等は対象外
    let has_stripe_subscription: bool = sqlx::query_scalar(
        "SELECT EXISTS(SELECT 1 FROM subscriptions WHERE user_id = ? AND provider = 'stripe')"
    )
    .bind(user.user_id as i64)
    .fetch_one(&pool)
    .await
    .unwrap_or(false);

    Ok(Json(serde_json::json!({
        "plan": plan,
        "is_paid_effective": is_paid_effective,
        "premium_started_at": premium_started_at,
        "trial_used": trial_used != 0,
        "trial_started_at": trial_started_at,
        "has_stripe_subscription": has_stripe_subscription
    })))
}

// POST /auth/start-trial - 1ヶ月お試し期間を開始する（1ユーザー1回のみ）
async fn start_trial(
    user: AuthenticatedUser,
    Extension(pool): Extension<Pool<Sqlite>>,
) -> Result<Json<serde_json::Value>, (StatusCode, Json<ErrorResponse>)> {
    let row: Option<(String, i32)> = sqlx::query_as(
        "SELECT plan, trial_used FROM users WHERE id = ?"
    )
    .bind(user.user_id as i64)
    .fetch_optional(&pool)
    .await
    .map_err(|e| {
        eprintln!("[StartTrial] Database error: {}", e);
        (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(ErrorResponse {
                error: "Database error".to_string(),
            }),
        )
    })?;

    let Some((plan, trial_used)) = row else {
        return Err((
            StatusCode::NOT_FOUND,
            Json(ErrorResponse {
                error: "ユーザーが見つかりません".to_string(),
            }),
        ));
    };

    if plan == "premium" {
        return Err((
            StatusCode::BAD_REQUEST,
            Json(ErrorResponse {
                error: "already_premium".to_string(),
            }),
        ));
    }
    if trial_used != 0 {
        return Err((
            StatusCode::BAD_REQUEST,
            Json(ErrorResponse {
                error: "trial_already_used".to_string(),
            }),
        ));
    }

    let now = Utc::now().to_rfc3339();
    sqlx::query(
        "UPDATE users SET trial_started_at = ?, trial_used = 1, updated_at = ? WHERE id = ?"
    )
    .bind(&now)
    .bind(&now)
    .bind(user.user_id as i64)
    .execute(&pool)
    .await
    .map_err(|e| {
        eprintln!("[StartTrial] Failed to start trial: {}", e);
        (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(ErrorResponse {
                error: "Database error".to_string(),
            }),
        )
    })?;

    Ok(Json(serde_json::json!({
        "success": true,
        "trial_started_at": now
    })))
}

// ====== Billing (Stripe) API ======

#[derive(Debug, Serialize)]
struct CheckoutSessionResponse {
    url: String,
}

// StripeへPOSTリクエストを送るヘルパー（フォームエンコード、Basic認証）
async fn stripe_api_post(path: &str, params: Vec<(String, String)>) -> Result<serde_json::Value, String> {
    let secret_key = get_stripe_secret_key();
    if secret_key.is_empty() {
        return Err("STRIPE_SECRET_KEY is not set".to_string());
    }

    let client = reqwest::Client::new();
    let response = client
        .post(format!("https://api.stripe.com/v1/{}", path))
        .basic_auth(secret_key, Option::<String>::None)
        .form(&params)
        .send()
        .await
        .map_err(|e| format!("Stripe request failed: {}", e))?;

    let status = response.status();
    let body: serde_json::Value = response
        .json()
        .await
        .map_err(|e| format!("Failed to parse Stripe response: {}", e))?;

    if !status.is_success() {
        let message = body["error"]["message"].as_str().unwrap_or("Unknown Stripe error");
        return Err(format!("Stripe API error ({}): {}", status, message));
    }

    Ok(body)
}

// StripeへDELETEリクエストを送るヘルパー（Basic認証）。サブスクリプションの即時解約に使用する
async fn stripe_api_delete(path: &str) -> Result<serde_json::Value, String> {
    let secret_key = get_stripe_secret_key();
    if secret_key.is_empty() {
        return Err("STRIPE_SECRET_KEY is not set".to_string());
    }

    let client = reqwest::Client::new();
    let response = client
        .delete(format!("https://api.stripe.com/v1/{}", path))
        .basic_auth(secret_key, Option::<String>::None)
        .send()
        .await
        .map_err(|e| format!("Stripe request failed: {}", e))?;

    let status = response.status();
    let body: serde_json::Value = response
        .json()
        .await
        .map_err(|e| format!("Failed to parse Stripe response: {}", e))?;

    if !status.is_success() {
        let message = body["error"]["message"].as_str().unwrap_or("Unknown Stripe error");
        return Err(format!("Stripe API error ({}): {}", status, message));
    }

    Ok(body)
}

// POST /billing/create-checkout-session - プレミアムプラン購読用のStripe Checkoutセッションを作成
async fn create_checkout_session(
    user: AuthenticatedUser,
    Extension(pool): Extension<Pool<Sqlite>>,
) -> Result<Json<CheckoutSessionResponse>, (StatusCode, Json<ErrorResponse>)> {
    let row: Option<(String, String)> = sqlx::query_as(
        "SELECT plan, email FROM users WHERE id = ?"
    )
    .bind(user.user_id as i64)
    .fetch_optional(&pool)
    .await
    .map_err(|e| {
        eprintln!("[CreateCheckoutSession] Database error: {}", e);
        (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(ErrorResponse { error: "Database error".to_string() }),
        )
    })?;

    let Some((plan, email)) = row else {
        return Err((
            StatusCode::NOT_FOUND,
            Json(ErrorResponse { error: "ユーザーが見つかりません".to_string() }),
        ));
    };

    if plan == "premium" {
        return Err((
            StatusCode::BAD_REQUEST,
            Json(ErrorResponse { error: "already_premium".to_string() }),
        ));
    }

    let price_id = get_stripe_premium_price_id();
    if price_id.is_empty() {
        eprintln!("[CreateCheckoutSession] STRIPE_PREMIUM_PRICE_ID is not set");
        return Err((
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(ErrorResponse { error: "Billing is not configured".to_string() }),
        ));
    }

    // 過去にStripe顧客が作成済みなら再利用し、重複した顧客レコードを作らないようにする
    let existing_customer_id: Option<(String,)> = sqlx::query_as(
        "SELECT provider_customer_id FROM subscriptions WHERE user_id = ? AND provider = 'stripe' AND provider_customer_id IS NOT NULL ORDER BY id DESC LIMIT 1"
    )
    .bind(user.user_id as i64)
    .fetch_optional(&pool)
    .await
    .map_err(|e| {
        eprintln!("[CreateCheckoutSession] Database error: {}", e);
        (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(ErrorResponse { error: "Database error".to_string() }),
        )
    })?;

    let frontend_url = get_frontend_url();
    let mut params = vec![
        ("mode".to_string(), "subscription".to_string()),
        ("line_items[0][price]".to_string(), price_id),
        ("line_items[0][quantity]".to_string(), "1".to_string()),
        ("client_reference_id".to_string(), user.user_id.to_string()),
        ("success_url".to_string(), format!("{}/billing/success?session_id={{CHECKOUT_SESSION_ID}}", frontend_url)),
        ("cancel_url".to_string(), format!("{}/billing/cancel", frontend_url)),
        // Managed Payments（税区分の設定が必要）は現時点で未対応のため、このセッションでは無効化する
        // 本番移行前に税務対応の要否を判断し、必要ならProductにtax_codeを設定した上で有効化を検討する
        ("managed_payments[enabled]".to_string(), "false".to_string()),
    ];

    let used_stored_customer = existing_customer_id.is_some();
    if let Some((customer_id,)) = existing_customer_id {
        params.push(("customer".to_string(), customer_id));
    } else {
        params.push(("customer_email".to_string(), email.clone()));
    }

    let mut session_result = stripe_api_post("checkout/sessions", params.clone()).await;

    // test/liveモード切り替え等で保存済みのcustomer_idが無効になっているケースへの対応。
    // customer_emailを使った新規顧客作成にフォールバックして再試行する
    if used_stored_customer {
        if let Err(ref e) = session_result {
            if e.contains("No such customer") {
                eprintln!("[CreateCheckoutSession] Stored customer id is invalid, retrying with customer_email");
                let retry_params: Vec<(String, String)> = params
                    .into_iter()
                    .filter(|(k, _)| k != "customer")
                    .chain(std::iter::once(("customer_email".to_string(), email)))
                    .collect();
                session_result = stripe_api_post("checkout/sessions", retry_params).await;
            }
        }
    }

    let session = session_result.map_err(|e| {
        eprintln!("[CreateCheckoutSession] Stripe error: {}", e);
        (
            StatusCode::BAD_GATEWAY,
            Json(ErrorResponse { error: "決済セッションの作成に失敗しました".to_string() }),
        )
    })?;

    let url = session["url"].as_str().ok_or_else(|| {
        eprintln!("[CreateCheckoutSession] Stripe response missing url: {:?}", session);
        (
            StatusCode::BAD_GATEWAY,
            Json(ErrorResponse { error: "決済セッションの作成に失敗しました".to_string() }),
        )
    })?;

    Ok(Json(CheckoutSessionResponse { url: url.to_string() }))
}

#[derive(Debug, Serialize)]
struct PortalSessionResponse {
    url: String,
}

// POST /billing/create-portal-session - 解約・支払い方法変更用のStripe Billing Portalセッションを作成
async fn create_portal_session(
    user: AuthenticatedUser,
    Extension(pool): Extension<Pool<Sqlite>>,
) -> Result<Json<PortalSessionResponse>, (StatusCode, Json<ErrorResponse>)> {
    let customer_id: Option<(String,)> = sqlx::query_as(
        "SELECT provider_customer_id FROM subscriptions WHERE user_id = ? AND provider = 'stripe' AND provider_customer_id IS NOT NULL ORDER BY id DESC LIMIT 1"
    )
    .bind(user.user_id as i64)
    .fetch_optional(&pool)
    .await
    .map_err(|e| {
        eprintln!("[CreatePortalSession] Database error: {}", e);
        (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(ErrorResponse { error: "Database error".to_string() }),
        )
    })?;

    let Some((customer_id,)) = customer_id else {
        return Err((
            StatusCode::BAD_REQUEST,
            Json(ErrorResponse { error: "no_stripe_customer".to_string() }),
        ));
    };

    let frontend_url = get_frontend_url();
    let params = vec![
        ("customer".to_string(), customer_id),
        ("return_url".to_string(), format!("{}/billing/portal-return", frontend_url)),
    ];

    let session = stripe_api_post("billing_portal/sessions", params).await.map_err(|e| {
        eprintln!("[CreatePortalSession] Stripe error: {}", e);
        (
            StatusCode::BAD_GATEWAY,
            Json(ErrorResponse { error: "ポータルセッションの作成に失敗しました".to_string() }),
        )
    })?;

    let url = session["url"].as_str().ok_or_else(|| {
        eprintln!("[CreatePortalSession] Stripe response missing url: {:?}", session);
        (
            StatusCode::BAD_GATEWAY,
            Json(ErrorResponse { error: "ポータルセッションの作成に失敗しました".to_string() }),
        )
    })?;

    Ok(Json(PortalSessionResponse { url: url.to_string() }))
}

// Stripe Webhook署名を検証する（HMAC-SHA256。タイムスタンプが現在時刻から5分以上ずれている場合はリプレイとみなし拒否する）
fn verify_stripe_signature(payload: &[u8], signature_header: &str, secret: &str) -> bool {
    type HmacSha256 = Hmac<Sha256>;

    let mut timestamp: Option<i64> = None;
    let mut v1_signatures: Vec<&str> = Vec::new();

    for part in signature_header.split(',') {
        let mut kv = part.splitn(2, '=');
        match (kv.next(), kv.next()) {
            (Some("t"), Some(v)) => timestamp = v.parse::<i64>().ok(),
            (Some("v1"), Some(v)) => v1_signatures.push(v),
            _ => {}
        }
    }

    let Some(timestamp) = timestamp else { return false };
    if v1_signatures.is_empty() {
        return false;
    }
    if (Utc::now().timestamp() - timestamp).abs() > 300 {
        return false;
    }

    let mut signed_payload = format!("{}.", timestamp).into_bytes();
    signed_payload.extend_from_slice(payload);

    let Ok(mac) = HmacSha256::new_from_slice(secret.as_bytes()) else { return false };

    v1_signatures.iter().any(|sig| match hex::decode(sig) {
        Ok(expected) => mac.clone().chain_update(&signed_payload).verify_slice(&expected).is_ok(),
        Err(_) => false,
    })
}

// ユーザーを有料プランに昇格する。既にpremiumの場合はpremium_started_atを上書きしない
async fn grant_premium_access(pool: &Pool<Sqlite>, user_id: i64, now: &str) -> Result<(), sqlx::Error> {
    sqlx::query(
        r#"
        UPDATE users
        SET plan = 'premium',
            premium_started_at = CASE WHEN plan != 'premium' THEN ? ELSE premium_started_at END,
            updated_at = ?
        WHERE id = ?
        "#
    )
    .bind(now)
    .bind(now)
    .bind(user_id)
    .execute(pool)
    .await?;
    Ok(())
}

// ユーザーを無料プランに戻す
// 注意: 現時点ではStripeのみ対応のため単純にfreeへ戻すが、将来Google Play/Apple等の
// 複数プロバイダに対応する際は、他プロバイダの有効なサブスクリプションが残っていないか
// 確認してからdowngradeする必要がある
async fn revoke_premium_access(pool: &Pool<Sqlite>, user_id: i64, now: &str) -> Result<(), sqlx::Error> {
    sqlx::query("UPDATE users SET plan = 'free', updated_at = ? WHERE id = ?")
        .bind(now)
        .bind(user_id)
        .execute(pool)
        .await?;
    Ok(())
}

// checkout.session.completedを処理: user_id・customer_id・subscription_idを紐付けてsubscriptionsに保存する
async fn handle_checkout_session_completed(pool: &Pool<Sqlite>, session: &serde_json::Value) {
    let Some(user_id) = session["client_reference_id"].as_str().and_then(|s| s.parse::<i64>().ok()) else {
        eprintln!("[StripeWebhook] checkout.session.completed missing client_reference_id: {:?}", session);
        return;
    };
    let Some(customer_id) = session["customer"].as_str() else {
        eprintln!("[StripeWebhook] checkout.session.completed missing customer: {:?}", session);
        return;
    };
    let Some(subscription_id) = session["subscription"].as_str() else {
        // mode=subscription以外、またはサブスクリプション未確定のセッションは対象外
        return;
    };

    let now = Utc::now().to_rfc3339();
    let result = sqlx::query(
        r#"
        INSERT INTO subscriptions (user_id, provider, provider_customer_id, provider_subscription_id, status, created_at, updated_at)
        VALUES (?, 'stripe', ?, ?, 'active', ?, ?)
        ON CONFLICT(provider, provider_subscription_id) DO UPDATE SET
            user_id = excluded.user_id,
            provider_customer_id = excluded.provider_customer_id,
            updated_at = excluded.updated_at
        "#
    )
    .bind(user_id)
    .bind(customer_id)
    .bind(subscription_id)
    .bind(&now)
    .bind(&now)
    .execute(pool)
    .await;

    if let Err(e) = result {
        eprintln!("[StripeWebhook] Failed to upsert subscription from checkout.session.completed: {}", e);
        return;
    }

    if let Err(e) = grant_premium_access(pool, user_id, &now).await {
        eprintln!("[StripeWebhook] Failed to grant premium access: {}", e);
    }
}

// customer.subscription.created/updatedを処理: ステータス・期間終了日時を反映し、users.planを同期する
async fn handle_subscription_updated(pool: &Pool<Sqlite>, subscription: &serde_json::Value) {
    let Some(subscription_id) = subscription["id"].as_str() else { return };
    let Some(customer_id) = subscription["customer"].as_str() else { return };
    let status = subscription["status"].as_str().unwrap_or("unknown");
    let cancel_at_period_end = subscription["cancel_at_period_end"].as_bool().unwrap_or(false) as i32;
    let current_period_end = subscription["current_period_end"]
        .as_i64()
        .and_then(|ts| Utc.timestamp_opt(ts, 0).single())
        .map(|dt| dt.to_rfc3339());

    let now = Utc::now().to_rfc3339();

    let update_result = sqlx::query(
        r#"
        UPDATE subscriptions
        SET status = ?, current_period_end = ?, cancel_at_period_end = ?, provider_customer_id = ?, updated_at = ?
        WHERE provider = 'stripe' AND provider_subscription_id = ?
        "#
    )
    .bind(status)
    .bind(&current_period_end)
    .bind(cancel_at_period_end)
    .bind(customer_id)
    .bind(&now)
    .bind(subscription_id)
    .execute(pool)
    .await;

    let rows_affected = match update_result {
        Ok(r) => r.rows_affected(),
        Err(e) => {
            eprintln!("[StripeWebhook] Failed to update subscription: {}", e);
            return;
        }
    };

    let user_id: Option<i64> = if rows_affected > 0 {
        sqlx::query_scalar(
            "SELECT user_id FROM subscriptions WHERE provider = 'stripe' AND provider_subscription_id = ?"
        )
        .bind(subscription_id)
        .fetch_optional(pool)
        .await
        .ok()
        .flatten()
    } else {
        // checkout.session.completedより先にこのイベントが届いた場合は、同一顧客の既存レコードからuser_idを補完する
        let existing_user_id: Option<i64> = sqlx::query_scalar(
            "SELECT user_id FROM subscriptions WHERE provider = 'stripe' AND provider_customer_id = ? ORDER BY id DESC LIMIT 1"
        )
        .bind(customer_id)
        .fetch_optional(pool)
        .await
        .ok()
        .flatten();

        let Some(resolved_user_id) = existing_user_id else {
            eprintln!(
                "[StripeWebhook] Cannot resolve user for subscription {} (customer {}), skipping",
                subscription_id, customer_id
            );
            return;
        };

        let insert_result = sqlx::query(
            r#"
            INSERT INTO subscriptions (user_id, provider, provider_customer_id, provider_subscription_id, status, current_period_end, cancel_at_period_end, created_at, updated_at)
            VALUES (?, 'stripe', ?, ?, ?, ?, ?, ?, ?)
            "#
        )
        .bind(resolved_user_id)
        .bind(customer_id)
        .bind(subscription_id)
        .bind(status)
        .bind(&current_period_end)
        .bind(cancel_at_period_end)
        .bind(&now)
        .bind(&now)
        .execute(pool)
        .await;

        if let Err(e) = insert_result {
            eprintln!("[StripeWebhook] Failed to insert subscription: {}", e);
            return;
        }

        Some(resolved_user_id)
    };

    let Some(user_id) = user_id else { return };

    match status {
        "active" | "trialing" => {
            if let Err(e) = grant_premium_access(pool, user_id, &now).await {
                eprintln!("[StripeWebhook] Failed to grant premium access: {}", e);
            }
        }
        "canceled" | "unpaid" | "incomplete_expired" => {
            if let Err(e) = revoke_premium_access(pool, user_id, &now).await {
                eprintln!("[StripeWebhook] Failed to revoke premium access: {}", e);
            }
        }
        _ => {
            // past_due/incomplete等は支払いリトライ中の猶予期間のため、planを変更しない
        }
    }
}

// customer.subscription.deletedを処理: 状態をcanceledにし、有料プランへのアクセスを外す
async fn handle_subscription_deleted(pool: &Pool<Sqlite>, subscription: &serde_json::Value) {
    let Some(subscription_id) = subscription["id"].as_str() else { return };
    let now = Utc::now().to_rfc3339();

    if let Err(e) = sqlx::query(
        "UPDATE subscriptions SET status = 'canceled', updated_at = ? WHERE provider = 'stripe' AND provider_subscription_id = ?"
    )
    .bind(&now)
    .bind(subscription_id)
    .execute(pool)
    .await
    {
        eprintln!("[StripeWebhook] Failed to mark subscription canceled: {}", e);
        return;
    }

    let user_id: Option<i64> = sqlx::query_scalar(
        "SELECT user_id FROM subscriptions WHERE provider = 'stripe' AND provider_subscription_id = ?"
    )
    .bind(subscription_id)
    .fetch_optional(pool)
    .await
    .ok()
    .flatten();

    let Some(user_id) = user_id else { return };

    if let Err(e) = revoke_premium_access(pool, user_id, &now).await {
        eprintln!("[StripeWebhook] Failed to revoke premium access: {}", e);
    }
}

// POST /billing/webhook - Stripe Webhook受信
// 注意: 署名検証に生のリクエストボディが必要なため、Jsonエクストラクタではなくbytesで受け取る
async fn stripe_webhook(
    Extension(pool): Extension<Pool<Sqlite>>,
    headers: HeaderMap,
    body: Bytes,
) -> Result<StatusCode, StatusCode> {
    let webhook_secret = get_stripe_webhook_secret();
    if webhook_secret.is_empty() {
        eprintln!("[StripeWebhook] STRIPE_WEBHOOK_SECRET is not set");
        return Err(StatusCode::INTERNAL_SERVER_ERROR);
    }

    let signature_header = headers
        .get("stripe-signature")
        .and_then(|v| v.to_str().ok())
        .ok_or(StatusCode::BAD_REQUEST)?;

    if !verify_stripe_signature(&body, signature_header, &webhook_secret) {
        eprintln!("[StripeWebhook] Signature verification failed");
        return Err(StatusCode::BAD_REQUEST);
    }

    let event: serde_json::Value = serde_json::from_slice(&body).map_err(|e| {
        eprintln!("[StripeWebhook] Failed to parse event JSON: {}", e);
        StatusCode::BAD_REQUEST
    })?;

    let event_type = event["type"].as_str().unwrap_or_default();
    let data = &event["data"]["object"];

    match event_type {
        "checkout.session.completed" => handle_checkout_session_completed(&pool, data).await,
        "customer.subscription.created" | "customer.subscription.updated" => {
            handle_subscription_updated(&pool, data).await
        }
        "customer.subscription.deleted" => handle_subscription_deleted(&pool, data).await,
        _ => {
            // その他のイベントは現時点では未対応（受信のみ確認しACKする）
        }
    }

    Ok(StatusCode::OK)
}

// GET /auth/profile - ログイン中ユーザーのプロフィール取得
async fn get_profile(
    user: AuthenticatedUser,
    Extension(pool): Extension<Pool<Sqlite>>,
) -> Result<Json<serde_json::Value>, (StatusCode, Json<ErrorResponse>)> {
    let row: Option<(String, Option<String>, Option<String>, Option<String>)> = sqlx::query_as(
        "SELECT email, share_id, avatar_data_url, display_name FROM users WHERE id = ?"
    )
    .bind(user.user_id as i64)
    .fetch_optional(&pool)
    .await
    .map_err(|_| (StatusCode::INTERNAL_SERVER_ERROR, Json(ErrorResponse { error: "プロフィールの取得に失敗しました".to_string() })))?;

    match row {
        Some((email, share_id, avatar_data_url, display_name)) => Ok(Json(serde_json::json!({
            "email": email,
            "share_id": share_id,
            "avatar_data_url": avatar_data_url,
            "display_name": display_name,
        }))),
        None => Err((StatusCode::NOT_FOUND, Json(ErrorResponse { error: "ユーザーが見つかりません".to_string() }))),
    }
}

// PUT /auth/profile - プロフィール名更新（空文字で未設定に戻す）
async fn update_profile(
    user: AuthenticatedUser,
    Extension(pool): Extension<Pool<Sqlite>>,
    Json(payload): Json<UpdateProfileRequest>,
) -> Result<Json<serde_json::Value>, (StatusCode, Json<ErrorResponse>)> {
    let display_name = payload
        .display_name
        .map(|name| name.trim().to_string())
        .filter(|name| !name.is_empty());

    if display_name.as_ref().map(|name| name.chars().count()).unwrap_or(0) > 50 {
        return Err((StatusCode::BAD_REQUEST, Json(ErrorResponse {
            error: "名前は50文字以内で入力してください".to_string(),
        })));
    }

    let now = Utc::now().to_rfc3339();
    sqlx::query("UPDATE users SET display_name = ?, updated_at = ? WHERE id = ?")
        .bind(&display_name)
        .bind(&now)
        .bind(user.user_id as i64)
        .execute(&pool)
        .await
        .map_err(|_| (StatusCode::INTERNAL_SERVER_ERROR, Json(ErrorResponse {
            error: "名前の更新に失敗しました".to_string(),
        })))?;

    Ok(Json(serde_json::json!({ "success": true, "display_name": display_name })))
}

// PUT /auth/profile-avatar - プロフィール画像更新（nullで削除）
async fn update_profile_avatar(
    user: AuthenticatedUser,
    Extension(pool): Extension<Pool<Sqlite>>,
    Json(payload): Json<ProfileAvatarRequest>,
) -> Result<Json<serde_json::Value>, (StatusCode, Json<ErrorResponse>)> {
    if let Some(ref data_url) = payload.avatar_data_url {
        let supported = data_url.starts_with("data:image/jpeg;base64,")
            || data_url.starts_with("data:image/png;base64,")
            || data_url.starts_with("data:image/webp;base64,");
        if !supported {
            return Err((StatusCode::BAD_REQUEST, Json(ErrorResponse { error: "JPEG、PNG、WebP画像のみ使用できます".to_string() })));
        }
        if data_url.len() > 2_100_000 {
            return Err((StatusCode::PAYLOAD_TOO_LARGE, Json(ErrorResponse { error: "画像サイズは1.5MB以下にしてください".to_string() })));
        }
    }

    let now = Utc::now().to_rfc3339();
    sqlx::query("UPDATE users SET avatar_data_url = ?, updated_at = ? WHERE id = ?")
        .bind(&payload.avatar_data_url)
        .bind(&now)
        .bind(user.user_id as i64)
        .execute(&pool)
        .await
        .map_err(|_| (StatusCode::INTERNAL_SERVER_ERROR, Json(ErrorResponse { error: "プロフィール画像の更新に失敗しました".to_string() })))?;

    Ok(Json(serde_json::json!({ "success": true, "avatar_data_url": payload.avatar_data_url })))
}

// DELETE /auth/account - 退会（アカウント削除）。パスワード確認必須。
// ユーザーに紐づく全データ（スケジュール・交通・宿泊・通知・マスク設定・選択肢・購読情報）を削除し、
// 残っているStripeサブスクリプションがあれば即時解約する（解約失敗はログのみで退会処理自体は継続する）
async fn delete_account(
    user: AuthenticatedUser,
    Extension(pool): Extension<Pool<Sqlite>>,
    Json(payload): Json<DeleteAccountRequest>,
) -> Result<Json<serde_json::Value>, (StatusCode, Json<ErrorResponse>)> {
    let row: Option<(String,)> = sqlx::query_as("SELECT password_hash FROM users WHERE id = ?")
        .bind(user.user_id as i64)
        .fetch_optional(&pool)
        .await
        .map_err(|_| (StatusCode::INTERNAL_SERVER_ERROR, Json(ErrorResponse { error: "アカウント情報の取得に失敗しました".to_string() })))?;

    let Some((password_hash,)) = row else {
        return Err((StatusCode::NOT_FOUND, Json(ErrorResponse { error: "ユーザーが見つかりません".to_string() })));
    };

    let valid = bcrypt::verify(&payload.password, &password_hash)
        .map_err(|_| (StatusCode::INTERNAL_SERVER_ERROR, Json(ErrorResponse { error: "パスワードの確認に失敗しました".to_string() })))?;
    if !valid {
        // authenticatedFetch側は401でセッションを自動ログアウトさせる仕様のため、
        // トークン自体は有効なパスワード確認失敗はここでは400を返す
        return Err((StatusCode::BAD_REQUEST, Json(ErrorResponse { error: "パスワードが正しくありません".to_string() })));
    }

    // 解約に失敗した場合は退会処理自体を中断し、ここでは何も削除しない。
    // 課金が残ったままアカウントとprovider_subscription_idの追跡手段を失うと、
    // 恒久的な過課金につながり得るため、退会は再試行可能な状態を保つ
    let active_subscriptions: Vec<(String,)> = sqlx::query_as(
        "SELECT provider_subscription_id FROM subscriptions WHERE user_id = ? AND provider = 'stripe' AND status NOT IN ('canceled', 'incomplete_expired')"
    )
    .bind(user.user_id as i64)
    .fetch_all(&pool)
    .await
    .map_err(|_| (StatusCode::INTERNAL_SERVER_ERROR, Json(ErrorResponse { error: "退会処理に失敗しました".to_string() })))?;

    for (subscription_id,) in &active_subscriptions {
        if let Err(e) = stripe_api_delete(&format!("subscriptions/{}", subscription_id)).await {
            eprintln!("[DeleteAccount] Failed to cancel Stripe subscription {}: {}", subscription_id, e);
            return Err((
                StatusCode::BAD_GATEWAY,
                Json(ErrorResponse { error: "サブスクリプションの解約に失敗しました。時間をおいて再度お試しください".to_string() }),
            ));
        }
    }

    let delete_failed = || (StatusCode::INTERNAL_SERVER_ERROR, Json(ErrorResponse { error: "退会処理に失敗しました".to_string() }));

    let mut tx = pool.begin().await.map_err(|_| delete_failed())?;

    sqlx::query("DELETE FROM traffics WHERE schedule_id IN (SELECT id FROM schedules WHERE user_id = ?)")
        .bind(user.user_id as i64).execute(&mut *tx).await.map_err(|_| delete_failed())?;
    sqlx::query("DELETE FROM stays WHERE schedule_id IN (SELECT id FROM schedules WHERE user_id = ?)")
        .bind(user.user_id as i64).execute(&mut *tx).await.map_err(|_| delete_failed())?;
    sqlx::query("DELETE FROM notifications WHERE user_id = ?")
        .bind(user.user_id as i64).execute(&mut *tx).await.map_err(|_| delete_failed())?;
    sqlx::query("DELETE FROM masked_locations WHERE user_id = ?")
        .bind(user.user_id as i64).execute(&mut *tx).await.map_err(|_| delete_failed())?;
    sqlx::query("DELETE FROM select_options WHERE user_id = ?")
        .bind(user.user_id as i64).execute(&mut *tx).await.map_err(|_| delete_failed())?;
    sqlx::query("DELETE FROM stay_select_options WHERE user_id = ?")
        .bind(user.user_id as i64).execute(&mut *tx).await.map_err(|_| delete_failed())?;
    sqlx::query("DELETE FROM subscriptions WHERE user_id = ?")
        .bind(user.user_id as i64).execute(&mut *tx).await.map_err(|_| delete_failed())?;
    sqlx::query("DELETE FROM schedules WHERE user_id = ?")
        .bind(user.user_id as i64).execute(&mut *tx).await.map_err(|_| delete_failed())?;
    sqlx::query("DELETE FROM users WHERE id = ?")
        .bind(user.user_id as i64).execute(&mut *tx).await.map_err(|_| delete_failed())?;

    tx.commit().await.map_err(|_| delete_failed())?;

    Ok(Json(serde_json::json!({ "success": true })))
}

// GET /share/:share_id/profile - 共有ページ用公開プロフィール
async fn get_shared_profile(
    Path(share_id): Path<String>,
    Extension(pool): Extension<Pool<Sqlite>>,
) -> Result<Json<serde_json::Value>, (StatusCode, Json<ErrorResponse>)> {
    let row: Option<(Option<String>, Option<String>, i32, String, Option<String>)> = sqlx::query_as(
        "SELECT avatar_data_url, display_name, sharing_enabled, plan, trial_started_at FROM users WHERE share_id = ?"
    )
    .bind(&share_id)
    .fetch_optional(&pool)
    .await
    .map_err(|_| (StatusCode::INTERNAL_SERVER_ERROR, Json(ErrorResponse { error: "プロフィールの取得に失敗しました".to_string() })))?;

    match row {
        Some((avatar_data_url, display_name, sharing_enabled, plan, trial_started_at))
            if sharing_enabled != 0 && has_paid_access(&plan, trial_started_at.as_deref()) =>
        Ok(Json(serde_json::json!({
            "share_id": share_id,
            "avatar_data_url": avatar_data_url,
            "display_name": display_name,
        }))),
        _ => Err((StatusCode::NOT_FOUND, Json(ErrorResponse { error: "共有プロフィールが見つかりません".to_string() }))),
    }
}

// GET /share/search-user?user_id=... - 公開中の共有ユーザーを完全一致で検索
async fn search_shared_user(
    Query(query): Query<SearchSharedUserQuery>,
    Extension(pool): Extension<Pool<Sqlite>>,
) -> Result<Json<serde_json::Value>, (StatusCode, Json<ErrorResponse>)> {
    let user_id = query.user_id.trim();
    if user_id.len() < 3
        || user_id.len() > 20
        || !user_id.chars().all(|c| c.is_alphanumeric() || c == '-' || c == '_')
    {
        return Err((
            StatusCode::BAD_REQUEST,
            Json(ErrorResponse { error: "ユーザーIDは3〜20文字の英数字・ハイフン・アンダースコアで入力してください".to_string() }),
        ));
    }

    let row: Option<(String, Option<String>, Option<String>, String, Option<String>)> = sqlx::query_as(
        "SELECT share_id, avatar_data_url, display_name, plan, trial_started_at FROM users WHERE share_id = ? AND sharing_enabled = 1"
    )
    .bind(user_id)
    .fetch_optional(&pool)
    .await
    .map_err(|_| (
        StatusCode::INTERNAL_SERVER_ERROR,
        Json(ErrorResponse { error: "ユーザー検索に失敗しました".to_string() }),
    ))?;

    if let Some((share_id, avatar_data_url, display_name, plan, trial_started_at)) = row {
        if has_paid_access(&plan, trial_started_at.as_deref()) {
            return Ok(Json(serde_json::json!({
                "found": true,
                "share_id": share_id,
                "avatar_data_url": avatar_data_url,
                "display_name": display_name,
            })));
        }
    }

    // 未登録と非公開を区別せず、非公開ユーザーの存在を開示しない
    Ok(Json(serde_json::json!({ "found": false })))
}

// ====== MaskedLocation API ======

// GET /masked-locations - マスク設定一覧取得
async fn list_masked_locations(
    user: AuthenticatedUser,
    Extension(pool): Extension<Pool<Sqlite>>,
) -> Result<Json<Vec<MaskedLocation>>, (StatusCode, Json<ErrorResponse>)> {
    let rows: Vec<MaskedLocationRow> = sqlx::query_as::<_, MaskedLocationRow>(
        "SELECT id, user_id, location_name, created_at, updated_at FROM masked_locations WHERE user_id = ? ORDER BY location_name ASC"
    )
    .bind(user.user_id as i64)
    .fetch_all(&pool)
    .await
    .map_err(|e| {
        eprintln!("[ListMaskedLocations] Database error: {}", e);
        (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(ErrorResponse {
                error: "Database error".to_string(),
            }),
        )
    })?;

    let locations = rows.into_iter().map(row_to_masked_location).collect();
    Ok(Json(locations))
}

// POST /masked-locations - マスク設定追加
async fn create_masked_location(
    user: AuthenticatedUser,
    Extension(pool): Extension<Pool<Sqlite>>,
    Json(payload): Json<NewMaskedLocation>,
) -> Result<Json<MaskedLocation>, (StatusCode, Json<ErrorResponse>)> {
    if payload.location_name.trim().is_empty() {
        return Err((
            StatusCode::BAD_REQUEST,
            Json(ErrorResponse {
                error: "駅名は必須です".to_string(),
            }),
        ));
    }

    let now = Utc::now().to_rfc3339();
    let result = sqlx::query(
        r#"
        INSERT INTO masked_locations (user_id, location_name, created_at, updated_at)
        VALUES (?, ?, ?, ?)
        "#
    )
    .bind(user.user_id as i64)
    .bind(payload.location_name.trim())
    .bind(&now)
    .bind(&now)
    .execute(&pool)
    .await;

    let inserted_id = match result {
        Ok(result) => result.last_insert_rowid(),
        Err(e) => {
            return match e {
                sqlx::Error::Database(db_err) if db_err.message().contains("UNIQUE constraint") => {
                    Err((
                        StatusCode::CONFLICT,
                        Json(ErrorResponse {
                            error: "この駅名は既に登録されています".to_string(),
                        }),
                    ))
                }
                _ => {
                    eprintln!("[CreateMaskedLocation] Database error: {}", e);
                    Err((
                        StatusCode::INTERNAL_SERVER_ERROR,
                        Json(ErrorResponse {
                            error: "Database error".to_string(),
                        }),
                    ))
                }
            };
        }
    };

    // 挿入したレコードを取得
    let row: Option<MaskedLocationRow> = sqlx::query_as::<_, MaskedLocationRow>(
        "SELECT id, user_id, location_name, created_at, updated_at FROM masked_locations WHERE id = ?"
    )
    .bind(inserted_id)
    .fetch_optional(&pool)
    .await
    .map_err(|e| {
        eprintln!("[CreateMaskedLocation] Database error: {}", e);
        (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(ErrorResponse {
                error: "Database error".to_string(),
            }),
        )
    })?;

    match row {
        Some(row) => Ok(Json(row_to_masked_location(row))),
        None => Err((
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(ErrorResponse {
                error: "Failed to create masked location".to_string(),
            }),
        )),
    }
}

// PUT /masked-locations/:id - マスク設定更新
async fn update_masked_location(
    user: AuthenticatedUser,
    Path(id): Path<i32>,
    Extension(pool): Extension<Pool<Sqlite>>,
    Json(payload): Json<UpdateMaskedLocation>,
) -> Result<Json<MaskedLocation>, (StatusCode, Json<ErrorResponse>)> {
    if payload.location_name.trim().is_empty() {
        return Err((
            StatusCode::BAD_REQUEST,
            Json(ErrorResponse {
                error: "駅名は必須です".to_string(),
            }),
        ));
    }

    // ユーザーが所有しているか確認
    let existing: Option<(i64,)> = sqlx::query_as(
        "SELECT user_id FROM masked_locations WHERE id = ?"
    )
    .bind(id as i64)
    .fetch_optional(&pool)
    .await
    .map_err(|e| {
        eprintln!("[UpdateMaskedLocation] Database error: {}", e);
        (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(ErrorResponse {
                error: "Database error".to_string(),
            }),
        )
    })?;

    let existing = existing.ok_or((
        StatusCode::NOT_FOUND,
        Json(ErrorResponse {
            error: "マスク設定が見つかりません".to_string(),
        }),
    ))?;

    if existing.0 != user.user_id as i64 {
        return Err((
            StatusCode::FORBIDDEN,
            Json(ErrorResponse {
                error: "このマスク設定を編集する権限がありません".to_string(),
            }),
        ));
    }

    let now = Utc::now().to_rfc3339();
    let result = sqlx::query(
        r#"
        UPDATE masked_locations
        SET location_name = ?, updated_at = ?
        WHERE id = ? AND user_id = ?
        "#
    )
    .bind(payload.location_name.trim())
    .bind(&now)
    .bind(id as i64)
    .bind(user.user_id as i64)
    .execute(&pool)
    .await;

    let updated = match result {
        Ok(result) if result.rows_affected() > 0 => true,
        Ok(_) => false,
        Err(sqlx::Error::Database(e)) if e.message().contains("UNIQUE constraint") => {
            return Err((
                StatusCode::CONFLICT,
                Json(ErrorResponse {
                    error: "この駅名は既に登録されています".to_string(),
                }),
            ));
        }
        Err(e) => {
            eprintln!("[UpdateMaskedLocation] Database error: {}", e);
            return Err((
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(ErrorResponse {
                    error: "Database error".to_string(),
                }),
            ));
        }
    };

    if !updated {
        return Err((
            StatusCode::NOT_FOUND,
            Json(ErrorResponse {
                error: "マスク設定が見つかりません".to_string(),
            }),
        ));
    }

    // 更新したレコードを取得
    let row: Option<MaskedLocationRow> = sqlx::query_as::<_, MaskedLocationRow>(
        "SELECT id, user_id, location_name, created_at, updated_at FROM masked_locations WHERE id = ?"
    )
    .bind(id as i64)
    .fetch_optional(&pool)
    .await
    .map_err(|e| {
        eprintln!("[UpdateMaskedLocation] Database error: {}", e);
        (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(ErrorResponse {
                error: "Database error".to_string(),
            }),
        )
    })?;

    match row {
        Some(row) => Ok(Json(row_to_masked_location(row))),
        None => Err((
            StatusCode::NOT_FOUND,
            Json(ErrorResponse {
                error: "マスク設定が見つかりません".to_string(),
            }),
        )),
    }
}

// DELETE /masked-locations/:id - マスク設定削除
async fn delete_masked_location(
    user: AuthenticatedUser,
    Path(id): Path<i32>,
    Extension(pool): Extension<Pool<Sqlite>>,
) -> Result<Json<serde_json::Value>, (StatusCode, Json<ErrorResponse>)> {
    // ユーザーが所有しているか確認
    let existing: Option<(i64,)> = sqlx::query_as(
        "SELECT user_id FROM masked_locations WHERE id = ?"
    )
    .bind(id as i64)
    .fetch_optional(&pool)
    .await
    .map_err(|e| {
        eprintln!("[DeleteMaskedLocation] Database error: {}", e);
        (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(ErrorResponse {
                error: "Database error".to_string(),
            }),
        )
    })?;

    let existing = existing.ok_or((
        StatusCode::NOT_FOUND,
        Json(ErrorResponse {
            error: "マスク設定が見つかりません".to_string(),
        }),
    ))?;

    if existing.0 != user.user_id as i64 {
        return Err((
            StatusCode::FORBIDDEN,
            Json(ErrorResponse {
                error: "このマスク設定を削除する権限がありません".to_string(),
            }),
        ));
    }

    let result = sqlx::query("DELETE FROM masked_locations WHERE id = ? AND user_id = ?")
        .bind(id as i64)
        .bind(user.user_id as i64)
        .execute(&pool)
        .await;

    match result {
        Ok(result) if result.rows_affected() > 0 => {
            Ok(Json(serde_json::json!({
                "success": true,
                "message": "マスク設定を削除しました"
            })))
        }
        Ok(_) => Err((
            StatusCode::NOT_FOUND,
            Json(ErrorResponse {
                error: "マスク設定が見つかりません".to_string(),
            }),
        )),
        Err(e) => {
            eprintln!("[DeleteMaskedLocation] Database error: {}", e);
            Err((
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(ErrorResponse {
                    error: "Database error".to_string(),
                }),
            ))
        }
    }
}

// GET /share/:share_id - 共有ページ用のスケジュール一覧取得
async fn get_shared_schedules(
    Path(share_id): Path<String>,
    Extension(pool): Extension<Pool<Sqlite>>,
) -> Result<Json<Vec<PublicSchedule>>, (StatusCode, Json<ErrorResponse>)> {
    // share_idからユーザーIDを取得
    let user_row: Option<(i64, i32, String, Option<String>)> = sqlx::query_as(
        "SELECT id, sharing_enabled, plan, trial_started_at FROM users WHERE share_id = ?"
    )
    .bind(&share_id)
    .fetch_optional(&pool)
    .await
    .map_err(|e| {
        eprintln!("[GetSharedSchedules] Database error: {}", e);
        (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(ErrorResponse {
                error: "Database error".to_string(),
            }),
        )
    })?;

    if let Some((user_id, sharing_enabled, plan, trial_started_at)) = user_row {
        if sharing_enabled == 0 || !has_paid_access(&plan, trial_started_at.as_deref()) {
            return Err((
                StatusCode::FORBIDDEN,
                Json(ErrorResponse {
                    error: "このユーザーのスケジュールは共有されていません".to_string(),
                }),
            ));
        }

        // 共有されているスケジュールを取得（is_public = 1 のみ）
        eprintln!("[GetSharedSchedules] Fetching schedules for user_id: {}, checking is_public = 1", user_id);
        let rows: Vec<PublicScheduleRow> = sqlx::query_as::<_, PublicScheduleRow>(
            r#"
            SELECT
              id,
              public_id,
              title,
              "group",
              date,
              open,
              start,
              "end",
              notes,
              category,
              area,
              venue,
              target,
              lineup,
              seller,
              ticket_fee,
              drink_fee,
              total_fare,
              stay_fee,
              travel_cost,
              total_cost,
              status,
              related_schedule_ids,
              CAST(is_public AS INTEGER) as is_public
            FROM schedules
            WHERE user_id = ? AND CAST(is_public AS INTEGER) = 1
            ORDER BY date ASC, start ASC
            "#
        )
        .bind(user_id)
        .fetch_all(&pool)
        .await
        .map_err(|e| {
            eprintln!("[GetSharedSchedules] Failed to fetch schedules: {}", e);
            (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(ErrorResponse {
                    error: "Database error".to_string(),
                }),
            )
        })?;

        eprintln!("[GetSharedSchedules] Found {} schedules with is_public = 1", rows.len());
        let mut schedules = Vec::with_capacity(rows.len());
        for row in rows {
            schedules.push(row_to_public_schedule(&pool, row).await);
        }
        Ok(Json(schedules))
    } else {
        Err((
            StatusCode::NOT_FOUND,
            Json(ErrorResponse {
                error: "ユーザーが見つかりません".to_string(),
            }),
        ))
    }
}

// GET /share/:share_id/schedules/:id - 共有ページ用のスケジュール詳細取得
async fn get_shared_schedule(
    Path((share_id, public_id)): Path<(String, String)>,
    Extension(pool): Extension<Pool<Sqlite>>,
) -> Result<Json<PublicSchedule>, (StatusCode, Json<ErrorResponse>)> {
    // share_idからユーザーIDを取得
    let user_row: Option<(i64, i32, String, Option<String>)> = sqlx::query_as(
        "SELECT id, sharing_enabled, plan, trial_started_at FROM users WHERE share_id = ?"
    )
    .bind(&share_id)
    .fetch_optional(&pool)
    .await
    .map_err(|e| {
        eprintln!("[GetSharedSchedule] Database error: {}", e);
        (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(ErrorResponse {
                error: "Database error".to_string(),
            }),
        )
    })?;

    if let Some((user_id, sharing_enabled, plan, trial_started_at)) = user_row {
        if sharing_enabled == 0 || !has_paid_access(&plan, trial_started_at.as_deref()) {
            return Err((
                StatusCode::FORBIDDEN,
                Json(ErrorResponse {
                    error: "このユーザーのスケジュールは共有されていません".to_string(),
                }),
            ));
        }

        // 共有されているスケジュールを取得（is_public = 1 のみ）
        let row: Option<PublicScheduleRow> = sqlx::query_as::<_, PublicScheduleRow>(
            r#"
            SELECT
              id,
              public_id,
              title,
              "group",
              date,
              open,
              start,
              "end",
              notes,
              category,
              area,
              venue,
              target,
              lineup,
              seller,
              ticket_fee,
              drink_fee,
              total_fare,
              stay_fee,
              travel_cost,
              total_cost,
              status,
              related_schedule_ids,
              CAST(is_public AS INTEGER) as is_public
            FROM schedules
            WHERE public_id = ? AND user_id = ? AND CAST(is_public AS INTEGER) = 1
            "#
        )
        .bind(public_id)
        .bind(user_id)
        .fetch_optional(&pool)
        .await
        .map_err(|e| {
            eprintln!("[GetSharedSchedule] Failed to fetch schedule: {}", e);
            (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(ErrorResponse {
                    error: "Database error".to_string(),
                }),
            )
        })?;

        if let Some(schedule_row) = row {
            Ok(Json(row_to_public_schedule(&pool, schedule_row).await))
        } else {
            Err((
                StatusCode::NOT_FOUND,
                Json(ErrorResponse {
                    error: "スケジュールが見つかりません".to_string(),
                }),
            ))
        }
    } else {
        Err((
            StatusCode::NOT_FOUND,
            Json(ErrorResponse {
                error: "ユーザーが見つかりません".to_string(),
            }),
        ))
    }
}

// GET /schedules?year=2025 など
async fn list_schedules(
    Query(params): Query<ScheduleQuery>,
    Extension(pool): Extension<Pool<Sqlite>>,
    user: AuthenticatedUser,
) -> Result<Json<Vec<Schedule>>, (StatusCode, Json<ErrorResponse>)> {
    eprintln!("[ListSchedules] User ID: {}", user.user_id);
    let rows: Vec<ScheduleRow> = sqlx::query_as::<_, ScheduleRow>(
        r#"
        SELECT
          id,
          title,
          "group",
          date,
          open,
          start,
          "end",
          notes,
          category,
          area,
          venue,
          target,
          lineup,
          seller,
          ticket_fee,
          drink_fee,
          total_fare,
          stay_fee,
          travel_cost,
          total_cost,
          status,
          related_schedule_ids,
          user_id,
          CAST(is_public AS INTEGER) as is_public,
          created_at,
          updated_at
        FROM schedules
        WHERE user_id = ?
        "#,
    )
    .bind(user.user_id)
    .fetch_all(&pool)
    .await
    .map_err(|e| {
        eprintln!("[ListSchedules] Database error: {}", e);
        (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(ErrorResponse {
                error: format!("データベースエラーが発生しました: {}", e),
            }),
        )
    })?;

    // 各スケジュールに対してロールアップ計算を実行
    for row in &rows {
        calculate_rollup(&pool, row.id).await.ok();
    }
    
    // 計算後のスケジュールを再取得
    let rows: Vec<ScheduleRow> = sqlx::query_as::<_, ScheduleRow>(
        r#"
        SELECT
          id,
          title,
          "group",
          date,
          open,
          start,
          "end",
          notes,
          category,
          area,
          venue,
          target,
          lineup,
          seller,
          ticket_fee,
          drink_fee,
          total_fare,
          stay_fee,
          travel_cost,
          total_cost,
          status,
          related_schedule_ids,
          user_id,
          CAST(is_public AS INTEGER) as is_public,
          created_at,
          updated_at
        FROM schedules
        WHERE user_id = ?
        "#,
    )
    .bind(user.user_id)
    .fetch_all(&pool)
    .await
    .map_err(|e| {
        eprintln!("[ListSchedules] Database error on second fetch: {}", e);
        (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(ErrorResponse {
                error: format!("データベースエラーが発生しました: {}", e),
            }),
        )
    })?;

    let mut schedules: Vec<Schedule> = rows.into_iter().map(row_to_schedule).collect();

    if let Some(year) = params.year {
        schedules = schedules
            .into_iter()
            .filter(|s| s.datetime.year() == year)
            .collect();
    }

    if params.include_canceled != Some(true) {
        schedules = schedules
            .into_iter()
            .filter(|s| s.status != "Canceled")
            .collect();
    }

    let (plan, trial_started_at) = fetch_user_plan(&pool, user.user_id).await.map_err(|e| {
        eprintln!("[ListSchedules] Failed to fetch plan: {}", e);
        (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(ErrorResponse {
                error: "Database error".to_string(),
            }),
        )
    })?;
    if !has_paid_access(&plan, trial_started_at.as_deref()) {
        // 無料プランは過去アーカイブを直近2年分（今年+去年）のみ閲覧可能。未来の予定は制限しない
        let earliest_visible_year = free_plan_earliest_archive_year(Utc::now());
        schedules = schedules
            .into_iter()
            .filter(|s| s.datetime.year() >= earliest_visible_year)
            .collect();
    }

    eprintln!("[ListSchedules] Returning {} schedules for user_id: {}", schedules.len(), user.user_id);
    Ok(Json(schedules))
}

// GET /schedules/upcoming
async fn list_upcoming(
    Extension(pool): Extension<Pool<Sqlite>>,
    user: AuthenticatedUser,
) -> Json<Vec<Schedule>> {
    let rows: Vec<ScheduleRow> = sqlx::query_as::<_, ScheduleRow>(
        r#"
        SELECT
          id,
          title,
          "group",
          date,
          open,
          start,
          "end",
          notes,
          category,
          area,
          venue,
          target,
          lineup,
          seller,
          ticket_fee,
          drink_fee,
          total_fare,
          stay_fee,
          travel_cost,
          total_cost,
          status,
          related_schedule_ids,
          user_id,
          CAST(is_public AS INTEGER) as is_public,
          created_at,
          updated_at
        FROM schedules
        WHERE status != 'Canceled' AND user_id = ?
        "#,
    )
    .bind(user.user_id)
    .fetch_all(&pool)
    .await
    .expect("failed to fetch schedules");

    // 各スケジュールに対してロールアップ計算を実行
    for row in &rows {
        calculate_rollup(&pool, row.id).await.ok();
    }
    
    // 計算後のスケジュールを再取得
    let rows: Vec<ScheduleRow> = sqlx::query_as::<_, ScheduleRow>(
        r#"
        SELECT
          id,
          title,
          "group",
          date,
          open,
          start,
          "end",
          notes,
          category,
          area,
          venue,
          target,
          lineup,
          seller,
          ticket_fee,
          drink_fee,
          total_fare,
          stay_fee,
          travel_cost,
          total_cost,
          status,
          related_schedule_ids,
          user_id,
          CAST(is_public AS INTEGER) as is_public,
          created_at,
          updated_at
        FROM schedules
        WHERE status != 'Canceled' AND user_id = ?
        "#,
    )
    .bind(user.user_id)
    .fetch_all(&pool)
    .await
    .expect("failed to fetch schedules");

    let mut schedules: Vec<Schedule> = rows.into_iter().map(row_to_schedule).collect();

    let now = Utc::now();
    schedules = schedules
        .into_iter()
        .filter(|s| s.datetime > now)
        .collect();

    // 日付順にソートして直近3件に制限
    schedules.sort_by(|a, b| a.datetime.cmp(&b.datetime));
    schedules.truncate(3);

    Json(schedules)
}

// ロールアップ計算関数
async fn calculate_rollup(
    pool: &Pool<Sqlite>,
    schedule_id: i64,
) -> Result<(), sqlx::Error> {
    // total_fare: 関連するtrafficsのfareの合計
    let total_fare: Option<i32> = sqlx::query_scalar(
        "SELECT COALESCE(SUM(fare), 0) FROM traffics WHERE schedule_id = ?"
    )
    .bind(schedule_id)
    .fetch_optional(pool)
    .await?
    .map(|sum: i64| sum as i32);
    
    // stay_fee: 関連するstaysのfeeの合計
    let stay_fee: Option<i32> = sqlx::query_scalar(
        "SELECT COALESCE(SUM(fee), 0) FROM stays WHERE schedule_id = ?"
    )
    .bind(schedule_id)
    .fetch_optional(pool)
    .await?
    .map(|sum: i64| sum as i32);
    
    // スケジュールのticket_feeとdrink_feeを取得
    let schedule_row: Option<(Option<i32>, Option<i32>)> = sqlx::query_as(
        "SELECT ticket_fee, drink_fee FROM schedules WHERE id = ?"
    )
    .bind(schedule_id)
    .fetch_optional(pool)
    .await?;
    
    let (ticket_fee, drink_fee) = schedule_row.unwrap_or((None, None));
    
    // travel_cost: total_fare + stay_fee
    let travel_cost = total_fare
        .unwrap_or(0)
        .saturating_add(stay_fee.unwrap_or(0));
    
    // total_cost: ticket_fee + drink_fee + travel_cost
    let total_cost = ticket_fee.unwrap_or(0)
        .saturating_add(drink_fee.unwrap_or(0))
        .saturating_add(travel_cost);
    
    // スケジュールを更新
    let now = Utc::now().to_rfc3339();
    sqlx::query(
        r#"
        UPDATE schedules SET
          total_fare = ?,
          stay_fee = ?,
          travel_cost = ?,
          total_cost = ?,
          updated_at = ?
        WHERE id = ?
        "#
    )
    .bind(total_fare)
    .bind(stay_fee)
    .bind(Some(travel_cost))
    .bind(Some(total_cost))
    .bind(&now)
    .bind(schedule_id)
    .execute(pool)
    .await?;
    
    Ok(())
}

// POST /schedules
async fn create_schedule(
    user: AuthenticatedUser,
    Extension(pool): Extension<Pool<Sqlite>>,
    Json(payload): Json<NewSchedule>,
) -> Result<(StatusCode, Json<Schedule>), (StatusCode, Json<ErrorResponse>)> {
    // 必須項目のバリデーション（targetはNULL許可）
    let now = Utc::now().to_rfc3339();
    let is_public = payload.is_public.unwrap_or(true) as i32;
    eprintln!("[CreateSchedule] is_public value: {} (from payload: {:?})", is_public, payload.is_public);
    let result = sqlx::query(
        r#"
        INSERT INTO schedules (
          user_id,
          title,
          "group",
          date,
          open,
          start,
          "end",
          notes,
          category,
          area,
          venue,
          target,
          lineup,
          seller,
          ticket_fee,
          drink_fee,
          total_fare,
          stay_fee,
          travel_cost,
          total_cost,
          status,
          related_schedule_ids,
          is_public,
          public_id,
          created_at,
          updated_at
        ) VALUES (
          ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, NULL, NULL, NULL, ?, ?, ?, ?, ?, ?
        )
        "#,
    )
    .bind(user.user_id)
    .bind(&payload.title)
    .bind(&payload.group.as_ref().and_then(|g| {
        let trimmed = g.trim();
        if trimmed.is_empty() { None } else { Some(trimmed.to_string()) }
    }))
    .bind(&payload.date)
    .bind(&payload.open)
    .bind(&payload.start)
    .bind(&payload.end)
    .bind(&payload.notes)
    .bind(&payload.category)
    .bind(&payload.area)
    .bind(&payload.venue)
    .bind(&payload.target)
    .bind(&payload.lineup)
    .bind(&payload.seller)
    .bind(payload.ticket_fee)
    .bind(payload.drink_fee)
    .bind(payload.status.as_deref().unwrap_or("Pending"))
    .bind(&payload.related_schedule_ids.as_ref().and_then(|ids| {
        if ids.is_empty() {
            None
        } else {
            serde_json::to_string(ids).ok()
        }
    }))
    .bind(is_public)
    .bind(generate_public_id())
    .bind(&now)
    .bind(&now)
    .execute(&pool)
    .await
    .map_err(|_| {
        (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(ErrorResponse {
                error: "データベースエラーが発生しました".to_string(),
            }),
        )
    })?;

    let last_id = result.last_insert_rowid();

    // ロールアップ計算を実行
    calculate_rollup(&pool, last_id).await.ok();
    
    // 計算後のスケジュールを再取得
    let row: ScheduleRow = sqlx::query_as::<_, ScheduleRow>(
        r#"
        SELECT
          id,
          title,
          "group",
          date,
          open,
          start,
          "end",
          notes,
          category,
          area,
          venue,
          target,
          lineup,
          seller,
          ticket_fee,
          drink_fee,
          total_fare,
          stay_fee,
          travel_cost,
          total_cost,
          status,
          related_schedule_ids,
          user_id,
          CAST(is_public AS INTEGER) as is_public,
          created_at,
          updated_at
        FROM schedules
        WHERE id = ?
        "#,
    )
    .bind(last_id)
    .fetch_one(&pool)
    .await
    .map_err(|_| {
        (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(ErrorResponse {
                error: "データベースエラーが発生しました".to_string(),
            }),
        )
    })?;

    let schedule = row_to_schedule(row);
    
    // 双方向リレーションを更新
    // 新規作成時は、related_schedule_idsに含まれるスケジュールに対して、このスケジュールを追加
    if let Some(related_ids) = &payload.related_schedule_ids {
        for related_id in related_ids {
            // 関連スケジュールを取得
            let related_row: Option<ScheduleRow> = sqlx::query_as::<_, ScheduleRow>(
                r#"
                SELECT
                  id,
                  title,
                  "group",
                  date,
                  open,
                  start,
                  "end",
                  notes,
                  category,
                  area,
                  venue,
                  target,
                  lineup,
                  seller,
                  ticket_fee,
                  drink_fee,
                  total_fare,
                  stay_fee,
                  travel_cost,
                  total_cost,
                  status,
                  related_schedule_ids,
                  user_id,
                  CAST(is_public AS INTEGER) as is_public,
                  created_at,
                  updated_at
                FROM schedules
                WHERE id = ?
                "#,
            )
            .bind(related_id)
            .fetch_optional(&pool)
            .await
            .ok()
            .flatten();
            
            if let Some(related) = related_row {
                // 既存のrelated_schedule_idsを取得
                let mut related_ids_vec: Vec<i32> = related.related_schedule_ids
                    .as_ref()
                    .and_then(|json| serde_json::from_str::<Vec<i32>>(json).ok())
                    .unwrap_or_default();
                
                // このスケジュールIDが含まれていない場合のみ追加
                if !related_ids_vec.contains(&(last_id as i32)) {
                    related_ids_vec.push(last_id as i32);
                    let updated_json = serde_json::to_string(&related_ids_vec).ok();
                    
                    // 関連スケジュールを更新
                    let _ = sqlx::query(
                        r#"
                        UPDATE schedules SET
                          related_schedule_ids = ?,
                          updated_at = ?
                        WHERE id = ?
                        "#,
                    )
                    .bind(&updated_json)
                    .bind(&now)
                    .bind(related_id)
                    .execute(&pool)
                    .await;
                }
            }
        }
    }
    
    Ok((StatusCode::CREATED, Json(schedule)))
}

// PUT /schedules/:id
async fn update_schedule(
    Path(id): Path<i32>,
    user: AuthenticatedUser,
    Extension(pool): Extension<Pool<Sqlite>>,
    Json(payload): Json<NewSchedule>,
) -> Result<Json<Schedule>, (StatusCode, Json<ErrorResponse>)> {
    // 必須項目のバリデーション（targetはNULL許可）
    
    // スケジュールが存在し、ユーザーが所有しているかチェック
    let existing: Option<ScheduleRow> = sqlx::query_as::<_, ScheduleRow>(
        r#"
        SELECT
          id,
          title,
          "group",
          date,
          open,
          start,
          "end",
          notes,
          category,
          area,
          venue,
          target,
          lineup,
          seller,
          ticket_fee,
          drink_fee,
          total_fare,
          stay_fee,
          travel_cost,
          total_cost,
          status,
          related_schedule_ids,
          user_id,
          CAST(is_public AS INTEGER) as is_public,
          created_at,
          updated_at
        FROM schedules
        WHERE id = ?
        "#,
    )
    .bind(id)
    .fetch_optional(&pool)
    .await
    .map_err(|e| {
        eprintln!("[UpdateSchedule] Database error when fetching existing schedule: {}", e);
        (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(ErrorResponse {
                error: format!("データベースエラーが発生しました: {}", e),
            }),
        )
    })?;

    let existing = existing.ok_or((
        StatusCode::NOT_FOUND,
        Json(ErrorResponse {
            error: "スケジュールが見つかりませんでした".to_string(),
        }),
    ))?;
    if existing.user_id.map(|uid| uid as i32) != Some(user.user_id) {
        return Err((
            StatusCode::FORBIDDEN,
            Json(ErrorResponse {
                error: "このスケジュールを編集する権限がありません".to_string(),
            }),
        ));
    }

    let now = Utc::now().to_rfc3339();
    let existing_is_public = existing.is_public != 0;
    let is_public = payload.is_public.unwrap_or(existing_is_public) as i32;
    
    // 既存のrelated_schedule_idsを取得
    let existing_related_ids: Vec<i32> = existing.related_schedule_ids
        .as_ref()
        .and_then(|json| serde_json::from_str::<Vec<i32>>(json).ok())
        .unwrap_or_default();
    
    // 新しいrelated_schedule_ids
    let new_related_ids = payload.related_schedule_ids.as_ref()
        .map(|ids| ids.clone())
        .unwrap_or_default();
    
    // 追加されたIDと削除されたIDを特定
    let added_ids: Vec<i32> = new_related_ids.iter()
        .filter(|id| !existing_related_ids.contains(id))
        .cloned()
        .collect();
    let removed_ids: Vec<i32> = existing_related_ids.iter()
        .filter(|id| !new_related_ids.contains(id))
        .cloned()
        .collect();
    
    let result = sqlx::query(
        r#"
        UPDATE schedules SET
          title = ?,
          "group" = ?,
          date = ?,
          open = ?,
          start = ?,
          "end" = ?,
          notes = ?,
          category = ?,
          area = ?,
          venue = ?,
          target = ?,
          lineup = ?,
          seller = ?,
          ticket_fee = ?,
          drink_fee = ?,
          status = ?,
          related_schedule_ids = ?,
          is_public = ?,
          updated_at = ?
        WHERE id = ? AND user_id = ?
        "#,
    )
    .bind(&payload.title)
    .bind(&payload.group.as_ref().and_then(|g| {
        let trimmed = g.trim();
        if trimmed.is_empty() { None } else { Some(trimmed.to_string()) }
    }))
    .bind(&payload.date)
    .bind(&payload.open)
    .bind(&payload.start)
    .bind(&payload.end)
    .bind(&payload.notes)
    .bind(&payload.category)
    .bind(&payload.area)
    .bind(&payload.venue)
    .bind(&payload.target)
    .bind(&payload.lineup)
    .bind(&payload.seller)
    .bind(payload.ticket_fee)
    .bind(payload.drink_fee)
    .bind(payload.status.as_deref().unwrap_or("Pending"))
    .bind(&payload.related_schedule_ids.as_ref().and_then(|ids| {
        if ids.is_empty() {
            None
        } else {
            serde_json::to_string(ids).ok()
        }
    }))
    .bind(is_public)
    .bind(&now)
    .bind(id)
    .bind(user.user_id)
    .execute(&pool)
    .await
    .map_err(|e| {
        eprintln!("[UpdateSchedule] Database error when updating schedule: {}", e);
        (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(ErrorResponse {
                error: format!("データベースエラーが発生しました: {}", e),
            }),
        )
    })?;

    if result.rows_affected() == 0 {
        return Err((
            StatusCode::NOT_FOUND,
            Json(ErrorResponse {
                error: "スケジュールが見つかりませんでした".to_string(),
            }),
        ));
    }

    // ロールアップ計算を実行
    calculate_rollup(&pool, id as i64).await.ok();
    
    // 計算後のスケジュールを再取得
    let row: ScheduleRow = sqlx::query_as::<_, ScheduleRow>(
        r#"
        SELECT
          id,
          title,
          "group",
          date,
          open,
          start,
          "end",
          notes,
          category,
          area,
          venue,
          target,
          lineup,
          seller,
          ticket_fee,
          drink_fee,
          total_fare,
          stay_fee,
          travel_cost,
          total_cost,
          status,
          related_schedule_ids,
          user_id,
          CAST(is_public AS INTEGER) as is_public,
          created_at,
          updated_at
        FROM schedules
        WHERE id = ?
        "#,
    )
    .bind(id)
    .fetch_one(&pool)
    .await
    .map_err(|_| {
        (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(ErrorResponse {
                error: "データベースエラーが発生しました".to_string(),
            }),
        )
    })?;

    let schedule = row_to_schedule(row);
    
    // 双方向リレーションを更新
    // 追加されたIDに対して、このスケジュールを追加
    for related_id in &added_ids {
        let related_row: Option<ScheduleRow> = sqlx::query_as::<_, ScheduleRow>(
            r#"
            SELECT
              id,
              title,
              "group",
              date,
              open,
              start,
              "end",
              notes,
              category,
              area,
              venue,
              target,
              lineup,
              seller,
              ticket_fee,
              drink_fee,
              total_fare,
              stay_fee,
              travel_cost,
              total_cost,
              status,
              related_schedule_ids,
              user_id,
              CAST(is_public AS INTEGER) as is_public,
              created_at,
              updated_at
            FROM schedules
            WHERE id = ?
            "#,
        )
        .bind(related_id)
        .fetch_optional(&pool)
        .await
        .ok()
        .flatten();
        
        if let Some(related) = related_row {
            let mut related_ids_vec: Vec<i32> = related.related_schedule_ids
                .as_ref()
                .and_then(|json| serde_json::from_str::<Vec<i32>>(json).ok())
                .unwrap_or_default();
            
            if !related_ids_vec.contains(&id) {
                related_ids_vec.push(id);
                let updated_json = serde_json::to_string(&related_ids_vec).ok();
                
                let _ = sqlx::query(
                    r#"
                    UPDATE schedules SET
                      related_schedule_ids = ?,
                      updated_at = ?
                    WHERE id = ?
                    "#,
                )
                .bind(&updated_json)
                .bind(&now)
                .bind(related_id)
                .execute(&pool)
                .await;
            }
        }
    }
    
    // 削除されたIDに対して、このスケジュールを削除
    for related_id in &removed_ids {
        let related_row: Option<ScheduleRow> = sqlx::query_as::<_, ScheduleRow>(
            r#"
            SELECT
              id,
              title,
              "group",
              date,
              open,
              start,
              "end",
              notes,
              category,
              area,
              venue,
              target,
              lineup,
              seller,
              ticket_fee,
              drink_fee,
              total_fare,
              stay_fee,
              travel_cost,
              total_cost,
              status,
              related_schedule_ids,
              user_id,
              is_public,
              created_at,
              updated_at
            FROM schedules
            WHERE id = ?
            "#,
        )
        .bind(related_id)
        .fetch_optional(&pool)
        .await
        .ok()
        .flatten();
        
        if let Some(related) = related_row {
            let mut related_ids_vec: Vec<i32> = related.related_schedule_ids
                .as_ref()
                .and_then(|json| serde_json::from_str::<Vec<i32>>(json).ok())
                .unwrap_or_default();
            
            related_ids_vec.retain(|&x| x != id);
            let updated_json = if related_ids_vec.is_empty() {
                None
            } else {
                serde_json::to_string(&related_ids_vec).ok()
            };
            
            let _ = sqlx::query(
                r#"
                UPDATE schedules SET
                  related_schedule_ids = ?,
                  updated_at = ?
                WHERE id = ?
                "#,
            )
            .bind(&updated_json)
            .bind(&now)
            .bind(related_id)
            .execute(&pool)
            .await;
        }
    }
    
    Ok(Json(schedule))
}

// DELETE /schedules/:id
async fn delete_schedule(
    Path(id): Path<i32>,
    user: AuthenticatedUser,
    Extension(pool): Extension<Pool<Sqlite>>,
) -> Result<Json<serde_json::Value>, (StatusCode, Json<ErrorResponse>)> {
    // スケジュールが存在し、ユーザーが所有しているかチェック
    let existing: Option<ScheduleRow> = sqlx::query_as::<_, ScheduleRow>(
        r#"
        SELECT
          id,
          title,
          "group",
          date,
          open,
          start,
          "end",
          notes,
          category,
          area,
          venue,
          target,
          lineup,
          seller,
          ticket_fee,
          drink_fee,
          total_fare,
          stay_fee,
          travel_cost,
          total_cost,
          status,
          related_schedule_ids,
          user_id,
          is_public,
          created_at,
          updated_at
        FROM schedules
        WHERE id = ?
        "#,
    )
    .bind(id)
    .fetch_optional(&pool)
    .await
    .map_err(|_| {
        (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(ErrorResponse {
                error: "データベースエラーが発生しました".to_string(),
            }),
        )
    })?;

    let existing = existing.ok_or((
        StatusCode::NOT_FOUND,
        Json(ErrorResponse {
            error: "スケジュールが見つかりませんでした".to_string(),
        }),
    ))?;
    
    if existing.user_id.map(|uid| uid as i32) != Some(user.user_id) {
        return Err((
            StatusCode::FORBIDDEN,
            Json(ErrorResponse {
                error: "このスケジュールを削除する権限がありません".to_string(),
            }),
        ));
    }

    let mut transaction = pool.begin().await.map_err(|_| {
        (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(ErrorResponse {
                error: "データベースエラーが発生しました".to_string(),
            }),
        )
    })?;

    // 関連スケジュールからこのスケジュールへの参照を削除
    let related_ids: Vec<i32> = existing.related_schedule_ids
        .as_ref()
        .and_then(|json| serde_json::from_str::<Vec<i32>>(json).ok())
        .unwrap_or_default();
    
    let now = Utc::now().to_rfc3339();
    for related_id in related_ids {
        let related_row: Option<ScheduleRow> = sqlx::query_as::<_, ScheduleRow>(
            r#"
            SELECT
              id,
              title,
              "group",
              date,
              open,
              start,
              "end",
              notes,
              category,
              area,
              venue,
              target,
              lineup,
              seller,
              ticket_fee,
              drink_fee,
              total_fare,
              stay_fee,
              travel_cost,
              total_cost,
              status,
              related_schedule_ids,
              user_id,
              is_public,
              created_at,
              updated_at
            FROM schedules
            WHERE id = ?
            "#,
        )
        .bind(related_id)
        .fetch_optional(&pool)
        .await
        .ok()
        .flatten();
        
        if let Some(related) = related_row {
            let mut related_ids_vec: Vec<i32> = related.related_schedule_ids
                .as_ref()
                .and_then(|json| serde_json::from_str::<Vec<i32>>(json).ok())
                .unwrap_or_default();
            
            related_ids_vec.retain(|&x| x != id);
            let updated_json = if related_ids_vec.is_empty() {
                None
            } else {
                serde_json::to_string(&related_ids_vec).ok()
            };
            
            let _ = sqlx::query(
                r#"
                UPDATE schedules SET
                  related_schedule_ids = ?,
                  updated_at = ?
                WHERE id = ?
                "#,
            )
            .bind(&updated_json)
            .bind(&now)
            .bind(related_id)
            .execute(&mut *transaction)
            .await
            .map_err(|_| (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(ErrorResponse { error: "関連スケジュールの更新に失敗しました".to_string() }),
            ))?;
        }
    }

    // 宿泊情報を参照する通知を先に削除
    sqlx::query("DELETE FROM notifications WHERE schedule_id = ?")
        .bind(id)
        .execute(&mut *transaction)
        .await
        .map_err(|_| (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(ErrorResponse { error: "関連通知の削除に失敗しました".to_string() }),
        ))?;

    // 関連する交通・宿泊情報を同じトランザクションで削除
    sqlx::query("DELETE FROM traffics WHERE schedule_id = ?")
        .bind(id)
        .execute(&mut *transaction)
        .await
        .map_err(|_| (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(ErrorResponse { error: "関連する交通情報の削除に失敗しました".to_string() }),
        ))?;

    sqlx::query("DELETE FROM stays WHERE schedule_id = ?")
        .bind(id)
        .execute(&mut *transaction)
        .await
        .map_err(|_| (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(ErrorResponse { error: "関連する宿泊情報の削除に失敗しました".to_string() }),
        ))?;

    // スケジュールを削除
    let result = sqlx::query("DELETE FROM schedules WHERE id = ? AND user_id = ?")
        .bind(id)
        .bind(user.user_id)
        .execute(&mut *transaction)
        .await
        .map_err(|_| {
            (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(ErrorResponse {
                    error: "データベースエラーが発生しました".to_string(),
                }),
            )
        })?;

    if result.rows_affected() == 0 {
        return Err((
            StatusCode::NOT_FOUND,
            Json(ErrorResponse {
                error: "スケジュールが見つかりませんでした".to_string(),
            }),
        ));
    }

    transaction.commit().await.map_err(|_| (
        StatusCode::INTERNAL_SERVER_ERROR,
        Json(ErrorResponse { error: "削除処理の確定に失敗しました".to_string() }),
    ))?;

    Ok(Json(serde_json::json!({
        "success": true,
        "message": "スケジュールを削除しました"
    })))
}

// GET /public/schedules - 公開されているスケジュール一覧
// DISABLE_AUTHが設定されている場合、DEFAULT_USER_IDのスケジュールも返す
async fn list_public_schedules(
    Query(params): Query<ScheduleQuery>,
    Extension(pool): Extension<Pool<Sqlite>>,
) -> Json<Vec<PublicSchedule>> {
    // DISABLE_AUTHが設定されている場合、全てのスケジュールを取得（ユーザーIDによるフィルタリングなし）
    let rows: Vec<PublicScheduleRow> = if std::env::var("DISABLE_AUTH").is_ok() {
        // 認証が無効化されている場合、全てのスケジュールを返す
        println!("[PUBLIC SCHEDULES] DISABLE_AUTH is set, returning ALL schedules (ignoring user_id and is_public)");
        let rows = sqlx::query_as::<_, PublicScheduleRow>(
            r#"
            SELECT
              id,
              public_id,
              title,
              "group",
              date,
              open,
              start,
              "end",
              notes,
              category,
              area,
              venue,
              target,
              lineup,
              seller,
              ticket_fee,
              drink_fee,
              total_fare,
              stay_fee,
              travel_cost,
              total_cost,
              status,
              related_schedule_ids,
              CAST(is_public AS INTEGER) as is_public
            FROM schedules
            "#,
        )
        .fetch_all(&pool)
        .await
        .expect("failed to fetch all schedules");

        println!("[PUBLIC SCHEDULES] Found {} schedules in database", rows.len());
        if rows.is_empty() {
            println!("[PUBLIC SCHEDULES] WARNING: No schedules found in database. The database might be empty.");
        } else {
            println!("[PUBLIC SCHEDULES] First schedule: id={}, title={}",
                rows[0].id,
                rows[0].title
            );
        }

        rows
    } else {
        // 通常の動作：公開スケジュールのみ
        sqlx::query_as::<_, PublicScheduleRow>(
            r#"
            SELECT
              id,
              public_id,
              title,
              "group",
              date,
              open,
              start,
              "end",
              notes,
              category,
              area,
              venue,
              target,
              lineup,
              seller,
              ticket_fee,
              drink_fee,
              total_fare,
              stay_fee,
              travel_cost,
              total_cost,
              status,
              related_schedule_ids,
              CAST(is_public AS INTEGER) as is_public
            FROM schedules
            WHERE CAST(is_public AS INTEGER) = 1
            "#,
        )
        .fetch_all(&pool)
        .await
        .expect("failed to fetch public schedules")
    };

    let mut schedules = Vec::with_capacity(rows.len());
    for row in rows {
        schedules.push(row_to_public_schedule(&pool, row).await);
    }

    if let Some(year) = params.year {
        schedules = schedules
            .into_iter()
            .filter(|s| s.datetime.year() == year)
            .collect();
    }

    if params.include_canceled != Some(true) {
        schedules = schedules
            .into_iter()
            .filter(|s| s.status != "Canceled")
            .collect();
    }

    Json(schedules)
}

// GET /public/schedules/:id - 公開されているスケジュール詳細
// DISABLE_AUTHが設定されている場合、全てのスケジュールを返す
async fn get_public_schedule(
    Path(public_id): Path<String>,
    Extension(pool): Extension<Pool<Sqlite>>,
) -> Result<Json<PublicSchedule>, StatusCode> {
    // DISABLE_AUTHが設定されている場合、is_publicの条件を無視
    let row: PublicScheduleRow = if std::env::var("DISABLE_AUTH").is_ok() {
        sqlx::query_as::<_, PublicScheduleRow>(
            r#"
            SELECT
              id,
              public_id,
              title,
              "group",
              date,
              open,
              start,
              "end",
              notes,
              category,
              area,
              venue,
              target,
              lineup,
              seller,
              ticket_fee,
              drink_fee,
              total_fare,
              stay_fee,
              travel_cost,
              total_cost,
              status,
              related_schedule_ids,
              is_public
            FROM schedules
            WHERE public_id = ?
            "#,
        )
        .bind(&public_id)
        .fetch_one(&pool)
        .await
        .map_err(|_| StatusCode::NOT_FOUND)?
    } else {
        sqlx::query_as::<_, PublicScheduleRow>(
            r#"
            SELECT
              id,
              public_id,
              title,
              "group",
              date,
              open,
              start,
              "end",
              notes,
              category,
              area,
              venue,
              target,
              lineup,
              seller,
              ticket_fee,
              drink_fee,
              total_fare,
              stay_fee,
              travel_cost,
              total_cost,
              status,
              related_schedule_ids,
              CAST(is_public AS INTEGER) as is_public
            FROM schedules
            WHERE public_id = ? AND CAST(is_public AS INTEGER) = 1
            "#,
        )
        .bind(&public_id)
        .fetch_one(&pool)
        .await
        .map_err(|_| StatusCode::NOT_FOUND)?
    };

    let schedule = row_to_public_schedule(&pool, row).await;
    Ok(Json(schedule))
}

// GET /public/traffic?schedule_id=... - 公開スケジュールの交通情報
// DISABLE_AUTHが設定されている場合、全てのスケジュールの交通情報を返す
async fn list_public_traffics(
    Query(params): Query<PublicTrafficQuery>,
    Extension(pool): Extension<Pool<Sqlite>>,
) -> Json<Vec<PublicTraffic>> {
    // DISABLE_AUTHが設定されている場合、is_publicの条件を無視
    let schedule_exists: Option<i64> = if std::env::var("DISABLE_AUTH").is_ok() {
        sqlx::query_scalar("SELECT id FROM schedules WHERE public_id = ?")
            .bind(&params.schedule_id)
            .fetch_optional(&pool)
            .await
            .expect("failed to check schedule")
    } else {
        sqlx::query_scalar("SELECT id FROM schedules WHERE public_id = ? AND CAST(is_public AS INTEGER) = 1")
            .bind(&params.schedule_id)
            .fetch_optional(&pool)
            .await
            .expect("failed to check schedule")
    };

    let Some(schedule_internal_id) = schedule_exists else {
        return Json(vec![]);
    };

    let rows: Vec<PublicTrafficRow> = sqlx::query_as::<_, PublicTrafficRow>(
        r#"
        SELECT
          public_id,
          date,
          "order",
          transportation,
          from_place,
          to_place,
          notes,
          fare,
          miles,
          return_flag,
          total_fare,
          total_miles
        FROM traffics
        WHERE schedule_id = ?
        ORDER BY date ASC, "order" ASC
        "#,
    )
    .bind(schedule_internal_id)
    .fetch_all(&pool)
    .await
    .expect("failed to fetch traffics");

    let mut traffics: Vec<PublicTraffic> = rows
        .into_iter()
        .map(|row| row_to_public_traffic(row, &params.schedule_id))
        .collect();

    // スケジュールのユーザーIDを取得してマスク処理を適用
    let user_id: Option<i64> = sqlx::query_scalar("SELECT user_id FROM schedules WHERE id = ?")
        .bind(schedule_internal_id)
        .fetch_optional(&pool)
        .await
        .ok()
        .flatten();

    if let Some(uid) = user_id {
        if let Ok(masked_locations) = get_masked_locations_for_user(&pool, uid).await {
            traffics = traffics.into_iter()
                .map(|t| apply_mask_to_public_traffic(t, &masked_locations))
                .collect();
        }
    }

    Json(traffics)
}

// GET /public/stay?schedule_id=... - 公開スケジュールの宿泊情報
// DISABLE_AUTHが設定されている場合、全てのスケジュールの宿泊情報を返す
async fn list_public_stays(
    Query(params): Query<PublicStayQuery>,
    Extension(pool): Extension<Pool<Sqlite>>,
) -> Json<Vec<PublicStay>> {
    // DISABLE_AUTHが設定されている場合、is_publicの条件を無視
    let schedule_exists: Option<i64> = if std::env::var("DISABLE_AUTH").is_ok() {
        sqlx::query_scalar("SELECT id FROM schedules WHERE public_id = ?")
            .bind(&params.schedule_id)
            .fetch_optional(&pool)
            .await
            .expect("failed to check schedule")
    } else {
        sqlx::query_scalar("SELECT id FROM schedules WHERE public_id = ? AND CAST(is_public AS INTEGER) = 1")
            .bind(&params.schedule_id)
            .fetch_optional(&pool)
            .await
            .expect("failed to check schedule")
    };

    let Some(schedule_internal_id) = schedule_exists else {
        return Json(vec![]);
    };

    let rows: Vec<PublicStayRow> = sqlx::query_as::<_, PublicStayRow>(
        r#"
        SELECT
          public_id,
          check_in,
          check_out,
          hotel_name,
          website,
          fee,
          breakfast_flag,
          deadline,
          penalty,
          status
        FROM stays
        WHERE schedule_id = ?
        "#,
    )
    .bind(schedule_internal_id)
    .fetch_all(&pool)
    .await
    .expect("failed to fetch stays");

    let stays = rows
        .into_iter()
        .map(|row| row_to_public_stay(row, &params.schedule_id))
        .collect();
    Json(stays)
}

// GET /public/traffic/:id - 公開スケジュールの交通情報（個別）
async fn get_public_traffic(
    Path(public_id): Path<String>,
    Extension(pool): Extension<Pool<Sqlite>>,
) -> Result<Json<PublicTraffic>, StatusCode> {
    let schedule_internal_id: Option<i64> = sqlx::query_scalar(
        "SELECT schedule_id FROM traffics WHERE public_id = ?",
    )
    .bind(&public_id)
    .fetch_optional(&pool)
    .await
    .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    let schedule_internal_id = schedule_internal_id.ok_or(StatusCode::NOT_FOUND)?;

    let row: Option<PublicTrafficRow> = sqlx::query_as::<_, PublicTrafficRow>(
        r#"
        SELECT
          public_id,
          date,
          "order",
          transportation,
          from_place,
          to_place,
          notes,
          fare,
          miles,
          return_flag,
          total_fare,
          total_miles
        FROM traffics
        WHERE public_id = ?
        "#,
    )
    .bind(&public_id)
    .fetch_optional(&pool)
    .await
    .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    let row = row.ok_or(StatusCode::NOT_FOUND)?;

    // 関連するスケジュールが公開されているか確認
    let schedule: Option<(i64, Option<String>)> = if std::env::var("DISABLE_AUTH").is_ok() {
        sqlx::query_as("SELECT id, public_id FROM schedules WHERE id = ?")
            .bind(schedule_internal_id)
            .fetch_optional(&pool)
            .await
            .expect("failed to check schedule")
    } else {
        sqlx::query_as("SELECT id, public_id FROM schedules WHERE id = ? AND CAST(is_public AS INTEGER) = 1")
            .bind(schedule_internal_id)
            .fetch_optional(&pool)
            .await
            .expect("failed to check schedule")
    };

    let Some((_, Some(schedule_public_id))) = schedule else {
        return Err(StatusCode::NOT_FOUND);
    };

    let mut traffic = row_to_public_traffic(row, &schedule_public_id);

    // スケジュールのユーザーIDを取得してマスク処理を適用
    let user_id: Option<i64> = sqlx::query_scalar("SELECT user_id FROM schedules WHERE id = ?")
        .bind(schedule_internal_id)
        .fetch_optional(&pool)
        .await
        .ok()
        .flatten();

    if let Some(uid) = user_id {
        if let Ok(masked_locations) = get_masked_locations_for_user(&pool, uid).await {
            traffic = apply_mask_to_public_traffic(traffic, &masked_locations);
        }
    }

    Ok(Json(traffic))
}

// GET /public/stay/:id - 公開スケジュールの宿泊情報（個別）
async fn get_public_stay(
    Path(public_id): Path<String>,
    Extension(pool): Extension<Pool<Sqlite>>,
) -> Result<Json<PublicStay>, StatusCode> {
    let schedule_internal_id: Option<i64> = sqlx::query_scalar(
        "SELECT schedule_id FROM stays WHERE public_id = ?",
    )
    .bind(&public_id)
    .fetch_optional(&pool)
    .await
    .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    let schedule_internal_id = schedule_internal_id.ok_or(StatusCode::NOT_FOUND)?;

    let row: Option<PublicStayRow> = sqlx::query_as::<_, PublicStayRow>(
        r#"
        SELECT
          public_id,
          check_in,
          check_out,
          hotel_name,
          website,
          fee,
          breakfast_flag,
          deadline,
          penalty,
          status
        FROM stays
        WHERE public_id = ?
        "#,
    )
    .bind(&public_id)
    .fetch_optional(&pool)
    .await
    .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    let row = row.ok_or(StatusCode::NOT_FOUND)?;

    // 関連するスケジュールが公開されているか確認
    let schedule: Option<(i64, Option<String>)> = if std::env::var("DISABLE_AUTH").is_ok() {
        sqlx::query_as("SELECT id, public_id FROM schedules WHERE id = ?")
            .bind(schedule_internal_id)
            .fetch_optional(&pool)
            .await
            .expect("failed to check schedule")
    } else {
        sqlx::query_as("SELECT id, public_id FROM schedules WHERE id = ? AND CAST(is_public AS INTEGER) = 1")
            .bind(schedule_internal_id)
            .fetch_optional(&pool)
            .await
            .expect("failed to check schedule")
    };

    let Some((_, Some(schedule_public_id))) = schedule else {
        return Err(StatusCode::NOT_FOUND);
    };

    Ok(Json(row_to_public_stay(row, &schedule_public_id)))
}

// GET /share/:share_id/traffic/:id - 共有ページ用の交通情報（個別）
async fn list_shared_traffics(
    Path(share_id): Path<String>,
    Extension(pool): Extension<Pool<Sqlite>>,
) -> Result<Json<Vec<PublicTraffic>>, (StatusCode, Json<ErrorResponse>)> {
    let user_id = resolve_active_share_owner(&pool, &share_id).await?;

    let rows: Vec<SharedTrafficRow> = sqlx::query_as::<_, SharedTrafficRow>(
        r#"
        SELECT t.public_id, t.date, t."order", t.transportation,
               t.from_place, t.to_place, t.notes, t.fare, t.miles,
               t.return_flag, t.total_fare, t.total_miles,
               s.public_id AS schedule_public_id
        FROM traffics t
        INNER JOIN schedules s ON s.id = t.schedule_id
        WHERE s.user_id = ? AND CAST(s.is_public AS INTEGER) = 1
        ORDER BY t.date ASC, t."order" ASC
        "#,
    )
    .bind(user_id)
    .fetch_all(&pool)
    .await
    .map_err(|_| (StatusCode::INTERNAL_SERVER_ERROR, Json(ErrorResponse { error: "Database error".to_string() })))?;

    let masked_locations = get_masked_locations_for_user(&pool, user_id).await.unwrap_or_default();
    let traffics = rows.into_iter()
        .map(shared_row_to_public_traffic)
        .map(|traffic| apply_mask_to_public_traffic(traffic, &masked_locations))
        .collect();
    Ok(Json(traffics))
}

async fn get_shared_traffic(
    Path((share_id, public_id)): Path<(String, String)>,
    Extension(pool): Extension<Pool<Sqlite>>,
) -> Result<Json<PublicTraffic>, (StatusCode, Json<ErrorResponse>)> {
    // share_idからユーザーIDを取得
    let user_row: Option<(i64, i32, String, Option<String>)> = sqlx::query_as(
        "SELECT id, sharing_enabled, plan, trial_started_at FROM users WHERE share_id = ?"
    )
    .bind(&share_id)
    .fetch_optional(&pool)
    .await
    .map_err(|e| {
        eprintln!("[GetSharedTraffic] Database error: {}", e);
        (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(ErrorResponse {
                error: "Database error".to_string(),
            }),
        )
    })?;

    if let Some((user_id, sharing_enabled, plan, trial_started_at)) = user_row {
        if sharing_enabled == 0 || !has_paid_access(&plan, trial_started_at.as_deref()) {
            return Err((
                StatusCode::FORBIDDEN,
                Json(ErrorResponse {
                    error: "このユーザーのスケジュールは共有されていません".to_string(),
                }),
            ));
        }

        // 交通情報を取得（このユーザーの公開スケジュールに属するもののみ）
        let row: Option<SharedTrafficRow> = sqlx::query_as::<_, SharedTrafficRow>(
            r#"
            SELECT t.public_id, t.date, t."order", t.transportation,
                   t.from_place, t.to_place, t.notes, t.fare, t.miles,
                   t.return_flag, t.total_fare, t.total_miles,
                   s.public_id AS schedule_public_id
            FROM traffics t
            INNER JOIN schedules s ON s.id = t.schedule_id
            WHERE t.public_id = ? AND s.user_id = ? AND CAST(s.is_public AS INTEGER) = 1
            "#,
        )
        .bind(&public_id)
        .bind(user_id)
        .fetch_optional(&pool)
        .await
        .map_err(|e| {
            eprintln!("[GetSharedTraffic] Database error: {}", e);
            (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(ErrorResponse {
                    error: "Database error".to_string(),
                }),
            )
        })?;

        let row = row.ok_or((
            StatusCode::NOT_FOUND,
            Json(ErrorResponse {
                error: "Traffic not found".to_string(),
            }),
        ))?;

        let mut traffic = shared_row_to_public_traffic(row);

        // マスク処理を適用
        if let Ok(masked_locations) = get_masked_locations_for_user(&pool, user_id).await {
            traffic = apply_mask_to_public_traffic(traffic, &masked_locations);
        }

        Ok(Json(traffic))
    } else {
        Err((
            StatusCode::NOT_FOUND,
            Json(ErrorResponse {
                error: "User not found".to_string(),
            }),
        ))
    }
}

// GET /share/:share_id/stay/:id - 共有ページ用の宿泊情報（個別）
async fn get_shared_stay(
    Path((share_id, public_id)): Path<(String, String)>,
    Extension(pool): Extension<Pool<Sqlite>>,
) -> Result<Json<PublicStay>, (StatusCode, Json<ErrorResponse>)> {
    // share_idからユーザーIDを取得
    let user_row: Option<(i64, i32, String, Option<String>)> = sqlx::query_as(
        "SELECT id, sharing_enabled, plan, trial_started_at FROM users WHERE share_id = ?"
    )
    .bind(&share_id)
    .fetch_optional(&pool)
    .await
    .map_err(|e| {
        eprintln!("[GetSharedStay] Database error: {}", e);
        (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(ErrorResponse {
                error: "Database error".to_string(),
            }),
        )
    })?;

    if let Some((user_id, sharing_enabled, plan, trial_started_at)) = user_row {
        if sharing_enabled == 0 || !has_paid_access(&plan, trial_started_at.as_deref()) {
            return Err((
                StatusCode::FORBIDDEN,
                Json(ErrorResponse {
                    error: "このユーザーのスケジュールは共有されていません".to_string(),
                }),
            ));
        }

        // 宿泊情報を取得（このユーザーの公開スケジュールに属するもののみ）
        let row: Option<SharedStayRow> = sqlx::query_as::<_, SharedStayRow>(
            r#"
            SELECT st.public_id, st.check_in, st.check_out, st.hotel_name,
                   st.website, st.fee, st.breakfast_flag, st.deadline,
                   st.penalty, st.status,
                   s.public_id AS schedule_public_id
            FROM stays st
            INNER JOIN schedules s ON s.id = st.schedule_id
            WHERE st.public_id = ? AND s.user_id = ? AND CAST(s.is_public AS INTEGER) = 1
            "#,
        )
        .bind(&public_id)
        .bind(user_id)
        .fetch_optional(&pool)
        .await
        .map_err(|e| {
            eprintln!("[GetSharedStay] Database error: {}", e);
            (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(ErrorResponse {
                    error: "Database error".to_string(),
                }),
            )
        })?;

        let row = row.ok_or((
            StatusCode::NOT_FOUND,
            Json(ErrorResponse {
                error: "Stay not found".to_string(),
            }),
        ))?;

        Ok(Json(shared_row_to_public_stay(row)))
    } else {
        Err((
            StatusCode::NOT_FOUND,
            Json(ErrorResponse {
                error: "User not found".to_string(),
            }),
        ))
    }
}

// GET /traffic?schedule_id=...
async fn list_traffics(
    user: AuthenticatedUser,
    Query(params): Query<TrafficQuery>,
    Extension(pool): Extension<Pool<Sqlite>>,
) -> Json<Vec<Traffic>> {
    let rows: Vec<TrafficRow> = sqlx::query_as::<_, TrafficRow>(
        r#"
        SELECT
          t.id,
          t.schedule_id,
          t.date,
          t."order",
          t.transportation,
          t.from_place,
          t.to_place,
          t.notes,
          t.fare,
          t.miles,
          t.return_flag,
          t.total_fare,
          t.total_miles
        FROM traffics t
        INNER JOIN schedules s ON t.schedule_id = s.id
        WHERE t.schedule_id = ? AND s.user_id = ?
        ORDER BY t."order" ASC
        "#,
    )
    .bind(params.schedule_id)
    .bind(user.user_id as i64)
    .fetch_all(&pool)
    .await
    .expect("failed to fetch traffics");

    let traffics = rows.into_iter().map(row_to_traffic).collect();
    Json(traffics)
}

// GET /traffic/:id
async fn get_traffic(
    Path(id): Path<i32>,
    user: AuthenticatedUser,
    Extension(pool): Extension<Pool<Sqlite>>,
) -> Result<Json<Traffic>, StatusCode> {
    let row: Option<TrafficRow> = sqlx::query_as::<_, TrafficRow>(
        r#"
        SELECT
          id,
          schedule_id,
          date,
          "order",
          transportation,
          from_place,
          to_place,
          notes,
          fare,
          miles,
          return_flag,
          total_fare,
          total_miles
        FROM traffics
        WHERE id = ?
        "#,
    )
    .bind(id)
    .fetch_optional(&pool)
    .await
    .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    let row = row.ok_or(StatusCode::NOT_FOUND)?;

    // スケジュールの所有者を確認（スケジュールが存在しない場合も含め、
    // 所有者が確認できなければアクセスを拒否する）
    let schedule_user_id: Option<i64> = sqlx::query_scalar(
        "SELECT user_id FROM schedules WHERE id = ?",
    )
    .bind(row.schedule_id)
    .fetch_optional(&pool)
    .await
    .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    match schedule_user_id {
        Some(schedule_user_id) if schedule_user_id == user.user_id as i64 => {}
        _ => return Err(StatusCode::FORBIDDEN),
    }

    Ok(Json(row_to_traffic(row)))
}

// POST /traffic
async fn create_traffic(
    user: AuthenticatedUser,
    Extension(pool): Extension<Pool<Sqlite>>,
    Json(payload): Json<NewTraffic>,
) -> Result<(StatusCode, Json<Traffic>), StatusCode> {
    // スケジュールの所有者を確認
    let schedule_user_id: Option<i64> = sqlx::query_scalar(
        "SELECT user_id FROM schedules WHERE id = ?",
    )
    .bind(payload.schedule_id as i64)
    .fetch_optional(&pool)
    .await
    .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    if let Some(schedule_user_id) = schedule_user_id {
        if schedule_user_id != user.user_id as i64 {
            return Err(StatusCode::FORBIDDEN);
        }
    } else {
        // スケジュールが存在しない場合
        return Err(StatusCode::NOT_FOUND);
    }

    let now = Utc::now().to_rfc3339();
    let result = sqlx::query(
        r#"
        INSERT INTO traffics (
          schedule_id,
          date,
          "order",
          transportation,
          from_place,
          to_place,
          notes,
          fare,
          miles,
          return_flag,
          total_fare,
          total_miles,
          public_id,
          created_at,
          updated_at
        ) VALUES (
          ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, NULL, ?, ?, ?
        )
        "#,
    )
    .bind(payload.schedule_id)
    .bind(&payload.date)
    .bind(payload.order)
    .bind(&payload.transportation)
    .bind(&payload.from)
    .bind(&payload.to)
    .bind(&payload.notes)
    .bind(payload.fare)
    .bind(payload.miles)
    .bind(if payload.return_flag { 1 } else { 0 })
    .bind(generate_public_id())
    .bind(&now)
    .bind(&now)
    .execute(&pool)
    .await
    .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    let last_id = result.last_insert_rowid();

    // 関連するスケジュールのロールアップ計算を実行
    calculate_rollup(&pool, payload.schedule_id as i64).await.ok();

    let row: TrafficRow = sqlx::query_as::<_, TrafficRow>(
        r#"
        SELECT
          id,
          schedule_id,
          date,
          "order",
          transportation,
          from_place,
          to_place,
          notes,
          fare,
          miles,
          return_flag,
          total_fare,
          total_miles
        FROM traffics
        WHERE id = ?
        "#,
    )
    .bind(last_id)
    .fetch_one(&pool)
    .await
    .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    Ok((StatusCode::CREATED, Json(row_to_traffic(row))))
}

// PUT /traffic/:id
async fn update_traffic(
    Path(id): Path<i32>,
    user: AuthenticatedUser,
    Extension(pool): Extension<Pool<Sqlite>>,
    Json(payload): Json<NewTraffic>,
) -> Result<Json<Traffic>, StatusCode> {
    // 更新対象のtrafficが現在所属しているスケジュールの所有者を確認
    let current_schedule_id: Option<i64> = sqlx::query_scalar(
        "SELECT schedule_id FROM traffics WHERE id = ?",
    )
    .bind(id)
    .fetch_optional(&pool)
    .await
    .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;
    let current_schedule_id = current_schedule_id.ok_or(StatusCode::NOT_FOUND)?;

    // 付け替え先（またはそのまま）のスケジュールの所有者も併せて確認し、
    // 他人のスケジュールへ再割り当てできないようにする
    for schedule_id in [current_schedule_id, payload.schedule_id as i64] {
        let schedule_user_id: Option<i64> = sqlx::query_scalar(
            "SELECT user_id FROM schedules WHERE id = ?",
        )
        .bind(schedule_id)
        .fetch_optional(&pool)
        .await
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

        match schedule_user_id {
            Some(schedule_user_id) if schedule_user_id == user.user_id as i64 => {}
            _ => return Err(StatusCode::FORBIDDEN),
        }
    }

    let now = Utc::now().to_rfc3339();
    let result = sqlx::query(
        r#"
        UPDATE traffics SET
          schedule_id = ?,
          date = ?,
          "order" = ?,
          transportation = ?,
          from_place = ?,
          to_place = ?,
          notes = ?,
          fare = ?,
          miles = ?,
          return_flag = ?,
          updated_at = ?
        WHERE id = ?
        "#,
    )
    .bind(payload.schedule_id)
    .bind(&payload.date)
    .bind(payload.order)
    .bind(&payload.transportation)
    .bind(&payload.from)
    .bind(&payload.to)
    .bind(&payload.notes)
    .bind(payload.fare)
    .bind(payload.miles)
    .bind(if payload.return_flag { 1 } else { 0 })
    .bind(&now)
    .bind(id)
    .execute(&pool)
    .await
    .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    if result.rows_affected() == 0 {
        return Err(StatusCode::NOT_FOUND);
    }

    // 関連するスケジュールのロールアップ計算を実行
    calculate_rollup(&pool, payload.schedule_id as i64).await.ok();

    let row: TrafficRow = sqlx::query_as::<_, TrafficRow>(
        r#"
        SELECT
          id,
          schedule_id,
          date,
          "order",
          transportation,
          from_place,
          to_place,
          notes,
          fare,
          miles,
          return_flag,
          total_fare,
          total_miles
        FROM traffics
        WHERE id = ?
        "#,
    )
    .bind(id)
    .fetch_one(&pool)
    .await
    .map_err(|_| StatusCode::NOT_FOUND)?;

    Ok(Json(row_to_traffic(row)))
}

// GET /traffic/all - ユーザーが所有するすべてのTrafficを取得
async fn list_all_traffics(
    user: AuthenticatedUser,
    Extension(pool): Extension<Pool<Sqlite>>,
) -> Json<Vec<Traffic>> {
    let rows: Vec<TrafficRow> = sqlx::query_as::<_, TrafficRow>(
        r#"
        SELECT
          t.id,
          t.schedule_id,
          t.date,
          t."order",
          t.transportation,
          t.from_place,
          t.to_place,
          t.notes,
          t.fare,
          t.miles,
          t.return_flag,
          t.total_fare,
          t.total_miles
        FROM traffics t
        INNER JOIN schedules s ON t.schedule_id = s.id
        WHERE s.user_id = ?
        ORDER BY t.date ASC, t."order" ASC
        "#,
    )
    .bind(user.user_id as i64)
    .fetch_all(&pool)
    .await
    .unwrap_or_else(|e| {
        eprintln!("Error fetching traffics: {}", e);
        vec![]
    });

    let traffics = rows.into_iter().map(row_to_traffic).collect();
    Json(traffics)
}

// GET /stay/all - ユーザーが所有するすべてのStayを取得
async fn list_all_stays(
    user: AuthenticatedUser,
    Extension(pool): Extension<Pool<Sqlite>>,
) -> Result<Json<Vec<Stay>>, (StatusCode, Json<ErrorResponse>)> {
    let rows: Vec<StayRow> = sqlx::query_as::<_, StayRow>(
        r#"
        SELECT
          st.id,
          st.schedule_id,
          st.check_in,
          st.check_out,
          st.hotel_name,
          st.website,
          st.fee,
          st.breakfast_flag,
          st.deadline,
          st.penalty,
          st.status
        FROM stays st
        INNER JOIN schedules s ON st.schedule_id = s.id
        WHERE s.user_id = ?
        ORDER BY st.check_in ASC
        "#,
    )
    .bind(user.user_id as i64)
    .fetch_all(&pool)
    .await
    .unwrap_or_else(|e| {
        eprintln!("Error fetching stays: {}", e);
        vec![]
    });

    let mut stays: Vec<Stay> = rows.into_iter().map(row_to_stay).collect();

    let (plan, trial_started_at) = fetch_user_plan(&pool, user.user_id).await.map_err(|e| {
        eprintln!("Error fetching plan for user {}: {}", user.user_id, e);
        (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(ErrorResponse {
                error: "Database error".to_string(),
            }),
        )
    })?;
    if !has_paid_access(&plan, trial_started_at.as_deref()) {
        // 無料プランは過去アーカイブを直近2年分（今年+去年）のみ閲覧可能。未来の予定は制限しない
        let earliest_visible_year = free_plan_earliest_archive_year(Utc::now());
        stays = stays
            .into_iter()
            .filter(|s| parse_year_prefix(&s.check_in).map_or(true, |y| y >= earliest_visible_year))
            .collect();
    }

    Ok(Json(stays))
}

// GET /stay?schedule_id=...
async fn list_stays(
    user: AuthenticatedUser,
    Query(params): Query<StayQuery>,
    Extension(pool): Extension<Pool<Sqlite>>,
) -> Json<Vec<Stay>> {
    let rows: Vec<StayRow> = sqlx::query_as::<_, StayRow>(
        r#"
        SELECT
          st.id,
          st.schedule_id,
          st.check_in,
          st.check_out,
          st.hotel_name,
          st.website,
          st.fee,
          st.breakfast_flag,
          st.deadline,
          st.penalty,
          st.status
        FROM stays st
        INNER JOIN schedules s ON st.schedule_id = s.id
        WHERE st.schedule_id = ? AND s.user_id = ?
        "#,
    )
    .bind(params.schedule_id)
    .bind(user.user_id as i64)
    .fetch_all(&pool)
    .await
    .expect("failed to fetch stays");

    let stays = rows.into_iter().map(row_to_stay).collect();
    Json(stays)
}

// GET /stay/:id
async fn get_stay(
    Path(id): Path<i32>,
    user: AuthenticatedUser,
    Extension(pool): Extension<Pool<Sqlite>>,
) -> Result<Json<Stay>, StatusCode> {
    let row: Option<StayRow> = sqlx::query_as::<_, StayRow>(
        r#"
        SELECT
          id,
          schedule_id,
          check_in,
          check_out,
          hotel_name,
          website,
          fee,
          breakfast_flag,
          deadline,
          penalty,
          status
        FROM stays
        WHERE id = ?
        "#,
    )
    .bind(id)
    .fetch_optional(&pool)
    .await
    .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    let row = row.ok_or(StatusCode::NOT_FOUND)?;

    // スケジュールの所有者を確認（スケジュールが存在しない場合も含め、
    // 所有者が確認できなければアクセスを拒否する）
    let schedule_user_id: Option<i64> = sqlx::query_scalar(
        "SELECT user_id FROM schedules WHERE id = ?",
    )
    .bind(row.schedule_id)
    .fetch_optional(&pool)
    .await
    .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    match schedule_user_id {
        Some(schedule_user_id) if schedule_user_id == user.user_id as i64 => {}
        _ => return Err(StatusCode::FORBIDDEN),
    }

    Ok(Json(row_to_stay(row)))
}

// POST /stay
async fn create_stay(
    user: AuthenticatedUser,
    Extension(pool): Extension<Pool<Sqlite>>,
    Json(payload): Json<NewStay>,
) -> Result<(StatusCode, Json<Stay>), StatusCode> {
    // スケジュールの所有者を確認
    let schedule_user_id: Option<i64> = sqlx::query_scalar(
        "SELECT user_id FROM schedules WHERE id = ?",
    )
    .bind(payload.schedule_id as i64)
    .fetch_optional(&pool)
    .await
    .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    if let Some(schedule_user_id) = schedule_user_id {
        if schedule_user_id != user.user_id as i64 {
            return Err(StatusCode::FORBIDDEN);
        }
    } else {
        // スケジュールが存在しない場合
        return Err(StatusCode::NOT_FOUND);
    }

    let now = Utc::now().to_rfc3339();
    let result = sqlx::query(
        r#"
        INSERT INTO stays (
          schedule_id,
          check_in,
          check_out,
          hotel_name,
          website,
          fee,
          breakfast_flag,
          deadline,
          penalty,
          status,
          public_id,
          created_at,
          updated_at
        ) VALUES (
          ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?
        )
        "#,
    )
    .bind(payload.schedule_id)
    .bind(&payload.check_in)
    .bind(&payload.check_out)
    .bind(&payload.hotel_name)
    .bind(&payload.website)
    .bind(payload.fee)
    .bind(if payload.breakfast_flag { 1 } else { 0 })
    .bind(&payload.deadline)
    .bind(payload.penalty)
    .bind(payload.status.as_deref().unwrap_or("Keep"))
    .bind(generate_public_id())
    .bind(&now)
    .bind(&now)
    .execute(&pool)
    .await
    .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    let last_id = result.last_insert_rowid();

    // 関連するスケジュールのロールアップ計算を実行
    calculate_rollup(&pool, payload.schedule_id as i64).await.ok();

    let row: StayRow = sqlx::query_as::<_, StayRow>(
        r#"
        SELECT
          id,
          schedule_id,
          check_in,
          check_out,
          hotel_name,
          website,
          fee,
          breakfast_flag,
          deadline,
          penalty,
          status
        FROM stays
        WHERE id = ?
        "#,
    )
    .bind(last_id)
    .fetch_one(&pool)
    .await
    .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    Ok((StatusCode::CREATED, Json(row_to_stay(row))))
}

// PUT /stay/:id
async fn update_stay(
    Path(id): Path<i32>,
    user: AuthenticatedUser,
    Extension(pool): Extension<Pool<Sqlite>>,
    Json(payload): Json<NewStay>,
) -> Result<Json<Stay>, StatusCode> {
    // 更新対象のstayが現在所属しているスケジュールの所有者を確認
    let current_schedule_id: Option<i64> = sqlx::query_scalar(
        "SELECT schedule_id FROM stays WHERE id = ?",
    )
    .bind(id)
    .fetch_optional(&pool)
    .await
    .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;
    let current_schedule_id = current_schedule_id.ok_or(StatusCode::NOT_FOUND)?;

    // 付け替え先（またはそのまま）のスケジュールの所有者も併せて確認し、
    // 他人のスケジュールへ再割り当てできないようにする
    for schedule_id in [current_schedule_id, payload.schedule_id as i64] {
        let schedule_user_id: Option<i64> = sqlx::query_scalar(
            "SELECT user_id FROM schedules WHERE id = ?",
        )
        .bind(schedule_id)
        .fetch_optional(&pool)
        .await
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

        match schedule_user_id {
            Some(schedule_user_id) if schedule_user_id == user.user_id as i64 => {}
            _ => return Err(StatusCode::FORBIDDEN),
        }
    }

    let now = Utc::now().to_rfc3339();
    let result = sqlx::query(
        r#"
        UPDATE stays SET
          schedule_id = ?,
          check_in = ?,
          check_out = ?,
          hotel_name = ?,
          website = ?,
          fee = ?,
          breakfast_flag = ?,
          deadline = ?,
          penalty = ?,
          status = ?,
          updated_at = ?
        WHERE id = ?
        "#,
    )
    .bind(payload.schedule_id)
    .bind(&payload.check_in)
    .bind(&payload.check_out)
    .bind(&payload.hotel_name)
    .bind(&payload.website)
    .bind(payload.fee)
    .bind(if payload.breakfast_flag { 1 } else { 0 })
    .bind(&payload.deadline)
    .bind(payload.penalty)
    .bind(payload.status.as_deref().unwrap_or("Keep"))
    .bind(&now)
    .bind(id)
    .execute(&pool)
    .await
    .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    if result.rows_affected() == 0 {
        return Err(StatusCode::NOT_FOUND);
    }

    // 関連するスケジュールのロールアップ計算を実行
    calculate_rollup(&pool, payload.schedule_id as i64).await.ok();

    let row: StayRow = sqlx::query_as::<_, StayRow>(
        r#"
        SELECT
          id,
          schedule_id,
          check_in,
          check_out,
          hotel_name,
          website,
          fee,
          breakfast_flag,
          deadline,
          penalty,
          status
        FROM stays
        WHERE id = ?
        "#,
    )
    .bind(id)
    .fetch_one(&pool)
    .await
    .map_err(|_| StatusCode::NOT_FOUND)?;

    Ok(Json(row_to_stay(row)))
}

// ====== 選択肢管理 ======

#[derive(Deserialize)]
struct SelectOptionsRequest {
    options: Vec<serde_json::Value>,
    sort_order: Option<String>, // 'kana' または 'custom'
}

// GET /select-options/:type - 選択肢を取得
async fn get_select_options(
    user: AuthenticatedUser,
    Path(option_type): Path<String>,
    Extension(pool): Extension<Pool<Sqlite>>,
) -> Result<Json<serde_json::Value>, (StatusCode, Json<ErrorResponse>)> {
    // DISABLE_AUTHが有効な場合、データベースから実際のユーザーIDを取得
    let actual_user_id = if std::env::var("DISABLE_AUTH").is_ok() {
        // 環境変数DEFAULT_USER_IDが設定されている場合はそれを使用
        if let Ok(user_id_str) = std::env::var("DEFAULT_USER_ID") {
            user_id_str.parse::<i32>().ok().unwrap_or(user.user_id)
        } else if let Ok(email) = std::env::var("DEFAULT_USER_EMAIL") {
            // メールアドレスからユーザーIDを取得
            if let Some(user_id) = get_user_id_by_email(&pool, &email).await {
                user_id
            } else {
                // メールアドレスが見つからない場合、データベースから最初のユーザーIDを取得
                get_first_user_id(&pool).await.unwrap_or(user.user_id)
            }
        } else {
            // 環境変数が設定されていない場合、データベースから最初のユーザーIDを取得
            get_first_user_id(&pool).await.unwrap_or(user.user_id)
        }
    } else {
        user.user_id
    };
    
    eprintln!("[GetSelectOptions] User ID (i32): {}, Actual User ID: {}, Option Type: {}", 
        user.user_id, actual_user_id, option_type);
    
    let row: Option<(String, Option<String>)> = sqlx::query_as::<_, (String, Option<String>)>(
        "SELECT options_json, sort_order FROM select_options WHERE user_id = ? AND option_type = ?"
    )
    .bind(actual_user_id as i64)
    .bind(&option_type)
    .fetch_optional(&pool)
    .await
    .map_err(|e| {
        eprintln!("[GetSelectOptions] Database error: {}", e);
        (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(ErrorResponse {
                error: "Database error".to_string(),
            }),
        )
    })?;

    if let Some((options_json, sort_order)) = row {
        let options: Vec<serde_json::Value> = serde_json::from_str(&options_json)
            .map_err(|_| {
                (
                    StatusCode::INTERNAL_SERVER_ERROR,
                    Json(ErrorResponse {
                        error: "Failed to parse options".to_string(),
                    }),
                )
            })?;
        Ok(Json(serde_json::json!({
            "options": options,
            "sort_order": sort_order.unwrap_or_else(|| "custom".to_string()),
            "exists": true,
        })))
    } else {
        // データベースに保存されていない場合は空配列を返す
        // existsをfalseにすることで、フロントは「未保存（初回）」と
        // 「保存済みだが全件削除されて0件」を区別できる
        Ok(Json(serde_json::json!({
            "options": [],
            "sort_order": "custom",
            "exists": false,
        })))
    }
}

// POST /select-options/:type - 選択肢を保存
async fn save_select_options(
    user: AuthenticatedUser,
    Path(option_type): Path<String>,
    Extension(pool): Extension<Pool<Sqlite>>,
    Json(payload): Json<SelectOptionsRequest>,
) -> Result<Json<serde_json::Value>, (StatusCode, Json<ErrorResponse>)> {
    // DISABLE_AUTHが有効な場合、データベースから実際のユーザーIDを取得
    let actual_user_id = if std::env::var("DISABLE_AUTH").is_ok() {
        // 環境変数DEFAULT_USER_IDが設定されている場合はそれを使用
        if let Ok(user_id_str) = std::env::var("DEFAULT_USER_ID") {
            user_id_str.parse::<i32>().ok().unwrap_or(user.user_id)
        } else if let Ok(email) = std::env::var("DEFAULT_USER_EMAIL") {
            // メールアドレスからユーザーIDを取得
            if let Some(user_id) = get_user_id_by_email(&pool, &email).await {
                user_id
            } else {
                // メールアドレスが見つからない場合、データベースから最初のユーザーIDを取得
                get_first_user_id(&pool).await.unwrap_or(user.user_id)
            }
        } else {
            // 環境変数が設定されていない場合、データベースから最初のユーザーIDを取得
            get_first_user_id(&pool).await.unwrap_or(user.user_id)
        }
    } else {
        user.user_id
    };
    
    let user_id_i64 = actual_user_id as i64;
    eprintln!("[SaveSelectOptions] User ID (i32): {}, User ID (i64): {}, Option Type: {}, Options Count: {}", 
        actual_user_id, user_id_i64, option_type, payload.options.len());
    
    let options_json = serde_json::to_string(&payload.options)
        .map_err(|e| {
            eprintln!("[SaveSelectOptions] Failed to serialize options: {}", e);
            (
                StatusCode::BAD_REQUEST,
                Json(ErrorResponse {
                    error: "Invalid options format".to_string(),
                }),
            )
        })?;

    eprintln!("[SaveSelectOptions] Options JSON: {}", options_json);

    let now = Utc::now().to_rfc3339();

    // ユーザーIDが存在するか確認
    eprintln!("[SaveSelectOptions] Checking if user_id {} exists in users table", user_id_i64);
    let user_id_exists: Option<(i64,)> = sqlx::query_as("SELECT id FROM users WHERE id = ?")
        .bind(user_id_i64)
        .fetch_optional(&pool)
        .await
        .map_err(|e| {
            eprintln!("[SaveSelectOptions] Failed to check user existence: {}", e);
            (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(ErrorResponse {
                    error: "Database error".to_string(),
                }),
            )
        })?;
    
    if user_id_exists.is_none() {
        eprintln!("[SaveSelectOptions] User ID {} does not exist in users table", user_id_i64);
        // すべてのユーザーIDを確認
        let all_users: Vec<(i64, String)> = sqlx::query_as("SELECT id, email FROM users")
            .fetch_all(&pool)
            .await
            .unwrap_or_default();
        eprintln!("[SaveSelectOptions] All users in database: {:?}", all_users);
        return Err((
            StatusCode::BAD_REQUEST,
            Json(ErrorResponse {
                error: format!("User ID {} does not exist", actual_user_id),
            }),
        ));
    }
    
    eprintln!("[SaveSelectOptions] User ID {} exists in users table", user_id_i64);
    
    // 既存のレコードを確認
    eprintln!("[SaveSelectOptions] Checking for existing record: user_id={}, option_type={}", user_id_i64, option_type);
    let existing: Option<(i64,)> = sqlx::query_as(
        "SELECT id FROM select_options WHERE user_id = ? AND option_type = ?"
    )
    .bind(user_id_i64)
    .bind(&option_type)
    .fetch_optional(&pool)
    .await
    .map_err(|e| {
        eprintln!("[SaveSelectOptions] Failed to check existing record: {}", e);
        (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(ErrorResponse {
                error: "Database error".to_string(),
            }),
        )
    })?;
    
    eprintln!("[SaveSelectOptions] Existing record check result: {:?}", existing);
    
    let sort_order = payload.sort_order.unwrap_or_else(|| "custom".to_string());
    
    let result = if existing.is_some() {
        // 既存のレコードを更新
        eprintln!("[SaveSelectOptions] Updating existing record for user_id: {}, option_type: {}", actual_user_id, option_type);
        sqlx::query(
            r#"
            UPDATE select_options
            SET options_json = ?,
                sort_order = ?,
                updated_at = ?
            WHERE user_id = ? AND option_type = ?
            "#
        )
        .bind(&options_json)
        .bind(&sort_order)
        .bind(&now)
        .bind(user_id_i64)
        .bind(&option_type)
        .execute(&pool)
        .await
    } else {
        // 新しいレコードを挿入
        eprintln!("[SaveSelectOptions] Inserting new record for user_id: {}, option_type: {}", user_id_i64, option_type);
        sqlx::query(
            r#"
            INSERT INTO select_options (user_id, option_type, options_json, sort_order, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?)
            "#
        )
        .bind(user_id_i64)
        .bind(&option_type)
        .bind(&options_json)
        .bind(&sort_order)
        .bind(&now)
        .bind(&now)
        .execute(&pool)
        .await
    }
    .map_err(|e| {
        eprintln!("[SaveSelectOptions] Database error: {}", e);
        (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(ErrorResponse {
                error: format!("Failed to save options: {}", e),
            }),
        )
    })?;

    eprintln!("[SaveSelectOptions] Successfully saved. Rows affected: {}", result.rows_affected());

    Ok(Json(serde_json::json!({ "success": true })))
}

// GET /share/:share_id/select-options/:type - 共有ページ用の選択肢を取得（認証不要）
async fn get_shared_select_options(
    Path((share_id, option_type)): Path<(String, String)>,
    Extension(pool): Extension<Pool<Sqlite>>,
) -> Result<Json<serde_json::Value>, (StatusCode, Json<ErrorResponse>)> {
    eprintln!("[GetSharedSelectOptions] Called with share_id: {}, option_type: {}", share_id, option_type);
    
    // share_idからユーザーIDを取得
    let user_id: Option<i64> = sqlx::query_scalar(
        "SELECT id FROM users WHERE share_id = ?"
    )
    .bind(&share_id)
    .fetch_optional(&pool)
    .await
    .map_err(|e| {
        eprintln!("[GetSharedSelectOptions] Database error: {}", e);
        (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(ErrorResponse {
                error: "Database error".to_string(),
            }),
        )
    })?;
    
    eprintln!("[GetSharedSelectOptions] User ID found: {:?}", user_id);
    
    if let Some(user_id) = user_id {
        let row: Option<(String, Option<String>)> = sqlx::query_as::<_, (String, Option<String>)>(
            "SELECT options_json, sort_order FROM select_options WHERE user_id = ? AND option_type = ?"
        )
        .bind(user_id)
        .bind(&option_type)
        .fetch_optional(&pool)
        .await
        .map_err(|e| {
            eprintln!("[GetSharedSelectOptions] Database error: {}", e);
            (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(ErrorResponse {
                    error: "Database error".to_string(),
                }),
            )
        })?;

        if let Some((options_json, sort_order)) = row {
            let options: Vec<serde_json::Value> = serde_json::from_str(&options_json)
                .map_err(|_| {
                    (
                        StatusCode::INTERNAL_SERVER_ERROR,
                        Json(ErrorResponse {
                            error: "Failed to parse options".to_string(),
                        }),
                    )
                })?;
            eprintln!("[GetSharedSelectOptions] Returning {} options", options.len());
            Ok(Json(serde_json::json!({
                "options": options,
                "sort_order": sort_order.unwrap_or_else(|| "custom".to_string()),
                "exists": true,
            })))
        } else {
            eprintln!("[GetSharedSelectOptions] No options found, returning empty array");
            Ok(Json(serde_json::json!({
                "options": [],
                "sort_order": "custom",
                "exists": false,
            })))
        }
    } else {
        Err((
            StatusCode::NOT_FOUND,
            Json(ErrorResponse {
                error: "User not found".to_string(),
            }),
        ))
    }
}

fn normalize_stay_option_type(option_type: &str) -> Option<&'static str> {
    match option_type.trim().to_ascii_uppercase().as_str() {
        "WEBSITE" => Some("WEBSITE"),
        "STATUS" => Some("STATUS"),
        _ => None,
    }
}

fn invalid_stay_option_type() -> (StatusCode, Json<ErrorResponse>) {
    (
        StatusCode::BAD_REQUEST,
        Json(ErrorResponse {
            error: "Invalid stay option type. Expected WEBSITE or STATUS".to_string(),
        }),
    )
}

#[cfg(test)]
mod stay_option_type_tests {
    use super::normalize_stay_option_type;

    #[test]
    fn normalizes_supported_types_case_insensitively() {
        assert_eq!(normalize_stay_option_type("website"), Some("WEBSITE"));
        assert_eq!(normalize_stay_option_type("STATUS"), Some("STATUS"));
        assert_eq!(normalize_stay_option_type(" Status "), Some("STATUS"));
    }

    #[test]
    fn rejects_unknown_types() {
        assert_eq!(normalize_stay_option_type("category"), None);
        assert_eq!(normalize_stay_option_type(""), None);
    }
}

// GET /share/:share_id/stay-select-options/:type - 共有ページ用のホテル選択肢を取得（認証不要）
async fn get_shared_stay_select_options(
    Path((share_id, option_type)): Path<(String, String)>,
    Extension(pool): Extension<Pool<Sqlite>>,
) -> Result<Json<Vec<serde_json::Value>>, (StatusCode, Json<ErrorResponse>)> {
    let option_type = normalize_stay_option_type(&option_type)
        .ok_or_else(invalid_stay_option_type)?;
    eprintln!("[GetSharedStaySelectOptions] Called with share_id: {}, option_type: {}", share_id, option_type);
    
    // share_idからユーザーIDを取得
    let user_id: Option<i64> = sqlx::query_scalar(
        "SELECT id FROM users WHERE share_id = ?"
    )
    .bind(&share_id)
    .fetch_optional(&pool)
    .await
    .map_err(|e| {
        eprintln!("[GetSharedStaySelectOptions] Database error: {}", e);
        (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(ErrorResponse {
                error: "Database error".to_string(),
            }),
        )
    })?;
    
    eprintln!("[GetSharedStaySelectOptions] User ID found: {:?}", user_id);

    if let Some(user_id) = user_id {
        let row: Option<(String,)> = sqlx::query_as::<_, (String,)>(
            "SELECT options_json FROM stay_select_options WHERE user_id = ? AND option_type = ?"
        )
        .bind(user_id)
        .bind(&option_type)
        .fetch_optional(&pool)
        .await
        .map_err(|e| {
            eprintln!("[GetSharedStaySelectOptions] Database error: {}", e);
            (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(ErrorResponse {
                    error: "Database error".to_string(),
                }),
            )
        })?;

        if let Some((options_json,)) = row {
            let options: Vec<serde_json::Value> = serde_json::from_str(&options_json)
                .map_err(|_| {
                    (
                        StatusCode::INTERNAL_SERVER_ERROR,
                        Json(ErrorResponse {
                            error: "Failed to parse options".to_string(),
                        }),
                    )
                })?;
            eprintln!("[GetSharedStaySelectOptions] Returning {} options", options.len());
            Ok(Json(options))
        } else {
            eprintln!("[GetSharedStaySelectOptions] No options found, returning empty array");
            Ok(Json(vec![]))
        }
    } else {
        Err((
            StatusCode::NOT_FOUND,
            Json(ErrorResponse {
                error: "User not found".to_string(),
            }),
        ))
    }
}

// GET /stay-select-options/:type - ホテル用選択肢を取得
async fn get_stay_select_options(
    user: AuthenticatedUser,
    Path(option_type): Path<String>,
    Extension(pool): Extension<Pool<Sqlite>>,
) -> Result<Json<serde_json::Value>, (StatusCode, Json<ErrorResponse>)> {
    let option_type = normalize_stay_option_type(&option_type)
        .ok_or_else(invalid_stay_option_type)?;
    // DISABLE_AUTHが有効な場合、データベースから実際のユーザーIDを取得
    let actual_user_id = if std::env::var("DISABLE_AUTH").is_ok() {
        if let Ok(user_id_str) = std::env::var("DEFAULT_USER_ID") {
            user_id_str.parse::<i32>().ok().unwrap_or(user.user_id)
        } else if let Ok(email) = std::env::var("DEFAULT_USER_EMAIL") {
            if let Some(user_id) = get_user_id_by_email(&pool, &email).await {
                user_id
            } else {
                get_first_user_id(&pool).await.unwrap_or(user.user_id)
            }
        } else {
            get_first_user_id(&pool).await.unwrap_or(user.user_id)
        }
    } else {
        user.user_id
    };
    
    let row: Option<(String,)> = sqlx::query_as::<_, (String,)>(
        "SELECT options_json FROM stay_select_options WHERE user_id = ? AND option_type = ?"
    )
    .bind(actual_user_id as i64)
    .bind(&option_type)
    .fetch_optional(&pool)
    .await
    .map_err(|e| {
        eprintln!("[GetStaySelectOptions] Database error: {}", e);
        (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(ErrorResponse {
                error: "Database error".to_string(),
            }),
        )
    })?;

    if let Some((options_json,)) = row {
        let options: Vec<serde_json::Value> = serde_json::from_str(&options_json)
            .map_err(|_| {
                (
                    StatusCode::INTERNAL_SERVER_ERROR,
                    Json(ErrorResponse {
                        error: "Failed to parse options".to_string(),
                    }),
                )
            })?;
        Ok(Json(serde_json::json!({
            "options": options,
            "exists": true,
        })))
    } else {
        // existsをfalseにすることで、フロントは「未保存（初回）」と
        // 「保存済みだが全件削除されて0件」を区別できる
        Ok(Json(serde_json::json!({
            "options": [],
            "exists": false,
        })))
    }
}

// POST /stay-select-options/:type - ホテル用選択肢を保存
async fn save_stay_select_options(
    user: AuthenticatedUser,
    Path(option_type): Path<String>,
    Extension(pool): Extension<Pool<Sqlite>>,
    Json(payload): Json<SelectOptionsRequest>,
) -> Result<Json<serde_json::Value>, (StatusCode, Json<ErrorResponse>)> {
    let option_type = normalize_stay_option_type(&option_type)
        .ok_or_else(invalid_stay_option_type)?;
    // DISABLE_AUTHが有効な場合、データベースから実際のユーザーIDを取得
    let actual_user_id = if std::env::var("DISABLE_AUTH").is_ok() {
        if let Ok(user_id_str) = std::env::var("DEFAULT_USER_ID") {
            user_id_str.parse::<i32>().ok().unwrap_or(user.user_id)
        } else if let Ok(email) = std::env::var("DEFAULT_USER_EMAIL") {
            if let Some(user_id) = get_user_id_by_email(&pool, &email).await {
                user_id
            } else {
                get_first_user_id(&pool).await.unwrap_or(user.user_id)
            }
        } else {
            get_first_user_id(&pool).await.unwrap_or(user.user_id)
        }
    } else {
        user.user_id
    };
    
    let user_id_i64 = actual_user_id as i64;
    let options_json = serde_json::to_string(&payload.options)
        .map_err(|_| {
            (
                StatusCode::BAD_REQUEST,
                Json(ErrorResponse {
                    error: "Invalid options format".to_string(),
                }),
            )
        })?;

    let now = Utc::now().to_rfc3339();

    if let Some((_existing_id,)) = sqlx::query_as::<_, (i64,)>(
        "SELECT id FROM stay_select_options WHERE user_id = ? AND option_type = ?"
    )
    .bind(user_id_i64)
    .bind(&option_type)
    .fetch_optional(&pool)
    .await
    .map_err(|e| {
        eprintln!("[SaveStaySelectOptions] Database error: {}", e);
        (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(ErrorResponse {
                error: "Database error".to_string(),
            }),
        )
    })? {
        // 既存のレコードを更新
        sqlx::query(
            r#"
            UPDATE stay_select_options 
            SET options_json = ?, updated_at = ?
            WHERE user_id = ? AND option_type = ?
            "#
        )
        .bind(&options_json)
        .bind(&now)
        .bind(user_id_i64)
        .bind(&option_type)
        .execute(&pool)
        .await
    } else {
        // 新しいレコードを挿入
        sqlx::query(
            r#"
            INSERT INTO stay_select_options (user_id, option_type, options_json, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?)
            "#
        )
        .bind(user_id_i64)
        .bind(&option_type)
        .bind(&options_json)
        .bind(&now)
        .bind(&now)
        .execute(&pool)
        .await
    }
    .map_err(|e| {
        eprintln!("[SaveStaySelectOptions] Database error: {}", e);
        (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(ErrorResponse {
                error: format!("Failed to save options: {}", e),
            }),
        )
    })?;

    Ok(Json(serde_json::json!({ "success": true })))
}

// ====== 読み仮名解決（五十音順ソート用） ======
//
// 出演者名の五十音順ソートのため、AIで読み仮名（ひらがな）を推定する。
// 解決優先順位: ①手動修正ファイル(reading_overrides.json) → ②キャッシュファイル(data/reading_cache.json)
// → ③Claude APIに問い合わせて解決し、キャッシュに保存。
// DBスキーマは増やさず、ファイルベースで完結させている。

// 本番環境(systemd, WorkingDirectory=リポジトリ直下)とローカル開発(backend/配下で
// 実行)ではカレントディレクトリの前提が異なり、単純な相対パスだと本番でgit pull後の
// 実ファイル位置と食い違う。DATABASE_URLと同じく環境変数で上書きできるようにし、
// デフォルト値はローカル開発（backend/配下で実行する場合）に合わせている。
fn reading_overrides_path() -> String {
    std::env::var("READING_OVERRIDES_PATH").unwrap_or_else(|_| "reading_overrides.json".to_string())
}
fn reading_cache_path() -> String {
    std::env::var("READING_CACHE_PATH").unwrap_or_else(|_| "data/reading_cache.json".to_string())
}

// 1リクエストあたりの上限。アプリ内から通常送られる件数（出演者選択肢の総数）に対して
// 十分な余裕を持たせつつ、意図的に大量のユニークな名前を送ってAnthropic APIの利用量を
// 膨らませる悪用を防ぐための上限。
const READING_MAX_NAMES_PER_REQUEST: usize = 100;
const READING_MAX_NAME_LENGTH: usize = 100;

// ユーザーごとに一定時間あたりのリクエスト回数を制限する簡易レートリミット
// （認証済みユーザーが大量のリクエストを送り続けてAPI費用を意図的に増やすのを防ぐ）
const READING_RATE_LIMIT_MAX: usize = 30;
const READING_RATE_LIMIT_WINDOW: std::time::Duration = std::time::Duration::from_secs(10 * 60);

fn reading_rate_limiter() -> &'static std::sync::Mutex<std::collections::HashMap<String, Vec<std::time::Instant>>> {
    static LIMITER: std::sync::OnceLock<std::sync::Mutex<std::collections::HashMap<String, Vec<std::time::Instant>>>> = std::sync::OnceLock::new();
    LIMITER.get_or_init(|| std::sync::Mutex::new(std::collections::HashMap::new()))
}

fn check_reading_rate_limit(user_id: i32) -> bool {
    let mut map = reading_rate_limiter().lock().unwrap();
    let now = std::time::Instant::now();
    let key = user_id.to_string();
    let timestamps = map.entry(key).or_insert_with(Vec::new);
    timestamps.retain(|&t| now.duration_since(t) < READING_RATE_LIMIT_WINDOW);
    if timestamps.len() >= READING_RATE_LIMIT_MAX {
        false
    } else {
        timestamps.push(now);
        true
    }
}

#[derive(Debug, Deserialize)]
struct ReadingRequest {
    names: Vec<String>,
}

#[derive(Debug, Deserialize)]
struct ReadingEntry {
    name: String,
    reading: String,
}

// キャッシュファイルへの書き込みが同時リクエストで競合しないようにするロック。
fn reading_cache_lock() -> &'static tokio::sync::Mutex<()> {
    static LOCK: std::sync::OnceLock<tokio::sync::Mutex<()>> = std::sync::OnceLock::new();
    LOCK.get_or_init(|| tokio::sync::Mutex::new(()))
}

async fn load_reading_map(path: &str) -> std::collections::HashMap<String, String> {
    match tokio::fs::read_to_string(path).await {
        Ok(content) => serde_json::from_str(&content).unwrap_or_default(),
        Err(_) => std::collections::HashMap::new(),
    }
}

// 未解決の名前について、Claude APIにひらがな読みを問い合わせる。
async fn fetch_readings_from_claude(
    names: &[String],
) -> Result<std::collections::HashMap<String, String>, String> {
    let api_key = std::env::var("ANTHROPIC_API_KEY")
        .map_err(|_| "ANTHROPIC_API_KEY is not set".to_string())?;

    let schema = serde_json::json!({
        "type": "object",
        "properties": {
            "readings": {
                "type": "array",
                "items": {
                    "type": "object",
                    "properties": {
                        "name": { "type": "string" },
                        "reading": { "type": "string" }
                    },
                    "required": ["name", "reading"],
                    "additionalProperties": false
                }
            }
        },
        "required": ["readings"],
        "additionalProperties": false
    });

    let names_json = serde_json::to_string(names).map_err(|e| e.to_string())?;

    let body = serde_json::json!({
        "model": "claude-haiku-4-5",
        "max_tokens": 4096,
        "system": "あなたは日本のライブ・イベント出演者名の読み仮名を推定するアシスタントです。渡された名前（人名・芸名・グループ名など）それぞれについて、最も一般的で自然な読み方をひらがなのみで返してください。読みが一意に定まらない場合でも、最も妥当と考えられる読みを1つ推測して返してください。nameは渡された文字列と完全に一致させてください。",
        "messages": [{
            "role": "user",
            "content": format!("次の名前それぞれの読み仮名（ひらがな）を返してください:\n{}", names_json)
        }],
        "output_config": {
            "format": {
                "type": "json_schema",
                "schema": schema
            }
        }
    });

    let client = reqwest::Client::new();
    let response = client
        .post("https://api.anthropic.com/v1/messages")
        .header("x-api-key", api_key)
        .header("anthropic-version", "2023-06-01")
        .header("content-type", "application/json")
        .json(&body)
        .send()
        .await
        .map_err(|e| format!("Anthropic API request failed: {}", e))?;

    let response_json: serde_json::Value = response
        .json()
        .await
        .map_err(|e| format!("Failed to parse Anthropic API response: {}", e))?;

    let text = response_json
        .get("content")
        .and_then(|c| c.get(0))
        .and_then(|b| b.get("text"))
        .and_then(|t| t.as_str())
        .ok_or_else(|| format!("Unexpected Anthropic API response shape: {:?}", response_json))?;

    #[derive(Deserialize)]
    struct ReadingsWrapper {
        readings: Vec<ReadingEntry>,
    }

    let parsed: ReadingsWrapper = serde_json::from_str(text)
        .map_err(|e| format!("Failed to parse readings JSON: {} (body={})", e, text))?;

    Ok(parsed
        .readings
        .into_iter()
        .map(|r| (r.name, r.reading))
        .collect())
}

// 名前のリストを受け取り、読み仮名を解決して返す。
// overrides → cache → Claude APIの順で解決し、新規に解決した分だけキャッシュに書き込む。
async fn resolve_readings(names: &[String]) -> std::collections::HashMap<String, String> {
    let overrides = load_reading_map(&reading_overrides_path()).await;

    let _guard = reading_cache_lock().lock().await;
    let cache_path = reading_cache_path();
    let mut cache = load_reading_map(&cache_path).await;

    let mut result = std::collections::HashMap::new();
    let mut unresolved: Vec<String> = Vec::new();

    for name in names {
        if let Some(reading) = overrides.get(name) {
            result.insert(name.clone(), reading.clone());
        } else if let Some(reading) = cache.get(name) {
            result.insert(name.clone(), reading.clone());
        } else {
            unresolved.push(name.clone());
        }
    }

    if !unresolved.is_empty() {
        match fetch_readings_from_claude(&unresolved).await {
            Ok(resolved) => {
                for (name, reading) in resolved {
                    cache.insert(name.clone(), reading.clone());
                    result.insert(name, reading);
                }
                if let Ok(json) = serde_json::to_string_pretty(&cache) {
                    if let Err(e) = tokio::fs::write(&cache_path, json).await {
                        eprintln!("[ResolveReadings] Failed to write cache file: {}", e);
                    }
                }
            }
            Err(e) => {
                eprintln!("[ResolveReadings] Claude API call failed: {}", e);
                // フォールバック: 解決できなかった名前はそのまま文字列を読みとして扱う
                // （文字コード順にフォールバックするだけで、エラーにはしない）
                for name in &unresolved {
                    result.insert(name.clone(), name.clone());
                }
            }
        }
    }

    result
}

// POST /reading - 出演者名リストの読み仮名を解決して返す
async fn get_readings(
    user: AuthenticatedUser,
    Json(payload): Json<ReadingRequest>,
) -> Result<Json<serde_json::Value>, (StatusCode, Json<ErrorResponse>)> {
    // 不正なリクエスト（件数・文字数超過で必ず400になるもの）でレートリミットの
    // カウントを消費しないよう、入力バリデーションをレートリミット判定より先に行う
    if payload.names.len() > READING_MAX_NAMES_PER_REQUEST {
        return Err((
            StatusCode::BAD_REQUEST,
            Json(ErrorResponse {
                error: format!("一度に指定できる名前は{}件までです", READING_MAX_NAMES_PER_REQUEST),
            }),
        ));
    }
    if payload.names.iter().any(|n| n.chars().count() > READING_MAX_NAME_LENGTH) {
        return Err((
            StatusCode::BAD_REQUEST,
            Json(ErrorResponse {
                error: format!("名前は{}文字以内で指定してください", READING_MAX_NAME_LENGTH),
            }),
        ));
    }

    if !check_reading_rate_limit(user.user_id) {
        return Err((
            StatusCode::TOO_MANY_REQUESTS,
            Json(ErrorResponse {
                error: "リクエストが多すぎます。しばらく時間をおいて再度お試しください".to_string(),
            }),
        ));
    }

    let readings = resolve_readings(&payload.names).await;
    Ok(Json(serde_json::json!({ "readings": readings })))
}

// ====== 通知機能 ======

// 通知の型定義（API用）
#[derive(Serialize, Clone)]
struct Notification {
    id: i32,
    user_id: i32,
    stay_id: i32,
    schedule_id: i32,
    title: String,
    message: String,
    is_read: bool,
    created_at: String,
}

// 通知の行定義（DB用）
#[derive(sqlx::FromRow)]
struct NotificationRow {
    id: i64,
    user_id: i64,
    stay_id: i64,
    schedule_id: i64,
    title: String,
    message: String,
    is_read: i32,
    created_at: String,
}

// NotificationRowをNotificationに変換
fn row_to_notification(row: NotificationRow) -> Notification {
    Notification {
        id: row.id as i32,
        user_id: row.user_id as i32,
        stay_id: row.stay_id as i32,
        schedule_id: row.schedule_id as i32,
        title: row.title,
        message: row.message,
        is_read: row.is_read != 0,
        created_at: row.created_at,
    }
}

// 通知一覧を取得
async fn list_notifications(
    user: AuthenticatedUser,
    Extension(pool): Extension<Pool<Sqlite>>,
) -> Result<Json<Vec<Notification>>, StatusCode> {
    let rows: Vec<NotificationRow> = sqlx::query_as(
        "SELECT id, user_id, stay_id, schedule_id, title, message, is_read, created_at FROM notifications WHERE user_id = ? ORDER BY created_at DESC"
    )
    .bind(user.user_id as i64)
    .fetch_all(&pool)
    .await
    .map_err(|e| {
        eprintln!("Error fetching notifications: {}", e);
        StatusCode::INTERNAL_SERVER_ERROR
    })?;

    Ok(Json(rows.into_iter().map(row_to_notification).collect()))
}

// 通知を既読にする
async fn mark_notification_read(
    Path(id): Path<i32>,
    user: AuthenticatedUser,
    Extension(pool): Extension<Pool<Sqlite>>,
) -> Result<Json<serde_json::Value>, StatusCode> {
    let result = sqlx::query(
        "UPDATE notifications SET is_read = 1 WHERE id = ? AND user_id = ?"
    )
    .bind(id as i64)
    .bind(user.user_id as i64)
    .execute(&pool)
    .await
    .map_err(|e| {
        eprintln!("Error marking notification as read: {}", e);
        StatusCode::INTERNAL_SERVER_ERROR
    })?;

    if result.rows_affected() == 0 {
        return Err(StatusCode::NOT_FOUND);
    }

    Ok(Json(serde_json::json!({ "success": true })))
}

#[derive(Serialize)]
struct NotificationSettings {
    email_enabled: bool,
    push_enabled: bool,
}

#[derive(Deserialize)]
struct UpdateNotificationSettingsRequest {
    email_enabled: bool,
    push_enabled: bool,
}

// 通知設定（メール／アプリのプッシュ通知）を取得
async fn get_notification_settings(
    user: AuthenticatedUser,
    Extension(pool): Extension<Pool<Sqlite>>,
) -> Result<Json<NotificationSettings>, StatusCode> {
    let row: (i32, i32) = sqlx::query_as(
        "SELECT notify_email_enabled, notify_push_enabled FROM users WHERE id = ?"
    )
    .bind(user.user_id as i64)
    .fetch_one(&pool)
    .await
    .map_err(|e| {
        eprintln!("Error fetching notification settings: {}", e);
        StatusCode::INTERNAL_SERVER_ERROR
    })?;

    Ok(Json(NotificationSettings {
        email_enabled: row.0 != 0,
        push_enabled: row.1 != 0,
    }))
}

// 通知設定（メール／アプリのプッシュ通知）を更新
async fn update_notification_settings(
    user: AuthenticatedUser,
    Extension(pool): Extension<Pool<Sqlite>>,
    Json(payload): Json<UpdateNotificationSettingsRequest>,
) -> Result<Json<NotificationSettings>, StatusCode> {
    sqlx::query(
        "UPDATE users SET notify_email_enabled = ?, notify_push_enabled = ? WHERE id = ?"
    )
    .bind(payload.email_enabled as i32)
    .bind(payload.push_enabled as i32)
    .bind(user.user_id as i64)
    .execute(&pool)
    .await
    .map_err(|e| {
        eprintln!("Error updating notification settings: {}", e);
        StatusCode::INTERNAL_SERVER_ERROR
    })?;

    Ok(Json(NotificationSettings {
        email_enabled: payload.email_enabled,
        push_enabled: payload.push_enabled,
    }))
}

#[derive(Deserialize)]
struct PushTokenRequest {
    token: String,
}

// 端末のExpoプッシュ通知トークンを登録する。既に別ユーザーに紐づくトークンだった場合は付け替える
async fn register_push_token(
    user: AuthenticatedUser,
    Extension(pool): Extension<Pool<Sqlite>>,
    Json(payload): Json<PushTokenRequest>,
) -> Result<Json<serde_json::Value>, StatusCode> {
    if payload.token.trim().is_empty() {
        return Err(StatusCode::BAD_REQUEST);
    }

    let now = Utc::now().to_rfc3339();
    sqlx::query(
        r#"
        INSERT INTO push_tokens (user_id, token, created_at, updated_at)
        VALUES (?, ?, ?, ?)
        ON CONFLICT(token) DO UPDATE SET user_id = excluded.user_id, updated_at = excluded.updated_at
        "#
    )
    .bind(user.user_id as i64)
    .bind(&payload.token)
    .bind(&now)
    .bind(&now)
    .execute(&pool)
    .await
    .map_err(|e| {
        eprintln!("Error registering push token: {}", e);
        StatusCode::INTERNAL_SERVER_ERROR
    })?;

    Ok(Json(serde_json::json!({ "success": true })))
}

// ログアウト時などに端末のプッシュ通知トークン登録を解除する
async fn delete_push_token(
    user: AuthenticatedUser,
    Extension(pool): Extension<Pool<Sqlite>>,
    Json(payload): Json<PushTokenRequest>,
) -> Result<Json<serde_json::Value>, StatusCode> {
    sqlx::query("DELETE FROM push_tokens WHERE token = ? AND user_id = ?")
        .bind(&payload.token)
        .bind(user.user_id as i64)
        .execute(&pool)
        .await
        .map_err(|e| {
            eprintln!("Error deleting push token: {}", e);
            StatusCode::INTERNAL_SERVER_ERROR
        })?;

    Ok(Json(serde_json::json!({ "success": true })))
}

// キャンセル期限が24時間以内の宿泊情報をチェックし、通知を作成・送信
async fn check_deadline_notifications(pool: &Pool<Sqlite>) -> Result<(), Box<dyn std::error::Error>> {
    let now = Utc::now();
    let one_day_later = now + chrono::Duration::hours(24);
    
    // 期限が24時間以内の宿泊情報を取得
    // deadlineは "YYYY-MM-DD HH:MM" 形式で保存されていると仮定
    let stays: Vec<(i64, i64, i64, String, String, String)> = sqlx::query_as(
        r#"
        SELECT 
            st.id,
            st.schedule_id,
            s.user_id,
            st.hotel_name,
            st.deadline,
            s.title
        FROM stays st
        INNER JOIN schedules s ON st.schedule_id = s.id
        WHERE st.deadline IS NOT NULL
          AND st.deadline != ''
          AND st.status != 'Canceled'
          AND s.user_id IS NOT NULL
        "#
    )
    .fetch_all(pool)
    .await?;
    
    for (stay_id, schedule_id, user_id, hotel_name, deadline_str, schedule_title) in stays {
        // deadlineをパース（複数の形式に対応）
        let deadline = match deadline_str.parse::<DateTime<Utc>>() {
            Ok(dt) => dt,
            Err(_) => {
                // RFC3339形式でパースできない場合は、"YYYY-MM-DD HH:MM" 形式を試す
                match chrono::NaiveDateTime::parse_from_str(&deadline_str, "%Y-%m-%d %H:%M") {
                    Ok(naive_dt) => {
                        // UTCとして扱う（実際のタイムゾーンに応じて調整が必要な場合あり）
                        DateTime::from_naive_utc_and_offset(naive_dt, Utc)
                    }
                    Err(_) => {
                        eprintln!("[DEADLINE_CHECK] Failed to parse deadline: {}", deadline_str);
                        continue;
                    }
                }
            }
        };
        
        // 期限が24時間以内かチェック
        if deadline > now && deadline <= one_day_later {
            // 通知・メール・プッシュそれぞれの送信状態を取得（重複送信を防止）
            let existing_notification: Option<(i64, Option<String>, Option<String>)> = sqlx::query_as(
                "SELECT id, email_sent_at, push_sent_at FROM notifications WHERE stay_id = ? AND user_id = ? AND created_at > datetime('now', '-1 day') ORDER BY id DESC LIMIT 1"
            )
            .bind(stay_id)
            .bind(user_id)
            .fetch_optional(pool)
            .await?;

            // ユーザーの通知設定・メールアドレス・登録済みプッシュトークンを取得
            let user_row: Option<(String, i32, i32, i32)> = sqlx::query_as(
                "SELECT email, email_verified, notify_email_enabled, notify_push_enabled FROM users WHERE id = ?"
            )
            .bind(user_id)
            .fetch_optional(pool)
            .await?;

            let Some((email, email_verified, notify_email_enabled, notify_push_enabled)) = user_row else {
                continue;
            };
            let notify_email_enabled = notify_email_enabled != 0;
            let notify_push_enabled = notify_push_enabled != 0;

            let push_tokens: Vec<String> = if notify_push_enabled {
                sqlx::query_scalar("SELECT token FROM push_tokens WHERE user_id = ?")
                    .bind(user_id)
                    .fetch_all(pool)
                    .await?
            } else {
                Vec::new()
            };

            let email_already_sent = matches!(existing_notification.as_ref(), Some((_, Some(_), _)));
            let push_already_sent = matches!(existing_notification.as_ref(), Some((_, _, Some(_))));
            let should_send_email = email_verified != 0 && notify_email_enabled && !email_already_sent;
            let should_send_push = notify_push_enabled && !push_tokens.is_empty() && !push_already_sent;

            if !should_send_email && !should_send_push && existing_notification.is_some() {
                // 両チャネルとも送信済み（または設定でOFF）で、アプリ内通知も作成済みの場合はスキップ
                continue;
            }

            let formatted_deadline = deadline
                .with_timezone(&chrono::FixedOffset::east_opt(9 * 60 * 60).expect("valid JST offset"))
                .format("%Y.%m.%d %H:%M")
                .to_string();

            // 未作成の場合のみアプリ内通知を作成する
            let notification_title = format!("キャンセル期限が近づいています: {}", hotel_name);
            let notification_message = format!("期限日時: {}\n関連イベント: {}", formatted_deadline, schedule_title);
            let created_at = Utc::now().to_rfc3339();

            let notification_id = if let Some((notification_id, _, _)) = existing_notification {
                notification_id
            } else {
                sqlx::query_scalar::<_, i64>(
                    r#"
                    INSERT INTO notifications (user_id, stay_id, schedule_id, title, message, is_read, created_at, email_sent_at, push_sent_at)
                    VALUES (?, ?, ?, ?, ?, 0, ?, NULL, NULL)
                    RETURNING id
                    "#
                )
                .bind(user_id)
                .bind(stay_id)
                .bind(schedule_id)
                .bind(&notification_title)
                .bind(&notification_message)
                .bind(&created_at)
                .fetch_one(pool)
                .await?
            };

            if should_send_email {
                // メール送信に失敗した場合はemail_sent_atを残さず、次回チェックで再試行する
                match send_deadline_notification_email(
                    &email,
                    &hotel_name,
                    &formatted_deadline,
                    &schedule_title,
                ).await {
                    Ok(()) => {
                        sqlx::query("UPDATE notifications SET email_sent_at = ? WHERE id = ?")
                            .bind(Utc::now().to_rfc3339())
                            .bind(notification_id)
                            .execute(pool)
                            .await?;
                    }
                    Err(e) => {
                        eprintln!("[DEADLINE_CHECK] Failed to send notification email; it will be retried: {:?}", e);
                    }
                }
            }

            if should_send_push {
                // Expo APIへの送信に失敗した場合はpush_sent_atを残さず、次回チェックで再試行する
                match send_expo_push_notifications(
                    pool,
                    &push_tokens,
                    &notification_title,
                    &format!("期限日時: {}", formatted_deadline),
                    schedule_id,
                ).await {
                    Ok(()) => {
                        sqlx::query("UPDATE notifications SET push_sent_at = ? WHERE id = ?")
                            .bind(Utc::now().to_rfc3339())
                            .bind(notification_id)
                            .execute(pool)
                            .await?;
                    }
                    Err(e) => {
                        eprintln!("[DEADLINE_CHECK] Failed to send push notification; it will be retried: {:?}", e);
                    }
                }
            }
        }
    }

    Ok(())
}

// ====== メイン ======

// メールアドレスからユーザーIDを取得するヘルパー関数
async fn get_user_id_by_email(pool: &Pool<Sqlite>, email: &str) -> Option<i32> {
    let result: Option<(i64,)> = sqlx::query_as("SELECT id FROM users WHERE email = ?")
        .bind(email)
        .fetch_optional(pool)
        .await
        .ok()
        .flatten();
    
    result.map(|(id,)| id as i32)
}

// データベースから最初のユーザーIDを取得するヘルパー関数
async fn get_first_user_id(pool: &Pool<Sqlite>) -> Option<i32> {
    let result: Option<(i64,)> = sqlx::query_as("SELECT id FROM users ORDER BY id LIMIT 1")
        .fetch_optional(pool)
        .await
        .ok()
        .flatten();
    
    result.map(|(id,)| id as i32)
}

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    // .envファイルから環境変数を読み込む（ローカル開発環境用）
    dotenv::dotenv().ok();
    
    println!("=== Starting application ===");
    println!("RUST_LOG: {:?}", std::env::var("RUST_LOG").ok());
    println!("DISABLE_AUTH: {:?}", std::env::var("DISABLE_AUTH").ok());

    // JWT_SECRETは認証トークンの署名鍵。未設定や既知の弱い値のまま起動すると
    // 誰でも有効なトークンを偽造できてしまうため、起動時に必ず検証する
    match std::env::var("JWT_SECRET") {
        Ok(secret) if secret.len() >= 32 && secret != "your-secret-key-change-in-production" => {}
        Ok(_) => {
            eprintln!("FATAL: JWT_SECRET is set but too short or is the known insecure default. Generate one with `openssl rand -hex 32` and set it to at least 32 characters.");
            std::process::exit(1);
        }
        Err(_) => {
            eprintln!("FATAL: JWT_SECRET environment variable is not set. Generate one with `openssl rand -hex 32` before starting the server.");
            std::process::exit(1);
        }
    }

    // データベースURL（環境変数から読み込む、未設定の場合はデフォルト値）
    // ローカル環境: sqlite://data/app.db（相対パス）
    // Fly.io環境: sqlite:///app/data/app.db（絶対パス、3つのスラッシュ）またはsqlite:/app/data/app.db（1つのコロン）
    let db_url = std::env::var("DATABASE_URL")
        .unwrap_or_else(|_| "sqlite://data/app.db".to_string());
    println!("DATABASE_URL from env: {}", db_url);
    
    // データベースファイルのパスを抽出（親ディレクトリの作成のため）
    let db_path = if db_url.starts_with("sqlite:///") {
        // 絶対パス: sqlite:///app/data/app.db -> /app/data/app.db
        let path = db_url.strip_prefix("sqlite:///").unwrap();
        if path.starts_with('/') {
            path.to_string()
        } else {
            // /で始まらない場合でも、絶対パスとして扱う（/app/data/app.db）
            format!("/{}", path)
        }
    } else if db_url.starts_with("sqlite://") {
        // 相対パス: sqlite://data/app.db -> data/app.db
        db_url.strip_prefix("sqlite://").unwrap().to_string()
    } else if db_url.starts_with("sqlite:") {
        // sqlite:形式: sqlite:/app/data/app.db -> /app/data/app.db
        let path = db_url.strip_prefix("sqlite:").unwrap();
        if path.starts_with('/') {
            path.to_string()
        } else {
            format!("/{}", path)
        }
    } else {
        db_url.clone()
    };
    
    println!("Database path: {}", db_path);
    
    // 親ディレクトリが存在することを確認し、存在しない場合は作成
    if let Some(parent_dir) = std::path::Path::new(&db_path).parent() {
        println!("Database parent directory: {:?}", parent_dir);
        if !parent_dir.exists() {
            println!("Creating database directory: {:?}", parent_dir);
            std::fs::create_dir_all(parent_dir)?;
            println!("✓ Database directory created");
        } else {
            println!("✓ Database directory exists");
        }
        
        // 書き込み権限を確認
        let test_file = parent_dir.join(".write_test");
        match std::fs::File::create(&test_file) {
            Ok(_) => {
                let _ = std::fs::remove_file(&test_file);
                println!("✓ Database directory is writable");
            }
            Err(e) => {
                return Err(format!("Database directory is not writable: {:?}, error: {}", parent_dir, e).into());
            }
        }
    }
    
    // データベースファイルが存在しない場合は、空のファイルを作成してから接続を試みる
    // これにより、SQLiteがファイルを作成できない問題を回避できる
    let db_file_path = std::path::Path::new(&db_path);
    if !db_file_path.exists() {
        println!("Database file does not exist, creating empty file...");
        match std::fs::File::create(&db_file_path) {
            Ok(_) => {
                println!("✓ Empty database file created");
            }
            Err(e) => {
                println!("⚠ Could not create empty database file: {}", e);
                println!("Will let SQLite create the file during connection");
            }
        }
    } else {
        println!("✓ Database file already exists");
    }
    
    // sqlxのSQLiteドライバーは、絶対パスに対してsqlite:形式（1つのコロン）を使用する必要がある
    // sqlite:///形式（3つのスラッシュ）は動作しない可能性がある
    let connection_url = if db_path.starts_with('/') {
        // 絶対パスの場合、sqlite:形式に変換
        format!("sqlite:{}", db_path)
    } else {
        // 相対パスの場合、元の形式を使用
        db_url.clone()
    };
    
    println!("Connection URL: {}", connection_url);
    println!("Database file path: {:?}", db_file_path);
    println!("Database file exists: {}", db_file_path.exists());
    
    // データベース接続（SQLiteがファイルを自動作成する）
    println!("Connecting to database...");
    let pool = SqlitePoolOptions::new()
        .max_connections(5)
        .connect(&connection_url)
        .await
        .map_err(|e| {
            let error_msg = format!("Failed to connect to database: {}\nOriginal URL: {}\nConnection URL: {}\nDatabase path: {}\nFile exists: {}", e, db_url, connection_url, db_path, db_file_path.exists());
            eprintln!("{}", error_msg);
            error_msg
        })?;
    
    println!("✓ Database connected successfully");
    
    // 接続後にデータベースファイルの状態を確認
    if db_file_path.exists() {
        match std::fs::metadata(db_file_path) {
            Ok(metadata) => {
                println!("✓ Database file size: {} bytes", metadata.len());
            }
            Err(e) => {
                println!("⚠ Could not read database file metadata: {}", e);
            }
        }
    } else {
        println!("⚠ Database file does not exist after connection (this should not happen)");
    }

    init_db(&pool).await.map_err(|e| {
        let error_msg = format!("Failed to initialize database: {}", e);
        println!("{}", error_msg);
        eprintln!("{}", error_msg);
        e
    })?;
    println!("Database initialized successfully");
    
    // DISABLE_AUTHが設定されていて、DEFAULT_USER_EMAILが設定されている場合、
    // メールアドレスからユーザーIDを取得してログに出力（環境変数は変更できないため）
    // 注意: このログは開発環境用なので、本番環境では出力しない
    if std::env::var("DISABLE_AUTH").is_ok() {
        if let Ok(email) = std::env::var("DEFAULT_USER_EMAIL") {
            // 本番環境ではこのログを出力しない（古いメールアドレスが表示されるのを防ぐ）
            if std::env::var("RESEND_API_KEY").is_err() {
                // 開発環境のみログ出力
                if let Some(user_id) = get_user_id_by_email(&pool, &email).await {
                    println!("[AUTH DISABLED] Found user_id={} for email: {}", user_id, email);
                    println!("[AUTH DISABLED] Please set DEFAULT_USER_ID={} environment variable", user_id);
                } else {
                    println!("[AUTH DISABLED] User not found for email: {}", email);
                }
            }
        }
    }
    
    // RESEND_API_KEYの確認（起動時にログ出力）
    match std::env::var("RESEND_API_KEY") {
        Ok(api_key) => {
            eprintln!("[STARTUP] RESEND_API_KEY is set (length: {} characters)", api_key.len());
            eprintln!("[STARTUP] Email sending will use Resend API");
        }
        Err(_) => {
            eprintln!("[STARTUP] WARNING: RESEND_API_KEY is NOT set");
            eprintln!("[STARTUP] Email sending will use development mode (console output)");
        }
    }

    // CORS設定（環境変数から許可するオリジンを読み込む）
    // 複数のオリジンをカンマ区切りで指定可能
    let allowed_origin = std::env::var("ALLOWED_ORIGIN")
        .unwrap_or_else(|_| "*".to_string());
    if allowed_origin == "*" {
        eprintln!("WARNING: ALLOWED_ORIGIN is not set (or is \"*\"), so CORS allows requests from any origin. Set ALLOWED_ORIGIN to the frontend's origin(s) in production.");
    }

    let cors = if allowed_origin == "*" {
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
    };

    let app = Router::new()
        .route("/health", get(health_check))
        .route("/contact", post(submit_contact))
        .route("/auth/register", post(register))
        .route("/auth/login", post(login))
        .route("/auth/verify-email", post(verify_email))
        .route("/auth/request-password-reset", post(request_password_reset))
        .route("/auth/reset-password", post(reset_password))
        .route("/auth/change-email", post(change_email_request))
        .route("/auth/verify-email-change", post(verify_email_change))
        .route("/auth/change-share-id", post(change_share_id))
        .route("/auth/toggle-sharing", post(toggle_sharing))
        .route("/auth/sharing-status", get(get_sharing_status))
        .route("/auth/plan-status", get(get_plan_status))
        .route("/auth/start-trial", post(start_trial))
        .route("/billing/create-checkout-session", post(create_checkout_session))
        .route("/billing/create-portal-session", post(create_portal_session))
        .route("/billing/webhook", post(stripe_webhook))
        .route("/auth/profile", get(get_profile).put(update_profile))
        .route("/auth/profile-avatar", put(update_profile_avatar))
        .route("/auth/account", delete(delete_account))
        .route("/masked-locations", get(list_masked_locations).post(create_masked_location))
        .route("/masked-locations/:id", put(update_masked_location).delete(delete_masked_location))
        .route("/share/:share_id", get(get_shared_schedules))
        .route("/share/search-user", get(search_shared_user))
        .route("/share/:share_id/profile", get(get_shared_profile))
        .route("/share/:share_id/schedules/:id", get(get_shared_schedule))
        .route("/share/:share_id/traffic", get(list_shared_traffics))
        .route("/share/:share_id/traffic/:id", get(get_shared_traffic))
        .route("/share/:share_id/select-options/:type", get(get_shared_select_options))
        .route("/share/:share_id/stay-select-options/:type", get(get_shared_stay_select_options))
        .route("/share/:share_id/stay/:id", get(get_shared_stay))
        .route("/public/schedules", get(list_public_schedules))
        .route("/public/schedules/:id", get(get_public_schedule))
        .route("/public/traffic", get(list_public_traffics))
        .route("/public/traffic/:id", get(get_public_traffic))
        .route("/public/stay", get(list_public_stays))
        .route("/public/stay/:id", get(get_public_stay))
        .route("/schedules", get(list_schedules).post(create_schedule))
        .route("/schedules/:id", put(update_schedule).delete(delete_schedule))
        .route("/schedules/upcoming", get(list_upcoming))
        .route("/traffic", get(list_traffics).post(create_traffic))
        .route("/traffic/all", get(list_all_traffics))
        .route("/traffic/:id", get(get_traffic).put(update_traffic))
        .route("/stay", get(list_stays).post(create_stay))
        .route("/stay/all", get(list_all_stays))
        .route("/stay/:id", get(get_stay).put(update_stay))
        .route("/select-options/:type", get(get_select_options).post(save_select_options))
        .route("/stay-select-options/:type", get(get_stay_select_options).post(save_stay_select_options))
        .route("/reading", post(get_readings))
        .route("/notifications", get(list_notifications))
        .route("/notifications/:id/read", put(mark_notification_read))
        .route("/notification-settings", get(get_notification_settings).put(update_notification_settings))
        .route("/push-tokens", post(register_push_token).delete(delete_push_token))
        .layer(cors)
        .layer(Extension(pool.clone()));

    // ポート番号を環境変数から読み込む（Fly.ioなどではPORT環境変数が設定される）
    let port = std::env::var("PORT")
        .unwrap_or_else(|_| "3000".to_string())
        .parse::<u16>()
        .unwrap_or(3000);
    let bind_host = std::env::var("BIND_HOST").unwrap_or_else(|_| "0.0.0.0".to_string());
    let addr: SocketAddr = format!("{}:{}", bind_host, port)
        .parse()
        .unwrap_or_else(|_| SocketAddr::from(([0, 0, 0, 0], port)));
    println!("Server running at http://{}:{}", bind_host, port);

    // バックグラウンドでキャンセル期限通知を定期的にチェック
    let pool_clone = pool.clone();
    tokio::spawn(async move {
        let mut interval = tokio::time::interval(tokio::time::Duration::from_secs(30 * 60)); // 30分ごと
        loop {
            interval.tick().await;
            eprintln!("[BACKGROUND_TASK] Checking for deadline notifications...");
            if let Err(e) = check_deadline_notifications(&pool_clone).await {
                eprintln!("[BACKGROUND_TASK] Error checking deadline notifications: {:?}", e);
            }
        }
    });

    println!("Binding to address: {}", addr);
    let listener = tokio::net::TcpListener::bind(addr).await.map_err(|e| {
        let error_msg = format!("Failed to bind to address {}: {}", addr, e);
        println!("{}", error_msg);
        eprintln!("{}", error_msg);
        e
    })?;
    println!("Server listening on {}", addr);
    
    axum::serve(listener, app.into_make_service_with_connect_info::<SocketAddr>()).await.map_err(|e| {
        let error_msg = format!("Server error: {}", e);
        println!("{}", error_msg);
        eprintln!("{}", error_msg);
        e
    })?;

    Ok(())
}
async fn init_db(pool: &Pool<Sqlite>) -> Result<(), sqlx::Error> {
    // ユーザーテーブルの作成
    let create_users = r#"
    CREATE TABLE IF NOT EXISTS users (
      id                    INTEGER PRIMARY KEY AUTOINCREMENT,
      email                 TEXT NOT NULL UNIQUE,
      password_hash         TEXT NOT NULL,
      email_verified        INTEGER NOT NULL DEFAULT 0,
      verification_token    TEXT,
      password_reset_token  TEXT,
      password_reset_expires TEXT,
      email_change_token    TEXT,
      email_change_expires  TEXT,
      new_email             TEXT,
      share_id              TEXT UNIQUE,
      sharing_enabled       INTEGER NOT NULL DEFAULT 0,
      avatar_data_url       TEXT,
      display_name          TEXT,
      created_at            TEXT,
      updated_at            TEXT
    );
    "#;
    
    // 既存のusersテーブルが古いスキーマ（user_idカラムがある）の場合は再作成
    // まず、既存のテーブル構造を確認
    let table_exists: Option<String> = sqlx::query_scalar(
        "SELECT name FROM sqlite_master WHERE type='table' AND name='users'"
    )
    .fetch_optional(pool)
    .await
    .ok()
    .flatten();
    
    if table_exists.is_some() {
        // 既存のテーブルにuser_idカラムがあるか確認
        let has_user_id: Option<String> = sqlx::query_scalar(
            "SELECT sql FROM sqlite_master WHERE type='table' AND name='users'"
        )
        .fetch_optional(pool)
        .await
        .ok()
        .flatten();
        
        // user_idカラムが存在する場合は、テーブルを再作成
        if let Some(sql) = has_user_id {
            if sql.contains("user_id") {
                println!("[INIT_DB] Old schema detected (user_id column exists), recreating users table...");
                sqlx::query("DROP TABLE IF EXISTS users")
                    .execute(pool)
                    .await
                    .ok();
                // テーブルを再作成
                sqlx::query(create_users).execute(pool).await?;
            } else {
                // 新しいカラムを追加（既存データを保持）
                let _ = sqlx::query("ALTER TABLE users ADD COLUMN email TEXT")
                    .execute(pool)
                    .await;
                let _ = sqlx::query("ALTER TABLE users ADD COLUMN email_verified INTEGER NOT NULL DEFAULT 0")
                    .execute(pool)
                    .await;
                let _ = sqlx::query("ALTER TABLE users ADD COLUMN verification_token TEXT")
                    .execute(pool)
                    .await;
                let _ = sqlx::query("ALTER TABLE users ADD COLUMN password_reset_token TEXT")
                    .execute(pool)
                    .await;
                let _ = sqlx::query("ALTER TABLE users ADD COLUMN password_reset_expires TEXT")
                    .execute(pool)
                    .await;
                // メールアドレス変更用のカラムを追加（既に存在する場合はエラーを無視）
                let _ = sqlx::query("ALTER TABLE users ADD COLUMN email_change_token TEXT")
                    .execute(pool)
                    .await;
                let _ = sqlx::query("ALTER TABLE users ADD COLUMN email_change_expires TEXT")
                    .execute(pool)
                    .await;
                let _ = sqlx::query("ALTER TABLE users ADD COLUMN new_email TEXT")
                    .execute(pool)
                    .await;
            }
        } else {
            // テーブルが存在しない場合は作成
            sqlx::query(create_users).execute(pool).await?;
        }
    } else {
        // テーブルが存在しない場合は作成
        sqlx::query(create_users).execute(pool).await?;
    }

    let create_schedules = r#"
    CREATE TABLE IF NOT EXISTS schedules (
      id           INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id      INTEGER,
      title        TEXT NOT NULL,
      "group"      TEXT,
      date         TEXT NOT NULL,
      open         TEXT,
      start        TEXT,
      "end"        TEXT,
      notes        TEXT,
      category     TEXT,
      area         TEXT NOT NULL,
      venue        TEXT NOT NULL,
      target       TEXT,
      lineup       TEXT,
      seller       TEXT,
      ticket_fee   INTEGER,
      drink_fee    INTEGER,
      total_fare   INTEGER,
      stay_fee     INTEGER,
      travel_cost  INTEGER,
      total_cost   INTEGER,
      status       TEXT NOT NULL,
      related_schedule_ids TEXT,
      is_public    INTEGER NOT NULL DEFAULT 0,
      created_at   TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
      updated_at   TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
      FOREIGN KEY (user_id) REFERENCES users(id)
    );
    "#;

    let create_traffics = r#"
    CREATE TABLE IF NOT EXISTS traffics (
      id           INTEGER PRIMARY KEY AUTOINCREMENT,
      schedule_id  INTEGER NOT NULL,
      date         TEXT NOT NULL,
      "order"      INTEGER NOT NULL,
      transportation TEXT,
      from_place   TEXT NOT NULL,
      to_place     TEXT NOT NULL,
      notes        TEXT,
      fare         INTEGER NOT NULL,
      miles        INTEGER,
      return_flag  INTEGER NOT NULL,
      total_fare   INTEGER,
      total_miles  INTEGER,
      created_at   TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
      updated_at   TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
      FOREIGN KEY (schedule_id) REFERENCES schedules(id) ON DELETE CASCADE
    );
    "#;

    let create_stays = r#"
    CREATE TABLE IF NOT EXISTS stays (
      id             INTEGER PRIMARY KEY AUTOINCREMENT,
      schedule_id    INTEGER NOT NULL,
      check_in       TEXT NOT NULL,
      check_out      TEXT NOT NULL,
      hotel_name     TEXT NOT NULL,
      website        TEXT,
      fee            INTEGER NOT NULL,
      breakfast_flag INTEGER NOT NULL,
      deadline       TEXT,
      penalty        INTEGER,
      status         TEXT NOT NULL,
      created_at     TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
      updated_at     TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
      FOREIGN KEY (schedule_id) REFERENCES schedules(id) ON DELETE CASCADE
    );
    "#;

    let create_select_options = r#"
    CREATE TABLE IF NOT EXISTS select_options (
      id           INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id      INTEGER NOT NULL,
      option_type  TEXT NOT NULL,
      options_json TEXT NOT NULL,
      created_at   TEXT,
      updated_at   TEXT,
      UNIQUE(user_id, option_type)
    );
    "#;

    let create_stay_select_options = r#"
    CREATE TABLE IF NOT EXISTS stay_select_options (
      id           INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id      INTEGER NOT NULL,
      option_type  TEXT NOT NULL,
      options_json TEXT NOT NULL,
      created_at   TEXT,
      updated_at   TEXT,
      UNIQUE(user_id, option_type)
    );
    "#;

    let create_notifications = r#"
    CREATE TABLE IF NOT EXISTS notifications (
      id           INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id      INTEGER NOT NULL,
      stay_id      INTEGER NOT NULL,
      schedule_id  INTEGER NOT NULL,
      title         TEXT NOT NULL,
      message       TEXT NOT NULL,
      is_read       INTEGER NOT NULL DEFAULT 0,
      created_at    TEXT,
      email_sent_at TEXT,
      push_sent_at  TEXT,
      FOREIGN KEY (user_id) REFERENCES users(id),
      FOREIGN KEY (stay_id) REFERENCES stays(id),
      FOREIGN KEY (schedule_id) REFERENCES schedules(id)
    );
    "#;

    // Expoのプッシュ通知トークンを保持する。1台の端末（トークン）につき1行。
    // 同じ端末で別ユーザーとしてログインし直した場合は、後勝ちでuser_idを付け替える（UNIQUE(token)）。
    let create_push_tokens = r#"
    CREATE TABLE IF NOT EXISTS push_tokens (
      id           INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id      INTEGER NOT NULL,
      token        TEXT NOT NULL UNIQUE,
      created_at   TEXT,
      updated_at   TEXT,
      FOREIGN KEY (user_id) REFERENCES users(id)
    );
    "#;

    let create_masked_locations = r#"
    CREATE TABLE IF NOT EXISTS masked_locations (
      id           INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id       INTEGER NOT NULL,
      location_name TEXT NOT NULL,
      created_at     TEXT,
      updated_at     TEXT,
      FOREIGN KEY (user_id) REFERENCES users(id),
      UNIQUE(user_id, location_name)
    );
    "#;

    // provider（'stripe' / 'google_play' / 'apple'）ごとに決済プロバイダ側のサブスクリプション状態を保持する。
    // usersのplan/premium_started_atはこのテーブルの状態からWebhook処理側で更新する想定（現時点では未配線）。
    let create_subscriptions = r#"
    CREATE TABLE IF NOT EXISTS subscriptions (
      id                        INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id                   INTEGER NOT NULL,
      provider                  TEXT NOT NULL,
      provider_customer_id      TEXT,
      provider_subscription_id  TEXT NOT NULL,
      status                    TEXT NOT NULL,
      current_period_end        TEXT,
      cancel_at_period_end      INTEGER NOT NULL DEFAULT 0,
      created_at                TEXT,
      updated_at                TEXT,
      FOREIGN KEY (user_id) REFERENCES users(id),
      UNIQUE(provider, provider_subscription_id)
    );
    "#;

    sqlx::query(create_users).execute(pool).await?;
    sqlx::query(create_schedules).execute(pool).await?;
    sqlx::query(create_traffics).execute(pool).await?;
    sqlx::query(create_stays).execute(pool).await?;
    sqlx::query(create_select_options).execute(pool).await?;
    sqlx::query(create_stay_select_options).execute(pool).await?;
    sqlx::query(create_notifications).execute(pool).await?;
    sqlx::query(create_push_tokens).execute(pool).await?;
    sqlx::query(create_masked_locations).execute(pool).await?;
    sqlx::query(create_subscriptions).execute(pool).await?;
    
    // 既存のselect_optionsテーブルからFOREIGN KEY制約を削除（マイグレーション）
    // SQLiteではALTER TABLEでFOREIGN KEY制約を削除できないため、
    // データが空の場合は、テーブルを削除して再作成（FOREIGN KEY制約なし）
    let select_options_count: Option<(i64,)> = sqlx::query_as("SELECT COUNT(*) FROM select_options")
        .fetch_optional(pool)
        .await
        .ok()
        .flatten();
    
    if select_options_count.map(|(count,)| count) == Some(0) {
        // データが空の場合は、テーブルを削除して再作成（FOREIGN KEY制約なし）
        let _ = sqlx::query("DROP TABLE IF EXISTS select_options").execute(pool).await;
        sqlx::query(create_select_options).execute(pool).await?;
        eprintln!("[Migration] Recreated select_options table without FOREIGN KEY constraint");
    }

    // 既存のschedulesテーブルにuser_idとis_publicカラムを追加（マイグレーション）
    // SQLiteではALTER TABLE ADD COLUMNがサポートされているが、既に存在する場合はエラーになる
    // そのため、エラーを無視する
    let _ = sqlx::query("ALTER TABLE schedules ADD COLUMN user_id INTEGER")
        .execute(pool)
        .await;
    let _ = sqlx::query("ALTER TABLE schedules ADD COLUMN is_public INTEGER NOT NULL DEFAULT 0")
        .execute(pool)
        .await;
    
    // 既存のusersテーブルにshare_idとsharing_enabledカラムを追加（マイグレーション）
    let _ = sqlx::query("ALTER TABLE users ADD COLUMN share_id TEXT UNIQUE")
        .execute(pool)
        .await;
    let _ = sqlx::query("ALTER TABLE users ADD COLUMN sharing_enabled INTEGER NOT NULL DEFAULT 0")
        .execute(pool)
        .await;
    let _ = sqlx::query("ALTER TABLE users ADD COLUMN avatar_data_url TEXT")
        .execute(pool)
        .await;
    let _ = sqlx::query("ALTER TABLE users ADD COLUMN display_name TEXT")
        .execute(pool)
        .await;
    
    // 既存のstaysテーブルにwebsiteカラムを追加（マイグレーション）
    let _ = sqlx::query("ALTER TABLE stays ADD COLUMN website TEXT")
        .execute(pool)
        .await;
    
    // 既存のselect_optionsテーブルにsort_orderカラムを追加（マイグレーション）
    let _ = sqlx::query("ALTER TABLE select_options ADD COLUMN sort_order TEXT DEFAULT 'custom'")
        .execute(pool)
        .await;

    // 既存のnotificationsテーブルが存在しない場合は作成（マイグレーション）
    let notifications_table_exists: Option<String> = sqlx::query_scalar(
        "SELECT name FROM sqlite_master WHERE type='table' AND name='notifications'"
    )
    .fetch_optional(pool)
    .await
    .ok()
    .flatten();
    
    if notifications_table_exists.is_none() {
        sqlx::query(create_notifications).execute(pool).await?;
        eprintln!("[Migration] Created notifications table");
    }

    let notification_email_column_exists: i64 = sqlx::query_scalar(
        "SELECT COUNT(*) FROM pragma_table_info('notifications') WHERE name = 'email_sent_at'"
    )
    .fetch_one(pool)
    .await?;

    if notification_email_column_exists == 0 {
        sqlx::query("ALTER TABLE notifications ADD COLUMN email_sent_at TEXT")
            .execute(pool)
            .await?;
        // 旧実装で作成済みの通知はメール送信済みの可能性があるため再送しない
        sqlx::query("UPDATE notifications SET email_sent_at = created_at WHERE email_sent_at IS NULL")
            .execute(pool)
            .await?;
        eprintln!("[Migration] Added notifications.email_sent_at column");
    }

    if !column_exists(pool, "notifications", "push_sent_at").await? {
        sqlx::query("ALTER TABLE notifications ADD COLUMN push_sent_at TEXT")
            .execute(pool)
            .await?;
        // 旧実装で作成済みの通知はプッシュ通知機能が存在しなかったため再送不要
        sqlx::query("UPDATE notifications SET push_sent_at = created_at WHERE push_sent_at IS NULL")
            .execute(pool)
            .await?;
        eprintln!("[Migration] Added notifications.push_sent_at column");
    }

    // targetカラムがNULL許可であることを確認（既存のデータベース用マイグレーション）
    // SQLiteではALTER TABLE MODIFY COLUMNがサポートされていないため、
    // 既存のテーブルを再作成する必要があるが、データ損失を避けるため、
    // ここでは空文字列をNULLに変換する処理のみ実行
    // 注意: targetカラムは既にTEXT（NULL許可）として定義されているため、
    // 既存のデータベースでも問題なく動作するはずですが、念のため空文字列をNULLに変換
    let _ = sqlx::query(
        r#"
        UPDATE schedules
        SET target = NULL
        WHERE target = ''
        "#
    )
    .execute(pool)
    .await;

    // dateカラムをNOT NULLに変更（既存のデータベース用マイグレーション）
    // date未設定のレコードはどのスケジュール一覧からも参照できず、
    // データが埋もれてしまうため、NOT NULL制約を追加する
    // SQLiteではALTER TABLE MODIFY COLUMNがサポートされていないため、
    // テーブルを再作成して制約を反映する
    let date_not_null: i64 = sqlx::query_scalar(
        "SELECT \"notnull\" FROM pragma_table_info('schedules') WHERE name = 'date'"
    )
    .fetch_one(pool)
    .await?;

    if date_not_null == 0 {
        let null_date_count: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM schedules WHERE date IS NULL")
            .fetch_one(pool)
            .await?;

        if null_date_count == 0 {
            // traffics/staysがschedulesを外部キー参照しているため、
            // foreign_keysを一時的に無効化した上で同一コネクション内で再作成する
            // (SQLite公式手順: https://www.sqlite.org/lang_altertable.html#otheralter)
            let mut conn = pool.acquire().await?;
            sqlx::query("PRAGMA foreign_keys = OFF")
                .execute(&mut *conn)
                .await?;

            let mut tx = conn.begin().await?;
            sqlx::query(
                r#"
                CREATE TABLE schedules_new (
                  id           INTEGER PRIMARY KEY AUTOINCREMENT,
                  user_id      INTEGER,
                  title        TEXT NOT NULL,
                  "group"      TEXT,
                  date         TEXT NOT NULL,
                  open         TEXT,
                  start        TEXT,
                  "end"        TEXT,
                  notes        TEXT,
                  category     TEXT,
                  area         TEXT NOT NULL,
                  venue        TEXT NOT NULL,
                  target       TEXT,
                  lineup       TEXT,
                  seller       TEXT,
                  ticket_fee   INTEGER,
                  drink_fee    INTEGER,
                  total_fare   INTEGER,
                  stay_fee     INTEGER,
                  travel_cost  INTEGER,
                  total_cost   INTEGER,
                  status       TEXT NOT NULL,
                  related_schedule_ids TEXT,
                  is_public    INTEGER NOT NULL DEFAULT 0,
                  created_at   TEXT,
                  updated_at   TEXT,
                  FOREIGN KEY (user_id) REFERENCES users(id)
                )
                "#
            )
            .execute(&mut *tx)
            .await?;
            sqlx::query(
                r#"
                INSERT INTO schedules_new (
                  id, user_id, title, "group", date, open, start, "end", notes, category,
                  area, venue, target, lineup, seller, ticket_fee, drink_fee, total_fare,
                  stay_fee, travel_cost, total_cost, status, related_schedule_ids, is_public,
                  created_at, updated_at
                )
                SELECT
                  id, user_id, title, "group", date, open, start, "end", notes, category,
                  area, venue, target, lineup, seller, ticket_fee, drink_fee, total_fare,
                  stay_fee, travel_cost, total_cost, status, related_schedule_ids, is_public,
                  created_at, updated_at
                FROM schedules
                "#
            )
            .execute(&mut *tx)
            .await?;
            sqlx::query("DROP TABLE schedules").execute(&mut *tx).await?;
            sqlx::query("ALTER TABLE schedules_new RENAME TO schedules")
                .execute(&mut *tx)
                .await?;
            tx.commit().await?;

            sqlx::query("PRAGMA foreign_keys = ON")
                .execute(&mut *conn)
                .await?;

            let fk_violations: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM pragma_foreign_key_check")
                .fetch_one(&mut *conn)
                .await?;
            if fk_violations > 0 {
                eprintln!("[Migration] WARNING: {} foreign key violations detected after schedules.date migration", fk_violations);
            }

            eprintln!("[Migration] schedules.date is now NOT NULL");
        } else {
            eprintln!(
                "[Migration] WARNING: {} schedules have NULL date; skipping NOT NULL migration until they are fixed",
                null_date_count
            );
        }
    }

    // schedules.created_at/updated_atにDEFAULTを設定する（既存のデータベース用マイグレーション）
    // これまではアプリケーション側で都度INSERT時に値をセットしていたが、
    // DB側にもDEFAULTを持たせることで、セットし忘れた場合の保険とする
    let schedules_created_at_default: Option<String> = sqlx::query_scalar(
        "SELECT dflt_value FROM pragma_table_info('schedules') WHERE name = 'created_at'"
    )
    .fetch_one(pool)
    .await?;

    if schedules_created_at_default.is_none() {
        // dateがNOT NULLになっているかは、上のマイグレーションがNULLレコードの存在で
        // スキップされている可能性があるため、ここで改めて現在の状態を確認する。
        // 決め打ちで「date TEXT NOT NULL」として再作成すると、NULLのdateが残っている
        // 既存DBではこのテーブル再作成時のINSERTでNOT NULL制約違反となり、
        // アプリの起動（DB初期化）ごと失敗してしまう。
        let date_currently_not_null: i64 = sqlx::query_scalar(
            "SELECT \"notnull\" FROM pragma_table_info('schedules') WHERE name = 'date'"
        )
        .fetch_one(pool)
        .await?;
        let date_column_ddl = if date_currently_not_null != 0 {
            "TEXT NOT NULL"
        } else {
            "TEXT"
        };

        let mut conn = pool.acquire().await?;
        sqlx::query("PRAGMA foreign_keys = OFF")
            .execute(&mut *conn)
            .await?;

        let mut tx = conn.begin().await?;
        sqlx::query(&format!(
            r#"
            CREATE TABLE schedules_new (
              id           INTEGER PRIMARY KEY AUTOINCREMENT,
              user_id      INTEGER,
              title        TEXT NOT NULL,
              "group"      TEXT,
              date         {date_column_ddl},
              open         TEXT,
              start        TEXT,
              "end"        TEXT,
              notes        TEXT,
              category     TEXT,
              area         TEXT NOT NULL,
              venue        TEXT NOT NULL,
              target       TEXT,
              lineup       TEXT,
              seller       TEXT,
              ticket_fee   INTEGER,
              drink_fee    INTEGER,
              total_fare   INTEGER,
              stay_fee     INTEGER,
              travel_cost  INTEGER,
              total_cost   INTEGER,
              status       TEXT NOT NULL,
              related_schedule_ids TEXT,
              is_public    INTEGER NOT NULL DEFAULT 0,
              created_at   TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
              updated_at   TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
              FOREIGN KEY (user_id) REFERENCES users(id)
            )
            "#
        ))
        .execute(&mut *tx)
        .await?;
        sqlx::query(
            r#"
            INSERT INTO schedules_new (
              id, user_id, title, "group", date, open, start, "end", notes, category,
              area, venue, target, lineup, seller, ticket_fee, drink_fee, total_fare,
              stay_fee, travel_cost, total_cost, status, related_schedule_ids, is_public,
              created_at, updated_at
            )
            SELECT
              id, user_id, title, "group", date, open, start, "end", notes, category,
              area, venue, target, lineup, seller, ticket_fee, drink_fee, total_fare,
              stay_fee, travel_cost, total_cost, status, related_schedule_ids, is_public,
              created_at, updated_at
            FROM schedules
            "#
        )
        .execute(&mut *tx)
        .await?;
        sqlx::query("DROP TABLE schedules").execute(&mut *tx).await?;
        sqlx::query("ALTER TABLE schedules_new RENAME TO schedules")
            .execute(&mut *tx)
            .await?;
        tx.commit().await?;

        sqlx::query("PRAGMA foreign_keys = ON")
            .execute(&mut *conn)
            .await?;

        let fk_violations: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM pragma_foreign_key_check")
            .fetch_one(&mut *conn)
            .await?;
        if fk_violations > 0 {
            eprintln!("[Migration] WARNING: {} foreign key violations detected after schedules created_at/updated_at migration", fk_violations);
        }

        eprintln!("[Migration] schedules.created_at/updated_at now have DB-level defaults");
    }

    // traffics.schedule_idにON DELETE CASCADEを追加し、created_at/updated_atにDEFAULTを設定する
    // （既存のデータベース用マイグレーション）
    // これまではスケジュール削除時にアプリケーション側で明示的にtraffics/staysを削除していたが、
    // DB側の外部キー制約にCASCADEを持たせることで、削除経路が増えても消し漏れが起きないようにする
    let traffics_on_delete: Option<String> = sqlx::query_scalar(
        "SELECT \"on_delete\" FROM pragma_foreign_key_list('traffics') WHERE \"table\" = 'schedules' AND \"from\" = 'schedule_id'"
    )
    .fetch_optional(pool)
    .await?;

    if traffics_on_delete.as_deref() != Some("CASCADE") {
        let mut conn = pool.acquire().await?;
        sqlx::query("PRAGMA foreign_keys = OFF")
            .execute(&mut *conn)
            .await?;

        let mut tx = conn.begin().await?;
        sqlx::query(
            r#"
            CREATE TABLE traffics_new (
              id           INTEGER PRIMARY KEY AUTOINCREMENT,
              schedule_id  INTEGER NOT NULL,
              date         TEXT NOT NULL,
              "order"      INTEGER NOT NULL,
              transportation TEXT,
              from_place   TEXT NOT NULL,
              to_place     TEXT NOT NULL,
              notes        TEXT,
              fare         INTEGER NOT NULL,
              miles        INTEGER,
              return_flag  INTEGER NOT NULL,
              total_fare   INTEGER,
              total_miles  INTEGER,
              created_at   TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
              updated_at   TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
              FOREIGN KEY (schedule_id) REFERENCES schedules(id) ON DELETE CASCADE
            )
            "#
        )
        .execute(&mut *tx)
        .await?;
        sqlx::query(
            r#"
            INSERT INTO traffics_new (
              id, schedule_id, date, "order", transportation, from_place, to_place, notes,
              fare, miles, return_flag, total_fare, total_miles, created_at, updated_at
            )
            SELECT
              id, schedule_id, date, "order", transportation, from_place, to_place, notes,
              fare, miles, return_flag, total_fare, total_miles, created_at, updated_at
            FROM traffics
            "#
        )
        .execute(&mut *tx)
        .await?;
        sqlx::query("DROP TABLE traffics").execute(&mut *tx).await?;
        sqlx::query("ALTER TABLE traffics_new RENAME TO traffics")
            .execute(&mut *tx)
            .await?;
        tx.commit().await?;

        sqlx::query("PRAGMA foreign_keys = ON")
            .execute(&mut *conn)
            .await?;

        let fk_violations: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM pragma_foreign_key_check")
            .fetch_one(&mut *conn)
            .await?;
        if fk_violations > 0 {
            eprintln!("[Migration] WARNING: {} foreign key violations detected after traffics CASCADE migration", fk_violations);
        }

        eprintln!("[Migration] traffics.schedule_id now has ON DELETE CASCADE");
    }

    // stays.schedule_idにON DELETE CASCADEを追加し、created_at/updated_atにDEFAULTを設定する
    // （既存のデータベース用マイグレーション、traffics側と同様の理由）
    let stays_on_delete: Option<String> = sqlx::query_scalar(
        "SELECT \"on_delete\" FROM pragma_foreign_key_list('stays') WHERE \"table\" = 'schedules' AND \"from\" = 'schedule_id'"
    )
    .fetch_optional(pool)
    .await?;

    if stays_on_delete.as_deref() != Some("CASCADE") {
        let mut conn = pool.acquire().await?;
        sqlx::query("PRAGMA foreign_keys = OFF")
            .execute(&mut *conn)
            .await?;

        let mut tx = conn.begin().await?;
        sqlx::query(
            r#"
            CREATE TABLE stays_new (
              id             INTEGER PRIMARY KEY AUTOINCREMENT,
              schedule_id    INTEGER NOT NULL,
              check_in       TEXT NOT NULL,
              check_out      TEXT NOT NULL,
              hotel_name     TEXT NOT NULL,
              website        TEXT,
              fee            INTEGER NOT NULL,
              breakfast_flag INTEGER NOT NULL,
              deadline       TEXT,
              penalty        INTEGER,
              status         TEXT NOT NULL,
              created_at     TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
              updated_at     TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
              FOREIGN KEY (schedule_id) REFERENCES schedules(id) ON DELETE CASCADE
            )
            "#
        )
        .execute(&mut *tx)
        .await?;
        sqlx::query(
            r#"
            INSERT INTO stays_new (
              id, schedule_id, check_in, check_out, hotel_name, website, fee, breakfast_flag,
              deadline, penalty, status, created_at, updated_at
            )
            SELECT
              id, schedule_id, check_in, check_out, hotel_name, website, fee, breakfast_flag,
              deadline, penalty, status, created_at, updated_at
            FROM stays
            "#
        )
        .execute(&mut *tx)
        .await?;
        sqlx::query("DROP TABLE stays").execute(&mut *tx).await?;
        sqlx::query("ALTER TABLE stays_new RENAME TO stays")
            .execute(&mut *tx)
            .await?;
        tx.commit().await?;

        sqlx::query("PRAGMA foreign_keys = ON")
            .execute(&mut *conn)
            .await?;

        let fk_violations: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM pragma_foreign_key_check")
            .fetch_one(&mut *conn)
            .await?;
        if fk_violations > 0 {
            eprintln!("[Migration] WARNING: {} foreign key violations detected after stays CASCADE migration", fk_violations);
        }

        eprintln!("[Migration] stays.schedule_id now has ON DELETE CASCADE");
    }

    // 公開URL・共有URLで内部連番の代わりに使う推測困難なランダムIDカラムを追加（マイグレーション）
    // テーブル再作成（上記のCASCADE等）でカラムごと失われるため、必ず再作成マイグレーションより後に実行する
    // SQLiteはALTER TABLE ADD COLUMNにUNIQUE制約を直接付けられないため、
    // 素のカラムを追加してから別途UNIQUE INDEXで一意性を担保する
    // （既に列が存在する場合のみスキップし、それ以外のDBエラーはmigration失敗として伝播させる）
    for table in ["schedules", "traffics", "stays"] {
        if !column_exists(pool, table, "public_id").await? {
            sqlx::query(&format!("ALTER TABLE {} ADD COLUMN public_id TEXT", table))
                .execute(pool)
                .await?;
        }
    }

    sqlx::query("CREATE UNIQUE INDEX IF NOT EXISTS idx_schedules_public_id ON schedules(public_id) WHERE public_id IS NOT NULL")
        .execute(pool)
        .await?;
    sqlx::query("CREATE UNIQUE INDEX IF NOT EXISTS idx_traffics_public_id ON traffics(public_id) WHERE public_id IS NOT NULL")
        .execute(pool)
        .await?;
    sqlx::query("CREATE UNIQUE INDEX IF NOT EXISTS idx_stays_public_id ON stays(public_id) WHERE public_id IS NOT NULL")
        .execute(pool)
        .await?;

    backfill_public_ids(pool, "schedules").await?;
    backfill_public_ids(pool, "traffics").await?;
    backfill_public_ids(pool, "stays").await?;

    // 有料プラン（premium）と1ヶ月お試し期間の管理用カラムを追加（マイグレーション）
    // trial_ends_atは持たず、trial_started_at + 1ヶ月を都度計算して判定する（has_paid_accessを参照）
    if !column_exists(pool, "users", "plan").await? {
        sqlx::query("ALTER TABLE users ADD COLUMN plan TEXT NOT NULL DEFAULT 'free'")
            .execute(pool)
            .await?;
    }
    if !column_exists(pool, "users", "premium_started_at").await? {
        sqlx::query("ALTER TABLE users ADD COLUMN premium_started_at TEXT")
            .execute(pool)
            .await?;
    }
    if !column_exists(pool, "users", "trial_used").await? {
        sqlx::query("ALTER TABLE users ADD COLUMN trial_used INTEGER NOT NULL DEFAULT 0")
            .execute(pool)
            .await?;
    }
    if !column_exists(pool, "users", "trial_started_at").await? {
        sqlx::query("ALTER TABLE users ADD COLUMN trial_started_at TEXT")
            .execute(pool)
            .await?;
    }

    // 通知設定（メール／アプリのプッシュ通知）。デフォルトは両方ON（従来のメール通知のみの挙動を維持しつつ拡張）
    if !column_exists(pool, "users", "notify_email_enabled").await? {
        sqlx::query("ALTER TABLE users ADD COLUMN notify_email_enabled INTEGER NOT NULL DEFAULT 1")
            .execute(pool)
            .await?;
    }
    if !column_exists(pool, "users", "notify_push_enabled").await? {
        sqlx::query("ALTER TABLE users ADD COLUMN notify_push_enabled INTEGER NOT NULL DEFAULT 1")
            .execute(pool)
            .await?;
    }

    // パフォーマンス向上のためのインデックス追加
    // CREATE INDEX IF NOT EXISTSのため、テーブル再作成が発生した場合でも安全に再実行できる
    // (テーブル再作成を伴うマイグレーションより後、init_dbの最後で必ず実行する)
    sqlx::query("CREATE INDEX IF NOT EXISTS idx_schedules_date ON schedules(date)")
        .execute(pool)
        .await?;
    sqlx::query("CREATE INDEX IF NOT EXISTS idx_schedules_status ON schedules(status)")
        .execute(pool)
        .await?;
    sqlx::query("CREATE INDEX IF NOT EXISTS idx_traffics_schedule_id ON traffics(schedule_id)")
        .execute(pool)
        .await?;
    sqlx::query("CREATE INDEX IF NOT EXISTS idx_stays_schedule_id ON stays(schedule_id)")
        .execute(pool)
        .await?;
    sqlx::query("CREATE INDEX IF NOT EXISTS idx_subscriptions_user_id ON subscriptions(user_id)")
        .execute(pool)
        .await?;

    // updated_atをDBトリガーで自動更新する
    // アプリケーション側でupdated_atのセットを忘れた場合でも、UPDATEが実行されれば
    // 必ず最新時刻が反映されるようにする
    // (テーブル再作成を伴うマイグレーションより後、init_dbの最後で必ず実行する。
    //  SQLiteのrecursive_triggersはデフォルトOFFのため、トリガー内のUPDATEが
    //  自分自身を再度発火させることはない)
    sqlx::query(
        r#"
        CREATE TRIGGER IF NOT EXISTS trg_schedules_updated_at
        AFTER UPDATE ON schedules
        FOR EACH ROW
        BEGIN
          UPDATE schedules SET updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = NEW.id;
        END;
        "#
    )
    .execute(pool)
    .await?;
    sqlx::query(
        r#"
        CREATE TRIGGER IF NOT EXISTS trg_traffics_updated_at
        AFTER UPDATE ON traffics
        FOR EACH ROW
        BEGIN
          UPDATE traffics SET updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = NEW.id;
        END;
        "#
    )
    .execute(pool)
    .await?;
    sqlx::query(
        r#"
        CREATE TRIGGER IF NOT EXISTS trg_stays_updated_at
        AFTER UPDATE ON stays
        FOR EACH ROW
        BEGIN
          UPDATE stays SET updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = NEW.id;
        END;
        "#
    )
    .execute(pool)
    .await?;

    Ok(())
}
