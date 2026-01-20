# AWS移行計画 - アプリケーション移行とデプロイ

## 1. Dockerfileの更新

### 1.1 PostgreSQL対応のDockerfile

`backend/Dockerfile`を更新：

```dockerfile
# Rustアプリ用のDockerfile（PostgreSQL対応）
FROM rust:latest as builder

WORKDIR /app

# PostgreSQLのビルド依存関係をインストール
RUN apt-get update && apt-get install -y \
    pkg-config \
    libpq-dev \
    && rm -rf /var/lib/apt/lists/*

# 依存関係をコピーしてビルド（キャッシュを効かせるため）
COPY Cargo.toml Cargo.lock ./
RUN mkdir -p src/bin && \
    echo "fn main() {}" > src/main.rs && \
    echo "fn main() {}" > src/bin/create_user.rs && \
    echo "fn main() {}" > src/bin/seed_data.rs && \
    echo "fn main() {}" > src/bin/fix_bidirectional_relations.rs && \
    echo "fn main() {}" > src/bin/calculate_all_rollups.rs
RUN cargo build --release
RUN rm -rf src

# 実際のソースコードをコピー
COPY src ./src

# ビルド（依存関係はキャッシュから使用）
RUN touch src/main.rs
RUN cargo build --release

# 実行用イメージ
FROM debian:bookworm-slim

RUN apt-get update && apt-get install -y \
    ca-certificates \
    libssl3 \
    libpq5 \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# ビルドしたバイナリをコピー
COPY --from=builder /app/target/release/live-schedule-api /app/live-schedule-api

EXPOSE 3000

CMD ["./live-schedule-api"]
```

### 1.2 ローカルでのビルドテスト

```bash
cd backend
docker build -t live-schedule-api:latest .
docker run -p 3000:3000 \
  -e DATABASE_URL="postgresql://user:password@host:5432/dbname" \
  -e JWT_SECRET="test-secret" \
  live-schedule-api:latest
```

## 2. ECRへのイメージプッシュ

### 2.1 AWS CLIの設定

```bash
# AWS CLIがインストールされていることを確認
aws --version

# 認証情報を設定（初回のみ）
aws configure
# AWS Access Key ID: <入力>
# AWS Secret Access Key: <入力>
# Default region name: ap-northeast-1
# Default output format: json
```

### 2.2 ECRへのログイン

```bash
# アカウントIDを取得
AWS_ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)

# ECRにログイン
aws ecr get-login-password --region ap-northeast-1 | \
  docker login --username AWS --password-stdin \
  ${AWS_ACCOUNT_ID}.dkr.ecr.ap-northeast-1.amazonaws.com
```

### 2.3 イメージのビルドとプッシュ

```bash
cd backend

# イメージをビルド
docker build -t live-schedule-api:latest .

# ECR用にタグ付け
docker tag live-schedule-api:latest \
  ${AWS_ACCOUNT_ID}.dkr.ecr.ap-northeast-1.amazonaws.com/live-schedule-api:latest

# ECRにプッシュ
docker push \
  ${AWS_ACCOUNT_ID}.dkr.ecr.ap-northeast-1.amazonaws.com/live-schedule-api:latest
```

## 3. ECSタスク定義の作成

### 3.1 タスク定義JSONの作成

`backend/aws-migration/ecs-task-definition.json`を作成：

```json
{
  "family": "live-schedule-api",
  "networkMode": "awsvpc",
  "requiresCompatibilities": ["FARGATE"],
  "cpu": "256",
  "memory": "512",
  "containerDefinitions": [
    {
      "name": "live-schedule-api",
      "image": "<ACCOUNT_ID>.dkr.ecr.ap-northeast-1.amazonaws.com/live-schedule-api:latest",
      "portMappings": [
        {
          "containerPort": 3000,
          "protocol": "tcp"
        }
      ],
      "environment": [
        {
          "name": "RUST_LOG",
          "value": "info"
        },
        {
          "name": "PORT",
          "value": "3000"
        }
      ],
      "secrets": [
        {
          "name": "DATABASE_URL",
          "valueFrom": "arn:aws:secretsmanager:ap-northeast-1:<ACCOUNT_ID>:secret:live-schedule-api-secrets:DATABASE_URL::"
        },
        {
          "name": "JWT_SECRET",
          "valueFrom": "arn:aws:secretsmanager:ap-northeast-1:<ACCOUNT_ID>:secret:live-schedule-api-secrets:JWT_SECRET::"
        },
        {
          "name": "BASE_URL",
          "valueFrom": "arn:aws:secretsmanager:ap-northeast-1:<ACCOUNT_ID>:secret:live-schedule-api-secrets:BASE_URL::"
        },
        {
          "name": "FRONTEND_URL",
          "valueFrom": "arn:aws:secretsmanager:ap-northeast-1:<ACCOUNT_ID>:secret:live-schedule-api-secrets:FRONTEND_URL::"
        },
        {
          "name": "ALLOWED_ORIGIN",
          "valueFrom": "arn:aws:secretsmanager:ap-northeast-1:<ACCOUNT_ID>:secret:live-schedule-api-secrets:ALLOWED_ORIGIN::"
        },
        {
          "name": "RESEND_API_KEY",
          "valueFrom": "arn:aws:secretsmanager:ap-northeast-1:<ACCOUNT_ID>:secret:live-schedule-api-secrets:RESEND_API_KEY::"
        }
      ],
      "logConfiguration": {
        "logDriver": "awslogs",
        "options": {
          "awslogs-group": "/ecs/live-schedule-api",
          "awslogs-region": "ap-northeast-1",
          "awslogs-stream-prefix": "ecs"
        }
      },
      "healthCheck": {
        "command": [
          "CMD-SHELL",
          "curl -f http://localhost:3000/health || exit 1"
        ],
        "interval": 30,
        "timeout": 5,
        "retries": 3,
        "startPeriod": 60
      }
    }
  ]
}
```

**注意**: `<ACCOUNT_ID>`を実際のAWSアカウントIDに置き換えてください。

### 3.2 タスク定義の登録

**AWSマネジメントコンソールでの操作：**

1. **ECSダッシュボード** → **タスク定義**に移動
2. **新しいタスク定義の作成**をクリック
3. JSONをコピー&ペースト、または手動で入力

**または、AWS CLIで登録：**

```bash
cd backend/aws-migration

# アカウントIDを置き換え
sed "s/<ACCOUNT_ID>/${AWS_ACCOUNT_ID}/g" ecs-task-definition.json > ecs-task-definition-final.json

# タスク定義を登録
aws ecs register-task-definition \
  --cli-input-json file://ecs-task-definition-final.json \
  --region ap-northeast-1
```

## 4. ECSサービスの作成

### 4.1 サービスの作成

**AWSマネジメントコンソールでの操作：**

1. **ECSダッシュボード** → **クラスター** → `live-schedule-cluster`に移動
2. **サービス**タブ → **サービスの作成**をクリック
3. 以下の設定を入力：

**基本設定:**
- **起動タイプ**: Fargate
- **タスク定義**: `live-schedule-api`（最新リビジョン）
- **サービス名**: `live-schedule-api-service`
- **サービスタイプ**: REPLICA
- **必要なタスク数**: 1（初期）

**ネットワーク:**
- **VPC**: `live-schedule-vpc`
- **サブネット**: プライベートサブネット（1a, 1c）を選択
- **セキュリティグループ**: `live-schedule-ecs-sg`
- **パブリックIP**: 無効（NATゲートウェイ経由）

**ロードバランシング:**
- **ロードバランサーの種類**: Application Load Balancer
- **ロードバランサー名**: `live-schedule-alb`
- **リスナー**: HTTP:80
- **ターゲットグループ名**: `live-schedule-tg`
- **コンテナ名とポート**: `live-schedule-api:3000`

**自動スケーリング:**
- **自動スケーリング**: 有効化（オプション）
- **最小タスク数**: 1
- **最大タスク数**: 3
- **ターゲット追跡スケーリングポリシー**: CPU使用率70%

**デプロイ設定:**
- **デプロイメントタイプ**: ローリング更新
- **最小正常状態の割合**: 100%
- **最大パーセント**: 200%

### 4.2 サービスの起動確認

```bash
# サービスの状態を確認
aws ecs describe-services \
  --cluster live-schedule-cluster \
  --services live-schedule-api-service \
  --region ap-northeast-1

# タスクの状態を確認
aws ecs list-tasks \
  --cluster live-schedule-cluster \
  --service-name live-schedule-api-service \
  --region ap-northeast-1
```

## 5. ヘルスチェックエンドポイントの追加

### 5.1 アプリケーションにヘルスチェックを追加

`backend/src/main.rs`に追加：

```rust
// ヘルスチェックエンドポイント
async fn health_check() -> Json<serde_json::Value> {
    Json(serde_json::json!({
        "status": "ok",
        "timestamp": chrono::Utc::now().to_rfc3339()
    }))
}

// ルーターに追加
let app = Router::new()
    .route("/health", get(health_check))
    // ... 他のルート
```

## 6. フロントエンドの設定変更

### 6.1 環境変数の更新

`frontend/.env.production`またはCloudflare Pagesの環境変数を更新：

```bash
# 旧: API_URL=https://live-schedule-api.fly.dev
# 新: API_URL=https://api.yourdomain.com
# または
# 新: API_URL=<ALBのDNS名>
```

### 6.2 CORS設定の確認

バックエンドの`ALLOWED_ORIGIN`環境変数に、フロントエンドのURLを設定：

```bash
ALLOWED_ORIGIN=https://yourdomain.com
```

## 7. SSL/TLS証明書の設定（HTTPS対応）

### 7.1 ACM（AWS Certificate Manager）で証明書を取得

1. **ACMダッシュボード**に移動
2. **証明書のリクエスト**をクリック
3. **ドメイン名**を入力（例: `api.yourdomain.com`）
4. **検証方法**: DNS検証（推奨）
5. Route53でDNSレコードを作成して検証

### 7.2 ALBリスナーにHTTPSを追加

1. **EC2ダッシュボード** → **ロードバランサー** → `live-schedule-alb`に移動
2. **リスナー**タブ → **リスナーの追加**をクリック
3. 以下の設定を入力：
- **プロトコル**: HTTPS
- **ポート**: 443
- **デフォルトアクション**: ターゲットグループに転送（`live-schedule-tg`）
- **証明書**: 作成したACM証明書を選択

### 7.3 HTTPからHTTPSへのリダイレクト

1. HTTPリスナー（ポート80）のルールを編集
2. **アクション**を「HTTPSへのリダイレクト」に変更

## 8. デプロイスクリプトの作成

`backend/scripts/deploy-to-aws.sh`を作成：

```bash
#!/bin/bash
# AWS ECSへのデプロイスクリプト

set -e

AWS_ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)
AWS_REGION="ap-northeast-1"
ECR_REPO="live-schedule-api"
ECS_CLUSTER="live-schedule-cluster"
ECS_SERVICE="live-schedule-api-service"

echo "=== Building Docker image ==="
cd "$(dirname "$0")/.."
docker build -t ${ECR_REPO}:latest .

echo "=== Logging in to ECR ==="
aws ecr get-login-password --region ${AWS_REGION} | \
  docker login --username AWS --password-stdin \
  ${AWS_ACCOUNT_ID}.dkr.ecr.${AWS_REGION}.amazonaws.com

echo "=== Tagging image ==="
docker tag ${ECR_REPO}:latest \
  ${AWS_ACCOUNT_ID}.dkr.ecr.${AWS_REGION}.amazonaws.com/${ECR_REPO}:latest

echo "=== Pushing image to ECR ==="
docker push \
  ${AWS_ACCOUNT_ID}.dkr.ecr.${AWS_REGION}.amazonaws.com/${ECR_REPO}:latest

echo "=== Updating ECS service ==="
aws ecs update-service \
  --cluster ${ECS_CLUSTER} \
  --service ${ECS_SERVICE} \
  --force-new-deployment \
  --region ${AWS_REGION}

echo "=== Deployment initiated ==="
echo "Check the status in AWS Console:"
echo "https://console.aws.amazon.com/ecs/v2/clusters/${ECS_CLUSTER}/services/${ECS_SERVICE}"
```

実行権限を付与：
```bash
chmod +x backend/scripts/deploy-to-aws.sh
```

## 次のステップ

- [05-switchover.md](./05-switchover.md) - 切り替え手順と検証

