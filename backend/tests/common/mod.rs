// テスト共通モジュール

use sqlx::{Pool, Sqlite, sqlite::SqlitePoolOptions};
use std::sync::OnceLock;
use tempfile::TempDir;
use std::path::PathBuf;

// テスト用のデータベースプール（一度だけ初期化）
static TEST_POOL: OnceLock<Pool<Sqlite>> = OnceLock::new();
static TEST_DB_DIR: OnceLock<TempDir> = OnceLock::new();

/// テスト用のデータベースプールを取得
/// 各テストで同じプールを共有（テストの並列実行を考慮）
pub async fn get_test_pool() -> Pool<Sqlite> {
    TEST_POOL.get_or_init(|| {
        tokio::runtime::Handle::current().block_on(async {
            setup_test_db().await
        })
    }).clone()
}

/// テスト用データベースのセットアップ
async fn setup_test_db() -> Pool<Sqlite> {
    // 一時ディレクトリを作成
    let temp_dir = TempDir::new().expect("Failed to create temp directory");
    let db_path = temp_dir.path().join("test.db");
    
    // 一時ディレクトリを保持（テスト終了まで削除されないように）
    TEST_DB_DIR.set(temp_dir).ok();
    
    let database_url = format!("sqlite:{}", db_path.display());
    
    // データベースプールを作成
    let pool = SqlitePoolOptions::new()
        .max_connections(5)
        .connect(&database_url)
        .await
        .expect("Failed to create test database pool");
    
    // スキーマを初期化
    init_test_schema(&pool).await;
    
    pool
}

/// テスト用スキーマの初期化
async fn init_test_schema(pool: &Pool<Sqlite>) {
    // 本番環境と同じスキーマを作成
    let create_users = r#"
    CREATE TABLE IF NOT EXISTS users (
      id           INTEGER PRIMARY KEY AUTOINCREMENT,
      email        TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      email_verified INTEGER NOT NULL DEFAULT 0,
      verification_token TEXT,
      password_reset_token TEXT,
      password_reset_expires TEXT,
      email_change_token TEXT,
      email_change_expires TEXT,
      new_email TEXT,
      share_id TEXT UNIQUE,
      sharing_enabled INTEGER NOT NULL DEFAULT 0,
      created_at   TEXT,
      updated_at   TEXT
    );
    "#;

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
      user_id      INTEGER,
      schedule_id  INTEGER,
      departure     TEXT,
      destination   TEXT,
      method        TEXT,
      cost          INTEGER,
      return_flag   INTEGER NOT NULL DEFAULT 0,
      notes         TEXT,
      created_at    TEXT,
      updated_at    TEXT,
      FOREIGN KEY (user_id) REFERENCES users(id),
      FOREIGN KEY (schedule_id) REFERENCES schedules(id)
    );
    "#;

    let create_stays = r#"
    CREATE TABLE IF NOT EXISTS stays (
      id           INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id      INTEGER,
      schedule_id  INTEGER,
      name         TEXT NOT NULL,
      checkin      TEXT,
      checkout     TEXT,
      cost         INTEGER,
      status       TEXT NOT NULL,
      notes        TEXT,
      created_at   TEXT,
      updated_at   TEXT,
      FOREIGN KEY (user_id) REFERENCES users(id),
      FOREIGN KEY (schedule_id) REFERENCES schedules(id)
    );
    "#;

    let create_select_options = r#"
    CREATE TABLE IF NOT EXISTS select_options (
      id           INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id      INTEGER,
      type         TEXT NOT NULL,
      label        TEXT NOT NULL,
      color        TEXT,
      created_at   TEXT,
      updated_at   TEXT,
      FOREIGN KEY (user_id) REFERENCES users(id)
    );
    "#;

    let create_stay_select_options = r#"
    CREATE TABLE IF NOT EXISTS stay_select_options (
      id           INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id      INTEGER,
      type         TEXT NOT NULL,
      label        TEXT NOT NULL,
      color        TEXT,
      created_at   TEXT,
      updated_at   TEXT,
      FOREIGN KEY (user_id) REFERENCES users(id)
    );
    "#;

    let create_masked_locations = r#"
    CREATE TABLE IF NOT EXISTS masked_locations (
      id           INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id      INTEGER,
      area         TEXT NOT NULL,
      venue        TEXT NOT NULL,
      created_at   TEXT,
      updated_at   TEXT,
      FOREIGN KEY (user_id) REFERENCES users(id)
    );
    "#;

    let create_notifications = r#"
    CREATE TABLE IF NOT EXISTS notifications (
      id           INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id      INTEGER,
      schedule_id  INTEGER,
      type         TEXT NOT NULL,
      message      TEXT NOT NULL,
      read         INTEGER NOT NULL DEFAULT 0,
      created_at   TEXT,
      FOREIGN KEY (user_id) REFERENCES users(id),
      FOREIGN KEY (schedule_id) REFERENCES schedules(id)
    );
    "#;

    sqlx::query(create_users).execute(pool).await.expect("Failed to create users table");
    sqlx::query(create_schedules).execute(pool).await.expect("Failed to create schedules table");
    sqlx::query(create_traffics).execute(pool).await.expect("Failed to create traffics table");
    sqlx::query(create_stays).execute(pool).await.expect("Failed to create stays table");
    sqlx::query(create_select_options).execute(pool).await.expect("Failed to create select_options table");
    sqlx::query(create_stay_select_options).execute(pool).await.expect("Failed to create stay_select_options table");
    sqlx::query(create_masked_locations).execute(pool).await.expect("Failed to create masked_locations table");
    sqlx::query(create_notifications).execute(pool).await.expect("Failed to create notifications table");
}

/// テスト用のユーザーを作成
pub async fn create_test_user(pool: &Pool<Sqlite>, email: &str, password: &str) -> i64 {
    use bcrypt::{hash, DEFAULT_COST};
    
    let password_hash = hash(password, DEFAULT_COST).expect("Failed to hash password");
    let now = chrono::Utc::now().to_rfc3339();
    
    let result = sqlx::query(
        "INSERT INTO users (email, password_hash, email_verified, created_at, updated_at)
         VALUES (?, ?, 1, ?, ?)
         RETURNING id"
    )
    .bind(email)
    .bind(password_hash)
    .bind(&now)
    .bind(&now)
    .fetch_one(pool)
    .await
    .expect("Failed to create test user");
    
    result.get::<i64, _>(0)
}

/// テスト用のJWTトークンを作成
pub fn create_test_token(user_id: i32) -> String {
    use chrono::Utc;
    use jsonwebtoken::{encode, EncodingKey, Header};
    
    #[derive(serde::Serialize)]
    struct Claims {
        user_id: i32,
        exp: usize,
    }
    
    let expiration = Utc::now()
        .checked_add_signed(chrono::Duration::days(30))
        .expect("valid timestamp")
        .timestamp() as usize;
    
    let claims = Claims {
        user_id,
        exp: expiration,
    };
    
    let jwt_secret = std::env::var("JWT_SECRET")
        .unwrap_or_else(|_| "test-secret-key-for-testing-only".to_string());
    
    encode(
        &Header::default(),
        &claims,
        &EncodingKey::from_secret(jwt_secret.as_ref()),
    )
    .expect("Failed to create test token")
}

