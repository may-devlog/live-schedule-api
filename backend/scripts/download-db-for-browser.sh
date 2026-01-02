#!/bin/bash
# 本番データベースをダウンロードしてSQLite閲覧アプリで開くためのスクリプト
# ローカルのデータベースは上書きしません（別ファイルとして保存）
#
# 本番データベースの場所: Fly.ioサーバー上の /app/data/app.db
# ローカルデータベースの場所: backend/data/app.db
# ダウンロード先: backend/data/production.db

set -e

APP_NAME="live-schedule-api"
REMOTE_DB="/app/data/app.db"
LOCAL_DB_DIR="data"
PRODUCTION_DB="${LOCAL_DB_DIR}/production.db"

# データディレクトリが存在しない場合は作成
mkdir -p "$LOCAL_DB_DIR"

echo "本番環境からデータベースをダウンロード中..."
echo "注意: ローカルのデータベース（data/app.db）は変更されません"
echo "      本番データベースは ${PRODUCTION_DB} として保存されます"
echo ""

# 既存の本番データベースファイルがあればバックアップ
if [ -f "$PRODUCTION_DB" ]; then
    BACKUP_FILE="${PRODUCTION_DB}.backup.$(date +%Y%m%d_%H%M%S)"
    echo "既存の本番データベースをバックアップ: $BACKUP_FILE"
    cp "$PRODUCTION_DB" "$BACKUP_FILE"
fi

# 既存のファイルを削除（flyctl sftpは既存ファイルを上書きしないため）
if [ -f "$PRODUCTION_DB" ]; then
    rm "$PRODUCTION_DB"
fi

# 本番環境からデータベースをダウンロード
flyctl sftp shell --app "$APP_NAME" <<EOF
get $REMOTE_DB $PRODUCTION_DB
EOF

if [ $? -eq 0 ]; then
    echo ""
    echo "✓ データベースのダウンロードが完了しました"
    echo "  ファイル: $(pwd)/${PRODUCTION_DB}"
    echo ""
    echo "SQLite閲覧アプリで開く方法:"
    echo "  ファイル: $(pwd)/${PRODUCTION_DB}"
    echo ""
    echo "  推奨アプリ:"
    echo "  1. TablePlus（無料版）: https://tableplus.com/"
    echo "  2. DB Browser for SQLite: https://sqlitebrowser.org/"
    echo ""
    
    # macOSの場合、利用可能なアプリで自動的に開く
    if [[ "$OSTYPE" == "darwin"* ]]; then
        if command -v open &> /dev/null; then
            echo "利用可能なアプリで開きますか？ (y/N)"
            read -r response
            if [[ "$response" =~ ^[Yy]$ ]]; then
                # TablePlusを優先
                if [ -d "/Applications/TablePlus.app" ]; then
                    open -a "TablePlus" "$PRODUCTION_DB"
                    echo "✓ TablePlusで開きました"
                elif [ -d "/Applications/DB Browser for SQLite.app" ]; then
                    open -a "DB Browser for SQLite" "$PRODUCTION_DB"
                    echo "✓ DB Browser for SQLiteで開きました"
                else
                    echo "警告: SQLite閲覧アプリが見つかりません"
                    echo "     以下のアプリをインストールしてください:"
                    echo "     - TablePlus: https://tableplus.com/"
                    echo "     - DB Browser for SQLite: https://sqlitebrowser.org/"
                    echo ""
                    echo "     または、手動でファイルを開いてください:"
                    echo "     $(pwd)/${PRODUCTION_DB}"
                fi
            fi
        fi
    fi
else
    echo "✗ データベースのダウンロードに失敗しました"
    exit 1
fi

