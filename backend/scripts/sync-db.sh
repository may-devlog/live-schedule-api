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
    
    # バックアップを取得
    flyctl sftp shell --app "$APP_NAME" <<EOF
get $REMOTE_DB /tmp/app.db.backup.$BACKUP_TIMESTAMP
EOF
    
    if [ $? -ne 0 ]; then
        echo "警告: バックアップの取得に失敗しましたが、続行します..."
    fi
    
    # アプリケーションを停止してからデータベースをアップロード
    echo "アプリケーションを停止中..."
    flyctl scale count 0 -a "$APP_NAME" --yes || echo "警告: アプリケーションの停止に失敗しましたが、続行します..."
    
    sleep 5
    
    # SSH経由で既存のデータベースファイルを削除
    echo "既存のデータベースファイルを削除中..."
    flyctl ssh console -a "$APP_NAME" -C "rm -f $REMOTE_DB" || echo "警告: ファイルの削除に失敗しましたが、続行します..."
    
    sleep 2
    
    # データベースをアップロード（既存ファイルを上書き）
    echo "データベースをアップロード中..."
    flyctl sftp shell --app "$APP_NAME" <<EOF
put $LOCAL_DB $REMOTE_DB
EOF
    
    if [ $? -eq 0 ]; then
        echo "✓ データベースのアップロードが完了しました"
        echo "アプリケーションを再起動中..."
        flyctl scale count 1 -a "$APP_NAME" --yes
        echo "✓ 完了しました"
    else
        echo "✗ データベースのアップロードに失敗しました"
        echo "アプリケーションを再起動中..."
        flyctl scale count 1 -a "$APP_NAME" --yes
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

