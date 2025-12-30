// 既存のデータに対して双方向リレーションを構築するスクリプト
use sqlx::sqlite::SqlitePool;
use sqlx::Row;
use serde_json;

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    let pool = SqlitePool::connect("sqlite:data/app.db").await?;
    
    // 全てのスケジュールを取得
    let rows = sqlx::query("SELECT id, related_schedule_ids FROM schedules WHERE related_schedule_ids IS NOT NULL AND related_schedule_ids != ''")
        .fetch_all(&pool)
        .await?;
    
    println!("Found {} schedules with related_schedule_ids", rows.len());
    
    for row in rows {
        let id: i32 = row.get(0);
        let related_ids_json: Option<String> = row.get(1);
        
        if let Some(json) = related_ids_json {
            let related_ids: Vec<i32> = match serde_json::from_str(&json) {
                Ok(ids) => ids,
                Err(_) => continue,
            };
            
            println!("Schedule {} has related_ids: {:?}", id, related_ids);
            
            // 各関連スケジュールに対して、このスケジュールを追加
            for related_id in &related_ids {
                // 関連スケジュールを取得
                let related_row = sqlx::query("SELECT related_schedule_ids FROM schedules WHERE id = ?")
                    .bind(related_id)
                    .fetch_optional(&pool)
                    .await?;
                
                if let Some(related_row) = related_row {
                    let related_json: Option<String> = related_row.get(0);
                    let mut related_ids_vec: Vec<i32> = if let Some(json) = related_json {
                        serde_json::from_str(&json).unwrap_or_default()
                    } else {
                        Vec::new()
                    };
                    
                    // このスケジュールIDが含まれていない場合のみ追加
                    if !related_ids_vec.contains(&id) {
                        related_ids_vec.push(id);
                        let updated_json = serde_json::to_string(&related_ids_vec)?;
                        
                        println!("  Adding {} to schedule {}", id, related_id);
                        
                        // 関連スケジュールを更新
                        sqlx::query("UPDATE schedules SET related_schedule_ids = ?, updated_at = datetime('now') WHERE id = ?")
                            .bind(&updated_json)
                            .bind(related_id)
                            .execute(&pool)
                            .await?;
                    }
                }
            }
        }
    }
    
    println!("Done!");
    Ok(())
}

