# AWS移行計画 - 移行前の準備とデータベース移行

## 1. 移行前のチェックリスト

### データバックアップ
- [ ] Fly.ioからデータベースファイルをダウンロード
- [ ] バックアップファイルの整合性確認
- [ ] 複数のバックアップ場所に保存（ローカル、S3、Backblaze B2など）

### 現在の環境変数確認
- [ ] `JWT_SECRET`
- [ ] `DATABASE_URL`
- [ ] `BASE_URL`
- [ ] `FRONTEND_URL`
- [ ] `ALLOWED_ORIGIN`
- [ ] `RESEND_API_KEY`
- [ ] その他の環境変数

### 依存関係の確認
- [ ] 現在のSQLiteスキーマの確認
- [ ] 外部API連携（Resendなど）の確認
- [ ] フロントエンドとのAPI契約の確認

## 2. SQLiteからPostgreSQLへの移行

### 2.1 データベーススキーマの変換

SQLiteとPostgreSQLの主な違い：
- `INTEGER PRIMARY KEY AUTOINCREMENT` → `SERIAL PRIMARY KEY`
- `TEXT` → `TEXT` または `VARCHAR`
- `INTEGER NOT NULL DEFAULT 0` → `INTEGER NOT NULL DEFAULT 0`（同じ）
- 日時型: SQLiteは`TEXT`、PostgreSQLは`TIMESTAMP`

### 2.2 移行スクリプトの作成

`backend/scripts/migrate-sqlite-to-postgresql.sh`を作成：

```bash
#!/bin/bash
# SQLiteからPostgreSQLへのデータ移行スクリプト

set -e

SQLITE_DB="data/app.db"
PG_HOST="${PG_HOST:-localhost}"
PG_PORT="${PG_PORT:-5432}"
PG_DB="${PG_DB:-live_schedule}"
PG_USER="${PG_USER:-postgres}"
PG_PASSWORD="${PG_PASSWORD}"

if [ -z "$PG_PASSWORD" ]; then
    echo "Error: PG_PASSWORD environment variable is required"
    exit 1
fi

echo "=== SQLite to PostgreSQL Migration ==="
echo "Source: $SQLITE_DB"
echo "Target: $PG_HOST:$PG_PORT/$PG_DB"

# pgloaderを使用（推奨）
# インストール: brew install pgloader (macOS) または apt-get install pgloader (Linux)
if command -v pgloader &> /dev/null; then
    echo "Using pgloader for migration..."
    pgloader \
        "sqlite://$SQLITE_DB" \
        "postgresql://$PG_USER:$PG_PASSWORD@$PG_HOST:$PG_PORT/$PG_DB"
else
    echo "pgloader not found. Using manual migration..."
    # 手動移行の場合は、sqlite3とpsqlを使用
    # 詳細は後述
fi

echo "Migration completed!"
```

### 2.3 手動移行手順（pgloaderが使えない場合）

1. **SQLiteデータのエクスポート**
```bash
cd backend
sqlite3 data/app.db <<EOF
.mode insert users
.output users.sql
SELECT * FROM users;

.mode insert schedules
.output schedules.sql
SELECT * FROM schedules;

.mode insert traffics
.output traffics.sql
SELECT * FROM traffics;

.mode insert stays
.output stays.sql
SELECT * FROM stays;

.mode insert select_options
.output select_options.sql
SELECT * FROM select_options;

.mode insert stay_select_options
.output stay_select_options.sql
SELECT * FROM stay_select_options;

.mode insert masked_locations
.output masked_locations.sql
SELECT * FROM masked_locations;

.mode insert notifications
.output notifications.sql
SELECT * FROM notifications;
EOF
```

2. **PostgreSQLスキーマの作成**
   - `backend/src/database.rs`をPostgreSQL用に修正
   - または、新しい`backend/src/database_postgres.rs`を作成

3. **データのインポート**
   - エクスポートしたSQLファイルをPostgreSQL用に変換
   - `psql`コマンドでインポート

## 3. アプリケーションコードの変更

### 3.1 Cargo.tomlの更新

```toml
[dependencies]
# SQLiteからPostgreSQLに変更
sqlx = { version = "0.7", features = ["runtime-tokio-rustls", "postgres", "chrono"] }
# SQLiteの依存関係を削除
# sqlx = { version = "0.7", features = ["runtime-tokio-rustls", "sqlite", "chrono"] }
```

### 3.2 database.rsの変更

```rust
// backend/src/database.rs

use sqlx::{Pool, Postgres, postgres::PgPoolOptions};

pub async fn create_pool() -> Result<Pool<Postgres>, sqlx::Error> {
    let database_url = std::env::var("DATABASE_URL")
        .expect("DATABASE_URL must be set");
    
    let pool = PgPoolOptions::new()
        .max_connections(10) // PostgreSQLはより多くの接続をサポート
        .connect(&database_url)
        .await?;
    
    Ok(pool)
}
```

### 3.3 スキーマ定義の変更

主な変更点：
- `INTEGER PRIMARY KEY AUTOINCREMENT` → `SERIAL PRIMARY KEY`
- `TEXT` → `TEXT`（同じだが、日時型は`TIMESTAMP`に変更）
- `INTEGER NOT NULL DEFAULT 0` → `INTEGER NOT NULL DEFAULT 0`（同じ）

例：
```sql
-- SQLite
CREATE TABLE users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT NOT NULL UNIQUE,
  created_at TEXT
);

-- PostgreSQL
CREATE TABLE users (
  id SERIAL PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

### 3.4 クエリの調整

SQLite固有の構文をPostgreSQL用に変更：
- `||`（文字列連結）→ `||`（同じ）
- `datetime('now')` → `CURRENT_TIMESTAMP`
- `strftime('%Y-%m-%d %H:%M:%S', ...)` → `TO_CHAR(..., 'YYYY-MM-DD HH24:MI:SS')`

## 4. ローカルでのテスト

### 4.1 PostgreSQLのローカルセットアップ

```bash
# DockerでPostgreSQLを起動
docker run --name postgres-test \
  -e POSTGRES_PASSWORD=postgres \
  -e POSTGRES_DB=live_schedule \
  -p 5432:5432 \
  -d postgres:15

# 環境変数を設定
export DATABASE_URL="postgresql://postgres:postgres@localhost:5432/live_schedule"

# アプリケーションを実行
cd backend
cargo run
```

### 4.2 データ移行のテスト

```bash
# SQLiteデータをエクスポート
sqlite3 data/app.db .dump > backup.sql

# PostgreSQLにインポート（スキーマ変換が必要）
# pgloaderを使用するか、手動で変換
```

## 5. 環境変数の準備

移行時に必要な環境変数のリスト：

```bash
# データベース
DATABASE_URL=postgresql://user:password@host:5432/dbname

# 認証
JWT_SECRET=<既存の値または新規生成>

# URL
BASE_URL=https://api.yourdomain.com
FRONTEND_URL=https://yourdomain.com
ALLOWED_ORIGIN=https://yourdomain.com

# その他
RESEND_API_KEY=<既存の値>
RUST_LOG=info
```

## 6. バックアップ戦略

### 6.1 移行前のバックアップ

```bash
# Fly.ioからデータベースをダウンロード
flyctl sftp shell --app live-schedule-api <<EOF
get /app/data/app.db data/backups/app.db.$(date +%Y%m%d_%H%M%S)
EOF

# 複数の場所に保存
aws s3 cp data/backups/app.db.* s3://your-backup-bucket/sqlite-backups/
```

### 6.2 移行後のバックアップ設定

- RDS自動バックアップ（7日間保持）
- 手動スナップショット（重要データ前）
- S3への定期エクスポート（月次）

## 次のステップ

- [03-aws-setup.md](./03-aws-setup.md) - AWS環境構築手順

