# テスト自動化のセットアップ

## 概要

本番データベースを使用せずに、テスト用の一時データベースを使用してテストを自動化します。

## 実装内容

### 1. テスト用データベース

- **場所**: `backend/tests/common/mod.rs`
- **特徴**:
  - 一時ファイルとして作成
  - テスト終了後に自動削除
  - 本番データに影響なし

### 2. テストファイル

- **認証テスト**: `backend/tests/auth_test.rs`
- **APIテスト**: `backend/tests/api_test.rs`
- **共通モジュール**: `backend/tests/common/mod.rs`

### 3. GitHub Actions

- **ワークフロー**: `.github/workflows/test.yml`
- **実行タイミング**:
  - プッシュ時
  - プルリクエスト作成時
  - 手動実行

## セットアップ手順

### 1. 依存関係のインストール

```bash
cd backend
cargo build
```

### 2. テストの実行

```bash
# すべてのテストを実行
cargo test

# 特定のテストを実行
cargo test test_health_check

# 詳細な出力で実行
cargo test -- --nocapture
```

### 3. GitHub Actionsの設定

既に`.github/workflows/test.yml`が作成されているため、自動的に実行されます。

## 現在のテスト

### 実装済み

- ✅ ヘルスチェックエンドポイントのテスト
- ✅ テスト用ユーザー作成のテスト
- ✅ テスト用JWTトークン作成のテスト
- ✅ 認証が必要なエンドポイントのテスト（簡易版）

### 今後の拡張

実際のハンドラーをテストするには、`lib.rs`を作成してモジュールを公開する必要があります。

**推奨手順:**

1. `backend/src/lib.rs`を作成
2. `main.rs`のモジュールを`lib.rs`に移動
3. `main.rs`から`lib.rs`の関数を呼び出す
4. テストから`lib.rs`のモジュールをインポート

## テストの書き方

### 基本的なテスト

```rust
#[tokio::test]
async fn test_example() {
    let pool = get_test_pool().await;
    
    // テスト実行
    // ...
}
```

### テスト用ユーザーの作成

```rust
let user_id = create_test_user(&pool, "test@example.com", "password123").await;
```

### テスト用トークンの作成

```rust
let token = create_test_token(user_id as i32);
```

## 環境変数

テスト実行時は、以下の環境変数が自動設定されます：

```bash
JWT_SECRET=test-secret-key-for-testing-only
DATABASE_URL=sqlite::memory:  # または一時ファイル
ALLOW_USER_REGISTRATION=1
```

## トラブルシューティング

### テストが失敗する場合

1. **依存関係の確認**
   ```bash
   cargo build
   ```

2. **一時ディレクトリの確認**
   - `tempfile`クレートが正しくインストールされているか確認

3. **並列実行の問題**
   ```bash
   cargo test -- --test-threads=1
   ```

## 次のステップ

1. ✅ テストの基本構造: 完了
2. ⏭️ `lib.rs`の作成: 実際のハンドラーをテストするために必要
3. ⏭️ より詳細なテストの追加: 各エンドポイントのテスト

## 参考

- `backend/TESTING_GUIDE.md`: 詳細なテストガイド
- `backend/tests/`: テストファイルのディレクトリ

