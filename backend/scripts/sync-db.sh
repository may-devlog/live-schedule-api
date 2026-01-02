#!/bin/bash
# データベース同期スクリプト
# 本番環境のデータベースをローカルにダウンロード、またはローカルのデータベースを本番にアップロード

set -e

APP_NAME="live-schedule-api"
LOCAL_DB="data/app.db"
REMOTE_DB="/app/data/app.db"

function download_db() {
    echo "本番環境からデータベースをダウンロード中..."
    
    # バックアップを作成
    if [ -f "$LOCAL_DB" ]; then
        BACKUP_FILE="data/app.db.backup.$(date +%Y%m%d_%H%M%S)"
        echo "既存のデータベースをバックアップ: $BACKUP_FILE"
        cp "$LOCAL_DB" "$BACKUP_FILE"
    fi
    
    # 既存のファイルを削除（flyctl sftpは既存ファイルを上書きしないため）
    if [ -f "$LOCAL_DB" ]; then
        rm "$LOCAL_DB"
    fi
    
    # 本番環境からデータベースをダウンロード
    flyctl sftp shell --app "$APP_NAME" <<EOF
get $REMOTE_DB $LOCAL_DB
EOF
    
    if [ $? -eq 0 ]; then
        echo "✓ データベースのダウンロードが完了しました"
        echo "  ローカルファイル: $LOCAL_DB"
    else
        echo "✗ データベースのダウンロードに失敗しました"
        exit 1
    fi
}

function upload_db() {
    echo "ローカルのデータベースを本番環境にアップロード中..."
    echo "警告: 本番環境のデータベースが上書きされます。続行しますか？ (y/N)"
    read -r response
    if [[ ! "$response" =~ ^[Yy]$ ]]; then
        echo "アップロードをキャンセルしました"
        exit 0
    fi
    
    # 本番環境のデータベースをバックアップ
    echo "本番環境のデータベースをバックアップ中..."
    BACKUP_TIMESTAMP=$(date +%Y%m%d_%H%M%S)
    flyctl sftp shell --app "$APP_NAME" <<EOF
get $REMOTE_DB /tmp/app.db.backup.$BACKUP_TIMESTAMP
rm $REMOTE_DB
put $LOCAL_DB $REMOTE_DB
EOF
    
    if [ $? -eq 0 ]; then
        echo "✓ データベースのアップロードが完了しました"
        echo "  本番環境のアプリケーションを再起動してください: flyctl apps restart $APP_NAME"
    else
        echo "✗ データベースのアップロードに失敗しました"
        exit 1
    fi
}

function show_help() {
    echo "使用方法: $0 [download|upload]"
    echo ""
    echo "  download  - 本番環境からデータベースをダウンロード（ローカルにコピー）"
    echo "  upload    - ローカルのデータベースを本番環境にアップロード"
    echo ""
    echo "例:"
    echo "  $0 download  # 本番環境 → ローカル"
    echo "  $0 upload    # ローカル → 本番環境"
}

case "$1" in
    download)
        download_db
        ;;
    upload)
        upload_db
        ;;
    *)
        show_help
        exit 1
        ;;
esac

