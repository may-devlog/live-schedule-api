// 交通情報関連の型定義

use serde::{Deserialize, Serialize};

#[derive(Serialize)]
pub struct Traffic {
    pub id: i32,
    pub schedule_id: i32,
    pub date: String,
    pub order: i32,
    pub transportation: Option<String>,
    #[serde(rename = "from")]
    pub from: String,
    pub to: String,
    pub notes: Option<String>,
    pub fare: i32,
    pub miles: Option<i32>,
    pub return_flag: bool,
    pub total_fare: Option<i32>,
    pub total_miles: Option<i32>,
}

#[derive(sqlx::FromRow)]
pub struct TrafficRow {
    pub id: i64,
    pub schedule_id: i64,
    pub date: String,
    #[sqlx(rename = "order")]
    pub order_value: i64,
    pub transportation: Option<String>,
    pub from_place: String,
    pub to_place: String,
    pub notes: Option<String>,
    pub fare: i32,
    pub miles: Option<i32>,
    pub return_flag: i32, // 0/1
    pub total_fare: Option<i32>,
    pub total_miles: Option<i32>,
}

#[derive(Debug, Deserialize)]
pub struct TrafficQuery {
    pub schedule_id: i32,
}

// POST /traffic 用
#[derive(Deserialize)]
pub struct NewTraffic {
    pub schedule_id: i32,
    pub date: String,
    pub order: i32,
    pub transportation: Option<String>,
    #[serde(rename = "from")]
    pub from: String,
    pub to: String,
    pub notes: Option<String>,
    pub fare: i32,
    pub miles: Option<i32>,
    pub return_flag: bool,
}

pub fn row_to_traffic(row: TrafficRow) -> Traffic {
    Traffic {
        id: row.id as i32,
        schedule_id: row.schedule_id as i32,
        date: row.date,
        order: row.order_value as i32,
        transportation: row.transportation,
        from: row.from_place,
        to: row.to_place,
        notes: row.notes,
        fare: row.fare,
        miles: row.miles,
        return_flag: row.return_flag != 0,
        total_fare: row.total_fare,
        total_miles: row.total_miles,
    }
}

