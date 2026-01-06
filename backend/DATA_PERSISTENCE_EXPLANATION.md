# シンガポールリージョン避難時のデータ保持について

## 重要なポイント

### ❌ 自動的には保持されません

Fly.ioでは、**ボリュームはリージョン固有**です。東京リージョンのボリュームとシンガポールリージョンのボリュームは**別々のストレージ**です。

### ✅ 手動でコピーすれば保持されます

作成した `switch-to-backup-region.sh` スクリプトが、データベースを自動的にコピーします。

---

## 現在の状況

### 東京リージョン（nrt）
- **ボリューム**: `data` (vol_42le32zeq32yoo9r)
- **データベース**: `/app/data/app.db` に保存
- **状態**: リソース不足でデプロイできない

### シンガポールリージョン（sin）
- **ボリューム**: `data_backup` (未作成)
- **データベース**: 空（まだ作成されていない）

---

## データ保持の仕組み

### 1. 自動保持されない理由

```
東京リージョン（nrt）         シンガポールリージョン（sin）
┌─────────────────┐         ┌─────────────────┐
│ ボリューム: data │   ≠    │ ボリューム: data_backup │
│ app.db が保存   │         │ （空）          │
└─────────────────┘         └─────────────────┘
```

**ボリュームはリージョン間で共有されません。**

### 2. 手動コピーで保持される

`switch-to-backup-region.sh` スクリプトが以下の処理を実行します：

```bash
# ステップ1: 東京リージョンからデータベースをダウンロード
flyctl sftp shell --app live-schedule-api <<EOF
get /app/data/app.db data/backups/app.db.backup.20240101_120000
EOF

# ステップ2: シンガポールリージョンにデプロイ
fly deploy --config fly.toml.backup --region sin

# ステップ3: ダウンロードしたデータベースをシンガポールリージョンにアップロード
flyctl sftp shell --app live-schedule-api --region sin <<EOF
put data/backups/app.db.backup.20240101_120000 /app/data/app.db
EOF
```

---

## データ保持の確認

### 切り替え前（東京リージョン）

```bash
# データベースの内容を確認
fly ssh console --app live-schedule-api --region nrt -C "sqlite3 /app/data/app.db 'SELECT COUNT(*) FROM schedules;'"
```

### 切り替え後（シンガポールリージョン）

```bash
# データベースの内容を確認（同じデータが表示されるはず）
fly ssh console --app live-schedule-api --region sin -C "sqlite3 /app/data/app.db 'SELECT COUNT(*) FROM schedules;'"
```

---

## 重要な注意事項

### ⚠️ データ損失のリスク

1. **切り替え前にデータをバックアップしない場合**
   - シンガポールリージョンは空のデータベースで起動します
   - 東京リージョンのデータは失われませんが、シンガポールリージョンには反映されません

2. **スクリプト実行中にエラーが発生した場合**
   - バックアップファイル（`data/backups/app.db.backup.*`）が残っているので、再実行可能

### ✅ 安全な手順

1. **事前にバックアップを取得**
   ```bash
   ./scripts/backup-db.sh
   ```

2. **スクリプトを実行**
   ```bash
   ./scripts/switch-to-backup-region.sh
   ```

3. **動作確認**
   ```bash
   fly status --region sin
   curl https://live-schedule-api.fly.dev/health
   ```

---

## データの整合性

### 同時書き込みの問題

- **推奨**: 通常は1つのリージョンで運用
- **理由**: 両方のリージョンで同時に書き込みを行うと、データの不整合が発生する可能性があります

### 復旧時の同期

東京リージョンが復旧したら、シンガポールリージョンのデータを東京リージョンにコピーする必要があります：

```bash
# シンガポール → 東京
flyctl sftp shell --app live-schedule-api --region sin <<EOF
get /app/data/app.db data/app.db.singapore
EOF

flyctl sftp shell --app live-schedule-api --region nrt <<EOF
put data/app.db.singapore /app/data/app.db
EOF
```

---

## まとめ

### 質問への回答

**Q: シンガポールリージョンに一時的に避難する場合、データベースのデータは保持されるでしょうか？**

**A: はい、保持されます。ただし、手動でコピーする必要があります。**

- ✅ `switch-to-backup-region.sh` スクリプトが自動的にコピーします
- ✅ 東京リージョンのデータは失われません
- ✅ シンガポールリージョンに最新のデータがコピーされます
- ⚠️ ボリュームはリージョン間で共有されないため、手動コピーが必要です

### 推奨される運用

1. **週1回**: データベースのバックアップを実行
2. **緊急時**: `switch-to-backup-region.sh` を実行してシンガポールリージョンに切り替え
3. **復旧後**: シンガポールリージョンのデータを東京リージョンにコピーして戻す






