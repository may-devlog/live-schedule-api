// バリデーション関数

// メールアドレスの簡易バリデーション
pub fn is_valid_email(email: &str) -> bool {
    email.contains('@') && email.contains('.') && email.len() > 5
}

