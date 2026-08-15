# GitHub Actions ワークフローの再実行方法

## 🔄 ワークフローを再実行する手順

### 方法1: 失敗したワークフローから再実行

1. **現在表示しているページ（失敗したワークフロー）で**
   - 右上の「**Re-run jobs**」ボタンをクリック
   - または「**Re-run all jobs**」をクリック

2. **確認ダイアログが表示されたら**
   - 「Re-run jobs」をクリック

### 方法2: ワークフロー一覧から再実行

1. **左側のサイドバーで「Database Backup」をクリック**
   - ワークフロー一覧ページに戻ります

2. **右上の「Run workflow」ボタンをクリック**

3. **「Run workflow」をクリック**
   - 新しいワークフローが実行されます

## ✅ 再実行後の確認

### 成功時の確認項目

1. **各ステップのログを確認**
   - 「✓」マークが表示されていれば成功
   - 各ステップをクリックして詳細を確認

2. **SQLiteバックアップの整合性検証**
   - 「SQLite backup verified: tables=..., schedules=...」が表示される

3. **S3へのアップロード**
   - 「Backup completed: s3://.../database/YYYY/MM/app.db.<timestamp>.gz」が表示される
   - AWSコンソールまたは `aws s3 ls s3://<AWS_BACKUP_BUCKET>/database/` で確認可能

### まだ失敗する場合

各ステップのログを確認して、エラーメッセージを確認してください。

よくあるエラー：
- 「EC2_INSTANCE_ID secret is not set」「AWS_BACKUP_BUCKET repository variable is not set」→ リポジトリのSecrets/Variablesが未設定
- 「configure-aws-credentials」ステップで失敗 → `AWS_ROLE_ARN` のOIDC信頼関係を確認
- 「The live-schedule-api service is not running.」→ EC2インスタンス側でサービスが停止している





