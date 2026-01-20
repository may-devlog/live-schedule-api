# AWS移行計画 - 切り替え手順と検証

## 1. 並行運用期間の設定

### 1.1 両環境の同時運用

**期間**: 1-2週間（推奨）

**構成:**
- **旧環境**: Fly.io（既存のトラフィック）
- **新環境**: AWS（検証用トラフィック）

**DNS設定:**
- 本番: `api.yourdomain.com` → Fly.io（既存）
- 検証: `api-aws.yourdomain.com` → AWS ALB（新規）

### 1.2 検証用エンドポイントの作成

Route53で検証用Aレコードを作成：
- **レコード名**: `api-aws`
- **エイリアス先**: AWS ALB

## 2. データ同期の確認

### 2.1 初期データ移行

```bash
# SQLiteからPostgreSQLへのデータ移行を実行
cd backend
./scripts/migrate-sqlite-to-postgresql.sh
```

### 2.2 データ整合性の確認

```bash
# レコード数の確認
# SQLite
sqlite3 data/app.db "SELECT COUNT(*) FROM users;"
sqlite3 data/app.db "SELECT COUNT(*) FROM schedules;"

# PostgreSQL
psql $DATABASE_URL -c "SELECT COUNT(*) FROM users;"
psql $DATABASE_URL -c "SELECT COUNT(*) FROM schedules;"
```

### 2.3 データの比較スクリプト

`backend/scripts/compare-data.sh`を作成：

```bash
#!/bin/bash
# SQLiteとPostgreSQLのデータを比較

SQLITE_DB="data/app.db"
PG_URL="${DATABASE_URL}"

echo "=== Comparing Users ==="
SQLITE_COUNT=$(sqlite3 "$SQLITE_DB" "SELECT COUNT(*) FROM users;")
PG_COUNT=$(psql "$PG_URL" -t -c "SELECT COUNT(*) FROM users;")
echo "SQLite: $SQLITE_COUNT"
echo "PostgreSQL: $PG_COUNT"

echo "=== Comparing Schedules ==="
SQLITE_COUNT=$(sqlite3 "$SQLITE_DB" "SELECT COUNT(*) FROM schedules;")
PG_COUNT=$(psql "$PG_URL" -t -c "SELECT COUNT(*) FROM schedules;")
echo "SQLite: $SQLITE_COUNT"
echo "PostgreSQL: $PG_COUNT"

# その他のテーブルも同様に比較
```

## 3. 機能テスト

### 3.1 APIエンドポイントのテスト

**テストスクリプト** `backend/scripts/test-api.sh`:

```bash
#!/bin/bash
# APIエンドポイントのテスト

BASE_URL="${1:-https://api-aws.yourdomain.com}"

echo "=== Testing API Endpoints ==="

# ヘルスチェック
echo "1. Health Check"
curl -f "${BASE_URL}/health" || echo "FAILED"

# 公開スケジュール取得
echo "2. Public Schedules"
curl -f "${BASE_URL}/public/schedules" || echo "FAILED"

# 認証テスト（必要に応じて）
echo "3. Login Test"
# curl -X POST "${BASE_URL}/auth/login" \
#   -H "Content-Type: application/json" \
#   -d '{"email":"test@example.com","password":"test"}' || echo "FAILED"

echo "=== Tests Completed ==="
```

### 3.2 負荷テスト

**Apache Benchを使用:**

```bash
# インストール（macOS）
brew install httpd

# 負荷テスト実行
ab -n 1000 -c 10 https://api-aws.yourdomain.com/health
```

**または、k6を使用:**

```javascript
// load-test.js
import http from 'k6/http';
import { check } from 'k6';

export let options = {
  stages: [
    { duration: '30s', target: 10 },
    { duration: '1m', target: 20 },
    { duration: '30s', target: 0 },
  ],
};

export default function () {
  let res = http.get('https://api-aws.yourdomain.com/health');
  check(res, { 'status was 200': (r) => r.status == 200 });
}
```

実行:
```bash
k6 run load-test.js
```

## 4. パフォーマンス比較

### 4.1 レスポンスタイムの測定

```bash
# 旧環境（Fly.io）
time curl -s https://live-schedule-api.fly.dev/health

# 新環境（AWS）
time curl -s https://api-aws.yourdomain.com/health
```

### 4.2 CloudWatchメトリクスの確認

**AWSマネジメントコンソールでの確認:**

1. **CloudWatchダッシュボード**に移動
2. 以下のメトリクスを確認：
   - **ECS**: CPU使用率、メモリ使用率
   - **ALB**: リクエスト数、ターゲットレスポンス時間、エラー率
   - **RDS**: CPU使用率、接続数、読み取り/書き込みIOPS

## 5. 本番切り替え手順

### 5.1 切り替え前の最終確認

- [ ] データ整合性の確認完了
- [ ] 機能テスト完了
- [ ] 負荷テスト完了
- [ ] パフォーマンス確認完了
- [ ] バックアップ取得完了
- [ ] ロールバック手順の確認

### 5.2 DNS切り替え

**Route53での操作:**

1. **Route53ダッシュボード**に移動
2. `api.yourdomain.com`のAレコードを編集
3. **エイリアス先**をFly.ioからAWS ALBに変更
4. **TTL**を60秒に設定（切り替えが早い場合）

**注意**: DNSの伝播には数分かかる場合があります。

### 5.3 切り替え後の監視

**最初の1時間は特に注意深く監視:**

```bash
# エラーログの確認
aws logs tail /ecs/live-schedule-api --follow --region ap-northeast-1

# メトリクスの確認
aws cloudwatch get-metric-statistics \
  --namespace AWS/ApplicationELB \
  --metric-name TargetResponseTime \
  --dimensions Name=LoadBalancer,Value=<ALB-ARN> \
  --start-time $(date -u -d '1 hour ago' +%Y-%m-%dT%H:%M:%S) \
  --end-time $(date -u +%Y-%m-%dT%H:%M:%S) \
  --period 60 \
  --statistics Average \
  --region ap-northeast-1
```

### 5.4 フロントエンドの確認

**ブラウザで確認:**
- [ ] ログイン機能
- [ ] スケジュール一覧表示
- [ ] スケジュール作成・編集
- [ ] 宿泊情報の表示
- [ ] 共有機能

## 6. ロールバック手順

### 6.1 問題が発生した場合

**即座にロールバック:**

1. **Route53**でDNSレコードをFly.ioに戻す
2. 問題の原因を調査
3. 修正後、再度切り替え

### 6.2 データのロールバック

**PostgreSQLからSQLiteへのエクスポート（必要に応じて）:**

```bash
# PostgreSQLデータをSQL形式でエクスポート
pg_dump $DATABASE_URL > backup_postgres.sql

# SQLiteにインポート（変換が必要）
# 手動でSQLを変換するか、ツールを使用
```

## 7. Fly.io環境の停止

### 7.1 切り替え成功後の処理

**1-2週間の監視期間後:**

1. **Fly.ioアプリの停止**
```bash
flyctl apps suspend live-schedule-api
```

2. **ボリュームのバックアップ（念のため）**
```bash
flyctl volumes list --app live-schedule-api
flyctl sftp shell --app live-schedule-api <<EOF
get /app/data/app.db data/backups/final_backup_$(date +%Y%m%d).db
EOF
```

3. **アプリの削除（任意）**
```bash
# 注意: この操作は取り消せません
# flyctl apps destroy live-schedule-api
```

## 8. 移行後の最適化

### 8.1 コスト最適化

- **RDS**: インスタンスサイズの見直し
- **ECS**: タスク数の調整
- **ALB**: 不要なリスナーの削除
- **CloudWatch**: ログ保持期間の調整

### 8.2 パフォーマンス最適化

- **RDS**: 接続プールの調整
- **ECS**: タスクサイズの最適化
- **ALB**: ターゲットグループの設定調整

### 8.3 セキュリティ強化

- **WAF**: Application Load BalancerにWAFを追加
- **VPC**: セキュリティグループの見直し
- **Secrets Manager**: シークレットの自動ローテーション設定

## 9. ドキュメントの更新

### 9.1 更新が必要なドキュメント

- [ ] README.md（デプロイ手順）
- [ ] 環境変数の説明
- [ ] トラブルシューティングガイド
- [ ] 監視・アラート設定

## 次のステップ

- [06-cost-estimate.md](./06-cost-estimate.md) - 料金見積もり

