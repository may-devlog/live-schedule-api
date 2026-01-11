// 通知関連のハンドラ

use axum::{
    extract::{Extension, Path},
    http::StatusCode,
    response::Json,
};
use chrono::{DateTime, Utc};
use sqlx::{Pool, Sqlite};

use crate::auth::AuthenticatedUser;
use crate::notifications::types::*;
use crate::utils::email::send_deadline_notification_email;

// 通知一覧を取得
pub async fn list_notifications(
    user: AuthenticatedUser,
    Extension(pool): Extension<Pool<Sqlite>>,
) -> Result<Json<Vec<Notification>>, StatusCode> {
    let rows: Vec<NotificationRow> = sqlx::query_as(
        "SELECT id, user_id, stay_id, schedule_id, title, message, is_read, created_at FROM notifications WHERE user_id = ? ORDER BY created_at DESC"
    )
    .bind(user.user_id as i64)
    .fetch_all(&pool)
    .await
    .map_err(|e| {
        eprintln!("Error fetching notifications: {}", e);
        StatusCode::INTERNAL_SERVER_ERROR
    })?;

    Ok(Json(rows.into_iter().map(row_to_notification).collect()))
}

// 通知を既読にする
pub async fn mark_notification_read(
    Path(id): Path<i32>,
    user: AuthenticatedUser,
    Extension(pool): Extension<Pool<Sqlite>>,
) -> Result<Json<serde_json::Value>, StatusCode> {
    let result = sqlx::query(
        "UPDATE notifications SET is_read = 1 WHERE id = ? AND user_id = ?"
    )
    .bind(id as i64)
    .bind(user.user_id as i64)
    .execute(&pool)
    .await
    .map_err(|e| {
        eprintln!("Error marking notification as read: {}", e);
        StatusCode::INTERNAL_SERVER_ERROR
    })?;

    if result.rows_affected() == 0 {
        return Err(StatusCode::NOT_FOUND);
    }

    Ok(Json(serde_json::json!({ "success": true })))
}

// キャンセル期限が24時間以内の宿泊情報をチェックし、通知を作成・送信
pub async fn check_deadline_notifications(pool: &Pool<Sqlite>) -> Result<(), Box<dyn std::error::Error>> {
    let now = Utc::now();
    let one_day_later = now + chrono::Duration::hours(24);
    
    // 期限が24時間以内の宿泊情報を取得
    // deadlineは "YYYY-MM-DD HH:MM" 形式で保存されていると仮定
    let stays: Vec<(i64, i64, i64, String, String, String)> = sqlx::query_as(
        r#"
        SELECT 
            st.id,
            st.schedule_id,
            s.user_id,
            st.hotel_name,
            st.deadline,
            s.title
        FROM stays st
        INNER JOIN schedules s ON st.schedule_id = s.id
        WHERE st.deadline IS NOT NULL
          AND st.deadline != ''
          AND st.status != 'Canceled'
          AND s.user_id IS NOT NULL
        "#
    )
    .fetch_all(pool)
    .await?;
    
    for (stay_id, schedule_id, user_id, hotel_name, deadline_str, schedule_title) in stays {
        // deadlineをパース（複数の形式に対応）
        let deadline = match deadline_str.parse::<DateTime<Utc>>() {
            Ok(dt) => dt,
            Err(_) => {
                // RFC3339形式でパースできない場合は、"YYYY-MM-DD HH:MM" 形式を試す
                match chrono::NaiveDateTime::parse_from_str(&deadline_str, "%Y-%m-%d %H:%M") {
                    Ok(naive_dt) => {
                        // UTCとして扱う（実際のタイムゾーンに応じて調整が必要な場合あり）
                        DateTime::from_naive_utc_and_offset(naive_dt, Utc)
                    }
                    Err(_) => {
                        eprintln!("[DEADLINE_CHECK] Failed to parse deadline: {}", deadline_str);
                        continue;
                    }
                }
            }
        };
        
        // 期限が24時間以内かチェック
        if deadline > now && deadline <= one_day_later {
            // 既に通知が作成されているかチェック（重複防止）
            let existing_notification: Option<(i64,)> = sqlx::query_as(
                "SELECT id FROM notifications WHERE stay_id = ? AND user_id = ? AND created_at > datetime('now', '-1 day')"
            )
            .bind(stay_id)
            .bind(user_id)
            .fetch_optional(pool)
            .await?;
            
            if existing_notification.is_some() {
                // 既に通知が作成されている場合はスキップ
                continue;
            }
            
            // ユーザーのメールアドレスを取得
            let user_email: Option<(String,)> = sqlx::query_as(
                "SELECT email FROM users WHERE id = ?"
            )
            .bind(user_id)
            .fetch_optional(pool)
            .await?;
            
            if let Some((email,)) = user_email {
                // 通知を作成
                let notification_title = format!("キャンセル期限が近づいています: {}", hotel_name);
                let notification_message = format!("期限日時: {}\n関連イベント: {}", deadline_str, schedule_title);
                let created_at = Utc::now().to_rfc3339();
                
                sqlx::query(
                    r#"
                    INSERT INTO notifications (user_id, stay_id, schedule_id, title, message, is_read, created_at)
                    VALUES (?, ?, ?, ?, ?, 0, ?)
                    "#
                )
                .bind(user_id)
                .bind(stay_id)
                .bind(schedule_id)
                .bind(&notification_title)
                .bind(&notification_message)
                .bind(&created_at)
                .execute(pool)
                .await?;
                
                // メール送信（バックグラウンドで実行）
                let email_clone = email.clone();
                let hotel_name_clone = hotel_name.clone();
                let deadline_str_clone = deadline_str.clone();
                let schedule_title_clone = schedule_title.clone();
                tokio::spawn(async move {
                    if let Err(e) = send_deadline_notification_email(
                        &email_clone,
                        &hotel_name_clone,
                        &deadline_str_clone,
                        &schedule_title_clone,
                    ).await {
                        eprintln!("[DEADLINE_CHECK] Failed to send notification email: {:?}", e);
                    }
                });
            }
        }
    }
    
    Ok(())
}

