// 宿泊情報関連のハンドラ

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
use crate::stays::types::*;
use axum::extract::Json as AxumJson;

// GET /public/stay?schedule_id=... - 公開スケジュールの宿泊情報
pub async fn list_public_stays(
    Query(params): Query<StayQuery>,
    Extension(pool): Extension<Pool<Sqlite>>,
) -> Json<Vec<Stay>> {
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

    let rows: Vec<StayRow> = sqlx::query_as::<_, StayRow>(
        r#"
        SELECT
          id,
          schedule_id,
          check_in,
          check_out,
          hotel_name,
          website,
          fee,
          breakfast_flag,
          deadline,
          penalty,
          status
        FROM stays
        WHERE schedule_id = ?
        "#,
    )
    .bind(params.schedule_id)
    .fetch_all(&pool)
    .await
    .expect("failed to fetch stays");

    let stays = rows.into_iter().map(row_to_stay).collect();
    Json(stays)
}

// GET /public/stay/:id - 公開スケジュールの宿泊情報（個別）
pub async fn get_public_stay(
    Path(id): Path<i32>,
    Extension(pool): Extension<Pool<Sqlite>>,
) -> Result<Json<Stay>, StatusCode> {
    let row: Option<StayRow> = sqlx::query_as::<_, StayRow>(
        r#"
        SELECT
          id,
          schedule_id,
          check_in,
          check_out,
          hotel_name,
          website,
          fee,
          breakfast_flag,
          deadline,
          penalty,
          status
        FROM stays
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

    Ok(Json(row_to_stay(row)))
}

// GET /share/:share_id/stay/:id - 共有ページ用の宿泊情報（個別）
pub async fn get_shared_stay(
    Path((share_id, id)): Path<(String, i32)>,
    Extension(pool): Extension<Pool<Sqlite>>,
) -> Result<Json<Stay>, (StatusCode, Json<ErrorResponse>)> {
    // share_idからユーザーIDを取得
    let user_row: Option<(i64, i32)> = sqlx::query_as(
        "SELECT id, sharing_enabled FROM users WHERE share_id = ?"
    )
    .bind(&share_id)
    .fetch_optional(&pool)
    .await
    .map_err(|e| {
        eprintln!("[GetSharedStay] Database error: {}", e);
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
        
        // 宿泊情報を取得
        let row: Option<StayRow> = sqlx::query_as::<_, StayRow>(
            r#"
            SELECT
              id,
              schedule_id,
              check_in,
              check_out,
              hotel_name,
              website,
              fee,
              breakfast_flag,
              deadline,
              penalty,
              status
            FROM stays
            WHERE id = ?
            "#,
        )
        .bind(id)
        .fetch_optional(&pool)
        .await
        .map_err(|e| {
            eprintln!("[GetSharedStay] Database error: {}", e);
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
                error: "Stay not found".to_string(),
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
            eprintln!("[GetSharedStay] Database error: {}", e);
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
                    error: "Stay not found".to_string(),
                }),
            ));
        }

        Ok(Json(row_to_stay(row)))
    } else {
        Err((
            StatusCode::NOT_FOUND,
            Json(ErrorResponse {
                error: "User not found".to_string(),
            }),
        ))
    }
}

// GET /stay/all - ユーザーが所有するすべてのStayを取得
pub async fn list_all_stays(
    user: AuthenticatedUser,
    Extension(pool): Extension<Pool<Sqlite>>,
) -> Json<Vec<Stay>> {
    let rows: Vec<StayRow> = sqlx::query_as::<_, StayRow>(
        r#"
        SELECT
          st.id,
          st.schedule_id,
          st.check_in,
          st.check_out,
          st.hotel_name,
          st.website,
          st.fee,
          st.breakfast_flag,
          st.deadline,
          st.penalty,
          st.status
        FROM stays st
        INNER JOIN schedules s ON st.schedule_id = s.id
        WHERE s.user_id = ?
        ORDER BY st.check_in ASC
        "#,
    )
    .bind(user.user_id as i64)
    .fetch_all(&pool)
    .await
    .unwrap_or_else(|e| {
        eprintln!("Error fetching stays: {}", e);
        vec![]
    });

    let stays = rows.into_iter().map(row_to_stay).collect();
    Json(stays)
}

// GET /stay?schedule_id=...
pub async fn list_stays(
    Query(params): Query<StayQuery>,
    Extension(pool): Extension<Pool<Sqlite>>,
) -> Json<Vec<Stay>> {
    let rows: Vec<StayRow> = sqlx::query_as::<_, StayRow>(
        r#"
        SELECT
          id,
          schedule_id,
          check_in,
          check_out,
          hotel_name,
          website,
          fee,
          breakfast_flag,
          deadline,
          penalty,
          status
        FROM stays
        WHERE schedule_id = ?
        "#,
    )
    .bind(params.schedule_id)
    .fetch_all(&pool)
    .await
    .expect("failed to fetch stays");

    let stays = rows.into_iter().map(row_to_stay).collect();
    Json(stays)
}

// GET /stay/:id
pub async fn get_stay(
    Path(id): Path<i32>,
    user: AuthenticatedUser,
    Extension(pool): Extension<Pool<Sqlite>>,
) -> Result<Json<Stay>, StatusCode> {
    let row: Option<StayRow> = sqlx::query_as::<_, StayRow>(
        r#"
        SELECT
          id,
          schedule_id,
          check_in,
          check_out,
          hotel_name,
          website,
          fee,
          breakfast_flag,
          deadline,
          penalty,
          status
        FROM stays
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

    Ok(Json(row_to_stay(row)))
}

// POST /stay
pub async fn create_stay(
    user: AuthenticatedUser,
    Extension(pool): Extension<Pool<Sqlite>>,
    AxumJson(payload): AxumJson<NewStay>,
) -> Result<(StatusCode, Json<Stay>), StatusCode> {
    // スケジュールの所有者を確認
    let schedule_user_id: Option<i64> = sqlx::query_scalar(
        "SELECT user_id FROM schedules WHERE id = ?",
    )
    .bind(payload.schedule_id as i64)
    .fetch_optional(&pool)
    .await
    .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    if let Some(schedule_user_id) = schedule_user_id {
        if schedule_user_id != user.user_id as i64 {
            return Err(StatusCode::FORBIDDEN);
        }
    } else {
        // スケジュールが存在しない場合
        return Err(StatusCode::NOT_FOUND);
    }

    let now = Utc::now().to_rfc3339();
    let result = sqlx::query(
        r#"
        INSERT INTO stays (
          schedule_id,
          check_in,
          check_out,
          hotel_name,
          website,
          fee,
          breakfast_flag,
          deadline,
          penalty,
          status,
          created_at,
          updated_at
        ) VALUES (
          ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?
        )
        "#,
    )
    .bind(payload.schedule_id)
    .bind(&payload.check_in)
    .bind(&payload.check_out)
    .bind(&payload.hotel_name)
    .bind(&payload.website)
    .bind(payload.fee)
    .bind(if payload.breakfast_flag { 1 } else { 0 })
    .bind(&payload.deadline)
    .bind(payload.penalty)
    .bind(payload.status.as_deref().unwrap_or("Keep"))
    .bind(&now)
    .bind(&now)
    .execute(&pool)
    .await
    .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    let last_id = result.last_insert_rowid();

    // 関連するスケジュールのロールアップ計算を実行
    calculate_rollup(&pool, payload.schedule_id as i64).await.ok();

    let row: StayRow = sqlx::query_as::<_, StayRow>(
        r#"
        SELECT
          id,
          schedule_id,
          check_in,
          check_out,
          hotel_name,
          website,
          fee,
          breakfast_flag,
          deadline,
          penalty,
          status
        FROM stays
        WHERE id = ?
        "#,
    )
    .bind(last_id)
    .fetch_one(&pool)
    .await
    .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    Ok((StatusCode::CREATED, Json(row_to_stay(row))))
}

// PUT /stay/:id
pub async fn update_stay(
    Path(id): Path<i32>,
    Extension(pool): Extension<Pool<Sqlite>>,
    AxumJson(payload): AxumJson<NewStay>,
) -> Result<Json<Stay>, StatusCode> {
    let now = Utc::now().to_rfc3339();
    let result = sqlx::query(
        r#"
        UPDATE stays SET
          schedule_id = ?,
          check_in = ?,
          check_out = ?,
          hotel_name = ?,
          website = ?,
          fee = ?,
          breakfast_flag = ?,
          deadline = ?,
          penalty = ?,
          status = ?,
          updated_at = ?
        WHERE id = ?
        "#,
    )
    .bind(payload.schedule_id)
    .bind(&payload.check_in)
    .bind(&payload.check_out)
    .bind(&payload.hotel_name)
    .bind(&payload.website)
    .bind(payload.fee)
    .bind(if payload.breakfast_flag { 1 } else { 0 })
    .bind(&payload.deadline)
    .bind(payload.penalty)
    .bind(payload.status.as_deref().unwrap_or("Keep"))
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

    let row: StayRow = sqlx::query_as::<_, StayRow>(
        r#"
        SELECT
          id,
          schedule_id,
          check_in,
          check_out,
          hotel_name,
          website,
          fee,
          breakfast_flag,
          deadline,
          penalty,
          status
        FROM stays
        WHERE id = ?
        "#,
    )
    .bind(id)
    .fetch_one(&pool)
    .await
    .map_err(|_| StatusCode::NOT_FOUND)?;

    Ok(Json(row_to_stay(row)))
}
