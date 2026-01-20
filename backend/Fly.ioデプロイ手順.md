# Fly.io デプロイ手順

## 1. Fly.ioアカウントの作成

1. https://fly.io にアクセス
2. 「Sign Up」をクリック
3. GitHubアカウントでサインアップ（推奨）またはメールアドレスで登録
4. 無料プランで開始

## 2. Fly.io CLIのインストール

### macOSの場合

```bash
curl -L https://fly.io/install.sh | sh
```

インストール後、パスを通す：

```bash
export FLYCTL_INSTALL="/Users/$(whoami)/.fly"
export PATH="$FLYCTL_INSTALL/bin:$PATH"
```

または、`~/.zshrc`に追加：

```bash
echo 'export FLYCTL_INSTALL="/Users/$(whoami)/.fly"' >> ~/.zshrc
echo 'export PATH="$FLYCTL_INSTALL/bin:$PATH"' >> ~/.zshrc
source ~/.zshrc
```

### インストール確認

```bash
flyctl version
```

## 3. Fly.ioにログイン

```bash
flyctl auth login
```

ブラウザが開くので、Fly.ioアカウントでログインしてください。

## 4. アプリの初期化

```bash
cd backend
flyctl launch
```

以下の質問に答えます：

- **App name**: `live-schedule-api`（または任意の名前）
- **Region**: `nrt`（東京）を選択
- **Postgres**: `No`（SQLiteを使用するため）
- **Redis**: `No`

既に`fly.toml`がある場合は、スキップされます。

## 5. 環境変数の設定

```bash
# JWT秘密鍵を生成
openssl rand -hex 32

# 環境変数を設定（生成したJWT_SECRETを設定）
flyctl secrets set JWT_SECRET=生成したランダムな文字列
flyctl secrets set BASE_URL=https://your-frontend-domain.pages.dev
flyctl secrets set ALLOWED_ORIGIN=https://your-frontend-domain.pages.dev
flyctl secrets set DATABASE_URL=sqlite:///app/data/app.db
```

**注意**: `BASE_URL`と`ALLOWED_ORIGIN`は、後でCloudflare PagesのURLに更新します。

## 6. 永続ストレージの設定（データベース用）

SQLiteのデータベースファイルを保存するために、永続ボリュームを作成：

```bash
flyctl volumes create data --region nrt --size 1
```

`fly.toml`にボリューム設定を追加：

```toml
[mounts]
  source = "data"
  destination = "/app/data"
```

## 7. デプロイ

```bash
flyctl deploy
```

初回デプロイには数分かかります。

## 8. 動作確認

```bash
# アプリのURLを確認
flyctl status

# ヘルスチェック
curl https://live-schedule-api.fly.dev/health
```

## 9. ログの確認

```bash
flyctl logs
```

## 10. アプリのURLを確認

デプロイ後、以下のようなURLが発行されます：
- `https://live-schedule-api.fly.dev`

このURLをメモしておいてください（後でフロントエンドの環境変数に設定します）。

## トラブルシューティング

### デプロイが失敗する場合

```bash
# ログを確認
flyctl logs

# ローカルでビルドをテスト
docker build -t test-build .
```

### データベースエラーの場合

```bash
# ボリュームの確認
flyctl volumes list

# ボリュームがマウントされているか確認
flyctl ssh console
ls -la /app/data
```


















