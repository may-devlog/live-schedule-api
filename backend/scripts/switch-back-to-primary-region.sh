#!/bin/bash
# プライマリリージョン（東京）に戻すスクリプト

set -e

APP_NAME="live-schedule-api"
REMOTE_DB="/app/data/app.db"
LOCAL_DB="data/app.db"
PRIMARY_REGION="nrt"
BACKUP_REGION="sin"

echo "=========================================="
echo "プライマリリージョン（東京）への復帰"
echo "=========================================="
echo ""
echo "警告: この操作により、東京リージョンでアプリが起動します。"
echo "      データベースは最新の状態に同期されます。"
echo ""
read -p "続行しますか？ (y/N): " -r
if [[ ! "$REPLY" =~ ^[Yy]$ ]]; then
    echo "キャンセルしました"
    exit 0
fi

# ステップ1: シンガポールリージョンから最新のデータベースをバックアップ
echo ""
echo "[1/4] シンガポールリージョンから最新のデータベースをバックアップ中..."
mkdir -p data/backups
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
BACKUP_FILE="data/backups/app.db.backup.${TIMESTAMP}"

flyctl sftp shell --app "$APP_NAME" --region "$BACKUP_REGION" <<EOF
get $REMOTE_DB $BACKUP_FILE
EOF

if [ $? -ne 0 ]; then
    echo "エラー: データベースのバックアップに失敗しました"
    echo "シンガポールリージョンが起動しているか確認してください: fly status --region $BACKUP_REGION"
    exit 1
fi

echo "✓ バックアップが完了しました: $BACKUP_FILE"

# ステップ2: 東京リージョンにデプロイ
echo ""
echo "[2/4] 東京リージョンにデプロイ中..."
fly deploy --region "$PRIMARY_REGION"

if [ $? -ne 0 ]; then
    echo "警告: デプロイに失敗しました。リソース不足の可能性があります。"
    echo "リソース状況を確認してください: fly platform regions | grep nrt"
    exit 1
fi

# ステップ3: データベースをアップロード
echo ""
echo "[3/4] データベースを東京リージョンにアップロード中..."

# アプリを一時停止
fly scale count 0 --region "$PRIMARY_REGION" --yes || true
sleep 5

# データベースをアップロード
flyctl sftp shell --app "$APP_NAME" --region "$PRIMARY_REGION" <<EOF
put $BACKUP_FILE $REMOTE_DB
EOF

if [ $? -ne 0 ]; then
    echo "エラー: データベースのアップロードに失敗しました"
    echo "アプリを再起動します..."
    fly scale count 1 --region "$PRIMARY_REGION" --yes
    exit 1
fi

# ステップ4: アプリを再起動
echo ""
echo "[4/4] アプリを再起動中..."
fly scale count 1 --region "$PRIMARY_REGION" --yes

echo ""
echo "=========================================="
echo "✓ 復帰が完了しました"
echo "=========================================="
echo ""
echo "東京リージョンでアプリが起動しています。"
echo "動作確認: fly status --region $PRIMARY_REGION"
echo ""
echo "注意: シンガポールリージョンのマシンは停止していません。"
echo "      不要な場合は、以下のコマンドで停止できます:"
echo "      fly scale count 0 --region $BACKUP_REGION --yes"
echo ""






