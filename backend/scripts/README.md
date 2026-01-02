# データベース管理スクリプト

## sync-db.sh（手動同期）

ローカルと本番環境のデータベースを手動で同期するスクリプトです。

### 使用方法

```bash
# 本番環境からローカルにダウンロード
bash backend/scripts/sync-db.sh download

# ローカルから本番環境にアップロード
bash backend/scripts/sync-db.sh upload
```

## sync-db-auto.sh（自動同期）

ローカルと本番環境のデータベースを自動的に同期するスクリプトです。

### 主な機能

- **自動同期**: 指定した間隔で自動的にデータベースを同期
- **整合性チェック**: データベースの整合性を自動的にチェック
- **統計表示**: データベースの統計情報を表示
- **バックアップ**: 同期前に自動的にバックアップを作成

### 使用方法

```bash
# 本番環境からローカルへ自動同期（60秒間隔）
bash backend/scripts/sync-db-auto.sh auto-from

# ローカルから本番環境へ自動同期（60秒間隔）
bash backend/scripts/sync-db-auto.sh auto-to

# 同期間隔を変更（例: 5分間隔）
bash backend/scripts/sync-db-auto.sh auto-from --interval 300

# 1回だけ同期
bash backend/scripts/sync-db-auto.sh download  # 本番 → ローカル
bash backend/scripts/sync-db-auto.sh upload    # ローカル → 本番

# データベース統計を表示
bash backend/scripts/sync-db-auto.sh stats         # ローカル
bash backend/scripts/sync-db-auto.sh stats-remote # 本番

# データベース整合性チェック
bash backend/scripts/sync-db-auto.sh integrity
```

### 同期されるデータ

以下のテーブルが完全に同期されます：
- `users` - ユーザー情報
- `schedules` - スケジュール
- `traffic` - 交通情報
- `stays` - ホテル情報

### 注意事項

- 自動同期中は、Ctrl+Cで停止できます
- アップロード時は本番環境のアプリケーションが一時的に停止します
- 同期前に自動的にバックアップが作成されます

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

