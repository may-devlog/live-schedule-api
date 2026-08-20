# APIサーバー デプロイメントガイド

> **注意**: このガイドは元々ConoHa WING向けに書かれたものです。
> 現在の本番環境はAWS EC2上で稼働しており、実際のドメインは
> `api.genbgt.com`、`.env`の配置パスは`/opt/live-schedule-api/backend/.env`、
> Nginx設定は`/etc/nginx/conf.d/live-schedule-api.conf`であることを
> 本番サーバー上で直接確認済みです（2026年時点）。ConoHa WING固有の
> 手順（1〜2）は現在のAWS環境には当てはまりません。それ以外の手順
> （systemdサービス名、デプロイ方法の詳細など）は未検証のため、
> 実施前に必ず本番サーバー上の実際の状態を確認してください。

## 手動で対応すべき項目

### 1. ConoHa WINGでAPI用サブドメインを作成

- ConoHa WINGコントロールパネル → サーバー管理 → ドメイン
- 「+ドメイン」→「サブドメインを追加」
- サブドメイン名: `api`
- 無料独自SSL: 有効化（推奨）

### 2. DNS設定（ドメイン管理画面）

ドメイン管理画面（お名前.com、ムームードメインなど）で以下を設定：

```
ホスト名: api
タイプ: A
TTL: 3600
値: ConoHa WINGサーバーのIPアドレス
```

### 3. サーバーへのSSH接続

```bash
ssh ユーザー名@サーバーのIPアドレス
```

### 4. 必要なソフトウェアのインストール

```bash
# Rustのインストール
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
source $HOME/.cargo/env

# Nginxのインストール（ConoHa WINGに既にインストールされている可能性あり）
sudo apt update
sudo apt install nginx -y
```

### 5. プロジェクトのアップロード

#### 方法A: Gitを使用（推奨）

```bash
cd /var/www
sudo git clone https://github.com/your-username/live-schedule-api.git
cd live-schedule-api/backend
```

#### 方法B: SCPでアップロード

```bash
# ローカルから実行
scp -r backend/ ユーザー名@サーバーのIP:/var/www/live-schedule-api/
```

### 6. データベースディレクトリの作成

```bash
sudo mkdir -p /var/www/live-schedule-api/data
sudo chown -R www-data:www-data /var/www/live-schedule-api
```

### 7. バックエンドのビルド

```bash
cd /var/www/live-schedule-api/backend
cargo build --release
```

### 8. バイナリの配置

```bash
sudo cp target/release/live-schedule-api /var/www/live-schedule-api/
sudo chmod +x /var/www/live-schedule-api/live-schedule-api
```

### 9. 環境変数の設定

`/var/www/live-schedule-api/.env`を作成（またはsystemdサービスファイルを編集）：

```bash
sudo nano /var/www/live-schedule-api/.env
```

内容：
```
DATABASE_URL=sqlite:///var/www/live-schedule-api/data/app.db
JWT_SECRET=ランダムな長い文字列（32文字以上推奨）
BASE_URL=https://www.genbgt.com
ALLOWED_ORIGIN=https://www.genbgt.com
RESEND_API_KEY=Resendで発行したAPIキー
EMAIL_FROM=GenBGT <noreply@genbgt.com>
CONTACT_TO_EMAIL=contact@genbgt.com
```

`EMAIL_FROM`に使用するドメインは、事前にResendで所有確認を完了してください。
未確認ドメインやResendのテスト用送信元では、任意のユーザー宛てに送信できません。

`CONTACT_TO_EMAIL`はお問い合わせフォームの送信先で、未設定時は`contact@genbgt.com`宛てに送信されます。
genbgt.comは既存のメール転送設定（forwardemail.net）で運営者のGmailに転送されるため、追加設定は不要です。

JWT_SECRETの生成：
```bash
openssl rand -hex 32
```

### 10. systemdサービスファイルの配置

```bash
sudo cp deploy/systemd/live-schedule-api.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable live-schedule-api
sudo systemctl start live-schedule-api
```

### 11. Nginx設定ファイルの配置

現在の本番環境（AWS EC2 / Amazon Linux系）では`conf.d`配下に直接配置している
（Debian/Ubuntu系の`sites-available`/`sites-enabled`方式ではない）：

```bash
sudo cp deploy/nginx/api.genbgt.com.conf /etc/nginx/conf.d/live-schedule-api.conf
sudo nginx -t
sudo systemctl reload nginx
```

### 12. SSL証明書の取得（Let's Encrypt）

```bash
sudo apt install certbot python3-certbot-nginx -y
sudo certbot --nginx -d api.genbgt.com
```

### 13. ファイアウォール設定（必要に応じて）

```bash
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw allow 22/tcp
sudo ufw enable
```

### 14. 動作確認

```bash
# サービス状態確認
sudo systemctl status live-schedule-api

# ログ確認
sudo journalctl -u live-schedule-api -f

# API動作確認
curl http://localhost:3000/health
curl https://api.genbgt.com/health
```

## トラブルシューティング

### サービスが起動しない場合

```bash
# ログを確認
sudo journalctl -u live-schedule-api -n 50

# 手動で実行してエラーを確認
cd /var/www/live-schedule-api
./live-schedule-api
```

### データベースエラーの場合

```bash
# データベースファイルの権限確認
ls -la /var/www/live-schedule-api/data/
sudo chown -R www-data:www-data /var/www/live-schedule-api/data/
```

### Nginxエラーの場合

```bash
# 設定ファイルの構文チェック
sudo nginx -t

# エラーログ確認
sudo tail -f /var/log/nginx/error.log
```

## 更新手順

```bash
cd /var/www/live-schedule-api
git pull
cd backend
cargo build --release
sudo cp target/release/live-schedule-api /var/www/live-schedule-api/
sudo systemctl restart live-schedule-api
```


