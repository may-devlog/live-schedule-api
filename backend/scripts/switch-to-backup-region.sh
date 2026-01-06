#!/bin/bash
# バックアップリージョン（シンガポール）に切り替えるスクリプト

set -e

APP_NAME="live-schedule-api"
REMOTE_DB="/app/data/app.db"
LOCAL_DB="data/app.db"
BACKUP_REGION="sin"

echo "=========================================="
echo "バックアップリージョンへの切り替え"
echo "=========================================="
echo ""
echo "警告: この操作により、シンガポールリージョンでアプリが起動します。"
echo "      データベースは最新の状態に同期されます。"
echo ""
read -p "続行しますか？ (y/N): " -r
if [[ ! "$REPLY" =~ ^[Yy]$ ]]; then
    echo "キャンセルしました"
    exit 0
fi

# ステップ1: 最新のデータベースをバックアップ
echo ""
echo "[1/4] 最新のデータベースをバックアップ中..."
mkdir -p data/backups
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
BACKUP_FILE="data/backups/app.db.backup.${TIMESTAMP}"

flyctl sftp shell --app "$APP_NAME" <<EOF
get $REMOTE_DB $BACKUP_FILE
EOF

if [ $? -ne 0 ]; then
    echo "警告: データベースのバックアップに失敗しましたが、続行します..."
fi

# ステップ2: シンガポールリージョンにデプロイ
echo ""
echo "[2/4] シンガポールリージョンにデプロイ中..."
if [ -f "fly.toml.backup" ]; then
    fly deploy --config fly.toml.backup --region "$BACKUP_REGION"
else
    echo "警告: fly.toml.backup が見つかりません。通常の設定でデプロイします..."
    fly deploy --region "$BACKUP_REGION"
fi

# ステップ3: データベースをアップロード
echo ""
echo "[3/4] データベースをシンガポールリージョンにアップロード中..."

# アプリを一時停止
fly scale count 0 --region "$BACKUP_REGION" --yes || true
sleep 5

# データベースをアップロード
if [ -f "$LOCAL_DB" ]; then
    DB_FILE="$LOCAL_DB"
elif [ -f "$BACKUP_FILE" ]; then
    DB_FILE="$BACKUP_FILE"
else
    echo "エラー: データベースファイルが見つかりません"
    exit 1
fi

flyctl sftp shell --app "$APP_NAME" --region "$BACKUP_REGION" <<EOF
put $DB_FILE $REMOTE_DB
EOF

if [ $? -ne 0 ]; then
    echo "エラー: データベースのアップロードに失敗しました"
    exit 1
fi

# ステップ4: アプリを再起動
echo ""
echo "[4/4] アプリを再起動中..."
fly scale count 1 --region "$BACKUP_REGION" --yes

echo ""
echo "=========================================="
echo "✓ 切り替えが完了しました"
echo "=========================================="
echo ""
echo "シンガポールリージョンでアプリが起動しています。"
echo "動作確認: fly status --region $BACKUP_REGION"
echo ""






