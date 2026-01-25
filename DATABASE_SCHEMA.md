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
| date | TEXT | YES | NULL | 日付 | Date | YYYY-MM-DD形式 |
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
| created_at | TEXT | YES | NULL | 作成日時 | Created time | ISO 8601形式 |
| updated_at | TEXT | YES | NULL | 更新日時 | Last edited time | ISO 8601形式 |

**インデックス:**
- PRIMARY KEY: id
- INDEX: date（将来追加推奨）
- INDEX: status（将来追加推奨）

**制約:**
- area, venueは必須

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
| created_at | TEXT | YES | NULL | 作成日時 | Created time | ISO 8601形式 |
| updated_at | TEXT | YES | NULL | 更新日時 | Last edited time | ISO 8601形式 |

**インデックス:**
- PRIMARY KEY: id
- FOREIGN KEY: schedule_id → schedules.id
- INDEX: schedule_id（将来追加推奨）

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
| created_at | TEXT | YES | NULL | 作成日時 | Created time | ISO 8601形式 |
| updated_at | TEXT | YES | NULL | 更新日時 | Last edited time | ISO 8601形式 |

**インデックス:**
- PRIMARY KEY: id
- FOREIGN KEY: schedule_id → schedules.id
- INDEX: schedule_id（将来追加推奨）

**制約:**
- schedule_idは必須
- check_in < check_out（将来追加推奨）
- feeは必須（0以上）

---

## リレーション

```
schedules (1) ──< (N) traffics
schedules (1) ──< (N) stays
```

- 1つのスケジュールに対して、複数の交通情報と宿泊情報を紐付けることができます
- スケジュールが削除される場合、関連するtrafficsとstaysも削除される（CASCADE、将来実装推奨）

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

1. **created_at, updated_at**: 作成日時・更新日時の自動管理
2. **インデックス**: パフォーマンス向上のためのインデックス追加
3. **CASCADE削除**: 外部キー制約の強化
4. **バリデーション**: データ整合性チェックの強化
5. **スキーマバージョン管理**: マイグレーション機能の追加

---

## 変更履歴

| 日付 | バージョン | 変更内容 | 変更者 |
|------|-----------|---------|--------|
| 2025-01-XX | 1.0.0 | 初版作成 | - |

