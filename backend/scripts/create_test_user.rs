// テストユーザーを作成するRustスクリプト
// コンパイル: rustc --edition 2021 create_test_user.rs -L target/debug/deps --extern bcrypt --extern sqlx
// 実行: ./create_test_user <email> <password>

use std::env;
use std::process;

fn main() {
    let args: Vec<String> = env::args().collect();
    
    if args.len() != 3 {
        eprintln!("使用方法: {} <email> <password>", args[0]);
        eprintln!("例: {} test@example.com password123", args[0]);
        process::exit(1);
    }
    
    let email = &args[1];
    let password = &args[2];
    
    // パスワードをハッシュ化
    let password_hash = bcrypt::hash(password, bcrypt::DEFAULT_COST)
        .expect("Failed to hash password");
    
    // データベースに接続
    let db_url = "sqlite://data/app.db";
    // 実際の実装では、sqlxを使用してデータベースに接続する必要があります
    // ここでは簡易版として、SQLコマンドを出力します
    
    println!("以下のSQLコマンドを実行してください:");
    println!("sqlite3 data/app.db \"INSERT INTO users (email, password_hash, email_verified, created_at, updated_at) VALUES ('{}', '{}', 1, datetime('now'), datetime('now'));\"", email, password_hash);
}

