// 通知関連の型定義

use serde::Serialize;

#[derive(Serialize, Clone)]
pub struct Notification {
    pub id: i32,
    pub user_id: i32,
    pub stay_id: i32,
    pub schedule_id: i32,
    pub title: String,
    pub message: String,
    pub is_read: bool,
    pub created_at: String,
}

#[derive(sqlx::FromRow)]
pub struct NotificationRow {
    pub id: i64,
    pub user_id: i64,
    pub stay_id: i64,
    pub schedule_id: i64,
    pub title: String,
    pub message: String,
    pub is_read: i32,
    pub created_at: String,
}

pub fn row_to_notification(row: NotificationRow) -> Notification {
    Notification {
        id: row.id as i32,
        user_id: row.user_id as i32,
        stay_id: row.stay_id as i32,
        schedule_id: row.schedule_id as i32,
        title: row.title,
        message: row.message,
        is_read: row.is_read != 0,
        created_at: row.created_at,
    }
}


