// スケジュール関連のハンドラ

use axum::{
    extract::{Extension, Path, Query},
    http::StatusCode,
    response::Json,
};
use chrono::{Datelike, Utc};
use sqlx::{Pool, Sqlite};

use crate::auth::AuthenticatedUser;
use crate::lib::ErrorResponse;
use crate::schedules::types::*;
use axum::extract::Json as AxumJson;

// ロールアップ計算関数
pub async fn calculate_rollup(
    pool: &Pool<Sqlite>,
    schedule_id: i64,
) -> Result<(), sqlx::Error> {
    // total_fare: 関連するtrafficsのfareの合計
    let total_fare: Option<i32> = sqlx::query_scalar(
        "SELECT COALESCE(SUM(fare), 0) FROM traffics WHERE schedule_id = ?"
    )
    .bind(schedule_id)
    .fetch_optional(pool)
    .await?
    .map(|sum: i64| sum as i32);
    
    // stay_fee: 関連するstaysのfeeの合計
    let stay_fee: Option<i32> = sqlx::query_scalar(
        "SELECT COALESCE(SUM(fee), 0) FROM stays WHERE schedule_id = ?"
    )
    .bind(schedule_id)
    .fetch_optional(pool)
    .await?
    .map(|sum: i64| sum as i32);
    
    // スケジュールのticket_feeとdrink_feeを取得
    let schedule_row: Option<(Option<i32>, Option<i32>)> = sqlx::query_as(
        "SELECT ticket_fee, drink_fee FROM schedules WHERE id = ?"
    )
    .bind(schedule_id)
    .fetch_optional(pool)
    .await?;
    
    let (ticket_fee, drink_fee) = schedule_row.unwrap_or((None, None));
    
    // travel_cost: total_fare + stay_fee
    let travel_cost = total_fare
        .unwrap_or(0)
        .saturating_add(stay_fee.unwrap_or(0));
    
    // total_cost: ticket_fee + drink_fee + travel_cost
    let total_cost = ticket_fee.unwrap_or(0)
        .saturating_add(drink_fee.unwrap_or(0))
        .saturating_add(travel_cost);
    
    // スケジュールを更新
    let now = Utc::now().to_rfc3339();
    sqlx::query(
        r#"
        UPDATE schedules SET
          total_fare = ?,
          stay_fee = ?,
          travel_cost = ?,
          total_cost = ?,
          updated_at = ?
        WHERE id = ?
        "#
    )
    .bind(total_fare)
    .bind(stay_fee)
    .bind(Some(travel_cost))
    .bind(Some(total_cost))
    .bind(&now)
    .bind(schedule_id)
    .execute(pool)
    .await?;
    
    Ok(())
}

// GET /share/:share_id - 共有ページ用のスケジュール一覧取得
pub async fn get_shared_schedules(
    Path(share_id): Path<String>,
    Extension(pool): Extension<Pool<Sqlite>>,
) -> Result<Json<Vec<Schedule>>, (StatusCode, Json<ErrorResponse>)> {
    // share_idからユーザーIDを取得
    let user_row: Option<(i64, i32)> = sqlx::query_as(
        "SELECT id, sharing_enabled FROM users WHERE share_id = ?"
    )
    .bind(&share_id)
    .fetch_optional(&pool)
    .await
    .map_err(|e| {
        eprintln!("[GetSharedSchedules] Database error: {}", e);
        (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(ErrorResponse {
                error: "Database error".to_string(),
            }),
        )
    })?;
    
    if let Some((user_id, sharing_enabled)) = user_row {
        if sharing_enabled == 0 {
            return Err((
                StatusCode::FORBIDDEN,
                Json(ErrorResponse {
                    error: "このユーザーのスケジュールは共有されていません".to_string(),
                }),
            ));
        }
        
        // 共有されているスケジュールを取得（is_public = 1 のみ）
        eprintln!("[GetSharedSchedules] Fetching schedules for user_id: {}, checking is_public = 1", user_id);
        let rows: Vec<ScheduleRow> = sqlx::query_as::<_, ScheduleRow>(
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
            WHERE user_id = ? AND CAST(is_public AS INTEGER) = 1
            ORDER BY date ASC, start ASC
            "#
        )
        .bind(user_id)
        .fetch_all(&pool)
        .await
        .map_err(|e| {
            eprintln!("[GetSharedSchedules] Failed to fetch schedules: {}", e);
            (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(ErrorResponse {
                    error: "Database error".to_string(),
                }),
            )
        })?;
        
        eprintln!("[GetSharedSchedules] Found {} schedules with is_public = 1", rows.len());
        let schedules: Vec<Schedule> = rows.into_iter().map(|row| row_to_schedule(row)).collect();
        Ok(Json(schedules))
    } else {
        Err((
            StatusCode::NOT_FOUND,
            Json(ErrorResponse {
                error: "ユーザーが見つかりません".to_string(),
            }),
        ))
    }
}

// GET /share/:share_id/schedules/:id - 共有ページ用のスケジュール詳細取得
pub async fn get_shared_schedule(
    Path((share_id, id)): Path<(String, i32)>,
    Extension(pool): Extension<Pool<Sqlite>>,
) -> Result<Json<Schedule>, (StatusCode, Json<ErrorResponse>)> {
    // share_idからユーザーIDを取得
    let user_row: Option<(i64, i32)> = sqlx::query_as(
        "SELECT id, sharing_enabled FROM users WHERE share_id = ?"
    )
    .bind(&share_id)
    .fetch_optional(&pool)
    .await
    .map_err(|e| {
        eprintln!("[GetSharedSchedule] Database error: {}", e);
        (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(ErrorResponse {
                error: "Database error".to_string(),
            }),
        )
    })?;
    
    if let Some((user_id, sharing_enabled)) = user_row {
        if sharing_enabled == 0 {
            return Err((
                StatusCode::FORBIDDEN,
                Json(ErrorResponse {
                    error: "このユーザーのスケジュールは共有されていません".to_string(),
                }),
            ));
        }
        
        // 共有されているスケジュールを取得（is_public = 1 のみ）
        let row: Option<ScheduleRow> = sqlx::query_as::<_, ScheduleRow>(
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
            WHERE id = ? AND user_id = ? AND CAST(is_public AS INTEGER) = 1
            "#
        )
        .bind(id)
        .bind(user_id)
        .fetch_optional(&pool)
        .await
        .map_err(|e| {
            eprintln!("[GetSharedSchedule] Failed to fetch schedule: {}", e);
            (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(ErrorResponse {
                    error: "Database error".to_string(),
                }),
            )
        })?;
        
        if let Some(schedule_row) = row {
            Ok(Json(row_to_schedule(schedule_row)))
        } else {
            Err((
                StatusCode::NOT_FOUND,
                Json(ErrorResponse {
                    error: "スケジュールが見つかりません".to_string(),
                }),
            ))
        }
    } else {
        Err((
            StatusCode::NOT_FOUND,
            Json(ErrorResponse {
                error: "ユーザーが見つかりません".to_string(),
            }),
        ))
    }
}


// GET /schedules
pub async fn list_schedules(
    Query(params): Query<ScheduleQuery>,
    Extension(pool): Extension<Pool<Sqlite>>,
    user: AuthenticatedUser,
) -> Result<Json<Vec<Schedule>>, (StatusCode, Json<ErrorResponse>)> {
    eprintln!("[ListSchedules] User ID: {}", user.user_id);
    let rows: Vec<ScheduleRow> = sqlx::query_as::<_, ScheduleRow>(
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
        WHERE user_id = ?
        "#,
    )
    .bind(user.user_id)
    .fetch_all(&pool)
    .await
    .map_err(|e| {
        eprintln!("[ListSchedules] Database error: {}", e);
        (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(ErrorResponse {
                error: format!("データベースエラーが発生しました: {}", e),
            }),
        )
    })?;

    // 各スケジュールに対してロールアップ計算を実行
    for row in &rows {
        calculate_rollup(&pool, row.id).await.ok();
    }
    
    // 計算後のスケジュールを再取得
    let rows: Vec<ScheduleRow> = sqlx::query_as::<_, ScheduleRow>(
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
        WHERE user_id = ?
        "#,
    )
    .bind(user.user_id)
    .fetch_all(&pool)
    .await
    .map_err(|e| {
        eprintln!("[ListSchedules] Database error on second fetch: {}", e);
        (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(ErrorResponse {
                error: format!("データベースエラーが発生しました: {}", e),
            }),
        )
    })?;

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

    eprintln!("[ListSchedules] Returning {} schedules for user_id: {}", schedules.len(), user.user_id);
    Ok(Json(schedules))
}

// GET /schedules/upcoming
pub async fn list_upcoming(
    Extension(pool): Extension<Pool<Sqlite>>,
    user: AuthenticatedUser,
) -> Json<Vec<Schedule>> {
    let rows: Vec<ScheduleRow> = sqlx::query_as::<_, ScheduleRow>(
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
        WHERE status != 'Canceled' AND user_id = ?
        "#,
    )
    .bind(user.user_id)
    .fetch_all(&pool)
    .await
    .expect("failed to fetch schedules");

    // 各スケジュールに対してロールアップ計算を実行
    for row in &rows {
        calculate_rollup(&pool, row.id).await.ok();
    }
    
    // 計算後のスケジュールを再取得
    let rows: Vec<ScheduleRow> = sqlx::query_as::<_, ScheduleRow>(
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
        WHERE status != 'Canceled' AND user_id = ?
        "#,
    )
    .bind(user.user_id)
    .fetch_all(&pool)
    .await
    .expect("failed to fetch schedules");

    let mut schedules: Vec<Schedule> = rows.into_iter().map(row_to_schedule).collect();

    let now = Utc::now();
    schedules = schedules
        .into_iter()
        .filter(|s| s.datetime > now)
        .collect();

    // 日付順にソートして直近3件に制限
    schedules.sort_by(|a, b| a.datetime.cmp(&b.datetime));
    schedules.truncate(3);

    Json(schedules)
}

// POST /schedules
pub async fn create_schedule(
    user: AuthenticatedUser,
    Extension(pool): Extension<Pool<Sqlite>>,
    AxumJson(payload): AxumJson<NewSchedule>,
) -> Result<(StatusCode, Json<Schedule>), (StatusCode, Json<ErrorResponse>)> {
    // 必須項目のバリデーション（targetはNULL許可）
    let now = Utc::now().to_rfc3339();
    let is_public = payload.is_public.unwrap_or(true) as i32;
    eprintln!("[CreateSchedule] is_public value: {} (from payload: {:?})", is_public, payload.is_public);
    let result = sqlx::query(
        r#"
        INSERT INTO schedules (
          user_id,
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
          is_public,
          created_at,
          updated_at
        ) VALUES (
          ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, NULL, NULL, NULL, ?, ?, ?, ?, ?
        )
        "#,
    )
    .bind(user.user_id)
    .bind(&payload.title)
    .bind(&payload.group.as_ref().and_then(|g| {
        let trimmed = g.trim();
        if trimmed.is_empty() { None } else { Some(trimmed.to_string()) }
    }))
    .bind(&payload.date)
    .bind(&payload.open)
    .bind(&payload.start)
    .bind(&payload.end)
    .bind(&payload.notes)
    .bind(&payload.category)
    .bind(&payload.area)
    .bind(&payload.venue)
    .bind(&payload.target)
    .bind(&payload.lineup)
    .bind(&payload.seller)
    .bind(payload.ticket_fee)
    .bind(payload.drink_fee)
    .bind(payload.status.as_deref().unwrap_or("Pending"))
    .bind(&payload.related_schedule_ids.as_ref().and_then(|ids| {
        if ids.is_empty() {
            None
        } else {
            serde_json::to_string(ids).ok()
        }
    }))
    .bind(is_public)
    .bind(&now)
    .bind(&now)
    .execute(&pool)
    .await
    .map_err(|_| {
        (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(ErrorResponse {
                error: "データベースエラーが発生しました".to_string(),
            }),
        )
    })?;

    let last_id = result.last_insert_rowid();

    // ロールアップ計算を実行
    calculate_rollup(&pool, last_id).await.ok();
    
    // 計算後のスケジュールを再取得
    let row: ScheduleRow = sqlx::query_as::<_, ScheduleRow>(
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
        WHERE id = ?
        "#,
    )
    .bind(last_id)
    .fetch_one(&pool)
    .await
    .map_err(|_| {
        (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(ErrorResponse {
                error: "データベースエラーが発生しました".to_string(),
            }),
        )
    })?;

    let schedule = row_to_schedule(row);
    
    // 双方向リレーションを更新
    // 新規作成時は、related_schedule_idsに含まれるスケジュールに対して、このスケジュールを追加
    if let Some(related_ids) = &payload.related_schedule_ids {
        for related_id in related_ids {
            // 関連スケジュールを取得
            let related_row: Option<ScheduleRow> = sqlx::query_as::<_, ScheduleRow>(
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
                WHERE id = ?
                "#,
            )
            .bind(related_id)
            .fetch_optional(&pool)
            .await
            .ok()
            .flatten();
            
            if let Some(related) = related_row {
                // 既存のrelated_schedule_idsを取得
                let mut related_ids_vec: Vec<i32> = related.related_schedule_ids
                    .as_ref()
                    .and_then(|json| serde_json::from_str::<Vec<i32>>(json).ok())
                    .unwrap_or_default();
                
                // このスケジュールIDが含まれていない場合のみ追加
                if !related_ids_vec.contains(&(last_id as i32)) {
                    related_ids_vec.push(last_id as i32);
                    let updated_json = serde_json::to_string(&related_ids_vec).ok();
                    
                    // 関連スケジュールを更新
                    let _ = sqlx::query(
                        r#"
                        UPDATE schedules SET
                          related_schedule_ids = ?,
                          updated_at = ?
                        WHERE id = ?
                        "#,
                    )
                    .bind(&updated_json)
                    .bind(&now)
                    .bind(related_id)
                    .execute(&pool)
                    .await;
                }
            }
        }
    }
    
    Ok((StatusCode::CREATED, Json(schedule)))
}

// PUT /schedules/:id
pub async fn update_schedule(
    Path(id): Path<i32>,
    user: AuthenticatedUser,
    Extension(pool): Extension<Pool<Sqlite>>,
    AxumJson(payload): AxumJson<NewSchedule>,
) -> Result<Json<Schedule>, (StatusCode, Json<ErrorResponse>)> {
    // 必須項目のバリデーション（targetはNULL許可）
    
    // スケジュールが存在し、ユーザーが所有しているかチェック
    let existing: Option<ScheduleRow> = sqlx::query_as::<_, ScheduleRow>(
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
        WHERE id = ?
        "#,
    )
    .bind(id)
    .fetch_optional(&pool)
    .await
    .map_err(|e| {
        eprintln!("[UpdateSchedule] Database error when fetching existing schedule: {}", e);
        (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(ErrorResponse {
                error: format!("データベースエラーが発生しました: {}", e),
            }),
        )
    })?;

    let existing = existing.ok_or((
        StatusCode::NOT_FOUND,
        Json(ErrorResponse {
            error: "スケジュールが見つかりませんでした".to_string(),
        }),
    ))?;
    if existing.user_id.map(|uid| uid as i32) != Some(user.user_id) {
        return Err((
            StatusCode::FORBIDDEN,
            Json(ErrorResponse {
                error: "このスケジュールを編集する権限がありません".to_string(),
            }),
        ));
    }

    let now = Utc::now().to_rfc3339();
    let existing_is_public = existing.is_public != 0;
    let is_public = payload.is_public.unwrap_or(existing_is_public) as i32;
    
    // 既存のrelated_schedule_idsを取得
    let existing_related_ids: Vec<i32> = existing.related_schedule_ids
        .as_ref()
        .and_then(|json| serde_json::from_str::<Vec<i32>>(json).ok())
        .unwrap_or_default();
    
    // 新しいrelated_schedule_ids
    let new_related_ids = payload.related_schedule_ids.as_ref()
        .map(|ids| ids.clone())
        .unwrap_or_default();
    
    // 追加されたIDと削除されたIDを特定
    let added_ids: Vec<i32> = new_related_ids.iter()
        .filter(|id| !existing_related_ids.contains(id))
        .cloned()
        .collect();
    let removed_ids: Vec<i32> = existing_related_ids.iter()
        .filter(|id| !new_related_ids.contains(id))
        .cloned()
        .collect();
    
    let result = sqlx::query(
        r#"
        UPDATE schedules SET
          title = ?,
          "group" = ?,
          date = ?,
          open = ?,
          start = ?,
          "end" = ?,
          notes = ?,
          category = ?,
          area = ?,
          venue = ?,
          target = ?,
          lineup = ?,
          seller = ?,
          ticket_fee = ?,
          drink_fee = ?,
          status = ?,
          related_schedule_ids = ?,
          is_public = ?,
          updated_at = ?
        WHERE id = ? AND user_id = ?
        "#,
    )
    .bind(&payload.title)
    .bind(&payload.group.as_ref().and_then(|g| {
        let trimmed = g.trim();
        if trimmed.is_empty() { None } else { Some(trimmed.to_string()) }
    }))
    .bind(&payload.date)
    .bind(&payload.open)
    .bind(&payload.start)
    .bind(&payload.end)
    .bind(&payload.notes)
    .bind(&payload.category)
    .bind(&payload.area)
    .bind(&payload.venue)
    .bind(&payload.target)
    .bind(&payload.lineup)
    .bind(&payload.seller)
    .bind(payload.ticket_fee)
    .bind(payload.drink_fee)
    .bind(payload.status.as_deref().unwrap_or("Pending"))
    .bind(&payload.related_schedule_ids.as_ref().and_then(|ids| {
        if ids.is_empty() {
            None
        } else {
            serde_json::to_string(ids).ok()
        }
    }))
    .bind(is_public)
    .bind(&now)
    .bind(id)
    .bind(user.user_id)
    .execute(&pool)
    .await
    .map_err(|e| {
        eprintln!("[UpdateSchedule] Database error when updating schedule: {}", e);
        (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(ErrorResponse {
                error: format!("データベースエラーが発生しました: {}", e),
            }),
        )
    })?;

    if result.rows_affected() == 0 {
        return Err((
            StatusCode::NOT_FOUND,
            Json(ErrorResponse {
                error: "スケジュールが見つかりませんでした".to_string(),
            }),
        ));
    }

    // ロールアップ計算を実行
    calculate_rollup(&pool, id as i64).await.ok();
    
    // 計算後のスケジュールを再取得
    let row: ScheduleRow = sqlx::query_as::<_, ScheduleRow>(
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
        WHERE id = ?
        "#,
    )
    .bind(id)
    .fetch_one(&pool)
    .await
    .map_err(|_| {
        (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(ErrorResponse {
                error: "データベースエラーが発生しました".to_string(),
            }),
        )
    })?;

    let schedule = row_to_schedule(row);
    
    // 双方向リレーションを更新
    // 追加されたIDに対して、このスケジュールを追加
    for related_id in &added_ids {
        let related_row: Option<ScheduleRow> = sqlx::query_as::<_, ScheduleRow>(
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
            WHERE id = ?
            "#,
        )
        .bind(related_id)
        .fetch_optional(&pool)
        .await
        .ok()
        .flatten();
        
        if let Some(related) = related_row {
            let mut related_ids_vec: Vec<i32> = related.related_schedule_ids
                .as_ref()
                .and_then(|json| serde_json::from_str::<Vec<i32>>(json).ok())
                .unwrap_or_default();
            
            if !related_ids_vec.contains(&id) {
                related_ids_vec.push(id);
                let updated_json = serde_json::to_string(&related_ids_vec).ok();
                
                let _ = sqlx::query(
                    r#"
                    UPDATE schedules SET
                      related_schedule_ids = ?,
                      updated_at = ?
                    WHERE id = ?
                    "#,
                )
                .bind(&updated_json)
                .bind(&now)
                .bind(related_id)
                .execute(&pool)
                .await;
            }
        }
    }
    
    // 削除されたIDに対して、このスケジュールを削除
    for related_id in &removed_ids {
        let related_row: Option<ScheduleRow> = sqlx::query_as::<_, ScheduleRow>(
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
            WHERE id = ?
            "#,
        )
        .bind(related_id)
        .fetch_optional(&pool)
        .await
        .ok()
        .flatten();
        
        if let Some(related) = related_row {
            let mut related_ids_vec: Vec<i32> = related.related_schedule_ids
                .as_ref()
                .and_then(|json| serde_json::from_str::<Vec<i32>>(json).ok())
                .unwrap_or_default();
            
            related_ids_vec.retain(|&x| x != id);
            let updated_json = if related_ids_vec.is_empty() {
                None
            } else {
                serde_json::to_string(&related_ids_vec).ok()
            };
            
            let _ = sqlx::query(
                r#"
                UPDATE schedules SET
                  related_schedule_ids = ?,
                  updated_at = ?
                WHERE id = ?
                "#,
            )
            .bind(&updated_json)
            .bind(&now)
            .bind(related_id)
            .execute(&pool)
            .await;
        }
    }
    
    Ok(Json(schedule))
}

// DELETE /schedules/:id
pub async fn delete_schedule(
    Path(id): Path<i32>,
    user: AuthenticatedUser,
    Extension(pool): Extension<Pool<Sqlite>>,
) -> Result<Json<serde_json::Value>, (StatusCode, Json<ErrorResponse>)> {
    // スケジュールが存在し、ユーザーが所有しているかチェック
    let existing: Option<ScheduleRow> = sqlx::query_as::<_, ScheduleRow>(
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
        WHERE id = ?
        "#,
    )
    .bind(id)
    .fetch_optional(&pool)
    .await
    .map_err(|_| {
        (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(ErrorResponse {
                error: "データベースエラーが発生しました".to_string(),
            }),
        )
    })?;

    let existing = existing.ok_or((
        StatusCode::NOT_FOUND,
        Json(ErrorResponse {
            error: "スケジュールが見つかりませんでした".to_string(),
        }),
    ))?;
    
    if existing.user_id.map(|uid| uid as i32) != Some(user.user_id) {
        return Err((
            StatusCode::FORBIDDEN,
            Json(ErrorResponse {
                error: "このスケジュールを削除する権限がありません".to_string(),
            }),
        ));
    }

    // 関連スケジュールからこのスケジュールへの参照を削除
    let related_ids: Vec<i32> = existing.related_schedule_ids
        .as_ref()
        .and_then(|json| serde_json::from_str::<Vec<i32>>(json).ok())
        .unwrap_or_default();
    
    let now = Utc::now().to_rfc3339();
    for related_id in related_ids {
        let related_row: Option<ScheduleRow> = sqlx::query_as::<_, ScheduleRow>(
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
            WHERE id = ?
            "#,
        )
        .bind(related_id)
        .fetch_optional(&pool)
        .await
        .ok()
        .flatten();
        
        if let Some(related) = related_row {
            let mut related_ids_vec: Vec<i32> = related.related_schedule_ids
                .as_ref()
                .and_then(|json| serde_json::from_str::<Vec<i32>>(json).ok())
                .unwrap_or_default();
            
            related_ids_vec.retain(|&x| x != id);
            let updated_json = if related_ids_vec.is_empty() {
                None
            } else {
                serde_json::to_string(&related_ids_vec).ok()
            };
            
            let _ = sqlx::query(
                r#"
                UPDATE schedules SET
                  related_schedule_ids = ?,
                  updated_at = ?
                WHERE id = ?
                "#,
            )
            .bind(&updated_json)
            .bind(&now)
            .bind(related_id)
            .execute(&pool)
            .await;
        }
    }

    // 関連するtrafficsを削除
    let _ = sqlx::query("DELETE FROM traffics WHERE schedule_id = ?")
        .bind(id)
        .execute(&pool)
        .await;

    // 関連するstaysを削除
    let _ = sqlx::query("DELETE FROM stays WHERE schedule_id = ?")
        .bind(id)
        .execute(&pool)
        .await;

    // スケジュールを削除
    let result = sqlx::query("DELETE FROM schedules WHERE id = ? AND user_id = ?")
        .bind(id)
        .bind(user.user_id)
        .execute(&pool)
        .await
        .map_err(|_| {
            (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(ErrorResponse {
                    error: "データベースエラーが発生しました".to_string(),
                }),
            )
        })?;

    if result.rows_affected() == 0 {
        return Err((
            StatusCode::NOT_FOUND,
            Json(ErrorResponse {
                error: "スケジュールが見つかりませんでした".to_string(),
            }),
        ));
    }

    Ok(Json(serde_json::json!({
        "success": true,
        "message": "スケジュールを削除しました"
    })))
}
