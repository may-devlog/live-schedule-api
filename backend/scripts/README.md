# データベース管理スクリプト

本番環境（AWS EC2）のSQLiteデータベースは、毎日 `.github/workflows/backup-db.yml` によって
S3バケット（`database/YYYY/MM/app.db.<timestamp>.gz`）に自動バックアップされています。
閲覧用に取得したい場合は、AWSコンソールまたは `aws s3 cp` で最新のバックアップをダウンロードし、
`gunzip` して SQLite閲覧アプリ（TablePlus、DB Browser for SQLiteなど）で開いてください。

```bash
aws s3 ls s3://<AWS_BACKUP_BUCKET>/database/ --recursive | tail -5
aws s3 cp s3://<AWS_BACKUP_BUCKET>/database/2026/08/app.db.<timestamp>.gz .
gunzip app.db.<timestamp>.gz
```

## パスワードの更新

### 方法1: update-password.shを使用（推奨）

AWS SSM経由でEC2上のcreate_userバイナリを直接実行し、本番データベースを更新します。

```bash
export EC2_INSTANCE_ID=i-xxxxxxxxxxxx
bash backend/scripts/update-password.sh may04re@gmail.com "新しいパスワード"
```

### 方法2: パスワードリセット機能を使用

1. パスワードリセット画面でメールアドレスを入力
2. メールで送られてきたリンクから新しいパスワードを設定

