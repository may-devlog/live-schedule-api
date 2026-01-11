// 共有関連のハンドラ（公開API用）

use axum::{
    extract::{Extension, Path, Query},
    http::StatusCode,
    response::Json,
};
use chrono::Datelike;
use sqlx::{Pool, Sqlite};

use crate::schedules::types::{Schedule, ScheduleRow, ScheduleQuery, row_to_schedule};

// GET /public/schedules?year=2025 など - 公開されているスケジュール一覧
pub async fn list_public_schedules(
    Query(params): Query<ScheduleQuery>,
    Extension(pool): Extension<Pool<Sqlite>>,
) -> Json<Vec<Schedule>> {
    // DISABLE_AUTHが設定されている場合、全てのスケジュールを取得（ユーザーIDによるフィルタリングなし）
    let rows: Vec<ScheduleRow> = if std::env::var("DISABLE_AUTH").is_ok() {
        // 認証が無効化されている場合、全てのスケジュールを返す
        println!("[PUBLIC SCHEDULES] DISABLE_AUTH is set, returning ALL schedules (ignoring user_id and is_public)");
        let rows = sqlx::query_as::<_, ScheduleRow>(
            r#"
            SELECT
              id,
              title,
              "group",
              date,
              open,
              start,
              "end",
              notes,
              category,
              area,
              venue,
              target,
              lineup,
              seller,
              ticket_fee,
              drink_fee,
              total_fare,
              stay_fee,
              travel_cost,
              total_cost,
              status,
              related_schedule_ids,
              user_id,
              CAST(is_public AS INTEGER) as is_public,
              created_at,
              updated_at
            FROM schedules
            "#,
        )
        .fetch_all(&pool)
        .await
        .expect("failed to fetch all schedules");
        
        println!("[PUBLIC SCHEDULES] Found {} schedules in database", rows.len());
        if rows.is_empty() {
            println!("[PUBLIC SCHEDULES] WARNING: No schedules found in database. The database might be empty.");
        } else {
            println!("[PUBLIC SCHEDULES] First schedule: id={}, title={}", 
                rows[0].id, 
                rows[0].title
            );
        }
        
        rows
    } else {
        // 通常の動作：公開スケジュールのみ
        sqlx::query_as::<_, ScheduleRow>(
            r#"
            SELECT
              id,
              title,
              "group",
              date,
              open,
              start,
              "end",
              notes,
              category,
              area,
              venue,
              target,
              lineup,
              seller,
              ticket_fee,
              drink_fee,
              total_fare,
              stay_fee,
              travel_cost,
              total_cost,
              status,
              related_schedule_ids,
              user_id,
              CAST(is_public AS INTEGER) as is_public,
              created_at,
              updated_at
            FROM schedules
            WHERE CAST(is_public AS INTEGER) = 1
            "#,
        )
        .fetch_all(&pool)
        .await
        .expect("failed to fetch public schedules")
    };

    let mut schedules: Vec<Schedule> = rows.into_iter().map(row_to_schedule).collect();

    if let Some(year) = params.year {
        schedules = schedules
            .into_iter()
            .filter(|s| s.datetime.year() == year)
            .collect();
    }

    schedules = schedules
        .into_iter()
        .filter(|s| s.status != "Canceled")
        .collect();

    Json(schedules)
}

// GET /public/schedules/:id - 公開されているスケジュール詳細
// DISABLE_AUTHが設定されている場合、全てのスケジュールを返す
pub async fn get_public_schedule(
    Path(id): Path<i32>,
    Extension(pool): Extension<Pool<Sqlite>>,
) -> Result<Json<Schedule>, StatusCode> {
    // DISABLE_AUTHが設定されている場合、is_publicの条件を無視
    let row: ScheduleRow = if std::env::var("DISABLE_AUTH").is_ok() {
        sqlx::query_as::<_, ScheduleRow>(
            r#"
            SELECT
              id,
              title,
              "group",
              date,
              open,
              start,
              "end",
              notes,
              category,
              area,
              venue,
              target,
              lineup,
              seller,
              ticket_fee,
              drink_fee,
              total_fare,
              stay_fee,
              travel_cost,
              total_cost,
              status,
              related_schedule_ids,
              user_id,
              is_public,
              created_at,
              updated_at
            FROM schedules
            WHERE id = ?
            "#,
        )
        .bind(id)
        .fetch_one(&pool)
        .await
        .map_err(|_| StatusCode::NOT_FOUND)?
    } else {
        sqlx::query_as::<_, ScheduleRow>(
            r#"
            SELECT
              id,
              title,
              "group",
              date,
              open,
              start,
              "end",
              notes,
              category,
              area,
              venue,
              target,
              lineup,
              seller,
              ticket_fee,
              drink_fee,
              total_fare,
              stay_fee,
              travel_cost,
              total_cost,
              status,
              related_schedule_ids,
              user_id,
              CAST(is_public AS INTEGER) as is_public,
              created_at,
              updated_at
            FROM schedules
            WHERE id = ? AND CAST(is_public AS INTEGER) = 1
            "#,
        )
        .bind(id)
        .fetch_one(&pool)
        .await
        .map_err(|_| StatusCode::NOT_FOUND)?
    };

    let schedule = row_to_schedule(row);
    Ok(Json(schedule))
}

