use axum::{
    extract::{Extension, Path, Query},
    http::{header::AUTHORIZATION, HeaderValue, StatusCode, HeaderMap, request::Parts},
    response::Json,
    routing::{get, post, put},
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
struct PasswordResetResponse {
    success: bool,
    message: String,
}

#[derive(Debug, Serialize)]
struct ErrorResponse {
    error: String,
}

#[derive(sqlx::FromRow)]
struct UserRow {
    id: i64,
    email: String,
    password_hash: String,
    email_verified: i32, // 0/1
    verification_token: Option<String>,
    password_reset_token: Option<String>,
    password_reset_expires: Option<String>,
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

// ====== 認証ヘルパー関数 ======

// ランダムなトークンを生成
fn generate_token() -> String {
    let mut rng = rand::thread_rng();
    let bytes: Vec<u8> = (0..32).map(|_| rng.gen()).collect();
    hex::encode(bytes)
}

// メール送信（開発環境ではコンソールに出力）
async fn send_verification_email(email: &str, token: &str) {
    let base_url = get_base_url();
    let verification_url = format!("{}/verify-email?token={}", base_url, urlencoding::encode(token));
    
    // 開発環境ではコンソールに出力
    println!("=== メール送信（開発環境） ===");
    println!("宛先: {}", email);
    println!("件名: メールアドレスの確認");
    println!("本文:");
    println!("以下のURLをクリックしてメールアドレスを確認してください:");
    println!("{}", verification_url);
    println!("===========================");
    
    // 本番環境では実際のSMTPサーバーに送信
    // 環境変数からSMTP設定を読み込んで送信
}

async fn send_password_reset_email(email: &str, token: &str) {
    let base_url = get_base_url();
    let reset_url = format!("{}/reset-password?token={}", base_url, urlencoding::encode(token));
    
    // 開発環境ではコンソールに出力
    println!("=== メール送信（開発環境） ===");
    println!("宛先: {}", email);
    println!("件名: パスワードリセット");
    println!("本文:");
    println!("以下のURLをクリックしてパスワードをリセットしてください:");
    println!("{}", reset_url);
    println!("このリンクは24時間有効です。");
    println!("===========================");
    
    // 本番環境では実際のSMTPサーバーに送信
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
    .map_err(|_| StatusCode::UNAUTHORIZED)?;

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
    group: String, // groupがNULLの場合はtitleを使用（APIレスポンスでフォールバック）
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
    is_public: i32, // 0/1
    created_at: Option<String>,
    updated_at: Option<String>,
}

#[derive(Debug, Deserialize)]
struct ScheduleQuery {
    year: Option<i32>,
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

// ====== Stay 型定義 ======

#[derive(Serialize, Clone)]
struct Stay {
    id: i32,
    schedule_id: i32,
    check_in: String,
    check_out: String,
    hotel_name: String,
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
    fee: i32,
    breakfast_flag: bool,
    deadline: Option<String>,
    penalty: Option<i32>,
    status: Option<String>,
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

    // groupがNULLまたは空文字列の場合はtitleを使用
    let group = row.group_name
        .filter(|g| !g.trim().is_empty())
        .unwrap_or_else(|| row.title.clone());

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

fn row_to_stay(row: StayRow) -> Stay {
    Stay {
        id: row.id as i32,
        schedule_id: row.schedule_id as i32,
        check_in: row.check_in,
        check_out: row.check_out,
        hotel_name: row.hotel_name,
        fee: row.fee,
        breakfast_flag: row.breakfast_flag != 0,
        deadline: row.deadline,
        penalty: row.penalty,
        status: row.status,
    }
}

// ====== ハンドラ ======

async fn health_check() -> &'static str {
    "OK"
}

// メールアドレスの簡易バリデーション
fn is_valid_email(email: &str) -> bool {
    email.contains('@') && email.contains('.') && email.len() > 5
}

// POST /auth/register
async fn register(
    Extension(pool): Extension<Pool<Sqlite>>,
    Json(payload): Json<RegisterRequest>,
) -> Result<Json<AuthResponse>, (StatusCode, Json<ErrorResponse>)> {
    println!("[REGISTER] Received registration request for email: {}", payload.email);
    
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
    
    println!("[REGISTER] Validation passed");

    // 既存ユーザーのチェック
    let existing_user: Option<UserRow> = sqlx::query_as::<_, UserRow>(
        "SELECT id, email, password_hash, email_verified, verification_token, password_reset_token, password_reset_expires, created_at, updated_at FROM users WHERE email = ?",
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
        "INSERT INTO users (email, password_hash, email_verified, verification_token, created_at, updated_at) VALUES (?, ?, 0, ?, ?, ?)",
    )
    .bind(&payload.email)
    .bind(&password_hash)
    .bind(&verification_token)
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
    Extension(pool): Extension<Pool<Sqlite>>,
    Json(payload): Json<LoginRequest>,
) -> Result<Json<AuthResponse>, (StatusCode, Json<ErrorResponse>)> {
    // ユーザーを検索
    let user: Option<UserRow> = sqlx::query_as::<_, UserRow>(
        "SELECT id, email, password_hash, email_verified, verification_token, password_reset_token, password_reset_expires, created_at, updated_at FROM users WHERE email = ?",
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
        "SELECT id, email, password_hash, email_verified, verification_token, password_reset_token, password_reset_expires, created_at, updated_at FROM users WHERE verification_token = ?",
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
    Extension(pool): Extension<Pool<Sqlite>>,
    Json(payload): Json<RequestPasswordResetRequest>,
) -> Result<Json<PasswordResetResponse>, (StatusCode, Json<ErrorResponse>)> {
    // ユーザーを検索
    let user: Option<UserRow> = sqlx::query_as::<_, UserRow>(
        "SELECT id, email, password_hash, email_verified, verification_token, password_reset_token, password_reset_expires, created_at, updated_at FROM users WHERE email = ?",
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

    // ユーザーが存在しない場合でも、セキュリティのため成功を返す
    if user.is_none() {
        return Ok(Json(PasswordResetResponse {
            success: true,
            message: "パスワードリセット用のメールを送信しました（該当するメールアドレスが登録されている場合）".to_string(),
        }));
    }

    let user = user.unwrap();

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

    // メール送信
    send_password_reset_email(&user.email, &reset_token).await;

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
        "SELECT id, email, password_hash, email_verified, verification_token, password_reset_token, password_reset_expires, created_at, updated_at FROM users WHERE password_reset_token = ?",
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

// GET /schedules?year=2025 など
async fn list_schedules(
    Query(params): Query<ScheduleQuery>,
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
          is_public,
          created_at,
          updated_at
        FROM schedules
        WHERE user_id = ?
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
          is_public,
          created_at,
          updated_at
        FROM schedules
        WHERE user_id = ?
        "#,
    )
    .bind(user.user_id)
    .fetch_all(&pool)
    .await
    .expect("failed to fetch schedules");

    let mut schedules: Vec<Schedule> = rows.into_iter().map(row_to_schedule).collect();

    if let Some(year) = params.year {
        schedules = schedules
            .into_iter()
            .filter(|s| s.datetime.year() == year)
            .collect();
    }

    schedules = schedules
        .into_iter()
        .filter(|s| s.status != "Canceled")
        .collect();

    Json(schedules)
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
          is_public,
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
          is_public,
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
    // 必須項目のバリデーション
    if payload.target.is_none() {
        return Err((
            StatusCode::BAD_REQUEST,
            Json(ErrorResponse {
                error: "Targetは必須項目です".to_string(),
            }),
        ));
    }
    
    let now = Utc::now().to_rfc3339();
    let is_public = payload.is_public.unwrap_or(false) as i32;
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
          created_at,
          updated_at
        ) VALUES (
          ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, NULL, NULL, NULL, ?, ?, ?, ?, ?, ?
        )
        "#,
    )
    .bind(user.user_id)
    .bind(&payload.title)
    .bind(&payload.group.as_ref().map(|g| {
        let trimmed = g.trim();
        if trimmed.is_empty() { String::new() } else { trimmed.to_string() }
    }).unwrap_or_default())
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
          is_public,
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
            
            if let Some(mut related) = related_row {
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
    // 必須項目のバリデーション
    if payload.target.is_none() {
        return Err((
            StatusCode::BAD_REQUEST,
            Json(ErrorResponse {
                error: "Targetは必須項目です".to_string(),
            }),
        ));
    }
    
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
                error: "このスケジュールを編集する権限がありません".to_string(),
            }),
        ));
    }

    let now = Utc::now().to_rfc3339();
    let is_public = payload.is_public.unwrap_or(existing.is_public != 0) as i32;
    
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
    .bind(&payload.group.as_ref().map(|g| {
        let trimmed = g.trim();
        if trimmed.is_empty() { String::new() } else { trimmed.to_string() }
    }).unwrap_or_default())
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
          is_public,
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

// GET /public/schedules - 公開されているスケジュール一覧
async fn list_public_schedules(
    Query(params): Query<ScheduleQuery>,
    Extension(pool): Extension<Pool<Sqlite>>,
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
          is_public,
          created_at,
          updated_at
        FROM schedules
        WHERE is_public = 1
        "#,
    )
    .fetch_all(&pool)
    .await
    .expect("failed to fetch public schedules");

    let mut schedules: Vec<Schedule> = rows.into_iter().map(row_to_schedule).collect();

    if let Some(year) = params.year {
        schedules = schedules
            .into_iter()
            .filter(|s| s.datetime.year() == year)
            .collect();
    }

    schedules = schedules
        .into_iter()
        .filter(|s| s.status != "Canceled")
        .collect();

    Json(schedules)
}

// GET /public/schedules/:id - 公開されているスケジュール詳細
async fn get_public_schedule(
    Path(id): Path<i32>,
    Extension(pool): Extension<Pool<Sqlite>>,
) -> Result<Json<Schedule>, StatusCode> {
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
          is_public,
          created_at,
          updated_at
        FROM schedules
        WHERE id = ? AND is_public = 1
        "#,
    )
    .bind(id)
    .fetch_one(&pool)
    .await
    .map_err(|_| StatusCode::NOT_FOUND)?;

    let schedule = row_to_schedule(row);
    Ok(Json(schedule))
}

// GET /public/traffic?schedule_id=... - 公開スケジュールの交通情報
async fn list_public_traffics(
    Query(params): Query<TrafficQuery>,
    Extension(pool): Extension<Pool<Sqlite>>,
) -> Json<Vec<Traffic>> {
    // まず、スケジュールが公開されているかチェック
    let schedule_exists: Option<i64> = sqlx::query_scalar(
        "SELECT id FROM schedules WHERE id = ? AND is_public = 1",
    )
    .bind(params.schedule_id)
    .fetch_optional(&pool)
    .await
    .expect("failed to check schedule");

    if schedule_exists.is_none() {
        return Json(vec![]);
    }

    let rows: Vec<TrafficRow> = sqlx::query_as::<_, TrafficRow>(
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
        WHERE schedule_id = ?
        ORDER BY date ASC, "order" ASC
        "#,
    )
    .bind(params.schedule_id)
    .fetch_all(&pool)
    .await
    .expect("failed to fetch traffics");

    let traffics = rows.into_iter().map(row_to_traffic).collect();
    Json(traffics)
}

// GET /public/stay?schedule_id=... - 公開スケジュールの宿泊情報
async fn list_public_stays(
    Query(params): Query<StayQuery>,
    Extension(pool): Extension<Pool<Sqlite>>,
) -> Json<Vec<Stay>> {
    // まず、スケジュールが公開されているかチェック
    let schedule_exists: Option<i64> = sqlx::query_scalar(
        "SELECT id FROM schedules WHERE id = ? AND is_public = 1",
    )
    .bind(params.schedule_id)
    .fetch_optional(&pool)
    .await
    .expect("failed to check schedule");

    if schedule_exists.is_none() {
        return Json(vec![]);
    }

    let rows: Vec<StayRow> = sqlx::query_as::<_, StayRow>(
        r#"
        SELECT
          id,
          schedule_id,
          check_in,
          check_out,
          hotel_name,
          fee,
          breakfast_flag,
          deadline,
          penalty,
          status
        FROM stays
        WHERE schedule_id = ?
        "#,
    )
    .bind(params.schedule_id)
    .fetch_all(&pool)
    .await
    .expect("failed to fetch stays");

    let stays = rows.into_iter().map(row_to_stay).collect();
    Json(stays)
}

// GET /traffic?schedule_id=...
async fn list_traffics(
    Query(params): Query<TrafficQuery>,
    Extension(pool): Extension<Pool<Sqlite>>,
) -> Json<Vec<Traffic>> {
    let rows: Vec<TrafficRow> = sqlx::query_as::<_, TrafficRow>(
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
        WHERE schedule_id = ?
        ORDER BY "order" ASC
        "#,
    )
    .bind(params.schedule_id)
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

    // スケジュールの所有者を確認
    let schedule_user_id: Option<i64> = sqlx::query_scalar(
        "SELECT user_id FROM schedules WHERE id = ?",
    )
    .bind(row.schedule_id)
    .fetch_optional(&pool)
    .await
    .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    if let Some(schedule_user_id) = schedule_user_id {
        if schedule_user_id != user.user_id as i64 {
            return Err(StatusCode::FORBIDDEN);
        }
    }

    Ok(Json(row_to_traffic(row)))
}

// POST /traffic
async fn create_traffic(
    Extension(pool): Extension<Pool<Sqlite>>,
    Json(payload): Json<NewTraffic>,
) -> Result<(StatusCode, Json<Traffic>), StatusCode> {
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
          created_at,
          updated_at
        ) VALUES (
          ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, NULL, ?, ?
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
    Extension(pool): Extension<Pool<Sqlite>>,
    Json(payload): Json<NewTraffic>,
) -> Result<Json<Traffic>, StatusCode> {
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
) -> Json<Vec<Stay>> {
    let rows: Vec<StayRow> = sqlx::query_as::<_, StayRow>(
        r#"
        SELECT
          st.id,
          st.schedule_id,
          st.check_in,
          st.check_out,
          st.hotel_name,
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

    let stays = rows.into_iter().map(row_to_stay).collect();
    Json(stays)
}

// GET /stay?schedule_id=...
async fn list_stays(
    Query(params): Query<StayQuery>,
    Extension(pool): Extension<Pool<Sqlite>>,
) -> Json<Vec<Stay>> {
    let rows: Vec<StayRow> = sqlx::query_as::<_, StayRow>(
        r#"
        SELECT
          id,
          schedule_id,
          check_in,
          check_out,
          hotel_name,
          fee,
          breakfast_flag,
          deadline,
          penalty,
          status
        FROM stays
        WHERE schedule_id = ?
        "#,
    )
    .bind(params.schedule_id)
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

    // スケジュールの所有者を確認
    let schedule_user_id: Option<i64> = sqlx::query_scalar(
        "SELECT user_id FROM schedules WHERE id = ?",
    )
    .bind(row.schedule_id)
    .fetch_optional(&pool)
    .await
    .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    if let Some(schedule_user_id) = schedule_user_id {
        if schedule_user_id != user.user_id as i64 {
            return Err(StatusCode::FORBIDDEN);
        }
    }

    Ok(Json(row_to_stay(row)))
}

// POST /stay
async fn create_stay(
    Extension(pool): Extension<Pool<Sqlite>>,
    Json(payload): Json<NewStay>,
) -> Result<(StatusCode, Json<Stay>), StatusCode> {
    let now = Utc::now().to_rfc3339();
    let result = sqlx::query(
        r#"
        INSERT INTO stays (
          schedule_id,
          check_in,
          check_out,
          hotel_name,
          fee,
          breakfast_flag,
          deadline,
          penalty,
          status,
          created_at,
          updated_at
        ) VALUES (
          ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?
        )
        "#,
    )
    .bind(payload.schedule_id)
    .bind(&payload.check_in)
    .bind(&payload.check_out)
    .bind(&payload.hotel_name)
    .bind(payload.fee)
    .bind(if payload.breakfast_flag { 1 } else { 0 })
    .bind(&payload.deadline)
    .bind(payload.penalty)
    .bind(payload.status.as_deref().unwrap_or("Keep"))
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
    Extension(pool): Extension<Pool<Sqlite>>,
    Json(payload): Json<NewStay>,
) -> Result<Json<Stay>, StatusCode> {
    let now = Utc::now().to_rfc3339();
    let result = sqlx::query(
        r#"
        UPDATE stays SET
          schedule_id = ?,
          check_in = ?,
          check_out = ?,
          hotel_name = ?,
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

// ====== メイン ======

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    // データベースURL（環境変数から読み込む、未設定の場合はデフォルト値）
    let db_url = std::env::var("DATABASE_URL")
        .unwrap_or_else(|_| "sqlite://data/app.db".to_string());
    
    // データベースファイルのディレクトリが存在するか確認し、存在しない場合は作成
    if let Some(db_path) = db_url.strip_prefix("sqlite://") {
        let db_path = if db_path.starts_with('/') {
            db_path
        } else {
            db_path
        };
        let path = std::path::Path::new(db_path);
        if let Some(parent) = path.parent() {
            println!("Creating database directory: {:?}", parent);
            std::fs::create_dir_all(parent)?;
        }
        println!("Database path: {:?}", path);
    }
    
    println!("Connecting to database: {}", db_url);
    let pool = SqlitePoolOptions::new()
        .max_connections(5)
        .connect(&db_url)
        .await?;

    init_db(&pool).await?;

    // CORS設定（環境変数から許可するオリジンを読み込む）
    let allowed_origin = std::env::var("ALLOWED_ORIGIN")
        .unwrap_or_else(|_| "*".to_string());
    
    let cors = if allowed_origin == "*" {
        CorsLayer::new()
            .allow_origin(Any)
            .allow_methods(Any)
            .allow_headers(Any)
    } else {
        CorsLayer::new()
            .allow_origin(AllowOrigin::exact(HeaderValue::from_str(&allowed_origin).unwrap()))
            .allow_methods(Any)
            .allow_headers(Any)
    };

    let app = Router::new()
        .route("/health", get(health_check))
        .route("/auth/register", post(register))
        .route("/auth/login", post(login))
        .route("/auth/verify-email", post(verify_email))
        .route("/auth/request-password-reset", post(request_password_reset))
        .route("/auth/reset-password", post(reset_password))
        .route("/public/schedules", get(list_public_schedules))
        .route("/public/schedules/:id", get(get_public_schedule))
        .route("/public/traffic", get(list_public_traffics))
        .route("/public/stay", get(list_public_stays))
        .route("/schedules", get(list_schedules).post(create_schedule))
        .route("/schedules/:id", put(update_schedule))
        .route("/schedules/upcoming", get(list_upcoming))
        .route("/traffic", get(list_traffics).post(create_traffic))
        .route("/traffic/all", get(list_all_traffics))
        .route("/traffic/:id", get(get_traffic).put(update_traffic))
        .route("/stay", get(list_stays).post(create_stay))
        .route("/stay/all", get(list_all_stays))
        .route("/stay/:id", get(get_stay).put(update_stay))
        .layer(cors)
        .layer(Extension(pool));

    // ポート番号を環境変数から読み込む（Fly.ioなどではPORT環境変数が設定される）
    let port = std::env::var("PORT")
        .unwrap_or_else(|_| "3000".to_string())
        .parse::<u16>()
        .unwrap_or(3000);
    let addr = SocketAddr::from(([0, 0, 0, 0], port));
    println!("Server running at http://0.0.0.0:{}", port);

    let listener = tokio::net::TcpListener::bind(addr).await?;
    axum::serve(listener, app).await?;

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
      date         TEXT,
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
      created_at   TEXT,
      updated_at   TEXT,
      FOREIGN KEY (schedule_id) REFERENCES schedules(id)
    );
    "#;

    let create_stays = r#"
    CREATE TABLE IF NOT EXISTS stays (
      id             INTEGER PRIMARY KEY AUTOINCREMENT,
      schedule_id    INTEGER NOT NULL,
      check_in       TEXT NOT NULL,
      check_out      TEXT NOT NULL,
      hotel_name     TEXT NOT NULL,
      fee            INTEGER NOT NULL,
      breakfast_flag INTEGER NOT NULL,
      deadline       TEXT,
      penalty        INTEGER,
      status         TEXT NOT NULL,
      created_at     TEXT,
      updated_at     TEXT,
      FOREIGN KEY (schedule_id) REFERENCES schedules(id)
    );
    "#;

    sqlx::query(create_users).execute(pool).await?;
    sqlx::query(create_schedules).execute(pool).await?;
    sqlx::query(create_traffics).execute(pool).await?;
    sqlx::query(create_stays).execute(pool).await?;

    // 既存のschedulesテーブルにuser_idとis_publicカラムを追加（マイグレーション）
    // SQLiteではALTER TABLE ADD COLUMNがサポートされているが、既に存在する場合はエラーになる
    // そのため、エラーを無視する
    let _ = sqlx::query("ALTER TABLE schedules ADD COLUMN user_id INTEGER")
        .execute(pool)
        .await;
    let _ = sqlx::query("ALTER TABLE schedules ADD COLUMN is_public INTEGER NOT NULL DEFAULT 0")
        .execute(pool)
        .await;

    Ok(())
}