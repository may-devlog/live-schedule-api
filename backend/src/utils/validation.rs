// バリデーション関数

// メールアドレスの簡易バリデーション
pub fn is_valid_email(email: &str) -> bool {
    email.contains('@') && email.contains('.') && email.len() > 5
}

pub fn is_valid_password(password: &str) -> bool {
    password.chars().count() >= 8
        && password.chars().any(|c| c.is_ascii_alphabetic())
        && password.chars().any(|c| c.is_ascii_digit())
}

