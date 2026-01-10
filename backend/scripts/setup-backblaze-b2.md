# Backblaze B2 バックアップ設定ガイド

## 📋 準備するもの

### 1. Backblazeアカウントの作成

1. **Backblaze B2にアクセス**
   - https://www.backblaze.com/b2/sign-up.html

2. **アカウントを作成**
   - メールアドレスとパスワードで登録
   - 無料プランで開始可能

3. **アカウントの確認**
   - メールアドレスを確認してアカウントを有効化

---

## 🔧 設定手順

### ステップ1: B2バケットの作成

1. **Backblaze B2ダッシュボードにログイン**
   - https://secure.backblaze.com/user_signin.htm

2. **「B2 Cloud Storage」を選択**

3. **「Create a Bucket」をクリック**

4. **バケット設定**
   - **Bucket Name**: `live-schedule-backups`（任意の名前）
   - **Files in Bucket are**: `Private`（推奨）
   - **Default Encryption**: `None`（または`SSE-B2`を選択）
   - **Object Lock**: `Disabled`（通常は不要）

5. **「Create a Bucket」をクリック**

6. **バケット名をメモ**
   - 後でGitHub Secretsに設定します

---

### ステップ2: Application Keyの作成

1. **「App Keys」セクションを開く**
   - 左側のメニューから「App Keys」を選択

2. **「Add a New Application Key」をクリック**

3. **Application Key設定**
   - **Key Name**: `github-actions-backup`（任意の名前）
   - **Allow List Keys**: チェックを外す（フルアクセス）
   - **Allow List Buckets**: チェックを外す（フルアクセス）
   - **Allow Read Files**: チェックを入れる
   - **Allow Write Files**: チェックを入れる
   - **Allow Delete Files**: チェックを入れる（オプション、古いバックアップを削除する場合）
   - **Allow List Files**: チェックを入れる
   - **File name prefix**: 空白（すべてのファイルにアクセス）
   - **Duration**: `No restriction`（無期限）

4. **「Create New Key」をクリック**

5. **重要: 認証情報をコピー**
   - **Key ID**: `xxxxxxxxxxxxxxxxxxxxx`（例）
   - **Application Key**: `xxxxxxxxxxxxxxxxxxxxxxxxxxxxx`（例）
   - ⚠️ **Application Keyは一度しか表示されません。必ずコピーして保存してください！**

---

### ステップ3: GitHub Secretsの設定

1. **GitHubリポジトリにアクセス**
   - https://github.com/may-devlog/live-schedule-api

2. **Settings → Secrets and variables → Actions を開く**

3. **以下のシークレットを追加**

   #### シークレット1: `B2_APPLICATION_KEY_ID`
   - **Name**: `B2_APPLICATION_KEY_ID`
   - **Secret**: ステップ2で取得した**Key ID**
   - 「Add secret」をクリック

   #### シークレット2: `B2_APPLICATION_KEY`
   - **Name**: `B2_APPLICATION_KEY`
   - **Secret**: ステップ2で取得した**Application Key**
   - 「Add secret」をクリック

   #### シークレット3: `B2_BUCKET_NAME`
   - **Name**: `B2_BUCKET_NAME`
   - **Secret**: ステップ1で作成した**バケット名**（例: `live-schedule-backups`）
   - 「Add secret」をクリック

---

## ✅ 設定確認

### 設定したシークレットの確認

GitHub Secretsに以下の3つが設定されていることを確認：

- ✅ `B2_APPLICATION_KEY_ID`
- ✅ `B2_APPLICATION_KEY`
- ✅ `B2_BUCKET_NAME`

---

## 🚀 次のステップ

設定が完了したら、GitHub Actionsのワークフローが自動的にBackblaze B2へのバックアップも実行します。

### 動作確認

1. **ワークフローを手動実行**
   - GitHub Actionsの「Database Backup」ワークフローを実行

2. **ログを確認**
   - 「Run Backblaze B2 backup script」ステップが成功するか確認

3. **Backblaze B2で確認**
   - Backblaze B2ダッシュボードでバケット内にバックアップファイルがアップロードされているか確認

---

## 💰 料金について

### 無料枠
- **ストレージ**: 10GBまで無料
- **ダウンロード**: 1GB/日まで無料

### 超過時の料金（非常に安価）
- **ストレージ**: $0.005/GB/月（約0.5円/GB/月）
- **ダウンロード**: $0.01/GB（約1円/GB）

### 例: データベースが100MBの場合
- **月額ストレージ料金**: 約5円/月
- **非常にコストパフォーマンスが良い**

---

## 🔒 セキュリティ

- Application KeyはGitHub Secretsに安全に保存されます
- バケットはPrivateに設定されているため、認証なしではアクセスできません
- Application Keyは必要最小限の権限で作成することを推奨

---

## 📝 参考リンク

- [Backblaze B2 公式サイト](https://www.backblaze.com/b2/cloud-storage.html)
- [Backblaze B2 料金](https://www.backblaze.com/b2/pricing.html)
- [Backblaze B2 API ドキュメント](https://www.backblaze.com/b2/docs/)

---

## 🆘 トラブルシューティング

### エラー: "Authentication failed"

- Application Key IDとApplication Keyが正しく設定されているか確認
- Application Keyが有効期限内か確認

### エラー: "Bucket not found"

- バケット名が正しく設定されているか確認
- Application Keyにバケットへのアクセス権限があるか確認

### エラー: "Permission denied"

- Application Keyに「Write Files」権限があるか確認
- バケットがPrivateの場合、Application Keyに適切な権限が必要





