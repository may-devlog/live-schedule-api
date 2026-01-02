# APIサーバー設定 チェックリスト

## ConoHa WINGでの設定

- [ ] API用サブドメイン `api.null-relife.com` を作成
- [ ] サーバーのIPアドレスを確認

## DNS設定（ドメイン管理画面）

- [ ] `api.null-relife.com` のAレコードを追加
  - ホスト名: `api`
  - タイプ: `A`
  - 値: ConoHa WINGサーバーのIPアドレス

## サーバー内での設定

### 1. 基本環境

- [ ] SSH接続が可能
- [ ] Rustがインストールされている（`rustc --version`で確認）
- [ ] Nginxがインストールされている（`nginx -v`で確認）

### 2. プロジェクトの配置

- [ ] `/var/www/live-schedule-api/` ディレクトリを作成
- [ ] プロジェクトファイルをアップロード（GitまたはSCP）
- [ ] `data/` ディレクトリを作成
- [ ] ファイルの所有者を `www-data` に設定

### 3. ビルドと配置

- [ ] `cargo build --release` でビルド成功
- [ ] バイナリを `/var/www/live-schedule-api/live-schedule-api` に配置
- [ ] 実行権限を付与

### 4. 環境変数の設定

- [ ] JWT_SECRETを生成（`openssl rand -hex 32`）
- [ ] 環境変数を設定（systemdサービスファイルまたは`.env`）
  - `DATABASE_URL`
  - `JWT_SECRET`
  - `BASE_URL`
  - `ALLOWED_ORIGIN`

### 5. systemdサービスの設定

- [ ] `live-schedule-api.service` を `/etc/systemd/system/` に配置
- [ ] `sudo systemctl daemon-reload` を実行
- [ ] `sudo systemctl enable live-schedule-api` で自動起動を有効化
- [ ] `sudo systemctl start live-schedule-api` でサービスを起動
- [ ] `sudo systemctl status live-schedule-api` で状態を確認

### 6. Nginx設定

- [ ] `api.null-relife.com.conf` を `/etc/nginx/sites-available/` に配置
- [ ] シンボリックリンクを `/etc/nginx/sites-enabled/` に作成
- [ ] `sudo nginx -t` で設定をテスト
- [ ] `sudo systemctl restart nginx` でNginxを再起動

### 7. SSL証明書

- [ ] Certbotをインストール
- [ ] `sudo certbot --nginx -d api.null-relife.com` で証明書を取得
- [ ] 自動更新が設定されていることを確認

### 8. 動作確認

- [ ] `curl http://localhost:3000/health` でローカルアクセス確認
- [ ] `curl https://api.null-relife.com/health` で外部アクセス確認
- [ ] ブラウザで `https://api.null-relife.com/health` にアクセス

## トラブルシューティング

問題が発生した場合：

1. サービスログを確認: `sudo journalctl -u live-schedule-api -n 50`
2. Nginxログを確認: `sudo tail -f /var/log/nginx/error.log`
3. 手動で実行してエラーを確認: `cd /var/www/live-schedule-api && ./live-schedule-api`



