// データベース初期化、接続管理

use sqlx::{Pool, Sqlite, sqlite::SqlitePoolOptions};

pub async fn init_db(pool: &Pool<Sqlite>) -> Result<(), sqlx::Error> {
    // usersテーブル
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

    if let Err(e) = sqlx::query(create_users).execute(pool).await {
        eprintln!("[INIT_DB] Error creating users table: {}", e);
        return Err(e);
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

    if let Err(e) = sqlx::query(create_schedules).execute(pool).await {
        eprintln!("[INIT_DB] Error creating schedules table: {}", e);
        return Err(e);
    }

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

    if let Err(e) = sqlx::query(create_traffics).execute(pool).await {
        eprintln!("[INIT_DB] Error creating traffics table: {}", e);
        return Err(e);
    }

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
      created_at     TEXT,
      updated_at     TEXT,
      FOREIGN KEY (schedule_id) REFERENCES schedules(id)
    );
    "#;

    if let Err(e) = sqlx::query(create_stays).execute(pool).await {
        eprintln!("[INIT_DB] Error creating stays table: {}", e);
        return Err(e);
    }

    let create_select_options = r#"
    CREATE TABLE IF NOT EXISTS select_options (
      id           INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id      INTEGER NOT NULL,
      type         TEXT NOT NULL,
      name         TEXT NOT NULL,
      color        TEXT,
      sort_order   INTEGER,
      created_at   TEXT,
      updated_at   TEXT,
      FOREIGN KEY (user_id) REFERENCES users(id),
      UNIQUE(user_id, type, name)
    );
    "#;

    if let Err(e) = sqlx::query(create_select_options).execute(pool).await {
        eprintln!("[INIT_DB] Error creating select_options table: {}", e);
        return Err(e);
    }

    let create_masked_locations = r#"
    CREATE TABLE IF NOT EXISTS masked_locations (
      id           INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id      INTEGER NOT NULL,
      location     TEXT NOT NULL,
      created_at   TEXT,
      updated_at   TEXT,
      FOREIGN KEY (user_id) REFERENCES users(id),
      UNIQUE(user_id, location)
    );
    "#;

    if let Err(e) = sqlx::query(create_masked_locations).execute(pool).await {
        eprintln!("[INIT_DB] Error creating masked_locations table: {}", e);
        return Err(e);
    }

    let create_notifications = r#"
    CREATE TABLE IF NOT EXISTS notifications (
      id           INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id      INTEGER NOT NULL,
      stay_id      INTEGER NOT NULL,
      message      TEXT NOT NULL,
      read         INTEGER NOT NULL DEFAULT 0,
      created_at   TEXT,
      FOREIGN KEY (user_id) REFERENCES users(id),
      FOREIGN KEY (stay_id) REFERENCES stays(id)
    );
    "#;

    if let Err(e) = sqlx::query(create_notifications).execute(pool).await {
        eprintln!("[INIT_DB] Error creating notifications table: {}", e);
        return Err(e);
    }

    Ok(())
}

pub async fn create_pool() -> Result<Pool<Sqlite>, sqlx::Error> {
    let database_url = std::env::var("DATABASE_URL")
        .unwrap_or_else(|_| "sqlite:data/production.db".to_string());
    
    let pool = SqlitePoolOptions::new()
        .max_connections(5)
        .connect(&database_url)
        .await?;
    
    Ok(pool)
}


