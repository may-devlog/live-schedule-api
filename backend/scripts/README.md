# データベース管理スクリプト

## sync-db.sh

ローカルと本番環境のデータベースを同期するスクリプトです。

### 使用方法

```bash
# 本番環境からローカルにダウンロード
bash backend/scripts/sync-db.sh download

# ローカルから本番環境にアップロード
bash backend/scripts/sync-db.sh upload
```

## パスワードの更新

### 方法1: create_userバイナリを使用（推奨）

```bash
cd backend
cargo run --bin create_user -- may04re@gmail.com "新しいパスワード"
```

その後、データベースを本番環境に同期：

```bash
bash backend/scripts/sync-db.sh upload
```

### 方法2: パスワードリセット機能を使用

1. パスワードリセット画面でメールアドレスを入力
2. メールで送られてきたリンクから新しいパスワードを設定

