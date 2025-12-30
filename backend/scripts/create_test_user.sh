#!/bin/bash

# テストユーザーを作成するスクリプト
# 使用方法: ./create_test_user.sh <email> <password>

if [ $# -ne 2 ]; then
    echo "使用方法: $0 <email> <password>"
    echo "例: $0 test@example.com password123"
    exit 1
fi

EMAIL=$1
PASSWORD=$2

# Pythonスクリプトを使用してパスワードをハッシュ化
# bcryptを使用する必要があるため、Pythonスクリプトを作成
python3 << EOF
import bcrypt
import sys

password = sys.argv[1]
password_hash = bcrypt.hashpw(password.encode('utf-8'), bcrypt.gensalt()).decode('utf-8')
print(password_hash)
EOF

# パスワードハッシュを取得
PASSWORD_HASH=$(python3 -c "import bcrypt; print(bcrypt.hashpw('$PASSWORD'.encode('utf-8'), bcrypt.gensalt()).decode('utf-8'))")

# SQLiteデータベースにユーザーを挿入
sqlite3 data/app.db << EOF
INSERT INTO users (email, password_hash, email_verified, created_at, updated_at)
VALUES ('$EMAIL', '$PASSWORD_HASH', 1, datetime('now'), datetime('now'));
EOF

echo "ユーザーを作成しました: $EMAIL"
echo "メール確認済み（email_verified = 1）として設定しました"

