#!/bin/bash

# 既存ユーザーのshare_idを設定するスクリプト
# 使用方法: ./set-share-id.sh <email> <share_id>

set -e

if [ $# -ne 2 ]; then
    echo "使用方法: $0 <email> <share_id>"
    echo "例: $0 may04re@gmail.com may04re"
    exit 1
fi

EMAIL="$1"
SHARE_ID="$2"

# データベースファイルのパス
DB_PATH="${DATABASE_URL:-sqlite:./data/app.db}"

# SQLiteのパスを抽出（sqlite:./data/app.db -> ./data/app.db）
if [[ "$DB_PATH" == sqlite:* ]]; then
    DB_FILE="${DB_PATH#sqlite:}"
else
    DB_FILE="$DB_PATH"
fi

# データベースファイルが存在するか確認
if [ ! -f "$DB_FILE" ]; then
    echo "エラー: データベースファイルが見つかりません: $DB_FILE"
    exit 1
fi

echo "ユーザーIDを設定中..."
echo "メールアドレス: $EMAIL"
echo "ユーザーID: $SHARE_ID"

# ユーザーが存在するか確認
USER_EXISTS=$(sqlite3 "$DB_FILE" "SELECT COUNT(*) FROM users WHERE email = '$EMAIL';")

if [ "$USER_EXISTS" -eq 0 ]; then
    echo "警告: ユーザーが見つかりませんでした。メールアドレスを確認してください。"
    exit 1
fi

# SQLiteコマンドでshare_idを更新
sqlite3 "$DB_FILE" <<EOF
UPDATE users 
SET share_id = '$SHARE_ID', updated_at = datetime('now')
WHERE email = '$EMAIL';
EOF

echo "ユーザーIDが設定されました。"
echo ""
echo "確認:"
sqlite3 "$DB_FILE" "SELECT email, share_id, sharing_enabled FROM users WHERE email = '$EMAIL';"

