// 既存の全てのスケジュールに対してロールアップ計算を実行するスクリプト
use sqlx::sqlite::SqlitePool;
use chrono::Utc;

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    let pool = SqlitePool::connect("sqlite:data/app.db").await?;
    
    // 全てのスケジュールIDを取得
    let schedule_ids: Vec<i64> = sqlx::query_scalar("SELECT id FROM schedules")
        .fetch_all(&pool)
        .await?;
    
    println!("Found {} schedules", schedule_ids.len());
    
    for schedule_id in schedule_ids {
        // total_fare: 関連するtrafficsのfareの合計
        let total_fare: Option<i32> = sqlx::query_scalar(
            "SELECT COALESCE(SUM(fare), 0) FROM traffics WHERE schedule_id = ?"
        )
        .bind(schedule_id)
        .fetch_optional(&pool)
        .await?
        .map(|sum: i64| sum as i32);
        
        // stay_fee: 関連するstaysのfeeの合計
        let stay_fee: Option<i32> = sqlx::query_scalar(
            "SELECT COALESCE(SUM(fee), 0) FROM stays WHERE schedule_id = ?"
        )
        .bind(schedule_id)
        .fetch_optional(&pool)
        .await?
        .map(|sum: i64| sum as i32);
        
        // スケジュールのticket_feeとdrink_feeを取得
        let schedule_row: Option<(Option<i32>, Option<i32>)> = sqlx::query_as(
            "SELECT ticket_fee, drink_fee FROM schedules WHERE id = ?"
        )
        .bind(schedule_id)
        .fetch_optional(&pool)
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
        
        println!("Schedule {}: total_fare={:?}, stay_fee={:?}, travel_cost={}, total_cost={}", 
                 schedule_id, total_fare, stay_fee, travel_cost, total_cost);
        
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
        .execute(&pool)
        .await?;
    }
    
    println!("Done!");
    Ok(())
}

