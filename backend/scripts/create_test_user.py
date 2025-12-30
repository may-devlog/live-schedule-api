#!/usr/bin/env python3
"""
テストユーザーを作成するスクリプト
使用方法: python3 create_test_user.py <email> <password>
"""

import sys
import sqlite3
import bcrypt
from datetime import datetime

if len(sys.argv) != 3:
    print("使用方法: python3 create_test_user.py <email> <password>")
    print("例: python3 create_test_user.py test@example.com password123")
    sys.exit(1)

email = sys.argv[1]
password = sys.argv[2]

# パスワードをハッシュ化
password_hash = bcrypt.hashpw(password.encode('utf-8'), bcrypt.gensalt()).decode('utf-8')

# データベースに接続
conn = sqlite3.connect('data/app.db')
cursor = conn.cursor()

# 既存のユーザーをチェック
cursor.execute("SELECT id FROM users WHERE email = ?", (email,))
if cursor.fetchone():
    print(f"エラー: ユーザー {email} は既に存在します")
    conn.close()
    sys.exit(1)

# ユーザーを作成（メール確認済み）
now = datetime.now().isoformat()
cursor.execute(
    """INSERT INTO users (email, password_hash, email_verified, created_at, updated_at)
       VALUES (?, ?, 1, ?, ?)""",
    (email, password_hash, now, now)
)

conn.commit()
conn.close()

print(f"ユーザーを作成しました: {email}")
print("メール確認済み（email_verified = 1）として設定しました")
print("このユーザーでログインできます。")

