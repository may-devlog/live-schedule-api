# 災害復旧・リソース不足対策ガイド（無料プラン対応）

リソース不足でデプロイできない場合に備えた対策手順です。

## 📋 対策の概要

1. **バックアップリージョンの準備**: シンガポールリージョンにバックアップ環境を構築
2. **データベースの定期バックアップ**: 定期的にデータベースをバックアップ
3. **リージョン切り替え手順**: 東京リージョンでリソース不足が発生した場合の切り替え方法

---

## 1. バックアップリージョンの準備（事前設定）

### ステップ1: シンガポールリージョンにボリュームを作成

```bash
cd backend
fly volumes create data_backup --region sin --size 1
```

### ステップ2: バックアップ用の設定ファイルを作成

`fly.toml.backup` を作成（`primary_region` を `sin` に変更）：

```toml
# Fly.io設定ファイル（バックアップ用）
app = "live-schedule-api"
primary_region = "sin"  # シンガポールリージョン

[build]
  dockerfile = "Dockerfile"

[env]
  PORT = "3000"

[http_service]
  internal_port = 3000
  force_https = true
  auto_stop_machines = false
  auto_start_machines = true
  min_machines_running = 1
  processes = ["app"]

[[vm]]
  cpu_kind = "shared"
  cpus = 1
  memory_mb = 256

[mounts]
  source = "data_backup"
  destination = "/app/data"
```

### ステップ3: バックアップリージョンへの初回デプロイ

```bash
# バックアップ用設定でデプロイ
fly deploy --config fly.toml.backup --region sin
```

**注意**: 初回は空のデータベースでデプロイされます。データベースの同期は後で行います。

---

## 2. データベースの定期バックアップ

### 手動バックアップ

```bash
cd backend
./scripts/sync-db.sh download
```

これで `data/app.db` に本番データベースがダウンロードされます。

### 自動バックアップスクリプト（推奨）

`backend/scripts/backup-db.sh` を作成：

```bash
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
    find "$BACKUP_DIR" -name "app.db.backup.*" -mtime +30 -delete
    echo "古いバックアップを削除しました（30日以上前）"
else
    echo "[$(date +'%Y-%m-%d %H:%M:%S')] ✗ バックアップに失敗しました"
    exit 1
fi
```

実行権限を付与：

```bash
chmod +x backend/scripts/backup-db.sh
```

### cronで定期実行（オプション）

```bash
# 毎日午前3時にバックアップ
0 3 * * * cd /path/to/live-schedule-api/backend && ./scripts/backup-db.sh >> logs/backup.log 2>&1
```

---

## 3. リージョン切り替え手順（緊急時）

東京リージョンでリソース不足が発生し、デプロイできない場合の手順です。

### ステップ1: 最新のデータベースをバックアップ

```bash
cd backend
./scripts/sync-db.sh download
```

### ステップ2: シンガポールリージョンにデータベースをアップロード

```bash
# バックアップ用設定でデプロイ
fly deploy --config fly.toml.backup --region sin

# データベースをアップロード
flyctl sftp shell --app live-schedule-api --region sin <<EOF
put data/app.db /app/data/app.db
EOF
```

### ステップ3: 環境変数の確認

シンガポールリージョンでも同じ環境変数が使用されます（アプリ単位で設定されるため）。

### ステップ4: 動作確認

```bash
# シンガポールリージョンのURLを確認
fly status --region sin

# ヘルスチェック
curl https://live-schedule-api.fly.dev/health
```

### ステップ5: フロントエンドの環境変数を更新（必要に応じて）

通常、`api.skdrec.null-dev.tech` は自動的に最適なリージョンにルーティングされますが、明示的にシンガポールリージョンを使用する場合は、Fly.ioのDNS設定を確認してください。

---

## 4. リージョン間のデータベース同期（双方向）

### 東京 → シンガポール

```bash
# 東京リージョンからダウンロード
flyctl sftp shell --app live-schedule-api --region nrt <<EOF
get /app/data/app.db data/app.db.tokyo
EOF

# シンガポールリージョンにアップロード
flyctl sftp shell --app live-schedule-api --region sin <<EOF
put data/app.db.tokyo /app/data/app.db
EOF
```

### シンガポール → 東京

```bash
# シンガポールリージョンからダウンロード
flyctl sftp shell --app live-schedule-api --region sin <<EOF
get /app/data/app.db data/app.db.singapore
EOF

# 東京リージョンにアップロード
flyctl sftp shell --app live-schedule-api --region nrt <<EOF
put data/app.db.singapore /app/data/app.db
EOF
```

---

## 5. リソース状況の確認

### リージョンのリソース状況を確認

```bash
fly platform regions | grep -E "Tokyo|Singapore|nrt|sin"
```

### デプロイ状況の確認

```bash
fly status
fly releases
```

---

## 6. 推奨される運用フロー

### 日常運用

1. **週1回**: データベースのバックアップを実行
2. **月1回**: シンガポールリージョンのデータベースを更新（念のため）

### リソース不足が発生した場合

1. **即座**: 最新のデータベースをバックアップ
2. **30分以内**: シンガポールリージョンに切り替え
3. **復旧後**: 東京リージョンに戻す（データベースを同期）

---

## 4. 東京リージョンへの復帰手順

シンガポールリージョンに避難した後、東京リージョンが復旧したら戻すことができます。

### 事前確認（推奨）

東京リージョンに戻す前に、リソース状況を確認：

```bash
cd backend
./scripts/check-region-resources.sh nrt
```

**結果の見方**:
- ✅ **CAPACITY > 0**: リソースが利用可能。デプロイを試行できます
- ❌ **CAPACITY < 0**: リソース不足。デプロイが失敗する可能性が高い

### 自動復帰スクリプト（推奨）

リソースが利用可能なことを確認したら、復帰スクリプトを実行：

```bash
cd backend
./scripts/switch-back-to-primary-region.sh
```

このスクリプトは以下の処理を自動実行します：

1. **シンガポールリージョンから最新のデータベースをバックアップ**
2. **東京リージョンにデプロイ**
3. **バックアップしたデータベースを東京リージョンにアップロード**
4. **アプリを再起動**

### 手動復帰手順

#### ステップ1: シンガポールリージョンからデータベースをダウンロード

```bash
# 最新のデータベースをバックアップ
mkdir -p data/backups
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
BACKUP_FILE="data/backups/app.db.backup.${TIMESTAMP}"

flyctl sftp shell --app live-schedule-api --region sin <<EOF
get /app/data/app.db $BACKUP_FILE
EOF
```

#### ステップ2: 東京リージョンにデプロイ

```bash
# 通常の設定で東京リージョンにデプロイ
fly deploy --region nrt
```

**注意**: リソース不足が解消されていない場合は、デプロイが失敗する可能性があります。その場合は、シンガポールリージョンで運用を継続してください。

#### ステップ3: データベースを東京リージョンにアップロード

```bash
# アプリを一時停止
fly scale count 0 --region nrt --yes
sleep 5

# データベースをアップロード
flyctl sftp shell --app live-schedule-api --region nrt <<EOF
put $BACKUP_FILE /app/data/app.db
EOF

# アプリを再起動
fly scale count 1 --region nrt --yes
```

#### ステップ4: 動作確認

```bash
# 東京リージョンの状態を確認
fly status --region nrt

# ヘルスチェック
curl https://live-schedule-api.fly.dev/health
```

#### ステップ5: シンガポールリージョンの停止（オプション）

不要になったら、シンガポールリージョンのマシンを停止してコストを節約できます：

```bash
# シンガポールリージョンのマシンを停止
fly scale count 0 --region sin --yes
```

**注意**: ボリュームは残るため、次回避難する際に再利用できます。

---

## 7. 注意事項

### 無料プランの制限

- **ボリューム**: リージョンごとに別々のボリュームが必要
- **ストレージ**: 30日間停止しているマシンのディスクスペースに課金が発生（2024年4月以降）
- **メモリ**: 256MBのVMを最大3台まで（合計768MB）

### データの整合性

- リージョン間でデータベースを手動で同期する必要があります
- 同時に両方のリージョンで書き込みを行うと、データの不整合が発生する可能性があります
- **推奨**: 通常は1つのリージョンで運用し、緊急時のみバックアップリージョンに切り替える

---

## 8. トラブルシューティング

### ボリュームが見つからない

```bash
# ボリューム一覧を確認
fly volumes list

# ボリュームを作成
fly volumes create data_backup --region sin --size 1
```

### デプロイが失敗する

```bash
# ログを確認
fly logs --region sin

# リソース状況を確認
fly platform regions | grep sin
```

### データベースのアップロードが失敗する

```bash
# アプリを停止してからアップロード
fly scale count 0 --region sin
flyctl sftp shell --app live-schedule-api --region sin <<EOF
put data/app.db /app/data/app.db
EOF
fly scale count 1 --region sin
```

---

## まとめ

無料プランでも、以下の対策でリソース不足に対応できます：

1. ✅ **バックアップリージョンの準備**: シンガポールリージョンにバックアップ環境を構築
2. ✅ **定期バックアップ**: 週1回のデータベースバックアップ
3. ✅ **緊急時切り替え**: 30分以内にバックアップリージョンに切り替え可能

これにより、東京リージョンでリソース不足が発生しても、アプリを継続して利用できます。

