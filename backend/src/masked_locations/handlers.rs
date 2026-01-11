// マスクされた場所関連のハンドラ

use axum::{
    extract::{Extension, Path},
    http::StatusCode,
    response::Json,
};
use chrono::Utc;
use sqlx::{Pool, Sqlite};

use crate::auth::AuthenticatedUser;
use crate::lib::ErrorResponse;
use crate::masked_locations::types::*;
use axum::extract::Json as AxumJson;

// ユーザーのマスクされた場所一覧を取得（内部用）
pub async fn get_masked_locations_for_user(
    pool: &Pool<Sqlite>,
    user_id: i64,
) -> Result<Vec<String>, sqlx::Error> {
    let rows: Vec<(String,)> = sqlx::query_as(
        "SELECT location_name FROM masked_locations WHERE user_id = ?"
    )
    .bind(user_id)
    .fetch_all(pool)
    .await?;
    
    Ok(rows.into_iter().map(|(name,)| name).collect())
}

// GET /masked-locations - マスク設定一覧取得
pub async fn list_masked_locations(
    user: AuthenticatedUser,
    Extension(pool): Extension<Pool<Sqlite>>,
) -> Result<Json<Vec<MaskedLocation>>, (StatusCode, Json<ErrorResponse>)> {
    let rows: Vec<MaskedLocationRow> = sqlx::query_as::<_, MaskedLocationRow>(
        "SELECT id, user_id, location_name, created_at, updated_at FROM masked_locations WHERE user_id = ? ORDER BY location_name ASC"
    )
    .bind(user.user_id as i64)
    .fetch_all(&pool)
    .await
    .map_err(|e| {
        eprintln!("[ListMaskedLocations] Database error: {}", e);
        (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(ErrorResponse {
                error: "Database error".to_string(),
            }),
        )
    })?;

    let locations = rows.into_iter().map(row_to_masked_location).collect();
    Ok(Json(locations))
}

// POST /masked-locations - マスク設定追加
pub async fn create_masked_location(
    user: AuthenticatedUser,
    Extension(pool): Extension<Pool<Sqlite>>,
    AxumJson(payload): AxumJson<NewMaskedLocation>,
) -> Result<Json<MaskedLocation>, (StatusCode, Json<ErrorResponse>)> {
    if payload.location_name.trim().is_empty() {
        return Err((
            StatusCode::BAD_REQUEST,
            Json(ErrorResponse {
                error: "駅名は必須です".to_string(),
            }),
        ));
    }

    let now = Utc::now().to_rfc3339();
    let result = sqlx::query(
        r#"
        INSERT INTO masked_locations (user_id, location_name, created_at, updated_at)
        VALUES (?, ?, ?, ?)
        "#
    )
    .bind(user.user_id as i64)
    .bind(&payload.location_name)
    .bind(&now)
    .bind(&now)
    .execute(&pool)
    .await
    .map_err(|e| {
        eprintln!("[CreateMaskedLocation] Database error: {}", e);
        (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(ErrorResponse {
                error: "Database error".to_string(),
            }),
        )
    })?;

    let last_id = result.last_insert_rowid();
    let row: MaskedLocationRow = sqlx::query_as::<_, MaskedLocationRow>(
        "SELECT id, user_id, location_name, created_at, updated_at FROM masked_locations WHERE id = ?"
    )
    .bind(last_id)
    .fetch_one(&pool)
    .await
    .map_err(|e| {
        eprintln!("[CreateMaskedLocation] Failed to fetch created location: {}", e);
        (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(ErrorResponse {
                error: "Database error".to_string(),
            }),
        )
    })?;

    Ok(Json(row_to_masked_location(row)))
}

// PUT /masked-locations/:id - マスク設定更新
pub async fn update_masked_location(
    Path(id): Path<i32>,
    user: AuthenticatedUser,
    Extension(pool): Extension<Pool<Sqlite>>,
    AxumJson(payload): AxumJson<UpdateMaskedLocation>,
) -> Result<Json<MaskedLocation>, (StatusCode, Json<ErrorResponse>)> {
    // 既存のレコードを確認
    let existing: Option<MaskedLocationRow> = sqlx::query_as::<_, MaskedLocationRow>(
        "SELECT id, user_id, location_name, created_at, updated_at FROM masked_locations WHERE id = ?"
    )
    .bind(id as i64)
    .fetch_optional(&pool)
    .await
    .map_err(|e| {
        eprintln!("[UpdateMaskedLocation] Database error: {}", e);
        (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(ErrorResponse {
                error: "Database error".to_string(),
            }),
        )
    })?;

    if existing.is_none() {
        return Err((
            StatusCode::NOT_FOUND,
            Json(ErrorResponse {
                error: "Location not found".to_string(),
            }),
        ));
    }

    let existing = existing.unwrap();
    if existing.user_id != user.user_id as i64 {
        return Err((
            StatusCode::FORBIDDEN,
            Json(ErrorResponse {
                error: "Forbidden".to_string(),
            }),
        ));
    }

    let now = Utc::now().to_rfc3339();
    let location_name = payload.location_name.unwrap_or(existing.location_name);

    sqlx::query(
        r#"
        UPDATE masked_locations SET
            location_name = ?,
            updated_at = ?
        WHERE id = ? AND user_id = ?
        "#
    )
    .bind(&location_name)
    .bind(&now)
    .bind(id as i64)
    .bind(user.user_id as i64)
    .execute(&pool)
    .await
    .map_err(|e| {
        eprintln!("[UpdateMaskedLocation] Database error: {}", e);
        (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(ErrorResponse {
                error: "Database error".to_string(),
            }),
        )
    })?;

    let row: MaskedLocationRow = sqlx::query_as::<_, MaskedLocationRow>(
        "SELECT id, user_id, location_name, created_at, updated_at FROM masked_locations WHERE id = ?"
    )
    .bind(id as i64)
    .fetch_one(&pool)
    .await
    .map_err(|e| {
        eprintln!("[UpdateMaskedLocation] Failed to fetch updated location: {}", e);
        (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(ErrorResponse {
                error: "Database error".to_string(),
            }),
        )
    })?;

    Ok(Json(row_to_masked_location(row)))
}

// DELETE /masked-locations/:id - マスク設定削除
pub async fn delete_masked_location(
    Path(id): Path<i32>,
    user: AuthenticatedUser,
    Extension(pool): Extension<Pool<Sqlite>>,
) -> Result<Json<serde_json::Value>, (StatusCode, Json<ErrorResponse>)> {
    // 既存のレコードを確認
    let existing: Option<MaskedLocationRow> = sqlx::query_as::<_, MaskedLocationRow>(
        "SELECT id, user_id, location_name, created_at, updated_at FROM masked_locations WHERE id = ?"
    )
    .bind(id as i64)
    .fetch_optional(&pool)
    .await
    .map_err(|e| {
        eprintln!("[DeleteMaskedLocation] Database error: {}", e);
        (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(ErrorResponse {
                error: "Database error".to_string(),
            }),
        )
    })?;

    if existing.is_none() {
        return Err((
            StatusCode::NOT_FOUND,
            Json(ErrorResponse {
                error: "Location not found".to_string(),
            }),
        ));
    }

    let existing = existing.unwrap();
    if existing.user_id != user.user_id as i64 {
        return Err((
            StatusCode::FORBIDDEN,
            Json(ErrorResponse {
                error: "Forbidden".to_string(),
            }),
        ));
    }

    let result = sqlx::query("DELETE FROM masked_locations WHERE id = ? AND user_id = ?")
        .bind(id as i64)
        .bind(user.user_id as i64)
        .execute(&pool)
        .await
        .map_err(|e| {
            eprintln!("[DeleteMaskedLocation] Database error: {}", e);
            (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(ErrorResponse {
                    error: "Database error".to_string(),
                }),
            )
        })?;

    if result.rows_affected() == 0 {
        return Err((
            StatusCode::NOT_FOUND,
            Json(ErrorResponse {
                error: "Location not found".to_string(),
            }),
        ));
    }

    Ok(Json(serde_json::json!({ "success": true })))
}

