// 既存の出演者名（select_options の option_type='targets'）について、
// 五十音順ソート用の読み仮名をあらかじめ解決し、キャッシュファイルに書き込むスクリプト。
// リリース後に初めて五十音順表示を開いたユーザーが、まとめてAI解決のレイテンシ・課金を
// 負担しないようにするための事前ウォームアップ。
//
// 実行方法（ローカル）: cd backend && cargo run --bin warmup_readings
// 実行方法（本番）: リポジトリ直下(systemdのWorkingDirectoryと同じ)で
//   cargo run --manifest-path backend/Cargo.toml --bin warmup_readings --release
//   を実行する。DATABASE_URL・READING_OVERRIDES_PATH・READING_CACHE_PATHは
//   実行中のサーバーと同じ.envから読み込まれるため、カレントディレクトリを
//   サーバーと揃えることで接続先DB・ファイルパスの食い違いを防いでいる。

use serde::Deserialize;
use sqlx::sqlite::SqlitePool;
use std::collections::{HashMap, HashSet};

fn database_url() -> String {
    std::env::var("DATABASE_URL").unwrap_or_else(|_| "sqlite:data/app.db".to_string())
}
fn reading_overrides_path() -> String {
    std::env::var("READING_OVERRIDES_PATH").unwrap_or_else(|_| "reading_overrides.json".to_string())
}
fn reading_cache_path() -> String {
    std::env::var("READING_CACHE_PATH").unwrap_or_else(|_| "data/reading_cache.json".to_string())
}

#[derive(Deserialize)]
struct SelectOptionLabel {
    label: String,
}

#[derive(Deserialize)]
struct ReadingEntry {
    name: String,
    reading: String,
}

fn load_json_map(path: &str) -> HashMap<String, String> {
    match std::fs::read_to_string(path) {
        Ok(content) => serde_json::from_str(&content).unwrap_or_default(),
        Err(_) => HashMap::new(),
    }
}

async fn fetch_readings_from_claude(
    names: &[String],
) -> Result<HashMap<String, String>, String> {
    let api_key = std::env::var("ANTHROPIC_API_KEY")
        .map_err(|_| "ANTHROPIC_API_KEY is not set".to_string())?;

    let schema = serde_json::json!({
        "type": "object",
        "properties": {
            "readings": {
                "type": "array",
                "items": {
                    "type": "object",
                    "properties": {
                        "name": { "type": "string" },
                        "reading": { "type": "string" }
                    },
                    "required": ["name", "reading"],
                    "additionalProperties": false
                }
            }
        },
        "required": ["readings"],
        "additionalProperties": false
    });

    let names_json = serde_json::to_string(names).map_err(|e| e.to_string())?;

    let body = serde_json::json!({
        "model": "claude-haiku-4-5",
        "max_tokens": 4096,
        "system": "あなたは日本のライブ・イベント出演者名の読み仮名を推定するアシスタントです。渡された名前（人名・芸名・グループ名など）それぞれについて、最も一般的で自然な読み方をひらがなのみで返してください。読みが一意に定まらない場合でも、最も妥当と考えられる読みを1つ推測して返してください。nameは渡された文字列と完全に一致させてください。",
        "messages": [{
            "role": "user",
            "content": format!("次の名前それぞれの読み仮名（ひらがな）を返してください:\n{}", names_json)
        }],
        "output_config": {
            "format": {
                "type": "json_schema",
                "schema": schema
            }
        }
    });

    let client = reqwest::Client::new();
    let response = client
        .post("https://api.anthropic.com/v1/messages")
        .header("x-api-key", api_key)
        .header("anthropic-version", "2023-06-01")
        .header("content-type", "application/json")
        .json(&body)
        .send()
        .await
        .map_err(|e| format!("Anthropic API request failed: {}", e))?;

    let response_json: serde_json::Value = response
        .json()
        .await
        .map_err(|e| format!("Failed to parse Anthropic API response: {}", e))?;

    let text = response_json
        .get("content")
        .and_then(|c| c.get(0))
        .and_then(|b| b.get("text"))
        .and_then(|t| t.as_str())
        .ok_or_else(|| format!("Unexpected Anthropic API response shape: {:?}", response_json))?;

    #[derive(Deserialize)]
    struct ReadingsWrapper {
        readings: Vec<ReadingEntry>,
    }

    let parsed: ReadingsWrapper = serde_json::from_str(text)
        .map_err(|e| format!("Failed to parse readings JSON: {} (body={})", e, text))?;

    Ok(parsed
        .readings
        .into_iter()
        .map(|r| (r.name, r.reading))
        .collect())
}

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    // カレントディレクトリまたはその親から.envを探して読み込む（本番はsystemdが
    // EnvironmentFileで環境変数を注入するためこの呼び出しは基本的に無害なno-op、
    // ローカル開発ではbackend/.envを読み込むために必要）
    dotenv::dotenv().ok();

    let pool = SqlitePool::connect(&database_url()).await?;

    // 全ユーザー分の出演者名(option_type='targets')から重複を除いた名前一覧を作る
    let rows: Vec<(String,)> =
        sqlx::query_as("SELECT options_json FROM select_options WHERE option_type = 'targets'")
            .fetch_all(&pool)
            .await?;

    let mut all_names: HashSet<String> = HashSet::new();
    for (options_json,) in &rows {
        if let Ok(options) = serde_json::from_str::<Vec<SelectOptionLabel>>(options_json) {
            for opt in options {
                if !opt.label.trim().is_empty() {
                    all_names.insert(opt.label);
                }
            }
        }
    }

    let total_names = all_names.len();
    println!("Found {} distinct performer names across all users", total_names);

    let overrides = load_json_map(&reading_overrides_path());
    let cache_path = reading_cache_path();
    let mut cache = load_json_map(&cache_path);

    let unresolved: Vec<String> = all_names
        .into_iter()
        .filter(|name| !overrides.contains_key(name) && !cache.contains_key(name))
        .collect();

    println!(
        "{} names already resolved (overrides/cache), {} to resolve",
        total_names - unresolved.len(),
        unresolved.len()
    );

    if unresolved.is_empty() {
        println!("Nothing to do — cache is already warm.");
        return Ok(());
    }

    // 1リクエストあたりの件数が大きくなりすぎないよう、まとめてバッチ処理する
    const BATCH_SIZE: usize = 50;
    for (batch_index, batch) in unresolved.chunks(BATCH_SIZE).enumerate() {
        println!(
            "Resolving batch {} ({} names)...",
            batch_index + 1,
            batch.len()
        );
        match fetch_readings_from_claude(batch).await {
            Ok(resolved) => {
                for (name, reading) in resolved {
                    cache.insert(name, reading);
                }
                // バッチごとに保存しておくことで、途中で失敗しても解決済み分は失われない
                let json = serde_json::to_string_pretty(&cache)?;
                std::fs::write(&cache_path, json)?;
            }
            Err(e) => {
                eprintln!("Batch {} failed: {}", batch_index + 1, e);
            }
        }
    }

    println!("Done. Cache now has {} entries.", cache.len());
    Ok(())
}
