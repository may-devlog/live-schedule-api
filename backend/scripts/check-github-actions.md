# GitHub Actions バックアップ設定の確認方法

## 📋 現在の設定状況

### ✅ 実装済み
- `.github/workflows/backup-db.yml` - バックアップワークフロー
- 手動実行（workflow_dispatch）対応
- 定期実行（毎日午前3時 UTC = 日本時間12時）

### ⚠️ 必要な設定

#### 1. Fly.io APIトークンの設定

GitHubリポジトリで以下のシークレットを設定する必要があります：

1. GitHubリポジトリにアクセス: https://github.com/may-devlog/live-schedule-api
2. 「Settings」→「Secrets and variables」→「Actions」を開く
3. 「New repository secret」をクリック
4. 以下を追加：
   - **Name**: `FLY_API_TOKEN`
   - **Value**: Fly.ioのAPIトークン（下記コマンドで取得）

**Fly.io APIトークンの取得方法**:
```bash
cd backend
flyctl auth token
```

このコマンドで表示されるトークンをコピーして、GitHubのシークレットに設定してください。

---

## 🔍 確認方法

### 方法1: GitHubのWebインターフェースで確認

1. **リポジトリにアクセス**: https://github.com/may-devlog/live-schedule-api
2. **「Actions」タブをクリック**
3. 左側のメニューから「Database Backup」を選択
4. 実行履歴が表示されます

**確認ポイント**:
- ✅ ワークフローが表示されているか
- ✅ 実行履歴があるか
- ✅ エラーが発生していないか

### 方法2: 手動実行でテスト

1. GitHubリポジトリの「Actions」タブを開く
2. 左側のメニューから「Database Backup」を選択
3. 右側の「Run workflow」ボタンをクリック
4. 「Run workflow」をクリックして実行

**実行結果の確認**:
- 各ステップのログを確認
- 「✓」マークが表示されていれば成功
- エラーメッセージがあれば確認

### 方法3: GitHub CLIで確認（オプション）

```bash
# GitHub CLIがインストールされている場合
gh workflow list
gh workflow view "Database Backup"
gh run list --workflow="Database Backup"
```

---

## 🚨 よくある問題と解決方法

### 問題1: ワークフローが表示されない

**原因**: ワークフローファイルが正しくコミットされていない

**解決方法**:
```bash
cd /Users/mei/workspace/live-schedule-api
git status
# .github/workflows/backup-db.yml がコミットされているか確認
git log --oneline --all -- .github/workflows/backup-db.yml
```

### 問題2: 「FLY_API_TOKEN not found」エラー

**原因**: GitHubのシークレットが設定されていない

**解決方法**:
1. GitHubリポジトリの「Settings」→「Secrets and variables」→「Actions」を開く
2. `FLY_API_TOKEN`が存在するか確認
3. 存在しない場合は、上記の手順で追加

### 問題3: 「Authentication failed」エラー

**原因**: Fly.io APIトークンが無効または期限切れ

**解決方法**:
```bash
# 新しいトークンを取得
cd backend
flyctl auth token

# GitHubのシークレットを更新
# Settings → Secrets and variables → Actions → FLY_API_TOKEN → Update
```

### 問題4: 「sftp shell」コマンドが失敗する

**原因**: Fly.ioアプリが起動していない、またはネットワークエラー

**解決方法**:
```bash
# Fly.ioアプリの状態を確認
cd backend
flyctl status

# アプリが停止している場合は起動
flyctl apps restart live-schedule-api
```

---

## 📊 実行状況の確認

### 成功時の確認項目

1. **バックアップファイルの作成**
   - ログに「✓ バックアップが完了しました」が表示される
   - バックアップサイズが表示される

2. **整合性チェック**
   - 「✓ バックアップファイルは正常です」が表示される
   - テーブル数とスケジュール数が表示される

3. **GitHub Releasesへのアップロード**
   - 「Release created」が表示される
   - GitHubリポジトリの「Releases」タブで確認可能

### 失敗時の確認項目

1. **エラーメッセージを確認**
   - どのステップで失敗したか
   - エラーメッセージの内容

2. **ログを確認**
   - 各ステップのログを展開して詳細を確認

---

## 🎯 次のステップ

1. **FLY_API_TOKENの設定**（必須）
2. **手動実行でテスト**
3. **定期実行の確認**（毎日午前3時 UTC = 日本時間12時）

---

## 📝 参考リンク

- [GitHub Actions ドキュメント](https://docs.github.com/ja/actions)
- [Fly.io CLI ドキュメント](https://fly.io/docs/flyctl/)
- [GitHub Secrets の設定](https://docs.github.com/ja/actions/security-guides/encrypted-secrets)





