#!/bin/bash

# 簡単なテストユーザー作成スクリプト（bcryptなし）
# 注意: このスクリプトは、Rustのbcryptライブラリを使用してパスワードをハッシュ化します
# 使用方法: ./create_test_user_simple.sh <email> <password>

if [ $# -ne 2 ]; then
    echo "使用方法: $0 <email> <password>"
    echo "例: $0 test@example.com password123"
    exit 1
fi

EMAIL=$1
PASSWORD=$2

# Rustでパスワードをハッシュ化する一時的なプログラムを作成
cat > /tmp/hash_password.rs << 'RUST_EOF'
use std::env;
fn main() {
    let password = env::args().nth(1).expect("Password required");
    let hash = bcrypt::hash(&password, bcrypt::DEFAULT_COST).unwrap();
    println!("{}", hash);
}
RUST_EOF

# パスワードハッシュを取得（Rustを使用）
cd "$(dirname "$0")/.."
PASSWORD_HASH=$(cargo run --bin hash_password -- "$PASSWORD" 2>/dev/null || echo "")

if [ -z "$PASSWORD_HASH" ]; then
    echo "エラー: パスワードのハッシュ化に失敗しました"
    echo "代わりに、以下の方法を使用してください:"
    echo "1. Pythonスクリプト: python3 scripts/create_test_user.py $EMAIL $PASSWORD"
    echo "2. 手動でSQLを実行（パスワードハッシュは別途生成が必要）"
    exit 1
fi

# SQLiteデータベースにユーザーを挿入
sqlite3 data/app.db << EOF
INSERT INTO users (email, password_hash, email_verified, created_at, updated_at)
VALUES ('$EMAIL', '$PASSWORD_HASH', 1, datetime('now'), datetime('now'));
EOF

echo "ユーザーを作成しました: $EMAIL"
echo "メール確認済み（email_verified = 1）として設定しました"

