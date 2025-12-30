// テストユーザーを作成するためのバイナリ
// 使用方法: cargo run --bin create_user -- <email> <password>

use bcrypt;
use chrono::Utc;
use sqlx::sqlite::SqlitePoolOptions;
use std::env;

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    let args: Vec<String> = env::args().collect();
    
    if args.len() != 3 {
        eprintln!("使用方法: cargo run --bin create_user -- <email> <password>");
        eprintln!("例: cargo run --bin create_user -- test@example.com password123");
        std::process::exit(1);
    }
    
    let email = &args[1];
    let password = &args[2];
    
    // データベースに接続
    let db_url = "sqlite://data/app.db";
    let pool = SqlitePoolOptions::new()
        .max_connections(1)
        .connect(db_url)
        .await?;
    
    // 既存のユーザーをチェック
    let existing: Option<(i64,)> = sqlx::query_as("SELECT id FROM users WHERE email = ?")
        .bind(email)
        .fetch_optional(&pool)
        .await?;
    
    // パスワードをハッシュ化
    let password_hash = bcrypt::hash(password, bcrypt::DEFAULT_COST)?;
    let now = Utc::now().to_rfc3339();
    
    if existing.is_some() {
        println!("ユーザー {} は既に存在します。パスワードを更新します。", email);
        // 既存ユーザーのパスワードを更新
        sqlx::query(
            "UPDATE users SET password_hash = ?, email_verified = 1, updated_at = ? WHERE email = ?"
        )
        .bind(&password_hash)
        .bind(&now)
        .bind(email)
        .execute(&pool)
        .await?;
        
        println!("ユーザーのパスワードを更新しました: {}", email);
        println!("メール確認済み（email_verified = 1）として設定しました");
        println!("このユーザーでログインできます。");
    } else {
        // ユーザーを作成（メール確認済み）
        sqlx::query(
            "INSERT INTO users (email, password_hash, email_verified, created_at, updated_at) VALUES (?, ?, 1, ?, ?)"
        )
        .bind(email)
        .bind(&password_hash)
        .bind(&now)
        .bind(&now)
        .execute(&pool)
        .await?;
        
        println!("ユーザーを作成しました: {}", email);
        println!("メール確認済み（email_verified = 1）として設定しました");
        println!("このユーザーでログインできます。");
    }
    
    Ok(())
}

