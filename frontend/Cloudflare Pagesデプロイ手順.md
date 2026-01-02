# Cloudflare Pages デプロイ手順

## 1. Cloudflareアカウントの作成

1. https://pages.cloudflare.com にアクセス
2. 「Sign up」をクリック
3. メールアドレスまたはGitHubアカウントで登録
4. 無料プランで開始

## 2. プロジェクトの準備

### 2-1. 環境変数ファイルの作成

`frontend/.env.production`を作成：

```bash
cd frontend
echo "EXPO_PUBLIC_API_BASE=https://live-schedule-api.fly.dev" > .env.production
```

**注意**: `https://live-schedule-api.fly.dev`は、Fly.ioでデプロイしたAPIのURLに置き換えてください。

### 2-2. package.jsonにビルドスクリプトを追加

`frontend/package.json`に以下を追加：

```json
{
  "scripts": {
    "build": "expo export:web"
  }
}
```

## 3. Gitリポジトリの準備

### 3-1. GitHubリポジトリを作成（まだの場合）

1. GitHubにログイン
2. 新しいリポジトリを作成
3. リポジトリ名: `live-schedule-api`（任意）

### 3-2. コードをプッシュ

```bash
cd /Users/mei/workspace/live-schedule-api

# Gitリポジトリを初期化（まだの場合）
git init

# リモートリポジトリを追加
git remote add origin https://github.com/your-username/live-schedule-api.git

# コミット
git add .
git commit -m "Initial commit"

# プッシュ
git push -u origin master
```

## 4. Cloudflare Pagesでプロジェクトを作成

1. Cloudflareダッシュボードにログイン
2. 左メニューから「Workers & Pages」を選択
3. 「Pages」タブをクリック
4. 「Create a project」をクリック
5. 「Connect to Git」を選択
6. GitHubアカウントを連携（初回のみ）
7. リポジトリ `live-schedule-api` を選択

## 5. ビルド設定

以下の設定を入力：

- **Project name**: `live-schedule`（任意）
- **Production branch**: `master`（または`main`）
- **Framework preset**: `None`（または`Other`）
- **Build command**: `cd frontend && npm install && npm run build`
- **Build output directory**: `frontend/web-build`

## 6. 環境変数の設定

Cloudflare Pagesの設定画面で：

1. 「Settings」→「Environment variables」を開く
2. 以下を追加：
   - `EXPO_PUBLIC_API_BASE`: `https://live-schedule-api.fly.dev`

## 7. デプロイ

設定を保存すると、自動的にビルドとデプロイが開始されます。

## 8. カスタムドメインの設定（オプション）

1. Cloudflare Pagesのプロジェクト設定を開く
2. 「Custom domains」タブをクリック
3. 「Set up a custom domain」をクリック
4. `schedule.null-relife.com`を入力
5. DNS設定の指示に従う

## 9. 動作確認

デプロイ後、以下のURLでアクセスできます：
- `https://your-project-name.pages.dev`
- またはカスタムドメイン: `https://schedule.null-relife.com`

## 10. 自動デプロイの設定

GitHubにプッシュすると、自動的に再デプロイされます。

```bash
git add .
git commit -m "Update"
git push
```

## トラブルシューティング

### ビルドが失敗する場合

1. Cloudflare Pagesの「Deployments」タブでログを確認
2. ローカルでビルドをテスト：
   ```bash
   cd frontend
   npm install
   npm run build
   ```

### 環境変数が反映されない場合

1. 環境変数を設定後、再デプロイが必要
2. 「Deployments」タブで「Retry deployment」をクリック

### API接続エラーの場合

1. Fly.ioのAPIが起動しているか確認
2. CORS設定を確認（`ALLOWED_ORIGIN`が正しく設定されているか）



