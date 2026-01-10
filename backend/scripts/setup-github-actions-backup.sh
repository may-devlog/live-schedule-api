#!/bin/bash
# GitHub Actions バックアップ設定のセットアップスクリプト

set -e

echo "=========================================="
echo "GitHub Actions バックアップ設定の確認"
echo "=========================================="
echo ""

# 1. ワークフローファイルの確認
echo "[1/4] ワークフローファイルの確認..."
if [ -f ".github/workflows/backup-db.yml" ]; then
    echo "✓ ワークフローファイルが存在します: .github/workflows/backup-db.yml"
else
    echo "✗ ワークフローファイルが見つかりません"
    exit 1
fi

# 2. Fly.io APIトークンの確認
echo ""
echo "[2/4] Fly.io APIトークンの確認..."
if command -v flyctl &> /dev/null; then
    echo "✓ flyctlがインストールされています"
    echo ""
    echo "Fly.io APIトークンを取得中..."
    TOKEN=$(flyctl auth token 2>/dev/null || echo "")
    if [ -n "$TOKEN" ]; then
        echo "✓ Fly.io APIトークンを取得しました"
        echo ""
        echo "以下のトークンをGitHubのシークレットに設定してください:"
        echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
        echo "$TOKEN"
        echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
        echo ""
        echo "設定手順:"
        echo "1. https://github.com/may-devlog/live-schedule-api にアクセス"
        echo "2. Settings → Secrets and variables → Actions"
        echo "3. New repository secret をクリック"
        echo "4. Name: FLY_API_TOKEN"
        echo "5. Secret: 上記のトークンを貼り付け"
        echo "6. Add secret をクリック"
    else
        echo "✗ Fly.io APIトークンの取得に失敗しました"
        echo "   flyctl auth login を実行してください"
    fi
else
    echo "✗ flyctlがインストールされていません"
    echo "   インストール方法: curl -L https://fly.io/install.sh | sh"
fi

# 3. Gitリポジトリの確認
echo ""
echo "[3/4] Gitリポジトリの確認..."
REMOTE_URL=$(git remote get-url origin 2>/dev/null || echo "")
if [ -n "$REMOTE_URL" ]; then
    echo "✓ リモートリポジトリ: $REMOTE_URL"
    
    # ワークフローファイルがコミットされているか確認
    if git ls-files --error-unmatch .github/workflows/backup-db.yml &> /dev/null; then
        echo "✓ ワークフローファイルがGitに追跡されています"
    else
        echo "⚠ ワークフローファイルがGitに追跡されていません"
        echo "   git add .github/workflows/backup-db.yml を実行してください"
    fi
else
    echo "✗ リモートリポジトリが見つかりません"
fi

# 4. 次のステップ
echo ""
echo "[4/4] 次のステップ..."
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "設定完了後の確認方法:"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "1. GitHubリポジトリの「Actions」タブを開く"
echo "   https://github.com/may-devlog/live-schedule-api/actions"
echo ""
echo "2. 左側のメニューから「Database Backup」を選択"
echo ""
echo "3. 「Run workflow」ボタンをクリックして手動実行"
echo ""
echo "4. 実行結果を確認"
echo "   - 各ステップのログを確認"
echo "   - 「✓」マークが表示されていれば成功"
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""





