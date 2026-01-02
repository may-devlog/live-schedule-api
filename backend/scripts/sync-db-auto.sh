#!/bin/bash
# 自動データベース同期スクリプト
# ローカルと本番環境のデータベースを自動的に同期します

set -e

APP_NAME="live-schedule-api"
LOCAL_DB="data/app.db"
REMOTE_DB="/app/data/app.db"
SYNC_INTERVAL=60  # 同期間隔（秒）

function check_server_running() {
    # ポート3000または8081でサーバーが動いているかチェック
    if lsof -ti:3000 > /dev/null 2>&1 || lsof -ti:8081 > /dev/null 2>&1; then
        echo "警告: ローカルサーバーが実行中の可能性があります"
        echo "データベース同期中はサーバーを停止することを推奨します"
        echo "続行しますか？ (y/N)"
        read -r response
        if [[ ! "$response" =~ ^[Yy]$ ]]; then
            echo "同期をキャンセルしました"
            return 1
        fi
    fi
    return 0
}

function sync_from_production() {
    echo "[$(date +'%Y-%m-%d %H:%M:%S')] 本番環境からデータベースをダウンロード中..."
    
    # サーバーが実行中かチェック
    if ! check_server_running; then
        return 1
    fi
    
    # バックアップを作成
    if [ -f "$LOCAL_DB" ]; then
        BACKUP_FILE="data/app.db.backup.$(date +%Y%m%d_%H%M%S)"
        echo "既存のデータベースをバックアップ: $BACKUP_FILE"
        cp "$LOCAL_DB" "$BACKUP_FILE"
    fi
    
    # 既存のファイルを削除
    if [ -f "$LOCAL_DB" ]; then
        rm "$LOCAL_DB"
    fi
    
    # 本番環境からデータベースをダウンロード
    flyctl sftp shell --app "$APP_NAME" <<EOF
get $REMOTE_DB $LOCAL_DB
EOF
    
    if [ $? -eq 0 ]; then
        echo "[$(date +'%Y-%m-%d %H:%M:%S')] ✓ データベースのダウンロードが完了しました"
        return 0
    else
        echo "[$(date +'%Y-%m-%d %H:%M:%S')] ✗ データベースのダウンロードに失敗しました"
        return 1
    fi
}

function sync_to_production() {
    echo "[$(date +'%Y-%m-%d %H:%M:%S')] ローカルのデータベースを本番環境にアップロード中..."
    
    # サーバーが実行中かチェック（アップロード時は警告のみ）
    if lsof -ti:3000 > /dev/null 2>&1 || lsof -ti:8081 > /dev/null 2>&1; then
        echo "注意: ローカルサーバーが実行中です。データの整合性を保つため、サーバーを停止してから同期することを推奨します"
    fi
    
    # 本番環境のデータベースをバックアップ
    BACKUP_TIMESTAMP=$(date +%Y%m%d_%H%M%S)
    echo "本番環境のデータベースをバックアップ中..."
    
    flyctl sftp shell --app "$APP_NAME" <<EOF
get $REMOTE_DB /tmp/app.db.backup.$BACKUP_TIMESTAMP
EOF
    
    if [ $? -ne 0 ]; then
        echo "警告: バックアップの取得に失敗しましたが、続行します..."
    fi
    
    # アプリケーションを停止
    echo "アプリケーションを停止中..."
    flyctl scale count 0 -a "$APP_NAME" --yes || echo "警告: アプリケーションの停止に失敗しましたが、続行します..."
    
    sleep 5
    
    # SSH経由で既存のデータベースファイルを削除
    echo "既存のデータベースファイルを削除中..."
    flyctl ssh console -a "$APP_NAME" -C "rm -f $REMOTE_DB" || echo "警告: ファイルの削除に失敗しましたが、続行します..."
    
    sleep 2
    
    # データベースをアップロード
    echo "データベースをアップロード中..."
    flyctl sftp shell --app "$APP_NAME" <<EOF
put $LOCAL_DB $REMOTE_DB
EOF
    
    if [ $? -eq 0 ]; then
        echo "[$(date +'%Y-%m-%d %H:%M:%S')] ✓ データベースのアップロードが完了しました"
        echo "アプリケーションを再起動中..."
        flyctl scale count 1 -a "$APP_NAME" --yes
        echo "[$(date +'%Y-%m-%d %H:%M:%S')] ✓ 完了しました"
        return 0
    else
        echo "[$(date +'%Y-%m-%d %H:%M:%S')] ✗ データベースのアップロードに失敗しました"
        echo "アプリケーションを再起動中..."
        flyctl scale count 1 -a "$APP_NAME" --yes
        return 1
    fi
}

function check_db_integrity() {
    local db_file=$1
    if [ ! -f "$db_file" ]; then
        echo "エラー: データベースファイルが見つかりません: $db_file"
        return 1
    fi
    
    # SQLiteの整合性チェック
    sqlite3 "$db_file" "PRAGMA integrity_check;" > /tmp/integrity_check.txt 2>&1
    if grep -q "ok" /tmp/integrity_check.txt; then
        echo "✓ データベースの整合性チェック: OK"
        return 0
    else
        echo "✗ データベースの整合性チェック: 失敗"
        cat /tmp/integrity_check.txt
        return 1
    fi
}

function show_stats() {
    local db_file=$1
    if [ ! -f "$db_file" ]; then
        echo "データベースファイルが見つかりません: $db_file"
        return
    fi
    
    echo "=== データベース統計 ==="
    echo "ファイルサイズ: $(du -h "$db_file" | cut -f1)"
    echo ""
    echo "テーブル別レコード数:"
    sqlite3 "$db_file" <<EOF
SELECT 'users' as table_name, COUNT(*) as count FROM users
UNION ALL
SELECT 'schedules', COUNT(*) FROM schedules
UNION ALL
SELECT 'traffic', COUNT(*) FROM traffic
UNION ALL
SELECT 'stays', COUNT(*) FROM stays;
EOF
    echo ""
}

function auto_sync_loop() {
    local direction=$1  # "from" or "to"
    
    echo "自動同期を開始します（方向: $direction, 間隔: ${SYNC_INTERVAL}秒）"
    echo "停止するには Ctrl+C を押してください"
    echo ""
    
    while true; do
        if [ "$direction" = "from" ]; then
            sync_from_production
        else
            sync_to_production
        fi
        
        if [ $? -eq 0 ]; then
            show_stats "$LOCAL_DB"
        fi
        
        echo "[$(date +'%Y-%m-%d %H:%M:%S')] 次の同期まで ${SYNC_INTERVAL}秒待機中..."
        sleep "$SYNC_INTERVAL"
    done
}

function show_help() {
    echo "使用方法: $0 [command] [options]"
    echo ""
    echo "コマンド:"
    echo "  download          - 本番環境からデータベースをダウンロード（1回のみ）"
    echo "  upload            - ローカルのデータベースを本番環境にアップロード（1回のみ）"
    echo "  auto-from         - 本番環境からローカルへ自動同期（継続実行）"
    echo "  auto-to           - ローカルから本番環境へ自動同期（継続実行）"
    echo "  stats             - ローカルデータベースの統計を表示"
    echo "  stats-remote      - 本番環境データベースの統計を表示"
    echo "  integrity         - ローカルデータベースの整合性をチェック"
    echo ""
    echo "オプション:"
    echo "  --interval SECONDS - 自動同期の間隔を設定（デフォルト: 60秒）"
    echo ""
    echo "例:"
    echo "  $0 download                    # 本番環境 → ローカル（1回）"
    echo "  $0 upload                      # ローカル → 本番環境（1回）"
    echo "  $0 auto-from                   # 本番環境 → ローカル（自動、60秒間隔）"
    echo "  $0 auto-from --interval 300    # 本番環境 → ローカル（自動、5分間隔）"
    echo "  $0 stats                       # ローカルデータベースの統計"
}

# オプション解析
SYNC_INTERVAL=60
while [[ $# -gt 0 ]]; do
    case $1 in
        --interval)
            SYNC_INTERVAL="$2"
            shift 2
            ;;
        *)
            break
            ;;
    esac
done

case "$1" in
    download)
        sync_from_production
        if [ $? -eq 0 ]; then
            check_db_integrity "$LOCAL_DB"
            show_stats "$LOCAL_DB"
        fi
        ;;
    upload)
        if [ ! -f "$LOCAL_DB" ]; then
            echo "エラー: ローカルデータベースファイルが見つかりません: $LOCAL_DB"
            exit 1
        fi
        check_db_integrity "$LOCAL_DB"
        echo "警告: 本番環境のデータベースが上書きされます。続行しますか？ (y/N)"
        read -r response
        if [[ ! "$response" =~ ^[Yy]$ ]]; then
            echo "アップロードをキャンセルしました"
            exit 0
        fi
        sync_to_production
        ;;
    auto-from)
        auto_sync_loop "from"
        ;;
    auto-to)
        auto_sync_loop "to"
        ;;
    stats)
        show_stats "$LOCAL_DB"
        ;;
    stats-remote)
        echo "本番環境のデータベース統計を取得中..."
        flyctl ssh console -a "$APP_NAME" -C "sqlite3 $REMOTE_DB \"SELECT 'users' as table_name, COUNT(*) as count FROM users UNION ALL SELECT 'schedules', COUNT(*) FROM schedules UNION ALL SELECT 'traffic', COUNT(*) FROM traffic UNION ALL SELECT 'stays', COUNT(*) FROM stays;\"" || echo "統計の取得に失敗しました"
        ;;
    integrity)
        check_db_integrity "$LOCAL_DB"
        ;;
    *)
        show_help
        exit 1
        ;;
esac

