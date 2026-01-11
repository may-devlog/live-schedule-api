// 選択肢関連のハンドラ

use axum::{
    extract::{Extension, Path},
    http::StatusCode,
    response::Json,
};
use chrono::Utc;
use sqlx::{Pool, Sqlite};

use crate::auth::AuthenticatedUser;
use crate::lib::ErrorResponse;
use crate::select_options::types::SelectOptionsRequest;
use axum::extract::Json as AxumJson;

// ヘルパー関数（後でutilsモジュールに移動予定）
pub async fn get_user_id_by_email(pool: &Pool<Sqlite>, email: &str) -> Option<i32> {
    let row: Option<(i64,)> = sqlx::query_as("SELECT id FROM users WHERE email = ?")
        .bind(email)
        .fetch_optional(pool)
        .await
        .ok()?;
    
    row.map(|(id,)| id as i32)
}

async fn get_first_user_id(pool: &Pool<Sqlite>) -> Option<i32> {
    let row: Option<(i64,)> = sqlx::query_as("SELECT id FROM users ORDER BY id ASC LIMIT 1")
        .fetch_optional(pool)
        .await
        .ok()?;
    
    row.map(|(id,)| id as i32)
}

// GET /select-options/:type - 選択肢を取得
pub async fn get_select_options(
    user: AuthenticatedUser,
    Path(option_type): Path<String>,
    Extension(pool): Extension<Pool<Sqlite>>,
) -> Result<Json<Vec<serde_json::Value>>, (StatusCode, Json<ErrorResponse>)> {
    // DISABLE_AUTHが有効な場合、データベースから実際のユーザーIDを取得
    let actual_user_id = if std::env::var("DISABLE_AUTH").is_ok() {
        // 環境変数DEFAULT_USER_IDが設定されている場合はそれを使用
        if let Ok(user_id_str) = std::env::var("DEFAULT_USER_ID") {
            user_id_str.parse::<i32>().ok().unwrap_or(user.user_id)
        } else if let Ok(email) = std::env::var("DEFAULT_USER_EMAIL") {
            // メールアドレスからユーザーIDを取得
            if let Some(user_id) = get_user_id_by_email(&pool, &email).await {
                user_id
            } else {
                // メールアドレスが見つからない場合、データベースから最初のユーザーIDを取得
                get_first_user_id(&pool).await.unwrap_or(user.user_id)
            }
        } else {
            // 環境変数が設定されていない場合、データベースから最初のユーザーIDを取得
            get_first_user_id(&pool).await.unwrap_or(user.user_id)
        }
    } else {
        user.user_id
    };
    
    eprintln!("[GetSelectOptions] User ID (i32): {}, Actual User ID: {}, Option Type: {}", 
        user.user_id, actual_user_id, option_type);
    
    let row: Option<(String,)> = sqlx::query_as::<_, (String,)>(
        "SELECT options_json FROM select_options WHERE user_id = ? AND option_type = ?"
    )
    .bind(actual_user_id as i64)
    .bind(&option_type)
    .fetch_optional(&pool)
    .await
    .map_err(|e| {
        eprintln!("[GetSelectOptions] Database error: {}", e);
        (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(ErrorResponse {
                error: "Database error".to_string(),
            }),
        )
    })?;

    if let Some((options_json,)) = row {
        let options: Vec<serde_json::Value> = serde_json::from_str(&options_json)
            .map_err(|_| {
                (
                    StatusCode::INTERNAL_SERVER_ERROR,
                    Json(ErrorResponse {
                        error: "Failed to parse options".to_string(),
                    }),
                )
            })?;
        Ok(Json(options))
    } else {
        // データベースに保存されていない場合は空配列を返す
        Ok(Json(vec![]))
    }
}

// POST /select-options/:type - 選択肢を保存
pub async fn save_select_options(
    user: AuthenticatedUser,
    Path(option_type): Path<String>,
    Extension(pool): Extension<Pool<Sqlite>>,
    AxumJson(payload): AxumJson<SelectOptionsRequest>,
) -> Result<Json<serde_json::Value>, (StatusCode, Json<ErrorResponse>)> {
    // DISABLE_AUTHが有効な場合、データベースから実際のユーザーIDを取得
    let actual_user_id = if std::env::var("DISABLE_AUTH").is_ok() {
        // 環境変数DEFAULT_USER_IDが設定されている場合はそれを使用
        if let Ok(user_id_str) = std::env::var("DEFAULT_USER_ID") {
            user_id_str.parse::<i32>().ok().unwrap_or(user.user_id)
        } else if let Ok(email) = std::env::var("DEFAULT_USER_EMAIL") {
            // メールアドレスからユーザーIDを取得
            if let Some(user_id) = get_user_id_by_email(&pool, &email).await {
                user_id
            } else {
                // メールアドレスが見つからない場合、データベースから最初のユーザーIDを取得
                get_first_user_id(&pool).await.unwrap_or(user.user_id)
            }
        } else {
            // 環境変数が設定されていない場合、データベースから最初のユーザーIDを取得
            get_first_user_id(&pool).await.unwrap_or(user.user_id)
        }
    } else {
        user.user_id
    };
    
    let user_id_i64 = actual_user_id as i64;
    eprintln!("[SaveSelectOptions] User ID (i32): {}, User ID (i64): {}, Option Type: {}, Options Count: {}", 
        actual_user_id, user_id_i64, option_type, payload.options.len());
    
    let options_json = serde_json::to_string(&payload.options)
        .map_err(|e| {
            eprintln!("[SaveSelectOptions] Failed to serialize options: {}", e);
            (
                StatusCode::BAD_REQUEST,
                Json(ErrorResponse {
                    error: "Invalid options format".to_string(),
                }),
            )
        })?;

    eprintln!("[SaveSelectOptions] Options JSON: {}", options_json);

    let now = Utc::now().to_rfc3339();

    // ユーザーIDが存在するか確認
    eprintln!("[SaveSelectOptions] Checking if user_id {} exists in users table", user_id_i64);
    let user_id_exists: Option<(i64,)> = sqlx::query_as("SELECT id FROM users WHERE id = ?")
        .bind(user_id_i64)
        .fetch_optional(&pool)
        .await
        .map_err(|e| {
            eprintln!("[SaveSelectOptions] Failed to check user existence: {}", e);
            (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(ErrorResponse {
                    error: "Database error".to_string(),
                }),
            )
        })?;
    
    if user_id_exists.is_none() {
        eprintln!("[SaveSelectOptions] User ID {} does not exist in users table", user_id_i64);
        // すべてのユーザーIDを確認
        let all_users: Vec<(i64, String)> = sqlx::query_as("SELECT id, email FROM users")
            .fetch_all(&pool)
            .await
            .unwrap_or_default();
        eprintln!("[SaveSelectOptions] All users in database: {:?}", all_users);
        return Err((
            StatusCode::BAD_REQUEST,
            Json(ErrorResponse {
                error: format!("User ID {} does not exist", actual_user_id),
            }),
        ));
    }
    
    eprintln!("[SaveSelectOptions] User ID {} exists in users table", user_id_i64);
    
    // 既存のレコードを確認
    eprintln!("[SaveSelectOptions] Checking for existing record: user_id={}, option_type={}", user_id_i64, option_type);
    let existing: Option<(i64,)> = sqlx::query_as(
        "SELECT id FROM select_options WHERE user_id = ? AND option_type = ?"
    )
    .bind(user_id_i64)
    .bind(&option_type)
    .fetch_optional(&pool)
    .await
    .map_err(|e| {
        eprintln!("[SaveSelectOptions] Failed to check existing record: {}", e);
        (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(ErrorResponse {
                error: "Database error".to_string(),
            }),
        )
    })?;
    
    eprintln!("[SaveSelectOptions] Existing record check result: {:?}", existing);
    
    let sort_order = payload.sort_order.unwrap_or_else(|| "custom".to_string());
    
    let result = if existing.is_some() {
        // 既存のレコードを更新
        eprintln!("[SaveSelectOptions] Updating existing record for user_id: {}, option_type: {}", actual_user_id, option_type);
        sqlx::query(
            r#"
            UPDATE select_options
            SET options_json = ?,
                sort_order = ?,
                updated_at = ?
            WHERE user_id = ? AND option_type = ?
            "#
        )
        .bind(&options_json)
        .bind(&sort_order)
        .bind(&now)
        .bind(user_id_i64)
        .bind(&option_type)
        .execute(&pool)
        .await
    } else {
        // 新しいレコードを挿入
        eprintln!("[SaveSelectOptions] Inserting new record for user_id: {}, option_type: {}", user_id_i64, option_type);
        sqlx::query(
            r#"
            INSERT INTO select_options (user_id, option_type, options_json, sort_order, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?)
            "#
        )
        .bind(user_id_i64)
        .bind(&option_type)
        .bind(&options_json)
        .bind(&sort_order)
        .bind(&now)
        .bind(&now)
        .execute(&pool)
        .await
    }
    .map_err(|e| {
        eprintln!("[SaveSelectOptions] Database error: {}", e);
        (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(ErrorResponse {
                error: format!("Failed to save options: {}", e),
            }),
        )
    })?;

    eprintln!("[SaveSelectOptions] Successfully saved. Rows affected: {}", result.rows_affected());

    Ok(Json(serde_json::json!({ "success": true })))
}

// GET /share/:share_id/select-options/:type - 共有ページ用の選択肢を取得（認証不要）
pub async fn get_shared_select_options(
    Path((share_id, option_type)): Path<(String, String)>,
    Extension(pool): Extension<Pool<Sqlite>>,
) -> Result<Json<Vec<serde_json::Value>>, (StatusCode, Json<ErrorResponse>)> {
    eprintln!("[GetSharedSelectOptions] Called with share_id: {}, option_type: {}", share_id, option_type);
    
    // share_idからユーザーIDを取得
    let user_id: Option<i64> = sqlx::query_scalar(
        "SELECT id FROM users WHERE share_id = ?"
    )
    .bind(&share_id)
    .fetch_optional(&pool)
    .await
    .map_err(|e| {
        eprintln!("[GetSharedSelectOptions] Database error: {}", e);
        (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(ErrorResponse {
                error: "Database error".to_string(),
            }),
        )
    })?;
    
    eprintln!("[GetSharedSelectOptions] User ID found: {:?}", user_id);
    
    if let Some(user_id) = user_id {
        let row: Option<(String,)> = sqlx::query_as::<_, (String,)>(
            "SELECT options_json FROM select_options WHERE user_id = ? AND option_type = ?"
        )
        .bind(user_id)
        .bind(&option_type)
        .fetch_optional(&pool)
        .await
        .map_err(|e| {
            eprintln!("[GetSharedSelectOptions] Database error: {}", e);
            (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(ErrorResponse {
                    error: "Database error".to_string(),
                }),
            )
        })?;

        if let Some((options_json,)) = row {
            let options: Vec<serde_json::Value> = serde_json::from_str(&options_json)
                .map_err(|_| {
                    (
                        StatusCode::INTERNAL_SERVER_ERROR,
                        Json(ErrorResponse {
                            error: "Failed to parse options".to_string(),
                        }),
                    )
                })?;
            eprintln!("[GetSharedSelectOptions] Returning {} options", options.len());
            Ok(Json(options))
        } else {
            eprintln!("[GetSharedSelectOptions] No options found, returning empty array");
            Ok(Json(vec![]))
        }
    } else {
        Err((
            StatusCode::NOT_FOUND,
            Json(ErrorResponse {
                error: "User not found".to_string(),
            }),
        ))
    }
}

// GET /stay-select-options/:type - ホテル用選択肢を取得
pub async fn get_stay_select_options(
    user: AuthenticatedUser,
    Path(option_type): Path<String>,
    Extension(pool): Extension<Pool<Sqlite>>,
) -> Result<Json<Vec<serde_json::Value>>, (StatusCode, Json<ErrorResponse>)> {
    // DISABLE_AUTHが有効な場合、データベースから実際のユーザーIDを取得
    let actual_user_id = if std::env::var("DISABLE_AUTH").is_ok() {
        if let Ok(user_id_str) = std::env::var("DEFAULT_USER_ID") {
            user_id_str.parse::<i32>().ok().unwrap_or(user.user_id)
        } else if let Ok(email) = std::env::var("DEFAULT_USER_EMAIL") {
            if let Some(user_id) = get_user_id_by_email(&pool, &email).await {
                user_id
            } else {
                get_first_user_id(&pool).await.unwrap_or(user.user_id)
            }
        } else {
            get_first_user_id(&pool).await.unwrap_or(user.user_id)
        }
    } else {
        user.user_id
    };
    
    let row: Option<(String,)> = sqlx::query_as::<_, (String,)>(
        "SELECT options_json FROM stay_select_options WHERE user_id = ? AND option_type = ?"
    )
    .bind(actual_user_id as i64)
    .bind(&option_type)
    .fetch_optional(&pool)
    .await
    .map_err(|e| {
        eprintln!("[GetStaySelectOptions] Database error: {}", e);
        (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(ErrorResponse {
                error: "Database error".to_string(),
            }),
        )
    })?;

    if let Some((options_json,)) = row {
        let options: Vec<serde_json::Value> = serde_json::from_str(&options_json)
            .map_err(|_| {
                (
                    StatusCode::INTERNAL_SERVER_ERROR,
                    Json(ErrorResponse {
                        error: "Failed to parse options".to_string(),
                    }),
                )
            })?;
        Ok(Json(options))
    } else {
        Ok(Json(vec![]))
    }
}

// POST /stay-select-options/:type - ホテル用選択肢を保存
pub async fn save_stay_select_options(
    user: AuthenticatedUser,
    Path(option_type): Path<String>,
    Extension(pool): Extension<Pool<Sqlite>>,
    AxumJson(payload): AxumJson<SelectOptionsRequest>,
) -> Result<Json<serde_json::Value>, (StatusCode, Json<ErrorResponse>)> {
    // DISABLE_AUTHが有効な場合、データベースから実際のユーザーIDを取得
    let actual_user_id = if std::env::var("DISABLE_AUTH").is_ok() {
        if let Ok(user_id_str) = std::env::var("DEFAULT_USER_ID") {
            user_id_str.parse::<i32>().ok().unwrap_or(user.user_id)
        } else if let Ok(email) = std::env::var("DEFAULT_USER_EMAIL") {
            if let Some(user_id) = get_user_id_by_email(&pool, &email).await {
                user_id
            } else {
                get_first_user_id(&pool).await.unwrap_or(user.user_id)
            }
        } else {
            get_first_user_id(&pool).await.unwrap_or(user.user_id)
        }
    } else {
        user.user_id
    };
    
    let user_id_i64 = actual_user_id as i64;
    let options_json = serde_json::to_string(&payload.options)
        .map_err(|_| {
            (
                StatusCode::BAD_REQUEST,
                Json(ErrorResponse {
                    error: "Invalid options format".to_string(),
                }),
            )
        })?;

    let now = Utc::now().to_rfc3339();

    if let Some((_existing_id,)) = sqlx::query_as::<_, (i64,)>(
        "SELECT id FROM stay_select_options WHERE user_id = ? AND option_type = ?"
    )
    .bind(user_id_i64)
    .bind(&option_type)
    .fetch_optional(&pool)
    .await
    .map_err(|e| {
        eprintln!("[SaveStaySelectOptions] Database error: {}", e);
        (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(ErrorResponse {
                error: "Database error".to_string(),
            }),
        )
    })? {
        // 既存のレコードを更新
        sqlx::query(
            r#"
            UPDATE stay_select_options 
            SET options_json = ?, updated_at = ?
            WHERE user_id = ? AND option_type = ?
            "#
        )
        .bind(&options_json)
        .bind(&now)
        .bind(user_id_i64)
        .bind(&option_type)
        .execute(&pool)
        .await
    } else {
        // 新しいレコードを挿入
        sqlx::query(
            r#"
            INSERT INTO stay_select_options (user_id, option_type, options_json, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?)
            "#
        )
        .bind(user_id_i64)
        .bind(&option_type)
        .bind(&options_json)
        .bind(&now)
        .bind(&now)
        .execute(&pool)
        .await
    }
    .map_err(|e| {
        eprintln!("[SaveStaySelectOptions] Database error: {}", e);
        (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(ErrorResponse {
                error: format!("Failed to save options: {}", e),
            }),
        )
    })?;

    Ok(Json(serde_json::json!({ "success": true })))
}

// GET /share/:share_id/stay-select-options/:type - 共有ページ用のホテル選択肢を取得（認証不要）
pub async fn get_shared_stay_select_options(
    Path((share_id, option_type)): Path<(String, String)>,
    Extension(pool): Extension<Pool<Sqlite>>,
) -> Result<Json<Vec<serde_json::Value>>, (StatusCode, Json<ErrorResponse>)> {
    eprintln!("[GetSharedStaySelectOptions] Called with share_id: {}, option_type: {}", share_id, option_type);
    
    // share_idからユーザーIDを取得
    let user_id: Option<i64> = sqlx::query_scalar(
        "SELECT id FROM users WHERE share_id = ?"
    )
    .bind(&share_id)
    .fetch_optional(&pool)
    .await
    .map_err(|e| {
        eprintln!("[GetSharedStaySelectOptions] Database error: {}", e);
        (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(ErrorResponse {
                error: "Database error".to_string(),
            }),
        )
    })?;
    
    if let Some(user_id) = user_id {
        let row: Option<(String,)> = sqlx::query_as::<_, (String,)>(
            "SELECT options_json FROM stay_select_options WHERE user_id = ? AND option_type = ?"
        )
        .bind(user_id)
        .bind(&option_type)
        .fetch_optional(&pool)
        .await
        .map_err(|e| {
            eprintln!("[GetSharedStaySelectOptions] Database error: {}", e);
            (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(ErrorResponse {
                    error: "Database error".to_string(),
                }),
            )
        })?;

        if let Some((options_json,)) = row {
            let options: Vec<serde_json::Value> = serde_json::from_str(&options_json)
                .map_err(|_| {
                    (
                        StatusCode::INTERNAL_SERVER_ERROR,
                        Json(ErrorResponse {
                            error: "Failed to parse options".to_string(),
                        }),
                    )
                })?;
            eprintln!("[GetSharedStaySelectOptions] Returning {} options", options.len());
            Ok(Json(options))
        } else {
            eprintln!("[GetSharedStaySelectOptions] No options found, returning empty array");
            Ok(Json(vec![]))
        }
    } else {
        Err((
            StatusCode::NOT_FOUND,
            Json(ErrorResponse {
                error: "User not found".to_string(),
            }),
        ))
    }
}

