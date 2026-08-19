# GenBGT

ライブ予定を整理し、共有ページで公開できるアプリです。

- 使い方（画面の操作方法）は本番の使い方ページを参照してください: https://www.genbgt.com/guide
- このREADMEでは開発者向けに技術スタックと構成を説明します。

## アーキテクチャ概要

モノレポ構成で、フロントエンドとバックエンドを1つのリポジトリで管理しています。

```
frontend (Expo / React Native)  --->  backend (Rust / Axum API)  --->  SQLite
     Web / iOS / Android                  JWT認証・REST API
```

- `frontend/`: Expo Router製のアプリ本体（Web / iOS / Android）
- `backend/`: Rust製のAPIサーバー
- 共有ページ（ログイン不要の閲覧ページ）もこのAPIから配信されます

## フロントエンド（`frontend/`）

- **Expo** (~54) + **Expo Router** (~6) — ファイルベースルーティング
- **React Native** 0.81 / **React** 19、**TypeScript**
- 対応プラットフォーム: iOS / Android / Web（`react-native-web`）
- 主なライブラリ
  - React Navigation（bottom-tabs / native）
  - React Native Reanimated / Gesture Handler
  - react-native-svg（アイコン・グラフィック）
  - AsyncStorage（ローカル永続化）
  - expo-notifications（プッシュ通知）
  - expo-image / expo-image-picker
- ビルド
  - Web: `expo export --platform web` で静的出力し、Cloudflare Pagesにデプロイ
  - モバイル: EAS Build（Android app bundle / APK）

## バックエンド（`backend/`）

- **Rust** + **Axum**（Webフレームワーク）
- **Tokio**（非同期ランタイム）
- **SQLx** + **SQLite**（データベース）
- 認証: **JWT**（jsonwebtoken）+ **bcrypt**（パスワードハッシュ）
- メール送信: **Resend**
- その他: tower-http（CORS）、chrono（日時）、hmac / sha2（署名検証）
- `src/bin/` 配下に運用用CLIツール群（`create_user` / `seed_data` / `fix_bidirectional_relations` / `calculate_all_rollups`）

## インフラ・デプロイ

- **バックエンド**: AWS EC2上でsystemdサービスとして常駐（nginxでリバースプロキシ）
  - `master` へのpushで GitHub Actions（OIDC + AWS SSM）が自動デプロイ
  - デプロイ前にDBの自動バックアップを実行
- **フロントエンド（Web）**: Cloudflare Pages
- **フロントエンド（モバイル）**: EAS Build → Google Play（内部テスト運用）

## CI/CD（`.github/workflows/`）

| ワークフロー | 役割 |
| --- | --- |
| `test.yml` | push / PR時にRustのテストを実行 |
| `deploy-backend.yml` | `master` push時にバックエンドをAWS EC2へ自動デプロイ |
| `backup-db.yml` | DBの自動バックアップ（毎日定時実行、デプロイ前にも実行） |
| `repair-shishamo-order.yml` | 表示順データの手動メンテナンス用（手動実行） |

## ディレクトリ構成（抜粋）

```
frontend/
  app/            画面（Expo Router）
  components/     UIコンポーネント
  contexts/       AuthContextなど
  utils/          API呼び出し・データ加工などのユーティリティ
  constants/      API設定・テーマ

backend/
  src/            APIサーバー本体
  src/bin/        運用用CLIツール
  tests/          統合テスト（api_test.rs / auth_test.rs）
  deploy/         nginx / systemd設定
```

## ローカル開発

### フロントエンド
```bash
cd frontend
npm install
npm run web     # Web版を起動
npm run start   # Expo開発サーバーを起動（iOS/Android）
```

`frontend/.env.local` はローカル開発用のAPI接続先（`EXPO_PUBLIC_API_BASE`）を上書きします。本番ビルド（`eas build --local`など）を行う際は、このファイルが本番用の設定より優先されてしまうため、ビルド前に一時的に退避してください。

### バックエンド
```bash
cd backend
cargo run
```

## テスト

```bash
cd backend
cargo test
```

より詳しいテスト手順は `TESTING_GUIDE.md` を参照してください。

## その他のドキュメント

- `DATABASE_SCHEMA.md` — DBスキーマ
- `デプロイ完全ガイド.md` — デプロイ手順の詳細
- `認証とアクセス制御の説明.md` — 認証・権限まわりの詳細
- `backend/aws-migration/` — AWS移行の背景・手順
