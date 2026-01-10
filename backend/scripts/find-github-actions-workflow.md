# GitHub Actions ワークフローの見つけ方

## 📍 「Database Backup」ワークフローの場所

### 方法1: Actionsタブから確認

1. **GitHubリポジトリにアクセス**
   - https://github.com/may-devlog/live-schedule-api

2. **「Actions」タブをクリック**
   - リポジトリの上部にあるタブメニューから「Actions」を選択

3. **左側のサイドバーでワークフローを確認**
   - 左側にワークフローの一覧が表示されます
   - 「Database Backup」が表示されているはずです

### 方法2: ワークフローが表示されない場合

#### 確認1: ワークフローファイルがコミットされているか

```bash
cd /Users/mei/workspace/live-schedule-api
git log --oneline --all -- .github/workflows/backup-db.yml
```

コミット履歴が表示されれば、ファイルはコミットされています。

#### 確認2: 最新のコミットがプッシュされているか

```bash
git status
```

「Your branch is up to date with 'origin/master'」と表示されていれば、最新の状態です。

#### 確認3: Actionsが有効になっているか

1. GitHubリポジトリの「Settings」→「Actions」→「General」を開く
2. 「Actions permissions」セクションを確認
3. 「Allow all actions and reusable workflows」が選択されていることを確認

### 方法3: 直接URLでアクセス

以下のURLで直接アクセスできます：

- **ワークフロー一覧**: https://github.com/may-devlog/live-schedule-api/actions
- **Database Backupワークフロー**: https://github.com/may-devlog/live-schedule-api/actions/workflows/backup-db.yml

### 方法4: ワークフローが表示されない場合の対処法

#### 問題1: ワークフローファイルがコミットされていない

**解決方法**:
```bash
cd /Users/mei/workspace/live-schedule-api
git add .github/workflows/backup-db.yml
git commit -m "Add database backup workflow"
git push origin master
```

#### 問題2: Actionsが無効になっている

**解決方法**:
1. GitHubリポジトリの「Settings」→「Actions」→「General」を開く
2. 「Actions permissions」で「Allow all actions and reusable workflows」を選択
3. 「Save」をクリック

#### 問題3: ワークフローファイルの構文エラー

**確認方法**:
```bash
cd /Users/mei/workspace/live-schedule-api
# YAMLの構文チェック（yamllintがインストールされている場合）
yamllint .github/workflows/backup-db.yml
```

---

## 🔍 ワークフローの確認手順

### ステップ1: Actionsタブを開く

1. https://github.com/may-devlog/live-schedule-api にアクセス
2. 上部のタブメニューから「**Actions**」をクリック

### ステップ2: ワークフローを探す

左側のサイドバーに以下のようなワークフロー一覧が表示されます：

```
All workflows
├── Database Backup  ← これが表示されるはず
└── (他のワークフローがあれば表示)
```

### ステップ3: ワークフローを選択

「Database Backup」をクリックすると、実行履歴が表示されます。

### ステップ4: 手動実行

1. 「Database Backup」ワークフローページの右上に「**Run workflow**」ボタンがあるはずです
2. クリックして手動実行できます

---

## 📝 ワークフローファイルの場所

ワークフローファイルは以下の場所にあります：

```
.github/workflows/backup-db.yml
```

このファイルがGitHubリポジトリにプッシュされていれば、自動的に「Actions」タブに表示されます。

---

## 🚨 トラブルシューティング

### ワークフローが表示されない場合

1. **ブラウザをリフレッシュ**（Ctrl+R または Cmd+R）
2. **別のブラウザで試す**
3. **GitHubにログインしているか確認**
4. **リポジトリへのアクセス権限を確認**

### まだ表示されない場合

以下のコマンドでワークフローファイルの状態を確認：

```bash
cd /Users/mei/workspace/live-schedule-api
ls -la .github/workflows/
cat .github/workflows/backup-db.yml | head -20
```

---

## 💡 ヒント

- ワークフローは、ファイルが`.github/workflows/`ディレクトリにコミットされると自動的に認識されます
- 初回は数分かかる場合があります
- ワークフローが表示されない場合は、GitHubのキャッシュをクリアしてみてください





