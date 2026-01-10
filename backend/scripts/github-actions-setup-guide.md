# GitHub Actions バックアップ設定ガイド

## 📋 設定確認チェックリスト

### 1. Actions permissions（General セクション）

**現在の設定**: 「Allow all actions and reusable workflows」が選択されている ✅

この設定で問題ありません。バックアップワークフローが使用する以下のアクションが動作します：
- `actions/checkout@v4` - リポジトリのチェックアウト
- `softprops/action-gh-release@v1` - GitHub Releasesへのアップロード

**推奨設定**:
- ✅ 「Allow all actions and reusable workflows」を選択（現在の設定）
- ⚠️ 「Require actions to be pinned to a full-length commit SHA」はチェック不要（現在の設定でOK）

### 2. Workflow permissions（General セクション）

**現在の設定**: 「Read and write permissions」が選択されている ✅

この設定で問題ありません。バックアップワークフローは以下の権限が必要です：
- **Read**: リポジトリの読み取り
- **Write**: GitHub Releasesへのアップロード

### 3. Secrets and variables（重要！）

**設定場所**: Settings → Secrets and variables → Actions

**必要なシークレット**:
- `FLY_API_TOKEN` - Fly.io APIトークン（必須）

**設定手順**:
1. 「Secrets and variables」→「Actions」を開く
2. 「New repository secret」をクリック
3. 以下を設定：
   - **Name**: `FLY_API_TOKEN`
   - **Secret**: Fly.io APIトークン（下記コマンドで取得）
4. 「Add secret」をクリック

**Fly.io APIトークンの取得**:
```bash
cd backend
flyctl tokens create deploy
```

または（非推奨ですが動作します）:
```bash
flyctl auth token
```

---

## ✅ 設定完了後の確認

### 手動実行でテスト

1. GitHubリポジトリの「Actions」タブを開く
   - https://github.com/may-devlog/live-schedule-api/actions

2. 左側のメニューから「Database Backup」を選択

3. 右側の「Run workflow」ボタンをクリック

4. 「Run workflow」をクリックして実行

5. 実行結果を確認：
   - 各ステップのログを確認
   - 「✓」マークが表示されていれば成功
   - エラーメッセージがあれば確認

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

---

## 🚨 よくある問題

### 問題1: 「FLY_API_TOKEN not found」エラー

**原因**: GitHubのシークレットが設定されていない

**解決方法**: 上記の手順で`FLY_API_TOKEN`を設定

### 問題2: 「Authentication failed」エラー

**原因**: Fly.io APIトークンが無効または期限切れ

**解決方法**: 新しいトークンを取得してGitHubのシークレットを更新

### 問題3: 「Permission denied」エラー

**原因**: Workflow permissionsが「Read-only」になっている

**解決方法**: 「Read and write permissions」に変更（現在の設定でOK）

---

## 📊 定期実行の確認

ワークフローは毎日午前3時（UTC = 日本時間12時）に自動実行されます。

実行履歴は「Actions」タブで確認できます。

---

## 🔗 参考リンク

- [GitHub Actions ドキュメント](https://docs.github.com/ja/actions)
- [Fly.io CLI ドキュメント](https://fly.io/docs/flyctl/)
- [GitHub Secrets の設定](https://docs.github.com/ja/actions/security-guides/encrypted-secrets)





