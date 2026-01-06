#!/bin/bash
# データベースの定期バックアップスクリプト

set -e

APP_NAME="live-schedule-api"
REMOTE_DB="/app/data/app.db"
BACKUP_DIR="data/backups"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
BACKUP_FILE="${BACKUP_DIR}/app.db.backup.${TIMESTAMP}"

# バックアップディレクトリを作成
mkdir -p "$BACKUP_DIR"

echo "[$(date +'%Y-%m-%d %H:%M:%S')] データベースのバックアップを開始..."

# 本番環境からデータベースをダウンロード
flyctl sftp shell --app "$APP_NAME" <<EOF
get $REMOTE_DB $BACKUP_FILE
EOF

if [ $? -eq 0 ]; then
    echo "[$(date +'%Y-%m-%d %H:%M:%S')] ✓ バックアップが完了しました: $BACKUP_FILE"
    echo "バックアップサイズ: $(du -h "$BACKUP_FILE" | cut -f1)"
    
    # 古いバックアップを削除（30日以上前）
    find "$BACKUP_DIR" -name "app.db.backup.*" -mtime +30 -delete 2>/dev/null || true
    echo "古いバックアップを削除しました（30日以上前）"
else
    echo "[$(date +'%Y-%m-%d %H:%M:%S')] ✗ バックアップに失敗しました"
    exit 1
fi






