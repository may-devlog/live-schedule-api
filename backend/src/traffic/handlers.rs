// 交通情報関連のハンドラ

use axum::{
    extract::{Extension, Path, Query},
    http::StatusCode,
    response::Json,
};
use chrono::Utc;
use sqlx::{Pool, Sqlite};

use crate::auth::AuthenticatedUser;
use crate::lib::ErrorResponse;
use crate::schedules::handlers::calculate_rollup;
use crate::traffic::types::*;
use crate::masked_locations::handlers::get_masked_locations_for_user;
use axum::extract::Json as AxumJson;

fn apply_mask_to_traffic(mut traffic: Traffic, masked_locations: &[String]) -> Traffic {
    let mask_text = "***";
    
    if masked_locations.contains(&traffic.from) {
        traffic.from = mask_text.to_string();
    }
    if masked_locations.contains(&traffic.to) {
        traffic.to = mask_text.to_string();
    }
    
    traffic
}

// GET /traffic?schedule_id=...
pub async fn list_traffics(
    Query(params): Query<TrafficQuery>,
    Extension(pool): Extension<Pool<Sqlite>>,
) -> Json<Vec<Traffic>> {
    let rows: Vec<TrafficRow> = sqlx::query_as::<_, TrafficRow>(
        r#"
        SELECT
          id,
          schedule_id,
          date,
          "order",
          transportation,
          from_place,
          to_place,
          notes,
          fare,
          miles,
          return_flag,
          total_fare,
          total_miles
        FROM traffics
        WHERE schedule_id = ?
        ORDER BY "order" ASC
        "#,
    )
    .bind(params.schedule_id)
    .fetch_all(&pool)
    .await
    .expect("failed to fetch traffics");

    let traffics = rows.into_iter().map(row_to_traffic).collect();
    Json(traffics)
}

// GET /traffic/:id
pub async fn get_traffic(
    Path(id): Path<i32>,
    user: AuthenticatedUser,
    Extension(pool): Extension<Pool<Sqlite>>,
) -> Result<Json<Traffic>, StatusCode> {
    let row: Option<TrafficRow> = sqlx::query_as::<_, TrafficRow>(
        r#"
        SELECT
          id,
          schedule_id,
          date,
          "order",
          transportation,
          from_place,
          to_place,
          notes,
          fare,
          miles,
          return_flag,
          total_fare,
          total_miles
        FROM traffics
        WHERE id = ?
        "#,
    )
    .bind(id)
    .fetch_optional(&pool)
    .await
    .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    let row = row.ok_or(StatusCode::NOT_FOUND)?;

    // スケジュールの所有者を確認
    let schedule_user_id: Option<i64> = sqlx::query_scalar(
        "SELECT user_id FROM schedules WHERE id = ?",
    )
    .bind(row.schedule_id)
    .fetch_optional(&pool)
    .await
    .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    if let Some(schedule_user_id) = schedule_user_id {
        if schedule_user_id != user.user_id as i64 {
            return Err(StatusCode::FORBIDDEN);
        }
    }

    Ok(Json(row_to_traffic(row)))
}

// POST /traffic
pub async fn create_traffic(
    Extension(pool): Extension<Pool<Sqlite>>,
    AxumJson(payload): AxumJson<NewTraffic>,
) -> Result<(StatusCode, Json<Traffic>), StatusCode> {
    let now = Utc::now().to_rfc3339();
    let result = sqlx::query(
        r#"
        INSERT INTO traffics (
          schedule_id,
          date,
          "order",
          transportation,
          from_place,
          to_place,
          notes,
          fare,
          miles,
          return_flag,
          total_fare,
          total_miles,
          created_at,
          updated_at
        ) VALUES (
          ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, NULL, ?, ?
        )
        "#,
    )
    .bind(payload.schedule_id)
    .bind(&payload.date)
    .bind(payload.order)
    .bind(&payload.transportation)
    .bind(&payload.from)
    .bind(&payload.to)
    .bind(&payload.notes)
    .bind(payload.fare)
    .bind(payload.miles)
    .bind(if payload.return_flag { 1 } else { 0 })
    .bind(&now)
    .bind(&now)
    .execute(&pool)
    .await
    .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    let last_id = result.last_insert_rowid();

    // 関連するスケジュールのロールアップ計算を実行
    calculate_rollup(&pool, payload.schedule_id as i64).await.ok();

    let row: TrafficRow = sqlx::query_as::<_, TrafficRow>(
        r#"
        SELECT
          id,
          schedule_id,
          date,
          "order",
          transportation,
          from_place,
          to_place,
          notes,
          fare,
          miles,
          return_flag,
          total_fare,
          total_miles
        FROM traffics
        WHERE id = ?
        "#,
    )
    .bind(last_id)
    .fetch_one(&pool)
    .await
    .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    Ok((StatusCode::CREATED, Json(row_to_traffic(row))))
}

// PUT /traffic/:id
pub async fn update_traffic(
    Path(id): Path<i32>,
    Extension(pool): Extension<Pool<Sqlite>>,
    AxumJson(payload): AxumJson<NewTraffic>,
) -> Result<Json<Traffic>, StatusCode> {
    let now = Utc::now().to_rfc3339();
    let result = sqlx::query(
        r#"
        UPDATE traffics SET
          schedule_id = ?,
          date = ?,
          "order" = ?,
          transportation = ?,
          from_place = ?,
          to_place = ?,
          notes = ?,
          fare = ?,
          miles = ?,
          return_flag = ?,
          updated_at = ?
        WHERE id = ?
        "#,
    )
    .bind(payload.schedule_id)
    .bind(&payload.date)
    .bind(payload.order)
    .bind(&payload.transportation)
    .bind(&payload.from)
    .bind(&payload.to)
    .bind(&payload.notes)
    .bind(payload.fare)
    .bind(payload.miles)
    .bind(if payload.return_flag { 1 } else { 0 })
    .bind(&now)
    .bind(id)
    .execute(&pool)
    .await
    .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    if result.rows_affected() == 0 {
        return Err(StatusCode::NOT_FOUND);
    }

    // 関連するスケジュールのロールアップ計算を実行
    calculate_rollup(&pool, payload.schedule_id as i64).await.ok();

    let row: TrafficRow = sqlx::query_as::<_, TrafficRow>(
        r#"
        SELECT
          id,
          schedule_id,
          date,
          "order",
          transportation,
          from_place,
          to_place,
          notes,
          fare,
          miles,
          return_flag,
          total_fare,
          total_miles
        FROM traffics
        WHERE id = ?
        "#,
    )
    .bind(id)
    .fetch_one(&pool)
    .await
    .map_err(|_| StatusCode::NOT_FOUND)?;

    Ok(Json(row_to_traffic(row)))
}

// GET /traffic/all - ユーザーが所有するすべてのTrafficを取得
pub async fn list_all_traffics(
    user: AuthenticatedUser,
    Extension(pool): Extension<Pool<Sqlite>>,
) -> Json<Vec<Traffic>> {
    let rows: Vec<TrafficRow> = sqlx::query_as::<_, TrafficRow>(
        r#"
        SELECT
          t.id,
          t.schedule_id,
          t.date,
          t."order",
          t.transportation,
          t.from_place,
          t.to_place,
          t.notes,
          t.fare,
          t.miles,
          t.return_flag,
          t.total_fare,
          t.total_miles
        FROM traffics t
        INNER JOIN schedules s ON t.schedule_id = s.id
        WHERE s.user_id = ?
        ORDER BY t.date ASC, t."order" ASC
        "#,
    )
    .bind(user.user_id as i64)
    .fetch_all(&pool)
    .await
    .unwrap_or_else(|e| {
        eprintln!("Error fetching traffics: {}", e);
        vec![]
    });

    let traffics = rows.into_iter().map(row_to_traffic).collect();
    Json(traffics)
}

// GET /public/traffic?schedule_id=... - 公開スケジュールの交通情報
pub async fn list_public_traffics(
    Query(params): Query<TrafficQuery>,
    Extension(pool): Extension<Pool<Sqlite>>,
) -> Json<Vec<Traffic>> {
    // DISABLE_AUTHが設定されている場合、is_publicの条件を無視
    let schedule_exists: Option<i64> = if std::env::var("DISABLE_AUTH").is_ok() {
        sqlx::query_scalar("SELECT id FROM schedules WHERE id = ?")
            .bind(params.schedule_id)
            .fetch_optional(&pool)
            .await
            .expect("failed to check schedule")
    } else {
        sqlx::query_scalar("SELECT id FROM schedules WHERE id = ? AND CAST(is_public AS INTEGER) = 1")
            .bind(params.schedule_id)
            .fetch_optional(&pool)
            .await
            .expect("failed to check schedule")
    };

    if schedule_exists.is_none() {
        return Json(vec![]);
    }

    let rows: Vec<TrafficRow> = sqlx::query_as::<_, TrafficRow>(
        r#"
        SELECT
          id,
          schedule_id,
          date,
          "order",
          transportation,
          from_place,
          to_place,
          notes,
          fare,
          miles,
          return_flag,
          total_fare,
          total_miles
        FROM traffics
        WHERE schedule_id = ?
        ORDER BY date ASC, "order" ASC
        "#,
    )
    .bind(params.schedule_id)
    .fetch_all(&pool)
    .await
    .expect("failed to fetch traffics");

    let mut traffics: Vec<Traffic> = rows.into_iter().map(row_to_traffic).collect();
    
    // スケジュールのユーザーIDを取得してマスク処理を適用
    if let Some(schedule_id) = schedule_exists {
        let user_id: Option<i64> = sqlx::query_scalar("SELECT user_id FROM schedules WHERE id = ?")
            .bind(schedule_id)
            .fetch_optional(&pool)
            .await
            .ok()
            .flatten();
        
        if let Some(uid) = user_id {
            if let Ok(masked_locations) = get_masked_locations_for_user(&pool, uid).await {
                traffics = traffics.into_iter()
                    .map(|t| apply_mask_to_traffic(t, &masked_locations))
                    .collect();
            }
        }
    }
    
    Json(traffics)
}

// GET /public/traffic/:id - 公開スケジュールの交通情報（個別）
pub async fn get_public_traffic(
    Path(id): Path<i32>,
    Extension(pool): Extension<Pool<Sqlite>>,
) -> Result<Json<Traffic>, StatusCode> {
    let row: Option<TrafficRow> = sqlx::query_as::<_, TrafficRow>(
        r#"
        SELECT
          id,
          schedule_id,
          date,
          "order",
          transportation,
          from_place,
          to_place,
          notes,
          fare,
          miles,
          return_flag,
          total_fare,
          total_miles
        FROM traffics
        WHERE id = ?
        "#,
    )
    .bind(id)
    .fetch_optional(&pool)
    .await
    .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    let row = row.ok_or(StatusCode::NOT_FOUND)?;

    // 関連するスケジュールが公開されているか確認
    let schedule_is_public: Option<i64> = if std::env::var("DISABLE_AUTH").is_ok() {
        sqlx::query_scalar("SELECT id FROM schedules WHERE id = ?")
            .bind(row.schedule_id)
            .fetch_optional(&pool)
            .await
            .expect("failed to check schedule")
    } else {
        sqlx::query_scalar("SELECT id FROM schedules WHERE id = ? AND CAST(is_public AS INTEGER) = 1")
            .bind(row.schedule_id)
            .fetch_optional(&pool)
            .await
            .expect("failed to check schedule")
    };

    if schedule_is_public.is_none() {
        return Err(StatusCode::NOT_FOUND);
    }

    let mut traffic = row_to_traffic(row);
    
    // スケジュールのユーザーIDを取得してマスク処理を適用
    let user_id: Option<i64> = sqlx::query_scalar("SELECT user_id FROM schedules WHERE id = ?")
        .bind(traffic.schedule_id as i64)
        .fetch_optional(&pool)
        .await
        .ok()
        .flatten();
    
    if let Some(uid) = user_id {
        if let Ok(masked_locations) = get_masked_locations_for_user(&pool, uid).await {
            traffic = apply_mask_to_traffic(traffic, &masked_locations);
        }
    }
    
    Ok(Json(traffic))
}

// GET /share/:share_id/traffic/:id - 共有ページ用の交通情報（個別）
pub async fn get_shared_traffic(
    Path((share_id, id)): Path<(String, i32)>,
    Extension(pool): Extension<Pool<Sqlite>>,
) -> Result<Json<Traffic>, (StatusCode, Json<ErrorResponse>)> {
    // share_idからユーザーIDを取得
    let user_row: Option<(i64, i32)> = sqlx::query_as(
        "SELECT id, sharing_enabled FROM users WHERE share_id = ?"
    )
    .bind(&share_id)
    .fetch_optional(&pool)
    .await
    .map_err(|e| {
        eprintln!("[GetSharedTraffic] Database error: {}", e);
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
        
        // 交通情報を取得
        let row: Option<TrafficRow> = sqlx::query_as::<_, TrafficRow>(
            r#"
            SELECT
              id,
              schedule_id,
              date,
              "order",
              transportation,
              from_place,
              to_place,
              notes,
              fare,
              miles,
              return_flag,
              total_fare,
              total_miles
            FROM traffics
            WHERE id = ?
            "#,
        )
        .bind(id)
        .fetch_optional(&pool)
        .await
        .map_err(|e| {
            eprintln!("[GetSharedTraffic] Database error: {}", e);
            (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(ErrorResponse {
                    error: "Database error".to_string(),
                }),
            )
        })?;

        let row = row.ok_or((
            StatusCode::NOT_FOUND,
            Json(ErrorResponse {
                error: "Traffic not found".to_string(),
            }),
        ))?;

        // 関連するスケジュールがこのユーザーの公開スケジュールか確認
        let schedule_is_valid: Option<i64> = sqlx::query_scalar(
            "SELECT id FROM schedules WHERE id = ? AND user_id = ? AND CAST(is_public AS INTEGER) = 1"
        )
        .bind(row.schedule_id)
        .bind(user_id)
        .fetch_optional(&pool)
        .await
        .map_err(|e| {
            eprintln!("[GetSharedTraffic] Database error: {}", e);
            (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(ErrorResponse {
                    error: "Database error".to_string(),
                }),
            )
        })?;

        if schedule_is_valid.is_none() {
            return Err((
                StatusCode::NOT_FOUND,
                Json(ErrorResponse {
                    error: "Traffic not found".to_string(),
                }),
            ));
        }

        let mut traffic = row_to_traffic(row);
        
        // マスク処理を適用
        if let Ok(masked_locations) = get_masked_locations_for_user(&pool, user_id).await {
            traffic = apply_mask_to_traffic(traffic, &masked_locations);
        }
        
        Ok(Json(traffic))
    } else {
        Err((
            StatusCode::NOT_FOUND,
            Json(ErrorResponse {
                error: "User not found".to_string(),
            }),
        ))
    }
}

