# テスト自動化ガイド

## 概要

このプロジェクトでは、本番データベースを使用せずにテストを自動化しています。

### テストの種類

1. **単体テスト（Unit Tests）**
   - 各モジュール内の`#[cfg(test)]`モジュールで定義
   - 関数レベルのテスト

2. **統合テスト（Integration Tests）**
   - `backend/tests/`ディレクトリに配置
   - テスト用の一時データベースを使用
   - APIエンドポイントのテスト

3. **E2Eテスト（End-to-End Tests）**
   - 実際のHTTPリクエストを送信
   - テストサーバーを起動してテスト

## テスト用データベース

### 一時データベースの使用

テストでは、本番データベースを使用せず、一時的なSQLiteデータベースを使用します。

**特徴:**
- ✅ テストごとに独立したデータベース
- ✅ テスト終了後に自動削除
- ✅ 本番データに影響なし
- ✅ 並列実行可能

### 実装方法

`backend/tests/common/mod.rs`で実装：

```rust
use tempfile::TempDir;

// 一時ディレクトリを作成
let temp_dir = TempDir::new().expect("Failed to create temp directory");
let db_path = temp_dir.path().join("test.db");
let database_url = format!("sqlite:{}", db_path.display());
```

## テストの実行方法

### ローカルでの実行

```bash
cd backend

# すべてのテストを実行
cargo test

# 特定のテストを実行
cargo test test_user_login

# 詳細な出力で実行
cargo test -- --nocapture

# 並列実行を無効化（デバッグ時）
cargo test -- --test-threads=1
```

### GitHub Actionsでの自動実行

`.github/workflows/test.yml`が以下のタイミングで自動実行されます：

- プッシュ時（master/mainブランチ）
- プルリクエスト作成時
- 手動実行（workflow_dispatch）

## テストの書き方

### 認証テストの例

```rust
// backend/tests/auth_test.rs

#[tokio::test]
async fn test_user_login() {
    let pool = get_test_pool().await;
    let app = create_test_app(pool.clone()).await;
    
    // テストユーザーを作成
    let user_id = create_test_user(&pool, "test@example.com", "password123").await;
    
    // ログインリクエスト
    let login_body = serde_json::json!({
        "email": "test@example.com",
        "password": "password123"
    });
    
    let request = Request::builder()
        .method("POST")
        .uri("/auth/login")
        .header("content-type", "application/json")
        .body(Body::from(serde_json::to_string(&login_body).unwrap()))
        .unwrap();
    
    let response = app.oneshot(request).await.unwrap();
    
    assert_eq!(response.status(), StatusCode::OK);
}
```

### APIテストの例

```rust
// backend/tests/api_test.rs

#[tokio::test]
async fn test_schedules_endpoint_requires_auth() {
    let pool = get_test_pool().await;
    let app = create_test_app(pool).await;
    
    // 認証なしでアクセス
    let request = Request::builder()
        .method("GET")
        .uri("/schedules")
        .body(Body::empty())
        .unwrap();
    
    let response = app.oneshot(request).await.unwrap();
    
    // 認証が必要なので401が返される
    assert_eq!(response.status(), StatusCode::UNAUTHORIZED);
}
```

## テストヘルパー関数

### `backend/tests/common/mod.rs`

以下のヘルパー関数が利用可能です：

- `get_test_pool()`: テスト用データベースプールを取得
- `create_test_user()`: テスト用ユーザーを作成
- `create_test_token()`: テスト用JWTトークンを作成

## 環境変数

テスト実行時は、以下の環境変数が自動設定されます：

```bash
JWT_SECRET=test-secret-key-for-testing-only
DATABASE_URL=sqlite::memory:  # または一時ファイル
ALLOW_USER_REGISTRATION=1
```

## ベストプラクティス

### 1. テストの独立性

各テストは独立して実行できるようにする：
- テスト間でデータを共有しない
- テストごとに必要なデータを作成

### 2. テストデータのクリーンアップ

テスト用データベースは自動的にクリーンアップされますが、明示的に削除することも可能：

```rust
#[tokio::test]
async fn test_example() {
    let pool = get_test_pool().await;
    
    // テスト実行
    
    // 必要に応じてクリーンアップ
    sqlx::query("DELETE FROM users WHERE email LIKE 'test@%'")
        .execute(&pool)
        .await
        .unwrap();
}
```

### 3. エラーハンドリング

テストでは、エラーが発生した場合に適切なメッセージを表示：

```rust
let result = sqlx::query("SELECT * FROM users")
    .fetch_one(&pool)
    .await
    .expect("Failed to fetch user");
```

### 4. 非同期テスト

すべてのテストは`#[tokio::test]`を使用：

```rust
#[tokio::test]
async fn test_async_function() {
    // 非同期処理のテスト
}
```

## トラブルシューティング

### テストが失敗する場合

1. **データベース接続エラー**
   - 一時ディレクトリの作成に失敗している可能性
   - `tempfile`クレートが正しくインストールされているか確認

2. **認証エラー**
   - `JWT_SECRET`環境変数が設定されているか確認
   - テスト用のシークレットキーを使用

3. **並列実行の問題**
   - テストを順次実行: `cargo test -- --test-threads=1`

### テストのデバッグ

```bash
# 詳細な出力で実行
cargo test -- --nocapture

# 特定のテストのみ実行
cargo test test_user_login -- --nocapture

# テストの実行時間を表示
cargo test -- --show-output
```

## CI/CDでの実行

GitHub Actionsで自動実行されるテスト：

```yaml
# .github/workflows/test.yml
- name: Run tests
  working-directory: backend
  env:
    JWT_SECRET: test-secret-key-for-testing-only
    DATABASE_URL: sqlite::memory:
  run: cargo test --verbose
```

## カバレッジレポート（オプション）

カバレッジツールを使用する場合：

```bash
# cargo-tarpaulinをインストール
cargo install cargo-tarpaulin

# カバレッジレポートを生成
cargo tarpaulin --out Xml
```

## まとめ

- ✅ 本番データベースを使用しない
- ✅ テスト用の一時データベースを使用
- ✅ 自動クリーンアップ
- ✅ GitHub Actionsで自動実行
- ✅ 並列実行可能

テストを追加する際は、`backend/tests/`ディレクトリに新しいテストファイルを作成してください。

