#!/bin/bash
# 本番環境のユーザーパスワードを更新するスクリプト
# 使用方法: ./update-password.sh <email> <password>

set -e

if [ $# -ne 2 ]; then
    echo "使用方法: $0 <email> <password>"
    echo "例: $0 may04re@gmail.com newpassword123"
    exit 1
fi

EMAIL="$1"
PASSWORD="$2"
APP_NAME="live-schedule-api"

echo "本番環境のユーザーパスワードを更新中..."
echo "メールアドレス: $EMAIL"
echo "警告: 本番環境のデータベースが更新されます。続行しますか？ (y/N)"
read -r response
if [[ ! "$response" =~ ^[Yy]$ ]]; then
    echo "更新をキャンセルしました"
    exit 0
fi

# Rustスクリプトを実行してパスワードをハッシュ化し、SQLを生成
echo "パスワードハッシュを生成中..."
HASH_OUTPUT=$(cd backend && cargo run --quiet --bin create_user -- "$EMAIL" "$PASSWORD" 2>&1)

if [ $? -ne 0 ]; then
    echo "エラー: パスワードハッシュの生成に失敗しました"
    echo "$HASH_OUTPUT"
    exit 1
fi

echo "✓ パスワードハッシュを生成しました"
echo "本番環境のデータベースを更新中..."

# 本番環境で直接SQLを実行する方法がないため、
# ローカルでデータベースを更新してから同期する
echo "ローカルのデータベースを更新中..."
cd backend
cargo run --bin create_user -- "$EMAIL" "$PASSWORD"
cd ..

echo "✓ ローカルのデータベースを更新しました"
echo "本番環境に同期しますか？ (y/N)"
read -r sync_response
if [[ "$sync_response" =~ ^[Yy]$ ]]; then
    echo "y" | bash backend/scripts/sync-db.sh upload
    echo "✓ 完了しました"
else
    echo "本番環境への同期をスキップしました"
    echo "後で手動で同期する場合は以下を実行してください:"
    echo "  bash backend/scripts/sync-db.sh upload"
fi

