// モジュール宣言
mod lib;
mod config;
mod database;
mod utils;
mod auth;
mod schedules;
mod traffic;
mod stays;
mod shared;
mod select_options;
mod masked_locations;
mod notifications;

#[allow(unused_imports)]
use axum::{
    extract::{Extension, Path, Query},
    http::{header::AUTHORIZATION, HeaderValue, StatusCode, HeaderMap, request::Parts},
    response::Json,
    routing::{get, post, put, delete}, // delete is used in route definitions (line 5269)
    Router,
};
use axum::async_trait;
use chrono::{DateTime, Datelike, Utc};
use jsonwebtoken::{decode, encode, DecodingKey, EncodingKey, Header, Validation};
use rand::Rng;
use serde::{Deserialize, Serialize};
use sqlx::sqlite::SqlitePoolOptions;
use sqlx::{Pool, Sqlite};
use std::net::SocketAddr;
use tower_http::cors::{Any, AllowOrigin, CorsLayer};
use resend_rs::types::CreateEmailBaseOptions;
use resend_rs::{Resend, Result};

// モジュールのインポート
use crate::lib::ErrorResponse;
use crate::config::create_cors_layer;
use crate::database::{create_pool, init_db};
use crate::auth::{AuthenticatedUser, register, login, verify_email, request_password_reset, reset_password, change_email_request, verify_email_change, change_share_id, toggle_sharing, get_sharing_status};
use crate::schedules::types::{Schedule, ScheduleRow, ScheduleQuery};
use crate::schedules::handlers::{calculate_rollup, list_schedules, list_upcoming, create_schedule, update_schedule, delete_schedule, get_shared_schedules, get_shared_schedule};
use crate::traffic::handlers::{list_traffics, list_all_traffics, create_traffic, get_traffic, update_traffic, get_shared_traffic, list_public_traffics, get_public_traffic};
use crate::stays::handlers::{list_stays, list_all_stays, create_stay, get_stay, update_stay, get_shared_stay, list_public_stays, get_public_stay};
use crate::shared::handlers::{list_public_schedules, get_public_schedule};
use crate::select_options::handlers::{get_select_options, save_select_options, get_shared_select_options, get_stay_select_options, save_stay_select_options, get_shared_stay_select_options, get_user_id_by_email};
use crate::masked_locations::handlers::{list_masked_locations, create_masked_location, update_masked_location, delete_masked_location, get_masked_locations_for_user};
use crate::notifications::handlers::{list_notifications, mark_notification_read, check_deadline_notifications};

// 認証関連の型定義は auth モジュールに移動しました

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

// JWT秘密鍵（環境変数から読み込む、未設定の場合はデフォルト値）
fn get_jwt_secret() -> String {
    std::env::var("JWT_SECRET")
        .unwrap_or_else(|_| "your-secret-key-change-in-production".to_string())
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

// 認証関連の関数は auth モジュールに移動しました

// 通知機能で使用するメール送信関数（通知モジュールに移動予定）
async fn send_deadline_notification_email(
    email: &str,
    hotel_name: &str,
    deadline: &str,
    schedule_title: &str,
) -> Result<(), Box<dyn std::error::Error>> {
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
    let from = "onboarding@resend.dev";
    let to = [email];
    let subject = "キャンセル期限が近づいています";
    
    let email_options = CreateEmailBaseOptions::new(from, to, subject)
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

// 認証関連の関数と型定義は auth モジュールに移動しました
// スケジュール関連の型定義は schedules::types モジュールに移動しました
// ====== Row → API 用への変換 ======
// row_to_schedule は schedules::types::row_to_schedule を使用




// ====== マスク処理ヘルパー ======

// ユーザーのマスク設定を取得


// ====== ハンドラ ======

async fn health_check() -> &'static str {
    "OK"
}

// 認証関連の関数は auth::handlers モジュールに移動しました


// POST /masked-locations - マスク設定追加

// PUT /masked-locations/:id - マスク設定更新

// DELETE /masked-locations/:id - マスク設定削除

// ====== Schedule API ======

// POST /schedules

// PUT /schedules/:id

// DELETE /schedules/:id

// GET /public/schedules - 公開されているスケジュール一覧
// DISABLE_AUTHが設定されている場合、DEFAULT_USER_IDのスケジュールも返す

// GET /public/schedules/:id - 公開されているスケジュール詳細
// DISABLE_AUTHが設定されている場合、全てのスケジュールを返す

// GET /public/traffic?schedule_id=... - 公開スケジュールの交通情報
// DISABLE_AUTHが設定されている場合、全てのスケジュールの交通情報を返す

// GET /public/stay?schedule_id=... - 公開スケジュールの宿泊情報
// DISABLE_AUTHが設定されている場合、全てのスケジュールの宿泊情報を返す

// GET /public/traffic/:id - 公開スケジュールの交通情報（個別）

// GET /public/stay/:id - 公開スケジュールの宿泊情報（個別）

// GET /share/:share_id/traffic/:id - 共有ページ用の交通情報（個別）

// GET /share/:share_id/stay/:id - 共有ページ用の宿泊情報（個別）

// GET /traffic?schedule_id=...

// GET /traffic/:id

// POST /traffic

// PUT /traffic/:id

// GET /traffic/all - ユーザーが所有するすべてのTrafficを取得

// GET /stay/all - ユーザーが所有するすべてのStayを取得

// GET /stay?schedule_id=...

// GET /stay/:id

// POST /stay

// PUT /stay/:id


// GET /select-options/:type - 選択肢を取得

// POST /select-options/:type - 選択肢を保存

// GET /share/:share_id/select-options/:type - 共有ページ用の選択肢を取得（認証不要）

// GET /share/:share_id/stay-select-options/:type - 共有ページ用のホテル選択肢を取得（認証不要）

// GET /stay-select-options/:type - ホテル用選択肢を取得

// POST /stay-select-options/:type - ホテル用選択肢を保存

// キャンセル期限が24時間以内の宿泊情報をチェックし、通知を作成・送信

// ====== メイン ======

// メールアドレスからユーザーIDを取得するヘルパー関数

// データベースから最初のユーザーIDを取得するヘルパー関数

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    // .envファイルから環境変数を読み込む（ローカル開発環境用）
    dotenv::dotenv().ok();
    
    println!("=== Starting application ===");
    println!("RUST_LOG: {:?}", std::env::var("RUST_LOG").ok());
    println!("DISABLE_AUTH: {:?}", std::env::var("DISABLE_AUTH").ok());
    
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

    // CORS設定
    let cors = create_cors_layer();

    // 一時的なエンドポイント：SQLダンプを実行（データベースのコピー用）
    // 注意: 本番環境では削除すること
    async fn import_database_dump(
        Extension(pool): Extension<Pool<Sqlite>>,
        Json(payload): Json<serde_json::Value>,
    ) -> Result<Json<serde_json::Value>, (StatusCode, Json<ErrorResponse>)> {
        // DISABLE_AUTHが設定されている場合のみ実行可能
        if std::env::var("DISABLE_AUTH").is_err() {
            return Err((
                StatusCode::FORBIDDEN,
                Json(ErrorResponse {
                    error: "This endpoint is only available when DISABLE_AUTH is set".to_string(),
                }),
            ));
        }
        
        let sql_dump = payload.get("sql").and_then(|v| v.as_str()).ok_or((
            StatusCode::BAD_REQUEST,
            Json(ErrorResponse {
                error: "Missing 'sql' field in request body".to_string(),
            }),
        ))?;
        
        // SQLダンプを実行（複数のステートメントを分割）
        // 各行を処理し、空行やコメントをスキップ
        let statements: Vec<String> = sql_dump
            .lines()
            .map(|s| s.trim())
            .filter(|s| !s.is_empty() && !s.starts_with("--") && !s.starts_with("PRAGMA"))
            .collect::<Vec<_>>()
            .join("\n")
            .split(';')
            .map(|s| s.trim().to_string())
            .filter(|s| !s.is_empty() && !s.starts_with("BEGIN") && !s.starts_with("COMMIT"))
            .collect();
        
        println!("[IMPORT DB] Found {} SQL statements to execute", statements.len());
        let mut executed = 0;
        let mut errors = 0;
        for (i, statement) in statements.iter().enumerate() {
            if statement.is_empty() {
                continue;
            }
            // 最初の100文字だけをログに出力
            let preview = if statement.len() > 100 {
                format!("{}...", &statement[..100])
            } else {
                statement.clone()
            };
            match sqlx::query(statement).execute(&pool).await {
                Ok(_) => {
                    executed += 1;
                    if executed <= 5 || executed % 10 == 0 {
                        println!("[IMPORT DB] Executed statement {}/{}: {}", executed, statements.len(), preview);
                    }
                }
                Err(e) => {
                    errors += 1;
                    eprintln!("[IMPORT DB] Error executing statement {}: {} - Error: {}", i + 1, preview, e);
                }
            }
        }
        
        println!("[IMPORT DB] Import completed: {} executed, {} errors", executed, errors);
        
        Ok(Json(serde_json::json!({
            "success": true,
            "executed": executed
        })))
    }
    
    // 一時的なエンドポイント：ID 14より前のスケジュールを削除
    // 注意: 本番環境では削除すること
    async fn delete_old_schedules(
        Extension(pool): Extension<Pool<Sqlite>>,
    ) -> Result<Json<serde_json::Value>, (StatusCode, Json<ErrorResponse>)> {
        // DISABLE_AUTHが設定されている場合のみ実行可能
        if std::env::var("DISABLE_AUTH").is_err() {
            return Err((
                StatusCode::FORBIDDEN,
                Json(ErrorResponse {
                    error: "This endpoint is only available when DISABLE_AUTH is set".to_string(),
                }),
            ));
        }
        
        println!("[DELETE OLD] Deleting schedules with id < 15");
        
        // 関連するtrafficsを削除
        let traffics_deleted = sqlx::query("DELETE FROM traffics WHERE schedule_id < 15")
            .execute(&pool)
            .await
            .map_err(|e| {
                (
                    StatusCode::INTERNAL_SERVER_ERROR,
                    Json(ErrorResponse {
                        error: format!("Failed to delete traffics: {}", e),
                    }),
                )
            })?;
        
        // 関連するstaysを削除
        let stays_deleted = sqlx::query("DELETE FROM stays WHERE schedule_id < 15")
            .execute(&pool)
            .await
            .map_err(|e| {
                (
                    StatusCode::INTERNAL_SERVER_ERROR,
                    Json(ErrorResponse {
                        error: format!("Failed to delete stays: {}", e),
                    }),
                )
            })?;
        
        // スケジュールを削除
        let schedules_deleted = sqlx::query("DELETE FROM schedules WHERE id < 15")
            .execute(&pool)
            .await
            .map_err(|e| {
                (
                    StatusCode::INTERNAL_SERVER_ERROR,
                    Json(ErrorResponse {
                        error: format!("Failed to delete schedules: {}", e),
                    }),
                )
            })?;
        
        println!("[DELETE OLD] Deleted: {} schedules, {} traffics, {} stays", 
            schedules_deleted.rows_affected(),
            traffics_deleted.rows_affected(),
            stays_deleted.rows_affected()
        );
        
        Ok(Json(serde_json::json!({
            "success": true,
            "schedules_deleted": schedules_deleted.rows_affected(),
            "traffics_deleted": traffics_deleted.rows_affected(),
            "stays_deleted": stays_deleted.rows_affected()
        })))
    }
    
    let app = Router::new()
        .route("/health", get(health_check))
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
        .route("/masked-locations", get(list_masked_locations).post(create_masked_location))
        .route("/masked-locations/:id", put(update_masked_location).delete(delete_masked_location))
        .route("/share/:share_id", get(get_shared_schedules))
        .route("/share/:share_id/schedules/:id", get(get_shared_schedule))
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
        .route("/admin/import-db", post(import_database_dump)) // 一時的なエンドポイント
        .route("/admin/delete-old-schedules", post(delete_old_schedules)) // 一時的なエンドポイント
        .route("/select-options/:type", get(get_select_options).post(save_select_options))
        .route("/stay-select-options/:type", get(get_stay_select_options).post(save_stay_select_options))
        .route("/notifications", get(list_notifications))
        .route("/notifications/:id/read", put(mark_notification_read))
        .layer(cors)
        .layer(Extension(pool.clone()));

    // ポート番号を環境変数から読み込む（Fly.ioなどではPORT環境変数が設定される）
    let port = std::env::var("PORT")
        .unwrap_or_else(|_| "3000".to_string())
        .parse::<u16>()
        .unwrap_or(3000);
    let addr = SocketAddr::from(([0, 0, 0, 0], port));
    println!("Server running at http://0.0.0.0:{}", port);

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
    
    axum::serve(listener, app).await.map_err(|e| {
        let error_msg = format!("Server error: {}", e);
        println!("{}", error_msg);
        eprintln!("{}", error_msg);
        e
    })?;

    Ok(())
}
