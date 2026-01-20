# 一般公開に向けた準備 - Fly.io構成のまま

## 1. 現状の評価

### ✅ 既に実装済み（良好）

- **認証システム**: JWT認証、メール確認、パスワードリセット
- **データ永続化**: Fly.io VolumeによるSQLiteデータベースの永続化
- **HTTPS**: `force_https = true`で自動SSL/TLS
- **バックアップスクリプト**: 手動バックアップが可能
- **リージョン切り替え**: シンガポールリージョンへの避難手順あり
- **CORS設定**: フロントエンドとの連携設定済み

### ⚠️ 改善が必要な点

1. **認証の有効化確認**（最重要）
2. **自動バックアップの設定**
3. **監視とアラートの設定**
4. **レート制限の実装**
5. **ログの管理**

## 2. 必須対応事項

### 2.1 認証の有効化確認

**現在の状態を確認:**

```bash
# Fly.ioの環境変数を確認
flyctl secrets list --app live-schedule-api
```

**確認ポイント:**
- `DISABLE_AUTH`が設定されていないことを確認
- 設定されている場合は削除（本番環境では認証を有効化）

```bash
# DISABLE_AUTHを削除（認証を有効化）
flyctl secrets unset DISABLE_AUTH --app live-schedule-api
```

**理由:**
- 一般公開時は認証を有効化する必要がある
- `DISABLE_AUTH`は開発・テスト用の設定

### 2.2 自動バックアップの設定

**GitHub Actionsを使用した自動バックアップ（無料）:**

`.github/workflows/backup-db.yml`を作成：

```yaml
name: Database Backup

on:
  schedule:
    # 毎日午前3時（UTC = 日本時間12時）に実行
    - cron: '0 3 * * *'
  workflow_dispatch: # 手動実行も可能

jobs:
  backup:
    runs-on: ubuntu-latest
    steps:
      - name: Checkout
        uses: actions/checkout@v3

      - name: Install flyctl
        run: |
          curl -L https://fly.io/install.sh | sh
          echo "$HOME/.fly/bin" >> $GITHUB_PATH

      - name: Backup database
        env:
          FLY_API_TOKEN: ${{ secrets.FLY_API_TOKEN }}
        run: |
          cd backend
          mkdir -p data/backups
          TIMESTAMP=$(date +%Y%m%d_%H%M%S)
          BACKUP_FILE="data/backups/app.db.backup.${TIMESTAMP}"
          
          flyctl sftp shell --app live-schedule-api <<EOF
          get /app/data/app.db $BACKUP_FILE
          EOF
          
          # バックアップサイズを確認
          ls -lh $BACKUP_FILE

      - name: Upload backup as artifact
        uses: actions/upload-artifact@v3
        with:
          name: database-backup-${{ github.run_number }}
          path: backend/data/backups/*.db
          retention-days: 30

      - name: Cleanup old backups
        run: |
          cd backend/data/backups
          # 30日以上前のバックアップを削除（ローカルのみ）
          find . -name "*.db" -mtime +30 -delete || true
```

**設定手順:**

1. **GitHub SecretsにFly.io APIトークンを追加:**
   ```bash
   # Fly.io APIトークンを取得
   flyctl auth token
   
   # GitHubリポジトリのSettings > Secrets > Actionsで追加
   # 名前: FLY_API_TOKEN
   # 値: <取得したトークン>
   ```

2. **ワークフローファイルを作成:**
   ```bash
   mkdir -p .github/workflows
   # 上記のYAMLを .github/workflows/backup-db.yml に保存
   ```

3. **動作確認:**
   - GitHub Actionsのページで手動実行（`workflow_dispatch`）
   - 正常にバックアップが作成されることを確認

**メリット:**
- ✅ 完全無料
- ✅ 30日間のバックアップ履歴を保持
- ✅ 手動実行も可能
- ✅ バックアップ失敗時に通知可能

### 2.3 監視とアラートの設定

**Fly.ioの監視機能を活用:**

```bash
# メトリクスの確認
flyctl metrics --app live-schedule-api

# ログの確認
flyctl logs --app live-schedule-api
```

**推奨設定:**

1. **Fly.ioのアラート設定（有料プランが必要）:**
   - CPU使用率が80%を超えた場合
   - メモリ使用率が80%を超えた場合
   - レスポンスタイムが1秒を超えた場合

2. **無料での監視方法:**
   - 定期的に`flyctl status`で確認
   - ログを定期的に確認
   - 外部監視サービス（UptimeRobotなど）を使用

**UptimeRobot（無料）の設定:**
- URL: `https://live-schedule-api.fly.dev/health`
- 監視間隔: 5分
- アラート: メール通知

### 2.4 ヘルスチェックエンドポイントの追加

`backend/src/main.rs`に追加：

```rust
// ヘルスチェックエンドポイント
async fn health_check() -> Json<serde_json::Value> {
    Json(serde_json::json!({
        "status": "ok",
        "timestamp": chrono::Utc::now().to_rfc3339(),
        "version": env!("CARGO_PKG_VERSION")
    }))
}

// ルーターに追加
let app = Router::new()
    .route("/health", get(health_check))
    // ... 他のルート
```

## 3. 推奨対応事項（時間がある場合）

### 3.1 レート制限の実装

**目的**: DDoS攻撃や過剰なリクエストからの保護

**実装例（tower-governorを使用）:**

```toml
# Cargo.tomlに追加
[dependencies]
tower-governor = "0.4"
```

```rust
// main.rsに追加
use tower_governor::{governor::GovernorConfigBuilder, GovernorLayer};

let governor_conf = Box::new(
    GovernorConfigBuilder::default()
        .per_second(10) // 1秒あたり10リクエスト
        .burst_size(20) // バースト時は20リクエストまで
        .finish()
        .unwrap(),
);

let app = Router::new()
    .layer(GovernorLayer {
        config: governor_conf,
    })
    // ... 他のルート
```

### 3.2 ログの改善

**構造化ログの導入:**

```toml
# Cargo.tomlに追加
[dependencies]
tracing = "0.1"
tracing-subscriber = { version = "0.3", features = ["env-filter"] }
```

```rust
// main.rsに追加
use tracing_subscriber;

#[tokio::main]
async fn main() {
    tracing_subscriber::fmt()
        .with_env_filter("info")
        .init();
    
    // ...
}
```

### 3.3 セキュリティヘッダーの追加

```rust
use tower_http::set_header::SetResponseHeaderLayer;
use axum::http::HeaderValue;

let app = Router::new()
    .layer(SetResponseHeaderLayer::overriding(
        axum::http::header::X_CONTENT_TYPE_OPTIONS,
        HeaderValue::from_static("nosniff"),
    ))
    .layer(SetResponseHeaderLayer::overriding(
        axum::http::header::X_FRAME_OPTIONS,
        HeaderValue::from_static("DENY"),
    ))
    // ... 他のルート
```

## 4. コスト比較

### Fly.io（現状のまま）

| 項目 | 月額料金 |
|------|---------|
| **VM** (1 vCPU, 256MB RAM) | $5-10 |
| **Volume** (3GB) | $0.15/GB × 3 = $0.45 |
| **データ転送** (10GB/月) | 無料枠内 |
| **合計** | **約$5-10/月（¥750-1,500）** |

### AWS移行した場合

| 項目 | 月額料金 |
|------|---------|
| **ECS Fargate** | $7.50 |
| **RDS PostgreSQL** | $15.00 |
| **ALB** | $16.20 |
| **NAT Gateway** | $32.40 |
| **その他** | $4.40 |
| **合計** | **約$75/月（¥11,250）** |

**結論**: Fly.ioのままの方が**約7-15倍安い**

## 5. 一般公開前のチェックリスト

### セキュリティ
- [ ] `DISABLE_AUTH`環境変数を削除（認証を有効化）
- [ ] `JWT_SECRET`が強力なランダム値であることを確認
- [ ] パスワードポリシーの確認（最小文字数など）
- [ ] CORS設定が適切であることを確認

### データ保護
- [ ] 自動バックアップが設定されている
- [ ] バックアップの動作確認
- [ ] バックアップの復元テスト

### 監視
- [ ] ヘルスチェックエンドポイントが動作している
- [ ] ログの確認方法を把握している
- [ ] アラート設定（可能な範囲で）

### パフォーマンス
- [ ] レスポンスタイムの確認
- [ ] 同時接続数の確認
- [ ] データベースサイズの確認

### ドキュメント
- [ ] 利用規約の作成
- [ ] プライバシーポリシーの作成
- [ ] サポート連絡先の設定

## 6. スケーリング計画

### 現在の構成で対応可能な規模

- **同時ユーザー数**: 10-50人程度
- **1日のリクエスト数**: 10,000-50,000リクエスト
- **データベースサイズ**: 1GB以下

### スケールが必要になった場合

1. **VMサイズの増加:**
   ```toml
   [[vm]]
     cpu_kind = "shared"
     cpus = 2        # 1 → 2に増加
     memory_mb = 512  # 256 → 512に増加
   ```
   **コスト**: 約$20-30/月

2. **複数インスタンスの実行:**
   ```toml
   [http_service]
     min_machines_running = 2  # 1 → 2に増加
   ```
   **コスト**: 約$10-20/月（追加）

3. **データベースの最適化:**
   - インデックスの追加
   - クエリの最適化
   - 不要なデータの削除

## 7. まとめ

### Fly.ioのまま一般公開するメリット

✅ **低コスト**: 月額$5-10で運用可能  
✅ **シンプル**: 設定が簡単、管理が容易  
✅ **十分な機能**: 認証、HTTPS、バックアップ対応済み  
✅ **スケーラブル**: 必要に応じてリソースを増やせる  

### 必要な対応（最小限）

1. **認証の有効化**（必須）
2. **自動バックアップの設定**（必須）
3. **ヘルスチェックエンドポイントの追加**（推奨）

### 今後の検討事項

- ユーザー数が増えたらVMサイズを増やす
- トラフィックが増えたら複数インスタンスを実行
- データベースが大きくなったら最適化または移行を検討

**結論**: Fly.ioのままでも一般公開は十分可能です。最低限の対応を行えば、安全に運用できます。

