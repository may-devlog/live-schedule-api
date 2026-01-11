// 選択肢関連の型定義

use serde::Deserialize;

#[derive(Deserialize)]
pub struct SelectOptionsRequest {
    pub options: Vec<serde_json::Value>,
    pub sort_order: Option<String>, // 'kana' または 'custom'
}


