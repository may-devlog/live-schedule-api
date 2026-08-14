# データベース設計書

## 概要

ライブスケジュール管理アプリケーションのデータベース設計書です。

## プロパティタイプについて

各カラムの「プロパティタイプ」列は、UIでの表示方法を指定します。

### 利用可能なプロパティタイプ

| プロパティタイプ | 説明 | UI表示 |
|----------------|------|--------|
| Title | タイトル（通常は最初の列） | 太字で表示、リンク可能 |
| Text | テキスト入力 | 通常のテキスト入力フィールド |
| Number | 数値 | 数値入力フィールド |
| Select | 選択（項目追加可能） | ドロップダウン、新しい項目を追加可能 |
| Multi-select | 複数選択 | 複数のタグを選択可能 |
| Date | 日付 | 日付ピッカー |
| Time | 時刻 | 時刻ピッカー |
| Checkbox | チェックボックス | 真偽値（ON/OFF） |
| Relation | リレーション | 他のテーブルへのリンク |
| Created time | 作成日時 | 自動設定、読み取り専用 |
| Last edited time | 最終更新日時 | 自動更新、読み取り専用 |

**注意:** このプロジェクトでは、Notionの全てのプロパティタイプを実装しているわけではありません。必要に応じて追加してください。

## テーブル一覧

### 1. schedules（ライブスケジュール）

ライブイベントの基本情報を管理するテーブルです。

| カラム名 | データ型 | NULL許可 | デフォルト値 | 説明 | プロパティタイプ | 備考 |
|---------|---------|---------|------------|------|---------------------|------|
| id | INTEGER | NO | AUTO_INCREMENT | 主キー | - | PRIMARY KEY |
| title | TEXT | NO | - | タイトル | Title | |
| group | TEXT | YES | NULL | グループ | Select | 選択肢から選択（未選択時はtitleを使用） |
| date | TEXT | NO | - | 日付 | Date | YYYY-MM-DD形式 |
| open | TEXT | YES | NULL | 開場 | Time | HH:MM形式 |
| start | TEXT | YES | NULL | 開演 | Time | HH:MM形式 |
| end | TEXT | YES | NULL | 終演 | Time | HH:MM形式 |
| notes | TEXT | YES | NULL | 備考 | Text | |
| category | TEXT | YES | NULL | カテゴリ | Select | ワンマン, 対バン 等 |
| area | TEXT | NO | - | エリア | Select | |
| venue | TEXT | NO | - | 会場 | Text | |
| target | TEXT | YES | NULL | お目当て | Select | お目当てのアーティスト名 |
| lineup | TEXT | YES | NULL | 出演者 | Multi-select | |
| seller | TEXT | YES | NULL | 販売元 | Select | チケットぴあ、イープラス 等 |
| ticket_fee | INTEGER | YES | NULL | チケット代 | Number | 円単位 |
| drink_fee | INTEGER | YES | NULL | ドリンク代 | Number | 円単位 |
| total_fare | INTEGER | YES | NULL | 交通費合計 | Number | 円単位（計算値） |
| stay_fee | INTEGER | YES | NULL | 宿泊費合計 | Number | 円単位（計算値） |
| travel_cost | INTEGER | YES | NULL | 遠征費合計 | Number | 円単位（計算値） |
| total_cost | INTEGER | YES | NULL | 総費用 | Number | 円単位（計算値） |
| status | TEXT | NO | 'Pending' | ステータス | Select | Canceled, Pending, Keep, Done |
| created_at | TEXT | YES | 自動設定（DEFAULT） | 作成日時 | Created time | ISO 8601形式、DB側でDEFAULT値を自動設定 |
| updated_at | TEXT | YES | 自動設定（DEFAULT） | 更新日時 | Last edited time | ISO 8601形式、UPDATE時にDBトリガーで自動更新 |

**インデックス:**
- PRIMARY KEY: id
- INDEX: date
- INDEX: status

**制約:**
- date, area, venueは必須

**計算フィールド（アプリケーション側で生成）:**
- `datetime`: date + start から自動生成（ISO 8601形式: `YYYY-MM-DDTHH:MM:00Z`）
  - 並び替えやフィルタリングに使用
  - データベースには保存しない（仮想カラム）

---

### 2. traffics（交通情報）

ライブへの交通手段を管理するテーブルです。

| カラム名 | データ型 | NULL許可 | デフォルト値 | 説明 | プロパティタイプ | 備考 |
|---------|---------|---------|------------|------|---------------------|------|
| id | INTEGER | NO | AUTO_INCREMENT | 主キー | - | PRIMARY KEY |
| schedule_id | INTEGER | NO | - | スケジュールID | Relation | FOREIGN KEY → schedules.id |
| date | TEXT | NO | - | 利用日 | Date | YYYY-MM-DD形式 |
| order | INTEGER | NO | - | 利用順 | Number | |
| transportation | TEXT | YES | - | 交通手段 | Select | |
| from_place | TEXT | NO | - | 出発地 | Text | |
| to_place | TEXT | NO | - | 到着地 | Text | |
| notes | TEXT | YES | NULL | 備考 | Text | 座席種別 等 |
| fare | INTEGER | NO | - | 運賃 | Number | 円単位 |
| miles | INTEGER | YES | - | 消費マイル　| Number | |
| return_flag | INTEGER | NO | 0 | 往復フラグ | Checkbox | 0: 片道, 1: 往復 |
| total_fare | INTEGER | YES | NULL | 運賃合計 | Number | 円単位（計算値） |
| total_miles | INTEGER | YES | NULL | 消費マイル合計 | Number | マイル単位（計算値） |
| created_at | TEXT | YES | 自動設定（DEFAULT） | 作成日時 | Created time | ISO 8601形式、DB側でDEFAULT値を自動設定 |
| updated_at | TEXT | YES | 自動設定（DEFAULT） | 更新日時 | Last edited time | ISO 8601形式、UPDATE時にDBトリガーで自動更新 |

**インデックス:**
- PRIMARY KEY: id
- FOREIGN KEY: schedule_id → schedules.id（ON DELETE CASCADE）
- INDEX: schedule_id

**制約:**
- schedule_idは必須
- fareは必須（0以上）

---

### 3. stays（宿泊情報）

ライブ関連の宿泊情報を管理するテーブルです。

| カラム名 | データ型 | NULL許可 | デフォルト値 | 説明 | プロパティタイプ | 備考 |
|---------|---------|---------|------------|------|---------------------|------|
| id | INTEGER | NO | AUTO_INCREMENT | 主キー | - | PRIMARY KEY |
| schedule_id | INTEGER | NO | - | スケジュールID | Relation | FOREIGN KEY → schedules.id |
| check_in | TEXT | NO | - | チェックイン | Date | YYYY-MM-DD HH:MM形式 |
| check_out | TEXT | NO | - | チェックアウト | Date | YYYY-MM-DD HH:MM形式 |
| hotel_name | TEXT | NO | - | ホテル名 | Text | |
| website | TEXT | YES | - | 予約サイト | Select | |
| fee | INTEGER | NO | - | 宿泊費 | Number | 円単位 |
| breakfast_flag | INTEGER | NO | 0 | 朝食 | Checkbox | 0: 朝食なし, 1: 朝食あり |
| deadline | TEXT | YES | - | 取消料発生日時 | Date | YYYY-MM-DD HH:MM形式 |
| penalty | INTEGER | YES | - | 取消料 | Number | パーセント単位 |
| status | TEXT | NO | 'Keep' | ステータス | Select | Canceled, Keep, Done |
| created_at | TEXT | YES | 自動設定（DEFAULT） | 作成日時 | Created time | ISO 8601形式、DB側でDEFAULT値を自動設定 |
| updated_at | TEXT | YES | 自動設定（DEFAULT） | 更新日時 | Last edited time | ISO 8601形式、UPDATE時にDBトリガーで自動更新 |

**インデックス:**
- PRIMARY KEY: id
- FOREIGN KEY: schedule_id → schedules.id（ON DELETE CASCADE）
- INDEX: schedule_id

**制約:**
- schedule_idは必須
- check_in < check_out（将来追加推奨）
- feeは必須（0以上）

---

### 4. users（ユーザー・プロフィール）

認証情報、共有用ユーザーID、公開プロフィールを管理するテーブルです。

| カラム名 | データ型 | NULL許可 | デフォルト値 | 説明 | 公開範囲 |
|---------|---------|---------|------------|------|---------|
| id | INTEGER | NO | AUTO_INCREMENT | 内部ユーザーID | 非公開 |
| email | TEXT | NO | - | ログイン用メールアドレス | 非公開 |
| password_hash | TEXT | NO | - | パスワードハッシュ | 非公開 |
| email_verified | INTEGER | NO | 0 | メール確認済みフラグ | 非公開 |
| share_id | TEXT | YES | NULL | 共有URL・ユーザー検索に使う一意のユーザーID | 公開 |
| display_name | TEXT | YES | NULL | プロフィールに表示する名前（最大50文字） | 公開 |
| sharing_enabled | INTEGER | NO | 0 | 共有ページ公開フラグ | 非公開 |
| avatar_data_url | TEXT | YES | NULL | プロフィール画像 | 公開 |
| plan | TEXT | NO | 'free' | プラン種別（'free' または 'premium'） | 非公開 |
| premium_started_at | TEXT | YES | NULL | プレミアムプラン開始日時（ISO 8601形式） | 非公開 |
| trial_used | INTEGER | NO | 0 | 無料トライアル利用済みフラグ（0: 未利用, 1: 利用済み。1アカウント1回まで） | 非公開 |
| trial_started_at | TEXT | YES | NULL | 無料トライアル開始日時（ISO 8601形式）。終了日時は保存せず開始日時+1ヶ月を都度計算 | 非公開 |
| created_at | TEXT | YES | NULL | 作成日時 | 非公開 |
| updated_at | TEXT | YES | NULL | 更新日時 | 非公開 |

`display_name`と`share_id`は別項目です。名前は重複可能で、空の場合は画面上で`share_id`を代替表示します。共有ページが無効なユーザーの名前・画像は公開APIから取得できません。

**プラン・トライアル関連カラムについて:**

- `plan`が`'premium'`の場合、または`trial_started_at`から1ヶ月以内（都度計算、`trial_ends_at`のようなカラムは持たない）の場合に、有料プラン相当の機能（`has_paid_access()`）が有効になります
- `trial_used`は無料トライアルを一度でも開始すると`1`になり、以降は再度開始できません
- 有料・無料プランで利用できる機能の違いは [README.md](README.md#有料無料プランの機能差異) を参照してください

**プロフィールAPI:**

- `GET /auth/profile`: ログイン中ユーザーのメールアドレス、ユーザーID、名前、画像を取得
- `PUT /auth/profile`: 名前を更新。`{ "display_name": "名前" }`、`null`または空文字で未設定に戻す
- `PUT /auth/profile-avatar`: プロフィール画像を更新
- `GET /share/:share_id/profile`: 公開中ユーザーのユーザーID、名前、画像を取得

**プラン関連API:**

- `GET /auth/plan-status`: プラン種別（`plan`）、有料機能利用可否（`is_paid_effective`）、プレミアム開始日時、トライアル利用状況を取得
- `POST /auth/start-trial`: 1ヶ月無料トライアルを開始（`trial_started_at`を現在時刻に設定、`trial_used`を`1`に更新）。プレミアムユーザーは`already_premium`、トライアル利用済みの場合は`trial_already_used`エラーで400を返す

---

### 5. masked_locations（出発地・到着地マスク設定）

共有ページで非公開にしたい駅名（出発地・到着地）をユーザーごとに管理するテーブルです。

| カラム名 | データ型 | NULL許可 | デフォルト値 | 説明 | 備考 |
|---------|---------|---------|------------|------|------|
| id | INTEGER | NO | AUTO_INCREMENT | 主キー | PRIMARY KEY |
| user_id | INTEGER | NO | - | ユーザーID | FOREIGN KEY → users.id |
| location_name | TEXT | NO | - | マスク対象の駅名 | traffics.from_place / to_place と一致した場合にマスク |
| created_at | TEXT | YES | NULL | 作成日時 | |
| updated_at | TEXT | YES | NULL | 更新日時 | |

**制約:**
- UNIQUE(user_id, location_name)（同じユーザーが同じ駅名を重複登録できない）

**マスク処理について:**
- 共有ページ（`/share/:share_id/...`）でtrafficsを返す際、`from_place`または`to_place`が登録済みの`location_name`と一致する場合、値を`"***"`に置き換えて返す
- ログイン中の本人の画面（共有ページ以外）には影響しない

**マスク設定API:**

- `GET /masked-locations`: マスク設定一覧を取得
- `POST /masked-locations`: マスク対象の駅名を追加
- `PUT /masked-locations/:id`: マスク対象の駅名を更新
- `DELETE /masked-locations/:id`: マスク設定を削除

---

### 6. subscriptions（決済プロバイダのサブスクリプション情報）

Stripe / Google Play / Apple など、決済プロバイダごとのサブスクリプション状態を管理するテーブルです。

| カラム名 | データ型 | NULL許可 | デフォルト値 | 説明 | 備考 |
|---------|---------|---------|------------|------|------|
| id | INTEGER | NO | AUTO_INCREMENT | 主キー | PRIMARY KEY |
| user_id | INTEGER | NO | - | ユーザーID | FOREIGN KEY → users.id |
| provider | TEXT | NO | - | 決済プロバイダ種別 | `'stripe'` / `'google_play'` / `'apple'` |
| provider_customer_id | TEXT | YES | NULL | プロバイダ側の顧客ID | Stripeの`customer`ID等。プロバイダによっては未使用 |
| provider_subscription_id | TEXT | NO | - | プロバイダ側のサブスクリプションID | Stripeの`subscription`ID、Google Playの購入トークン、AppleのoriginalTransactionId等 |
| status | TEXT | NO | - | サブスクリプション状態 | プロバイダのstatusをほぼそのまま保持（例: `active`, `trialing`, `past_due`, `canceled`） |
| current_period_end | TEXT | YES | NULL | 現在の課金期間の終了日時（ISO 8601形式） | |
| cancel_at_period_end | INTEGER | NO | 0 | 期間終了時に解約予定かどうか（0: 継続, 1: 解約予定） | |
| created_at | TEXT | YES | NULL | 作成日時 | |
| updated_at | TEXT | YES | NULL | 更新日時 | |

**制約:**
- UNIQUE(provider, provider_subscription_id)（Webhook処理を冪等にするため、同一プロバイダ内でのサブスクリプションIDの重複を防ぐ）

**現時点のステータス:**
- テーブル定義のみで、決済プロバイダとの連携（Webhook受信によるレコード作成・更新、`users.plan`/`premium_started_at`への反映）は未実装
- 1ユーザーが複数プロバイダのサブスクリプションを持ちうる構成を想定（将来のAndroid/iOSアプリ化でGoogle Play Billing / StoreKitを追加する際、既存のStripe実装に影響を与えずに拡張できるようにするため）

---

## リレーション

```
schedules (1) ──< (N) traffics
schedules (1) ──< (N) stays
```

- 1つのスケジュールに対して、複数の交通情報と宿泊情報を紐付けることができます
- スケジュールが削除される場合、関連するtrafficsとstaysも削除される（ON DELETE CASCADE）

---

## 計算フィールド

以下のフィールドは、関連データから自動計算される想定です：

### schedulesテーブル

- `datetime`: date + start から自動生成（ISO 8601形式）
  - 例: date="2025-06-15", start="18:00" → datetime="2025-06-15T18:00:00Z"
  - 並び替えやフィルタリングに使用
  - データベースには保存しない（アプリケーション側で生成）

- `total_fare`: 関連するtrafficsのfareの合計
- `stay_fee`: 関連するstaysのfeeの合計
- `travel_cost`: total_fare + stay_fee
- `total_cost`: ticket_fee + drink_fee + travel_cost

### trafficsテーブル

- `total_fare`: 同一schedule_idのfareの合計（往復の場合は往復分も含む）
- `total_miles`: 同一schedule_idのmilesの合計

**注意:** 現在は手動更新またはアプリケーション側で計算が必要です。

---

## データ型の説明

### TEXT
- SQLiteのTEXT型
- 文字列データを格納
- 日付・時刻もTEXT型でISO 8601形式で保存

### INTEGER
- SQLiteのINTEGER型
- 数値データを格納
- 金額は円単位で保存

### 日付・時刻形式
- **datetime**: `YYYY-MM-DDTHH:MM:SSZ` (ISO 8601 UTC形式)
- **date**: `YYYY-MM-DD`
- **time**: `HH:MM`

---

## 将来の拡張案

1. **バリデーション**: データ整合性チェックの強化
2. **スキーマバージョン管理**: マイグレーション機能の追加

---

## 変更履歴

| 日付 | バージョン | 変更内容 | 変更者 |
|------|-----------|---------|--------|
| 2025-01-XX | 1.0.0 | 初版作成 | - |
| 2026-08-14 | 1.1.0 | created_at/updated_atのDB側自動管理（DEFAULT・トリガー）、インデックス追加（schedules.date/status, traffics.schedule_id, stays.schedule_id）、traffics/staysのCASCADE削除を実装 | - |
| 2026-08-15 | 1.2.0 | usersテーブルに有料・無料プラン対応のカラムを追加（plan, premium_started_at, trial_used, trial_started_at）、masked_locationsテーブルの説明を追加 | - |
| 2026-08-15 | 1.3.0 | Stripe決済連携に向けてsubscriptionsテーブルを追加（決済プロバイダ非依存の設計で、将来のGoogle Play Billing / StoreKit対応も見据える） | - |
