// JWT関連

use chrono::Utc;
use jsonwebtoken::{encode, decode, DecodingKey, EncodingKey, Header, Validation};
use axum::http::StatusCode;
use crate::auth::types::Claims;
use crate::config::get_jwt_secret;

pub fn create_token(user_id: i32) -> String {
    let expiration = Utc::now()
        .checked_add_signed(chrono::Duration::days(30))
        .expect("valid timestamp")
        .timestamp() as usize;

    let claims = Claims {
        user_id,
        exp: expiration,
    };

    let jwt_secret = get_jwt_secret();
    encode(
        &Header::default(),
        &claims,
        &EncodingKey::from_secret(jwt_secret.as_ref()),
    )
    .unwrap()
}

pub fn verify_token(token: &str) -> Result<i32, StatusCode> {
    let jwt_secret = get_jwt_secret();
    let token_data = decode::<Claims>(
        token,
        &DecodingKey::from_secret(jwt_secret.as_ref()),
        &Validation::default(),
    )
    .map_err(|e| {
        eprintln!("[VerifyToken] Token verification failed: {}", e);
        StatusCode::UNAUTHORIZED
    })?;

    eprintln!("[VerifyToken] Token verified successfully, user_id: {}", token_data.claims.user_id);
    Ok(token_data.claims.user_id)
}

pub fn extract_token_from_header(headers: &axum::http::HeaderMap) -> Result<String, StatusCode> {
    use axum::http::header::AUTHORIZATION;
    
    let auth_header = headers
        .get(AUTHORIZATION)
        .ok_or(StatusCode::UNAUTHORIZED)?
        .to_str()
        .map_err(|_| StatusCode::UNAUTHORIZED)?;

    if auth_header.starts_with("Bearer ") {
        Ok(auth_header[7..].to_string())
    } else {
        Err(StatusCode::UNAUTHORIZED)
    }
}


