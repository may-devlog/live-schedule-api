// マスクされた場所関連の型定義

use serde::{Deserialize, Serialize};

#[derive(Serialize, Clone)]
pub struct MaskedLocation {
    pub id: i32,
    pub user_id: i32,
    pub location_name: String,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(sqlx::FromRow)]
pub struct MaskedLocationRow {
    pub id: i64,
    pub user_id: i64,
    pub location_name: String,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Deserialize)]
pub struct NewMaskedLocation {
    pub location_name: String,
}

#[derive(Deserialize)]
pub struct UpdateMaskedLocation {
    pub location_name: Option<String>,
}

pub fn row_to_masked_location(row: MaskedLocationRow) -> MaskedLocation {
    MaskedLocation {
        id: row.id as i32,
        user_id: row.user_id as i32,
        location_name: row.location_name,
        created_at: row.created_at,
        updated_at: row.updated_at,
    }
}

