// スケジュール関連の型定義

use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use sqlx::FromRow;

// ====== Schedule 型定義（API 用） ======

#[derive(Serialize, Clone)]
pub struct Schedule {
    pub id: i32,
    pub title: String,
    pub group: Option<String>, // NULL許可（空欄の場合はNULLのまま）
    pub datetime: DateTime<Utc>, // date + start から生成（計算フィールド）

    // Event Info
    pub date: Option<String>,
    pub open: Option<String>,
    pub start: Option<String>,
    pub end: Option<String>,
    pub notes: Option<String>,
    pub category: Option<String>,
    pub area: String,
    pub venue: String,
    pub target: Option<String>,
    pub lineup: Option<String>,

    // Cost
    pub seller: Option<String>,
    pub ticket_fee: Option<i32>,  // チケット代
    pub drink_fee: Option<i32>,   // ドリンク代
    pub total_fare: Option<i32>,  // Traffic の合計
    pub stay_fee: Option<i32>,    // Stay の合計
    pub travel_cost: Option<i32>, // = Total fare + Stay fee
    pub total_cost: Option<i32>,  // = Ticket fee + Drink fee + Travel cost

    pub status: String, // "Canceled" / "Pending" / "Keep" / "Done"

    // Relation：他のライブ（自己リレーション）
    pub related_schedule_ids: Vec<i32>,

    // Traffic / Stay（複数）
    pub traffic_ids: Vec<String>,
    pub stay_ids: Vec<String>,

    // 認証・公開関連
    pub user_id: Option<i32>,
    pub is_public: bool,
}

// ====== Schedule 行定義（DB 用） ======

#[derive(FromRow)]
#[allow(dead_code)] // 一部のフィールドは将来使用する可能性があるため
pub struct ScheduleRow {
    pub id: i64,
    pub title: String,
    #[sqlx(rename = "group")]
    pub group_name: Option<String>, // NULL許可
    pub date: Option<String>,
    pub open: Option<String>,
    pub start: Option<String>,
    #[sqlx(rename = "end")]
    pub end_time: Option<String>,
    pub notes: Option<String>,
    pub category: Option<String>,
    pub area: String,
    pub venue: String,
    pub target: Option<String>,
    pub lineup: Option<String>,
    pub seller: Option<String>,
    pub ticket_fee: Option<i32>,
    pub drink_fee: Option<i32>,
    pub total_fare: Option<i32>,
    pub stay_fee: Option<i32>,
    pub travel_cost: Option<i32>,
    pub total_cost: Option<i32>,
    pub status: String,
    pub related_schedule_ids: Option<String>, // JSON形式で保存
    pub user_id: Option<i64>,
    pub is_public: i32, // INTEGER型として読み込む（0または1）
    pub created_at: Option<String>,
    pub updated_at: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct ScheduleQuery {
    pub year: Option<i32>,
}

// POST /schedules 用リクエストボディ
#[derive(Deserialize)]
pub struct NewSchedule {
    pub title: String,
    pub group: Option<String>, // NULL許可（空文字列もNULLに変換）
    pub date: Option<String>,
    pub open: Option<String>,
    pub start: Option<String>,
    pub end: Option<String>,
    pub notes: Option<String>,
    pub category: Option<String>,
    pub area: String,
    pub venue: String,
    pub target: Option<String>,
    pub lineup: Option<String>,
    pub seller: Option<String>,
    pub ticket_fee: Option<i32>,
    pub drink_fee: Option<i32>,
    pub status: Option<String>,
    pub related_schedule_ids: Option<Vec<i32>>, // 関連スケジュールIDの配列
    pub is_public: Option<bool>, // 公開フラグ
}

// Row → API 用への変換
pub fn row_to_schedule(row: ScheduleRow) -> Schedule {
    // date + start から datetime を生成
    let datetime = if let (Some(date), Some(start)) = (&row.date, &row.start) {
        // date: "YYYY-MM-DD", start: "HH:MM"
        let datetime_str = format!("{}T{}:00Z", date, start);
        datetime_str
            .parse::<DateTime<Utc>>()
            .unwrap_or_else(|_| Utc::now())
    } else if let Some(date) = &row.date {
        // date のみがある場合、00:00:00 として扱う
        let datetime_str = format!("{}T00:00:00Z", date);
        datetime_str
            .parse::<DateTime<Utc>>()
            .unwrap_or_else(|_| Utc::now())
    } else {
        // date も start もない場合、現在時刻を使用
        Utc::now()
    };

    // groupがNULLの場合はそのままNULLを返す（データとして保持）
    let group = row.group_name
        .filter(|g| !g.trim().is_empty())
        .map(|g| g.trim().to_string());

    Schedule {
        id: row.id as i32,
        title: row.title,
        group,
        datetime,
        date: row.date,
        open: row.open,
        start: row.start,
        end: row.end_time,
        notes: row.notes,
        category: row.category,
        area: row.area,
        venue: row.venue,
        target: row.target,
        lineup: row.lineup,
        seller: row.seller,
        ticket_fee: row.ticket_fee,
        drink_fee: row.drink_fee,
        total_fare: row.total_fare,
        stay_fee: row.stay_fee,
        travel_cost: row.travel_cost,
        total_cost: row.total_cost,
        status: row.status,
        // related_schedule_idsをJSONからパース
        related_schedule_ids: row.related_schedule_ids
            .as_ref()
            .and_then(|json| serde_json::from_str::<Vec<i32>>(json).ok())
            .unwrap_or_default(),
        traffic_ids: vec![],
        stay_ids: vec![],
        user_id: row.user_id.map(|id| id as i32),
        is_public: row.is_public != 0,
    }
}


