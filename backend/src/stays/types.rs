// 宿泊情報関連の型定義

use serde::{Deserialize, Serialize};

#[derive(Serialize)]
pub struct Stay {
    pub id: i32,
    pub schedule_id: i32,
    pub check_in: String,
    pub check_out: String,
    pub hotel_name: String,
    pub website: Option<String>,
    pub fee: i32,
    pub breakfast_flag: bool,
    pub deadline: Option<String>,
    pub penalty: Option<i32>,
    pub status: String,
}

#[derive(sqlx::FromRow)]
pub struct StayRow {
    pub id: i64,
    pub schedule_id: i64,
    pub check_in: String,
    pub check_out: String,
    pub hotel_name: String,
    pub website: Option<String>,
    pub fee: i32,
    pub breakfast_flag: i32, // 0/1
    pub deadline: Option<String>,
    pub penalty: Option<i32>,
    pub status: String,
}

#[derive(Debug, Deserialize)]
pub struct StayQuery {
    pub schedule_id: i32,
}

// POST /stay 用
#[derive(Deserialize)]
pub struct NewStay {
    pub schedule_id: i32,
    pub check_in: String,
    pub check_out: String,
    pub hotel_name: String,
    pub website: Option<String>,
    pub fee: i32,
    pub breakfast_flag: bool,
    pub deadline: Option<String>,
    pub penalty: Option<i32>,
    pub status: Option<String>,
}

pub fn row_to_stay(row: StayRow) -> Stay {
    Stay {
        id: row.id as i32,
        schedule_id: row.schedule_id as i32,
        check_in: row.check_in,
        check_out: row.check_out,
        hotel_name: row.hotel_name,
        website: row.website,
        fee: row.fee,
        breakfast_flag: row.breakfast_flag != 0,
        deadline: row.deadline,
        penalty: row.penalty,
        status: row.status,
    }
}

