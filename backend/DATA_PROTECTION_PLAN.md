# データ保護強化計画

一般公開に向けたデータ損失防止対策です。

## 📊 現在の状況

### ✅ 既に実装済み
- Fly.ioボリュームによる永続化
- 手動バックアップスクリプト（`backup-db.sh`）
- バックアップリージョン（シンガポール）の準備
- リージョン切り替えスクリプト

### ⚠️ 不足している点
- **自動バックアップの定期実行**
- **クラウドストレージへの自動バックアップ**
- **バックアップの検証機能**
- **複数のバックアップ先**
- **バックアップ失敗時の通知**

---

## 🎯 推奨される対策（優先順位順）

### 1. **自動バックアップの定期実行** ⭐⭐⭐（最優先）

**目的**: 手動バックアップの依存を排除し、確実にバックアップを取得

**実装方法**:
- GitHub Actionsで定期実行（無料）
- または、Fly.ioのcronジョブ（有料プランが必要）

**コスト**: 無料（GitHub Actionsの場合）

**実装手順**:
```yaml
# .github/workflows/backup-db.yml
name: Database Backup
on:
  schedule:
    - cron: '0 3 * * *'  # 毎日午前3時（UTC）
  workflow_dispatch:  # 手動実行も可能

jobs:
  backup:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - name: Install flyctl
        run: |
          curl -L https://fly.io/install.sh | sh
          echo "$HOME/.fly/bin" >> $GITHUB_PATH
      - name: Backup database
        env:
          FLY_API_TOKEN: ${{ secrets.FLY_API_TOKEN }}
        run: |
          cd backend
          ./scripts/backup-db.sh
      - name: Upload backup to GitHub Releases
        uses: softprops/action-gh-release@v1
        with:
          files: backend/data/backups/*.db
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
```

**メリット**:
- 完全無料
- バックアップ履歴がGitHub Releasesに保存される
- 手動実行も可能

---

### 2. **クラウドストレージへの自動バックアップ** ⭐⭐⭐（最優先）

**目的**: Fly.ioの障害時でもデータを保護

**推奨サービス**（無料枠あり）:

#### A. Backblaze B2（推奨）
- **無料枠**: 10GBストレージ + 1GB/日ダウンロード
- **料金**: 無料枠超過後も$0.005/GB/月（非常に安価）
- **メリット**: S3互換API、低コスト、信頼性が高い

#### B. AWS S3
- **無料枠**: 5GBストレージ（12ヶ月間）
- **料金**: 無料枠超過後$0.023/GB/月
- **メリット**: 業界標準、高い信頼性

#### C. Google Drive API
- **無料枠**: 15GB（Googleアカウント全体で共有）
- **料金**: 無料枠超過後$1.99/月（100GB）
- **メリット**: 使い慣れたサービス

**実装例**（Backblaze B2）:
```bash
#!/bin/bash
# backend/scripts/backup-to-b2.sh

set -e

APP_NAME="live-schedule-api"
REMOTE_DB="/app/data/app.db"
BACKUP_DIR="data/backups"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
BACKUP_FILE="${BACKUP_DIR}/app.db.backup.${TIMESTAMP}"

# B2設定
B2_BUCKET="your-bucket-name"
B2_APP_KEY_ID="your-app-key-id"
B2_APP_KEY="your-app-key"

echo "[$(date +'%Y-%m-%d %H:%M:%S')] データベースのバックアップを開始..."

# 本番環境からデータベースをダウンロード
flyctl sftp shell --app "$APP_NAME" <<EOF
get $REMOTE_DB $BACKUP_FILE
EOF

if [ $? -eq 0 ]; then
    echo "[$(date +'%Y-%m-%d %H:%M:%S')] ✓ バックアップが完了しました: $BACKUP_FILE"
    
    # B2にアップロード
    b2 authorize-account "$B2_APP_KEY_ID" "$B2_APP_KEY"
    b2 upload-file "$B2_BUCKET" "$BACKUP_FILE" "backups/app.db.backup.${TIMESTAMP}"
    
    if [ $? -eq 0 ]; then
        echo "[$(date +'%Y-%m-%d %H:%M:%S')] ✓ B2へのアップロードが完了しました"
    else
        echo "[$(date +'%Y-%m-%d %H:%M:%S')] ✗ B2へのアップロードに失敗しました"
        exit 1
    fi
    
    # 古いバックアップを削除（30日以上前）
    find "$BACKUP_DIR" -name "app.db.backup.*" -mtime +30 -delete 2>/dev/null || true
else
    echo "[$(date +'%Y-%m-%d %H:%M:%S')] ✗ バックアップに失敗しました"
    exit 1
fi
```

**コスト見積もり**（Backblaze B2）:
- データベースサイズ: 10MBと仮定
- 1日1回バックアップ: 10MB × 30日 = 300MB/月
- **月額コスト**: ほぼ無料（無料枠10GB内）

---

### 3. **バックアップの検証機能** ⭐⭐（重要）

**目的**: バックアップファイルの整合性を確認

**実装方法**:
```bash
#!/bin/bash
# backend/scripts/verify-backup.sh

BACKUP_FILE=$1

if [ -z "$BACKUP_FILE" ]; then
    echo "使用方法: $0 <backup-file>"
    exit 1
fi

echo "バックアップファイルの検証中: $BACKUP_FILE"

# SQLiteの整合性チェック
sqlite3 "$BACKUP_FILE" "PRAGMA integrity_check;" > /tmp/integrity_check.txt

if grep -q "ok" /tmp/integrity_check.txt; then
    echo "✓ バックアップファイルは正常です"
    
    # テーブル数の確認
    TABLE_COUNT=$(sqlite3 "$BACKUP_FILE" "SELECT COUNT(*) FROM sqlite_master WHERE type='table';")
    echo "  テーブル数: $TABLE_COUNT"
    
    # スケジュール数の確認
    SCHEDULE_COUNT=$(sqlite3 "$BACKUP_FILE" "SELECT COUNT(*) FROM schedules;" 2>/dev/null || echo "0")
    echo "  スケジュール数: $SCHEDULE_COUNT"
    
    exit 0
else
    echo "✗ バックアップファイルが破損しています"
    cat /tmp/integrity_check.txt
    exit 1
fi
```

---

### 4. **複数のバックアップ先** ⭐⭐（重要）

**目的**: 単一障害点を排除

**推奨構成**:
1. **ローカルバックアップ**: GitHub Actionsで取得
2. **クラウドストレージ**: Backblaze B2
3. **バックアップリージョン**: シンガポール（既存）

**3-2-1ルール**:
- **3**: 3つのコピー（本番 + バックアップ1 + バックアップ2）
- **2**: 2つの異なるメディア（Fly.ioボリューム + クラウドストレージ）
- **1**: 1つはオフサイト（Backblaze B2）

---

### 5. **バックアップ失敗時の通知** ⭐（推奨）

**目的**: バックアップ失敗を早期に検知

**実装方法**:
- GitHub Actionsの通知機能
- または、メール通知（SendGrid無料枠など）

**コスト**: 無料（GitHub Actionsの場合）

---

## 💰 コスト見積もり

### 最小構成（無料）
- GitHub Actions: 無料
- Backblaze B2: 無料（10GBまで）
- **月額: $0**

### 推奨構成（低コスト）
- GitHub Actions: 無料
- Backblaze B2: 無料枠内（10GBまで）
- Fly.io: 既存の無料プラン
- **月額: $0〜$1程度**（データ量による）

### 大規模利用時
- Backblaze B2: $0.005/GB/月（無料枠超過後）
- 例: 100GB使用時 = $0.50/月

---

## 🚀 実装優先順位

### Phase 1（即座に実装）
1. ✅ GitHub Actionsによる自動バックアップ
2. ✅ Backblaze B2への自動アップロード
3. ✅ バックアップ検証機能

### Phase 2（1週間以内）
4. ✅ バックアップ失敗時の通知
5. ✅ バックアップ一覧の管理機能

### Phase 3（1ヶ月以内）
6. ✅ 定期的なリストアテスト
7. ✅ バックアップの暗号化（オプション）

---

## 📝 実装チェックリスト

- [ ] GitHub Actionsワークフローの作成
- [ ] Backblaze B2アカウントの作成
- [ ] バックアップスクリプトの拡張
- [ ] バックアップ検証スクリプトの実装
- [ ] 通知機能の実装
- [ ] ドキュメントの更新
- [ ] リストア手順の整備

---

## 🔒 追加のセキュリティ対策

### データベースの暗号化（オプション）
- SQLiteの暗号化拡張（SQLCipher）を使用
- バックアップファイルも暗号化

### アクセス制御
- Backblaze B2のアクセスキーをGitHub Secretsに保存
- 最小権限の原則

### 監査ログ
- バックアップ実行ログの記録
- リストア操作の記録

---

## 📚 参考資料

- [Backblaze B2 Pricing](https://www.backblaze.com/b2/cloud-storage-pricing.html)
- [GitHub Actions Documentation](https://docs.github.com/en/actions)
- [Fly.io Volumes](https://fly.io/docs/reference/volumes/)

---

## ⚠️ 重要な注意事項

1. **バックアップの定期テスト**: バックアップが正しく動作しているか、定期的にリストアテストを実施
2. **複数のバックアップ先**: 単一のバックアップ先に依存しない
3. **バックアップの検証**: バックアップファイルの整合性を必ず確認
4. **ドキュメントの整備**: リストア手順を明確に文書化

---

## 🎯 まとめ

**最小構成（無料）で実現可能**:
- GitHub Actionsによる自動バックアップ
- Backblaze B2への自動アップロード
- バックアップ検証機能

**月額コスト**: $0（データ量が少ない場合）

**データ損失リスク**: 大幅に低減（3-2-1ルールの実現）

