#!/bin/bash
# データベースをBackblaze B2にバックアップするスクリプト
# 事前にb2コマンドラインツールをインストールする必要があります
# macOS: brew install b2
# Linux: https://www.backblaze.com/b2/docs/quick_command_line.html

set -e

APP_NAME="live-schedule-api"
REMOTE_DB="/app/data/app.db"
BACKUP_DIR="data/backups"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
BACKUP_FILE="${BACKUP_DIR}/app.db.backup.${TIMESTAMP}"

# B2設定（環境変数から取得、または直接設定）
B2_BUCKET="${B2_BUCKET:-your-bucket-name}"
B2_APP_KEY_ID="${B2_APP_KEY_ID:-your-app-key-id}"
B2_APP_KEY="${B2_APP_KEY:-your-app-key}"

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
    
    # バックアップの整合性チェック
    echo "バックアップファイルの検証中..."
    sqlite3 "$BACKUP_FILE" "PRAGMA integrity_check;" > /tmp/integrity_check.txt
    
    if grep -q "ok" /tmp/integrity_check.txt; then
        echo "✓ バックアップファイルは正常です"
    else
        echo "✗ バックアップファイルが破損しています"
        cat /tmp/integrity_check.txt
        exit 1
    fi
    
    # B2にアップロード
    if command -v b2 &> /dev/null; then
        echo "[$(date +'%Y-%m-%d %H:%M:%S')] B2へのアップロードを開始..."
        
        # B2認証
        b2 authorize-account "$B2_APP_KEY_ID" "$B2_APP_KEY"
        
        if [ $? -eq 0 ]; then
            # ファイルをアップロード
            b2 upload-file "$B2_BUCKET" "$BACKUP_FILE" "backups/app.db.backup.${TIMESTAMP}"
            
            if [ $? -eq 0 ]; then
                echo "[$(date +'%Y-%m-%d %H:%M:%S')] ✓ B2へのアップロードが完了しました"
            else
                echo "[$(date +'%Y-%m-%d %H:%M:%S')] ✗ B2へのアップロードに失敗しました"
                exit 1
            fi
        else
            echo "[$(date +'%Y-%m-%d %H:%M:%S')] ✗ B2認証に失敗しました"
            exit 1
        fi
    else
        echo "警告: b2コマンドが見つかりません。B2へのアップロードをスキップします。"
        echo "インストール方法:"
        echo "  macOS: brew install b2"
        echo "  Linux: https://www.backblaze.com/b2/docs/quick_command_line.html"
    fi
    
    # 古いバックアップを削除（30日以上前）
    find "$BACKUP_DIR" -name "app.db.backup.*" -mtime +30 -delete 2>/dev/null || true
    echo "古いバックアップを削除しました（30日以上前）"
else
    echo "[$(date +'%Y-%m-%d %H:%M:%S')] ✗ バックアップに失敗しました"
    exit 1
fi

