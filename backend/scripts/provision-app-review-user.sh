#!/bin/bash

# App Store Connect の審査専用ユーザーを、一般ユーザー登録を開放せずに
# 本番 SQLite データベースへ作成する。

set -euo pipefail

INSTANCE_ID="${EC2_INSTANCE_ID:?EC2_INSTANCE_ID を設定してください}"
AWS_REGION="${AWS_REGION:-ap-northeast-1}"
REVIEW_EMAIL="${REVIEW_EMAIL:-app-review@genbgt.com}"
REVIEW_SHARE_ID="${REVIEW_SHARE_ID:-app-review}"
REVIEW_PASSWORD="${REVIEW_PASSWORD:-Review9$(openssl rand -hex 12)}"

REMOTE_COMMAND=$(jq -n -r \
  --arg email "$REVIEW_EMAIL" \
  --arg share_id "$REVIEW_SHARE_ID" \
  --arg password "$REVIEW_PASSWORD" '
    "set -euo pipefail\n" +
    "SERVICE=live-schedule-api\n" +
    "MAIN_PID=$(systemctl show $SERVICE --property=MainPID --value)\n" +
    "WORKING_DIR=$(systemctl show $SERVICE --property=WorkingDirectory --value)\n" +
    "DATABASE_URL=$(tr \"\\0\" \"\\n\" < /proc/$MAIN_PID/environ | sed -n \"s/^DATABASE_URL=//p\" | head -n 1)\n" +
    "REVIEW_EMAIL=" + ($email | @sh) + "\n" +
    "REVIEW_SHARE_ID=" + ($share_id | @sh) + "\n" +
    "cd $WORKING_DIR\n" +
    "DATABASE_URL=$DATABASE_URL ./target/release/create_user " + ($email | @sh) + " " + ($password | @sh) + "\n" +
    "DB_FILE=${DATABASE_URL#sqlite:}\n" +
    "sqlite3 $DB_FILE \"UPDATE users SET share_id='\''$REVIEW_SHARE_ID'\'', display_name='\''App Review'\'', sharing_enabled=0, plan='\''premium'\'', premium_started_at=COALESCE(premium_started_at, datetime('\''now'\'')), updated_at=datetime('\''now'\'') WHERE email='\''$REVIEW_EMAIL'\'';\"\n" +
    "sqlite3 $DB_FILE \"SELECT email, email_verified, share_id, display_name, sharing_enabled, plan FROM users WHERE email='\''$REVIEW_EMAIL'\'';\""
  ')

PARAMETERS=$(jq -n --arg command "$REMOTE_COMMAND" '{commands: [$command]}')
COMMAND_ID=$(
  aws ssm send-command \
    --region "$AWS_REGION" \
    --instance-ids "$INSTANCE_ID" \
    --document-name AWS-RunShellScript \
    --comment "Create App Store review user" \
    --parameters "$PARAMETERS" \
    --query 'Command.CommandId' \
    --output text
)

aws ssm wait command-executed \
  --region "$AWS_REGION" \
  --command-id "$COMMAND_ID" \
  --instance-id "$INSTANCE_ID"

aws ssm get-command-invocation \
  --region "$AWS_REGION" \
  --command-id "$COMMAND_ID" \
  --instance-id "$INSTANCE_ID" \
  --query '{Status:Status,StandardOutput:StandardOutputContent,StandardError:StandardErrorContent}'

LOGIN_STATUS=$(curl -sS -o /dev/null -w '%{http_code}' \
  -H 'Content-Type: application/json' \
  -d "$(jq -n --arg email "$REVIEW_EMAIL" --arg password "$REVIEW_PASSWORD" '{email:$email,password:$password}')" \
  https://api.genbgt.com/auth/login)

if [[ "$LOGIN_STATUS" != "200" ]]; then
  echo "ログイン検証に失敗しました (HTTP $LOGIN_STATUS)" >&2
  exit 1
fi

printf 'REVIEW_EMAIL=%s\n' "$REVIEW_EMAIL"
printf 'REVIEW_PASSWORD=%s\n' "$REVIEW_PASSWORD"
printf 'LOGIN_HTTP_STATUS=%s\n' "$LOGIN_STATUS"
