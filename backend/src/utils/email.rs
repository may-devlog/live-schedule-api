// メール送信ユーティリティ

use resend_rs::types::CreateEmailBaseOptions;
use resend_rs::{Resend, Result};
use crate::config::{get_base_url, get_frontend_url};

// メール送信（開発環境ではコンソールに出力、本番環境ではResendを使用）
pub async fn send_verification_email(email: &str, token: &str) {
    let base_url = get_base_url();
    let verification_url = format!("{}/verify-email?token={}", base_url, urlencoding::encode(token));
    
    // 環境変数からResend APIキーを取得
    if let Ok(api_key) = std::env::var("RESEND_API_KEY") {
        // 本番環境: Resend APIを使用
        let email_body = format!(
            r#"<p>以下のURLをクリックしてメールアドレスを確認してください:</p><p><a href="{}">{}</a></p><p>このリンクは24時間有効です。</p>"#,
            verification_url, verification_url
        );
        
        let resend = Resend::new(&api_key);
        let from = "onboarding@resend.dev";
        let to = [email];
        let subject = "メールアドレスの確認";
        
        let email_options = CreateEmailBaseOptions::new(from, to, subject)
            .with_html(&email_body);
        
        match resend.emails.send(email_options).await {
            Ok(result) => {
                println!("[EMAIL] Verification email sent successfully to {}: {:?}", email, result);
            }
            Err(e) => {
                eprintln!("[EMAIL] Failed to send verification email to {}: {:?}", email, e);
                // フォールバック: コンソールに出力
                println!("=== メール送信（フォールバック） ===");
                println!("宛先: {}", email);
                println!("件名: メールアドレスの確認");
                println!("本文:");
                println!("以下のURLをクリックしてメールアドレスを確認してください:");
                println!("{}", verification_url);
                println!("===========================");
            }
        }
    } else {
        // 開発環境: コンソールに出力
        println!("[EMAIL] RESEND_API_KEY not found, using development mode (console output)");
        println!("=== メール送信（開発環境） ===");
        println!("宛先: {}", email);
        println!("件名: メールアドレスの確認");
        println!("本文:");
        println!("以下のURLをクリックしてメールアドレスを確認してください:");
        println!("{}", verification_url);
        println!("===========================");
    }
}

pub async fn send_password_reset_email(email: &str, token: &str, api_key: &str) -> Result<()> {
    // FRONTEND_URLを直接確認（確実に使用するため）
    let frontend_url = std::env::var("FRONTEND_URL")
        .unwrap_or_else(|_| {
            eprintln!("[EMAIL] ERROR: FRONTEND_URL not set! Falling back to BASE_URL");
            get_base_url()
        });
    
    // URLの末尾にスラッシュがある場合は削除
    let frontend_url = frontend_url.trim_end_matches('/');
    
    let reset_url = format!("{}/reset-password?token={}", frontend_url, urlencoding::encode(token));
    
    eprintln!("[EMAIL] ===== PASSWORD RESET EMAIL =====");
    eprintln!("[EMAIL] FRONTEND_URL from env: {}", std::env::var("FRONTEND_URL").unwrap_or_else(|_| "NOT SET".to_string()));
    eprintln!("[EMAIL] Using frontend URL: {}", frontend_url);
    eprintln!("[EMAIL] Reset URL: {}", reset_url);
    eprintln!("[EMAIL] ================================");
    
    let email_body = format!(
        r#"<p>以下のURLをクリックしてパスワードをリセットしてください:</p><p><a href="{}">{}</a></p><p>このリンクは24時間有効です。</p>"#,
        reset_url, reset_url
    );
    
    eprintln!("[EMAIL] Creating Resend client with API key length: {}", api_key.len());
    let resend = Resend::new(api_key);
    let from = "onboarding@resend.dev";
    let to = [email];
    let subject = "パスワードリセット";
    
    eprintln!("[EMAIL] Preparing email: from={}, to={:?}, subject={}", from, to, subject);
    let email = CreateEmailBaseOptions::new(from, to, subject)
        .with_html(&email_body);
    
    eprintln!("[EMAIL] Sending email via Resend API...");
    let email_result = resend.emails.send(email).await;
    
    match email_result {
        Ok(result) => {
            eprintln!("[EMAIL] Email sent successfully: {:?}", result);
            Ok(())
        }
        Err(e) => {
            eprintln!("[EMAIL] Failed to send email: {:?}", e);
            Err(e)
        }
    }
}

pub async fn send_deadline_notification_email(
    email: &str,
    hotel_name: &str,
    deadline: &str,
    schedule_title: &str,
) -> Result<(), Box<dyn std::error::Error>> {
    // 環境変数からResend APIキーを取得
    let api_key = match std::env::var("RESEND_API_KEY") {
        Ok(key) => key,
        Err(_) => {
            // 開発環境: コンソールに出力
            println!("[DEADLINE_NOTIFICATION] RESEND_API_KEY not found, using development mode (console output)");
            println!("=== キャンセル期限通知（開発環境） ===");
            println!("宛先: {}", email);
            println!("件名: キャンセル期限が近づいています");
            println!("本文:");
            println!("宿泊施設「{}」のキャンセル期限が24時間以内に迫っています。", hotel_name);
            println!("期限日時: {}", deadline);
            println!("関連イベント: {}", schedule_title);
            println!("===========================");
            return Ok(());
        }
    };

    // 本番環境: Resend APIを使用
    println!("[DEADLINE_NOTIFICATION] RESEND_API_KEY found, using Resend API");
    let email_body = format!(
        r#"<p>宿泊施設「{}」のキャンセル期限が24時間以内に迫っています。</p><p><strong>期限日時:</strong> {}</p><p><strong>関連イベント:</strong> {}</p><p>キャンセルをご検討の場合は、期限までに手続きをお願いします。</p>"#,
        hotel_name, deadline, schedule_title
    );
    
    let resend = Resend::new(&api_key);
    let from = "onboarding@resend.dev";
    let to = [email];
    let subject = "キャンセル期限が近づいています";
    
    let email_options = CreateEmailBaseOptions::new(from, to, subject)
        .with_html(&email_body);
    
    match resend.emails.send(email_options).await {
        Ok(result) => {
            println!("[DEADLINE_NOTIFICATION] Deadline notification email sent successfully to {}: {:?}", email, result);
            Ok(())
        }
        Err(e) => {
            eprintln!("[DEADLINE_NOTIFICATION] Failed to send deadline notification email to {}: {:?}", email, e);
            // フォールバック: コンソールに出力
            println!("=== キャンセル期限通知（フォールバック） ===");
            println!("宛先: {}", email);
            println!("件名: キャンセル期限が近づいています");
            println!("本文:");
            println!("宿泊施設「{}」のキャンセル期限が24時間以内に迫っています。", hotel_name);
            println!("期限日時: {}", deadline);
            println!("関連イベント: {}", schedule_title);
            println!("===========================");
            Err(e.into())
        }
    }
}

pub async fn send_email_change_verification_email(new_email: &str, token: &str) {
    let base_url = get_base_url();
    let verification_url = format!("{}/verify-email-change?token={}", base_url, urlencoding::encode(token));
    
    // 環境変数からResend APIキーを取得
    if let Ok(api_key) = std::env::var("RESEND_API_KEY") {
        // 本番環境: Resend APIを使用
        println!("[EMAIL] RESEND_API_KEY found, using Resend API");
        let email_body = format!(
            r#"<p>メールアドレスの変更をリクエストしました。</p><p>以下のURLをクリックしてメールアドレスを変更してください:</p><p><a href="{}">{}</a></p><p>このリンクは24時間有効です。</p>"#,
            verification_url, verification_url
        );
        
        let resend = Resend::new(&api_key);
        let from = "onboarding@resend.dev";
        let to = [new_email];
        let subject = "メールアドレス変更の確認";
        
        let email_options = CreateEmailBaseOptions::new(from, to, subject)
            .with_html(&email_body);
        
        match resend.emails.send(email_options).await {
            Ok(result) => {
                println!("[EMAIL] Email change verification email sent successfully to {}: {:?}", new_email, result);
            }
            Err(e) => {
                eprintln!("[EMAIL] Failed to send email change verification email to {}: {:?}", new_email, e);
                // フォールバック: コンソールに出力
                println!("=== メール送信（フォールバック） ===");
                println!("宛先: {}", new_email);
                println!("件名: メールアドレス変更の確認");
                println!("本文:");
                println!("メールアドレスの変更をリクエストしました。");
                println!("以下のURLをクリックしてメールアドレスを変更してください:");
                println!("{}", verification_url);
                println!("このリンクは24時間有効です。");
                println!("===========================");
            }
        }
    } else {
        // 開発環境: コンソールに出力
        println!("[EMAIL] RESEND_API_KEY not found, using development mode (console output)");
        println!("=== メール送信（開発環境） ===");
        println!("宛先: {}", new_email);
        println!("件名: メールアドレス変更の確認");
        println!("本文:");
        println!("メールアドレスの変更をリクエストしました。");
        println!("以下のURLをクリックしてメールアドレスを変更してください:");
        println!("{}", verification_url);
        println!("このリンクは24時間有効です。");
        println!("===========================");
    }
}


