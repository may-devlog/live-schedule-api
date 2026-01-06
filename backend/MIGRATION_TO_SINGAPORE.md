# シンガポールリージョンへの移行手順（緊急時テスト）

## 📋 事前確認事項

### 1. ボリュームの確認

シンガポールリージョンにボリューム（`data_backup`）が作成されているか確認：

```bash
cd backend
fly volumes list
```

**`data_backup` が存在しない場合**、以下のコマンドで作成：

```bash
fly volumes create data_backup --region sin --size 1
```

### 2. 環境変数の確認

環境変数（secrets）はアプリ単位で設定されるため、シンガポールリージョンでも同じ環境変数が使用されます。確認：

```bash
fly secrets list --app live-schedule-api
```

必要な環境変数：
- `JWT_SECRET`
- `DATABASE_URL`
- `BASE_URL`（オプション）
- `ALLOWED_ORIGIN`
- `RESEND_API_KEY`（オプション）

### 3. データベースのバックアップ

現在、東京リージョンでアプリが起動していない可能性があります。以下のいずれかでデータベースを取得：

#### オプションA: ローカルにデータベースがある場合

```bash
# ローカルのデータベースを確認
ls -lh data/app.db
```

#### オプションB: 東京リージョンからデータベースを取得

```bash
# 東京リージョンからデータベースをダウンロード
flyctl sftp shell --app live-schedule-api <<EOF
get /app/data/app.db data/app.db
EOF
```

#### オプションC: 既存のバックアップを使用

```bash
# バックアップディレクトリを確認
ls -lh data/backups/
```

---

## 🚀 移行手順

### ステップ1: ボリュームの作成（必要な場合）

```bash
cd backend
fly volumes create data_backup --region sin --size 1
```

### ステップ2: 移行スクリプトの実行

```bash
cd backend
./scripts/switch-to-backup-region.sh
```

このスクリプトは以下を自動実行します：
1. 東京リージョンからデータベースをバックアップ
2. シンガポールリージョンにデプロイ
3. データベースをアップロード
4. アプリを再起動

### ステップ3: 動作確認

#### アプリの状態確認

```bash
fly status --app live-schedule-api
```

#### ヘルスチェック

```bash
curl https://live-schedule-api.fly.dev/health
```

#### ログの確認

```bash
fly logs --app live-schedule-api
```

#### フロントエンドからのアクセス確認

1. ブラウザで `https://skdrec.null-dev.tech` にアクセス
2. ログインが正常に動作するか確認
3. スケジュール一覧が表示されるか確認
4. スケジュール詳細が表示されるか確認

---

## ⚠️ 注意事項

### データベースのバックアップ

- スクリプト実行前に、必ずデータベースのバックアップを取得してください
- 既存のバックアップがある場合は、それを使用できます

### 環境変数

- 環境変数（secrets）はアプリ単位で設定されるため、シンガポールリージョンでも同じ環境変数が使用されます
- 追加の設定は不要です

### デプロイ時間

- 初回デプロイには5-10分かかる場合があります
- リソースが利用可能な場合、通常は3-5分で完了します

### 東京リージョンの状態

- 東京リージョンのマシンは停止されますが、ボリュームとデータは保持されます
- 必要に応じて、後で東京リージョンに戻すことができます

---

## 🔄 復帰手順（テスト後）

テストが完了したら、東京リージョンに戻すことができます：

```bash
cd backend
./scripts/switch-back-to-primary-region.sh
```

**注意**: 東京リージョンでリソース不足が続いている場合、デプロイが失敗する可能性があります。その場合は、シンガポールリージョンで運用を継続してください。

---

## 📝 トラブルシューティング

### デプロイが失敗する

```bash
# リソース状況を確認
./scripts/check-region-resources.sh sin

# ログを確認
fly logs --app live-schedule-api
```

### データベースのアップロードが失敗する

```bash
# アプリを停止してから再試行
fly scale count 0 --app live-schedule-api --yes
sleep 5

# データベースをアップロード
flyctl sftp shell --app live-schedule-api <<EOF
put data/app.db /app/data/app.db
EOF

# アプリを再起動
fly scale count 1 --app live-schedule-api --yes
```

### フロントエンドからアクセスできない

1. バックエンドのURLを確認: `https://live-schedule-api.fly.dev`
2. フロントエンドの環境変数 `EXPO_PUBLIC_API_BASE` を確認
3. CORS設定を確認（`ALLOWED_ORIGIN`）

---

## ✅ チェックリスト

移行前：
- [ ] シンガポールリージョンのボリューム（`data_backup`）が作成されている
- [ ] 環境変数（secrets）が設定されている
- [ ] データベースのバックアップを取得済み

移行後：
- [ ] アプリが正常に起動している（`fly status`）
- [ ] ヘルスチェックが成功（`curl https://live-schedule-api.fly.dev/health`）
- [ ] フロントエンドからログインできる
- [ ] スケジュール一覧が表示される
- [ ] スケジュール詳細が表示される






