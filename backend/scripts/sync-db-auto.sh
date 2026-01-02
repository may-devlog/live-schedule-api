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

function backup_production_to_local() {
    echo "[$(date +'%Y-%m-%d %H:%M:%S')] 本番環境のデータベースをローカルにバックアップ中..."
    
    # バックアップディレクトリを作成
    mkdir -p data/backups
    
    # バックアップファイル名（タイムスタンプ付き）
    BACKUP_FILE="data/backups/production_backup_$(date +%Y%m%d_%H%M%S).db"
    
    # 本番環境からデータベースをダウンロード
    flyctl sftp shell --app "$APP_NAME" <<EOF
get $REMOTE_DB $BACKUP_FILE
EOF
    
    if [ $? -eq 0 ]; then
        echo "[$(date +'%Y-%m-%d %H:%M:%S')] ✓ バックアップが完了しました: $BACKUP_FILE"
        
        # バックアップの整合性チェック
        if check_db_integrity "$BACKUP_FILE"; then
            # ファイルサイズを表示
            echo "バックアップサイズ: $(du -h "$BACKUP_FILE" | cut -f1)"
            return 0
        else
            echo "警告: バックアップの整合性チェックに失敗しました"
            return 1
        fi
    else
        echo "[$(date +'%Y-%m-%d %H:%M:%S')] ✗ バックアップの作成に失敗しました"
        return 1
    fi
}

function sync_to_production() {
    echo "[$(date +'%Y-%m-%d %H:%M:%S')] ローカルのデータベースを本番環境にアップロード中..."
    
    # サーバーが実行中かチェック（アップロード時は警告のみ）
    if lsof -ti:3000 > /dev/null 2>&1 || lsof -ti:8081 > /dev/null 2>&1; then
        echo "注意: ローカルサーバーが実行中です。データの整合性を保つため、サーバーを停止してから同期することを推奨します"
    fi
    
    # 本番環境のデータベースをローカルにバックアップ（アップロード前に必ずバックアップ）
    echo "本番環境のデータベースをローカルにバックアップ中..."
    backup_production_to_local
    
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
    local background=$2  # "true" or "false"
    
    if [ "$background" = "true" ]; then
        # バックグラウンドで実行
        echo "自動同期をバックグラウンドで開始します（方向: $direction, 間隔: ${SYNC_INTERVAL}秒）"
        echo "ログファイル: data/sync-${direction}.log"
        echo "停止するには: pkill -f 'sync-db-auto.sh auto-${direction}'"
        echo ""
        
        # ログディレクトリを作成
        mkdir -p data
        
        # バックグラウンドで実行し、ログをファイルに出力
        nohup bash -c "
            while true; do
                if [ \"$direction\" = \"from\" ]; then
                    sync_from_production >> data/sync-${direction}.log 2>&1
                else
                    sync_to_production >> data/sync-${direction}.log 2>&1
                fi
                
                if [ \$? -eq 0 ]; then
                    show_stats \"$LOCAL_DB\" >> data/sync-${direction}.log 2>&1
                fi
                
                echo \"[$(date +'%Y-%m-%d %H:%M:%S')] 次の同期まで ${SYNC_INTERVAL}秒待機中...\" >> data/sync-${direction}.log
                sleep $SYNC_INTERVAL
            done
        " > /dev/null 2>&1 &
        
        echo "✓ バックグラウンドプロセスを開始しました（PID: $!）"
        echo "ログを確認: tail -f data/sync-${direction}.log"
        return 0
    else
        # フォアグラウンドで実行
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
    fi
}

function list_backups() {
    echo "=== ローカルのバックアップ一覧 ==="
    if [ ! -d "data/backups" ] || [ -z "$(ls -A data/backups 2>/dev/null)" ]; then
        echo "バックアップファイルが見つかりません"
        return
    fi
    
    echo ""
    echo "ファイル名 | サイズ | 作成日時"
    echo "----------------------------------------"
    for backup in data/backups/*.db; do
        if [ -f "$backup" ]; then
            filename=$(basename "$backup")
            size=$(du -h "$backup" | cut -f1)
            date=$(stat -f "%Sm" -t "%Y-%m-%d %H:%M:%S" "$backup" 2>/dev/null || stat -c "%y" "$backup" 2>/dev/null | cut -d' ' -f1,2 | cut -d'.' -f1)
            echo "$filename | $size | $date"
        fi
    done
    echo ""
}

function cleanup_old_backups() {
    local keep_days=${1:-30}  # デフォルトは30日
    echo "=== 古いバックアップの削除（${keep_days}日以上前） ==="
    
    if [ ! -d "data/backups" ]; then
        echo "バックアップディレクトリが見つかりません"
        return
    fi
    
    local deleted=0
    local current_time=$(date +%s)
    
    for backup in data/backups/*.db; do
        if [ -f "$backup" ]; then
            local file_time=$(stat -f "%m" "$backup" 2>/dev/null || stat -c "%Y" "$backup" 2>/dev/null)
            local age_days=$(( (current_time - file_time) / 86400 ))
            
            if [ "$age_days" -ge "$keep_days" ]; then
                echo "削除: $(basename "$backup") (${age_days}日前)"
                rm "$backup"
                deleted=$((deleted + 1))
            fi
        fi
    done
    
    if [ "$deleted" -eq 0 ]; then
        echo "削除するバックアップはありません"
    else
        echo "✓ ${deleted}個のバックアップを削除しました"
    fi
}

function show_help() {
    echo "使用方法: $0 [command] [options]"
    echo ""
    echo "コマンド:"
    echo "  download          - 本番環境からデータベースをダウンロード（ローカルDBを上書き）"
    echo "  backup            - 本番環境のデータベースをバックアップ（ローカルDBは上書きしない）"
    echo "  upload            - ローカルのデータベースを本番環境にアップロード（1回のみ）"
    echo "  auto-from         - 本番環境からローカルへ自動同期（継続実行）"
    echo "  auto-to           - ローカルから本番環境へ自動同期（継続実行）"
    echo "  stop              - 実行中の自動同期を停止"
    echo "  status            - 自動同期の実行状態を確認"
    echo "  backups           - ローカルのバックアップ一覧を表示"
    echo "  cleanup           - 古いバックアップを削除（デフォルト: 30日以上前）"
    echo "  stats             - ローカルデータベースの統計を表示"
    echo "  stats-remote      - 本番環境データベースの統計を表示"
    echo "  integrity         - ローカルデータベースの整合性をチェック"
    echo ""
    echo "オプション:"
    echo "  --interval SECONDS - 自動同期の間隔を設定（デフォルト: 60秒）"
    echo "  --background       - バックグラウンドで実行（ターミナルを閉じても継続）"
    echo "  --keep-days DAYS   - バックアップ保持期間（デフォルト: 30日）"
    echo ""
    echo "例:"
    echo "  $0 backup                    # 本番環境をバックアップ（推奨）"
    echo "  $0 download                  # 本番環境 → ローカル（ローカルDBを上書き）"
    echo "  $0 upload                    # ローカル → 本番環境（1回）"
    echo "  $0 backups                   # バックアップ一覧を表示"
    echo "  $0 cleanup                   # 30日以上前のバックアップを削除"
    echo "  $0 cleanup --keep-days 7      # 7日以上前のバックアップを削除"
    echo "  $0 auto-from --background    # 本番環境 → ローカル（自動、バックグラウンド）"
    echo "  $0 stats                     # ローカルデータベースの統計"
}

# オプション解析
SYNC_INTERVAL=60
BACKGROUND=false
KEEP_DAYS=30
while [[ $# -gt 0 ]]; do
    case $1 in
        --interval)
            SYNC_INTERVAL="$2"
            shift 2
            ;;
        --background)
            BACKGROUND=true
            shift
            ;;
        --keep-days)
            KEEP_DAYS="$2"
            shift 2
            ;;
        *)
            break
            ;;
    esac
done

function stop_sync() {
    echo "実行中の自動同期プロセスを検索中..."
    PIDS=$(pgrep -f "sync-db-auto.sh auto-")
    if [ -z "$PIDS" ]; then
        echo "実行中の自動同期プロセスは見つかりませんでした"
        return 0
    fi
    
    echo "以下のプロセスを停止します:"
    ps -p "$PIDS" -o pid,command
    echo ""
    echo "停止しますか？ (y/N)"
    read -r response
    if [[ "$response" =~ ^[Yy]$ ]]; then
        pkill -f "sync-db-auto.sh auto-"
        echo "✓ 自動同期プロセスを停止しました"
    else
        echo "停止をキャンセルしました"
    fi
}

function show_status() {
    echo "自動同期プロセスの状態:"
    PIDS=$(pgrep -f "sync-db-auto.sh auto-")
    if [ -z "$PIDS" ]; then
        echo "実行中の自動同期プロセスはありません"
    else
        echo "実行中のプロセス:"
        ps -p "$PIDS" -o pid,etime,command
        echo ""
        echo "ログファイル:"
        if [ -f "data/sync-from.log" ]; then
            echo "  data/sync-from.log (最終更新: $(stat -f "%Sm" -t "%Y-%m-%d %H:%M:%S" data/sync-from.log 2>/dev/null || stat -c "%y" data/sync-from.log 2>/dev/null))"
        fi
        if [ -f "data/sync-to.log" ]; then
            echo "  data/sync-to.log (最終更新: $(stat -f "%Sm" -t "%Y-%m-%d %H:%M:%S" data/sync-to.log 2>/dev/null || stat -c "%y" data/sync-to.log 2>/dev/null))"
        fi
    fi
}

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
        auto_sync_loop "from" "$BACKGROUND"
        ;;
    auto-to)
        auto_sync_loop "to" "$BACKGROUND"
        ;;
    backup)
        backup_production_to_local
        ;;
    stop)
        stop_sync
        ;;
    status)
        show_status
        ;;
    backups)
        list_backups
        ;;
    cleanup)
        cleanup_old_backups "$KEEP_DAYS"
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

