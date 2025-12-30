// サンプルデータを投入するためのバイナリ
// 使用方法: cargo run --bin seed_data

use chrono::Utc;
use sqlx::sqlite::SqlitePoolOptions;

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    // データベースに接続
    let db_url = "sqlite://data/app.db";
    let pool = SqlitePoolOptions::new()
        .max_connections(1)
        .connect(db_url)
        .await?;
    
    // ユーザーIDを取得（8tdys8@gmail.com）
    let user_id: Option<i64> = sqlx::query_scalar("SELECT id FROM users WHERE email = '8tdys8@gmail.com'")
        .fetch_optional(&pool)
        .await?;
    
    let user_id = user_id.ok_or("ユーザーが見つかりません。先にユーザーを作成してください。")?;
    println!("ユーザーID: {}", user_id);
    
    let now = Utc::now().to_rfc3339();
    
    // サンプルスケジュール1: 2025年6月のライブ
    println!("スケジュール1を作成中...");
    let schedule1_id = sqlx::query(
        r#"
        INSERT INTO schedules (
          title, "group", date, open, start, "end", notes, category, area, venue,
          target, lineup, seller, ticket_fee, drink_fee, total_fare, stay_fee, travel_cost, total_cost,
          status, created_at, updated_at, related_schedule_ids, user_id, is_public
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, NULL, NULL, NULL, ?, ?, ?, NULL, ?, ?)
        "#
    )
    .bind("サンプルライブ 2025")
    .bind("サンプルグループ")
    .bind("2025-06-15")
    .bind("17:00")
    .bind("18:00")
    .bind("20:00")
    .bind("初めてのライブです")
    .bind("ワンマン")
    .bind("東京都")
    .bind("東京ドーム")
    .bind("サンプルアーティスト")
    .bind("アーティストA, アーティストB")
    .bind("チケットぴあ")
    .bind(5000)
    .bind(1000)
    .bind("Pending")
    .bind(&now)
    .bind(&now)
    .bind(user_id)
    .bind(0) // 非公開
    .execute(&pool)
    .await?
    .last_insert_rowid();
    
    println!("スケジュール1を作成しました (ID: {})", schedule1_id);
    
    // スケジュール1の交通情報
    println!("交通情報を作成中...");
    sqlx::query(
        r#"
        INSERT INTO traffics (
          schedule_id, date, "order", transportation, from_place, to_place, notes,
          fare, miles, return_flag, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        "#
    )
    .bind(schedule1_id)
    .bind("2025-06-15")
    .bind(1)
    .bind("新幹線")
    .bind("新大阪")
    .bind("東京")
    .bind("エコノミークラス")
    .bind(14000)
    .bind(0)
    .bind(1) // 往復
    .bind(&now)
    .bind(&now)
    .execute(&pool)
    .await?;
    
    println!("交通情報1を作成しました");
    
    // スケジュール1の宿泊情報
    println!("宿泊情報を作成中...");
    sqlx::query(
        r#"
        INSERT INTO stays (
          schedule_id, check_in, check_out, hotel_name, fee, breakfast_flag,
          deadline, penalty, status, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        "#
    )
    .bind(schedule1_id)
    .bind("2025-06-14 15:00")
    .bind("2025-06-16 11:00")
    .bind("東京ホテル")
    .bind(12000)
    .bind(1) // 朝食あり
    .bind("2025-06-10 18:00")
    .bind(20) // 20%のキャンセル料
    .bind("Keep")
    .bind(&now)
    .bind(&now)
    .execute(&pool)
    .await?;
    
    println!("宿泊情報1を作成しました");
    
    // サンプルスケジュール2: 2025年7月のライブ（公開）
    println!("スケジュール2を作成中...");
    let schedule2_id = sqlx::query(
        r#"
        INSERT INTO schedules (
          title, "group", date, open, start, "end", notes, category, area, venue,
          target, lineup, seller, ticket_fee, drink_fee, total_fare, stay_fee, travel_cost, total_cost,
          status, created_at, updated_at, related_schedule_ids, user_id, is_public
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, NULL, NULL, NULL, ?, ?, ?, NULL, ?, ?)
        "#
    )
    .bind("サンプルライブ 2025 夏")
    .bind("サンプルグループ")
    .bind("2025-07-20")
    .bind("16:00")
    .bind("17:00")
    .bind("19:30")
    .bind("夏のライブ")
    .bind("対バン")
    .bind("大阪府")
    .bind("大阪城ホール")
    .bind("サンプルアーティスト2")
    .bind("アーティストC, アーティストD")
    .bind("イープラス")
    .bind(6000)
    .bind(1500)
    .bind("Pending")
    .bind(&now)
    .bind(&now)
    .bind(user_id)
    .bind(1) // 公開
    .execute(&pool)
    .await?
    .last_insert_rowid();
    
    println!("スケジュール2を作成しました (ID: {})", schedule2_id);
    
    // スケジュール2の交通情報
    sqlx::query(
        r#"
        INSERT INTO traffics (
          schedule_id, date, "order", transportation, from_place, to_place, notes,
          fare, miles, return_flag, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        "#
    )
    .bind(schedule2_id)
    .bind("2025-07-20")
    .bind(1)
    .bind("新幹線")
    .bind("東京")
    .bind("新大阪")
    .bind("グリーン車")
    .bind(18000)
    .bind(0)
    .bind(1) // 往復
    .bind(&now)
    .bind(&now)
    .execute(&pool)
    .await?;
    
    println!("交通情報2を作成しました");
    
    // サンプルスケジュール3: 2025年8月のライブ
    println!("スケジュール3を作成中...");
    let schedule3_id = sqlx::query(
        r#"
        INSERT INTO schedules (
          title, "group", date, open, start, "end", notes, category, area, venue,
          target, lineup, seller, ticket_fee, drink_fee, total_fare, stay_fee, travel_cost, total_cost,
          status, created_at, updated_at, related_schedule_ids, user_id, is_public
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, NULL, NULL, NULL, ?, ?, ?, NULL, ?, ?)
        "#
    )
    .bind("サンプルライブ 2025 秋")
    .bind("サンプルグループ")
    .bind("2025-08-10")
    .bind("18:00")
    .bind("19:00")
    .bind("21:00")
    .bind("秋のライブ")
    .bind("ワンマン")
    .bind("愛知県")
    .bind("名古屋国際会議場")
    .bind("サンプルアーティスト3")
    .bind("アーティストE")
    .bind("チケットぴあ")
    .bind(4500)
    .bind(800)
    .bind("Keep")
    .bind(&now)
    .bind(&now)
    .bind(user_id)
    .bind(0) // 非公開
    .execute(&pool)
    .await?
    .last_insert_rowid();
    
    println!("スケジュール3を作成しました (ID: {})", schedule3_id);
    
    // スケジュール1と2を関連付け
    println!("スケジュールの関連付けを作成中...");
    let related_ids = serde_json::to_string(&[schedule2_id as i32])?;
    sqlx::query(
        "UPDATE schedules SET related_schedule_ids = ? WHERE id = ?"
    )
    .bind(&related_ids)
    .bind(schedule1_id)
    .execute(&pool)
    .await?;
    
    println!("サンプルデータの投入が完了しました！");
    println!("\n作成されたデータ:");
    println!("- スケジュール: 3件");
    println!("- 交通情報: 2件");
    println!("- 宿泊情報: 1件");
    println!("- 関連スケジュール: 1件");
    
    Ok(())
}

