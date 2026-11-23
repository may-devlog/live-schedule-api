#!/bin/bash

# App Store の審査完了後に、審査専用ユーザーとそのデータを削除し、
# 審査データで進んだ SQLite の AUTOINCREMENT を現存データの最大値へ戻す。

set -euo pipefail

INSTANCE_ID="${EC2_INSTANCE_ID:?EC2_INSTANCE_ID を設定してください}"
AWS_REGION="${AWS_REGION:-ap-northeast-1}"
REVIEW_EMAIL="${REVIEW_EMAIL:-app-review@genbgt.com}"

printf '本番環境から %s と関連データを削除します。\n' "$REVIEW_EMAIL"
printf '実行するにはメールアドレスをもう一度入力してください: '
read -r confirmation
if [[ "$confirmation" != "$REVIEW_EMAIL" ]]; then
  echo "一致しないため中止しました。"
  exit 1
fi

REMOTE_COMMAND=$(jq -n -r --arg email "$REVIEW_EMAIL" '
  "set -euo pipefail\n" +
  "SERVICE=live-schedule-api\n" +
  "MAIN_PID=$(systemctl show $SERVICE --property=MainPID --value)\n" +
  "WORKING_DIR=$(systemctl show $SERVICE --property=WorkingDirectory --value)\n" +
  "DATABASE_URL=$(tr \"\\0\" \"\\n\" < /proc/$MAIN_PID/environ | sed -n \"s/^DATABASE_URL=//p\" | head -n 1)\n" +
  "REVIEW_EMAIL=" + ($email | @sh) + "\n" +
  "DB_FILE=${DATABASE_URL#sqlite:}\n" +
  "REVIEW_USER_ID=$(sqlite3 $DB_FILE \"SELECT id FROM users WHERE email='\''$REVIEW_EMAIL'\'';\")\n" +
  "test -n $REVIEW_USER_ID\n" +
  "BACKUP_FILE=$DB_FILE.app-review-cleanup-$(date +%Y%m%d-%H%M%S).bak\n" +
  "sqlite3 $DB_FILE \".backup $BACKUP_FILE\"\n" +
  "sqlite3 $DB_FILE \"PRAGMA foreign_keys=ON; BEGIN IMMEDIATE; " +
    "DELETE FROM traffics WHERE schedule_id IN (SELECT id FROM schedules WHERE user_id=$REVIEW_USER_ID) OR owner_user_id=$REVIEW_USER_ID; " +
    "DELETE FROM stays WHERE schedule_id IN (SELECT id FROM schedules WHERE user_id=$REVIEW_USER_ID) OR owner_user_id=$REVIEW_USER_ID; " +
    "DELETE FROM notifications WHERE user_id=$REVIEW_USER_ID; " +
    "DELETE FROM push_tokens WHERE user_id=$REVIEW_USER_ID; " +
    "DELETE FROM masked_locations WHERE user_id=$REVIEW_USER_ID; " +
    "DELETE FROM select_options WHERE user_id=$REVIEW_USER_ID; " +
    "DELETE FROM stay_select_options WHERE user_id=$REVIEW_USER_ID; " +
    "DELETE FROM subscriptions WHERE user_id=$REVIEW_USER_ID; " +
    "DELETE FROM schedules WHERE user_id=$REVIEW_USER_ID; " +
    "DELETE FROM users WHERE id=$REVIEW_USER_ID; " +
    "UPDATE sqlite_sequence SET seq=COALESCE((SELECT MAX(id) FROM users),0) WHERE name='\''users'\''; " +
    "UPDATE sqlite_sequence SET seq=COALESCE((SELECT MAX(id) FROM schedules),0) WHERE name='\''schedules'\''; " +
    "UPDATE sqlite_sequence SET seq=COALESCE((SELECT MAX(id) FROM traffics),0) WHERE name='\''traffics'\''; " +
    "UPDATE sqlite_sequence SET seq=COALESCE((SELECT MAX(id) FROM stays),0) WHERE name='\''stays'\''; " +
    "UPDATE sqlite_sequence SET seq=COALESCE((SELECT MAX(id) FROM notifications),0) WHERE name='\''notifications'\''; " +
    "UPDATE sqlite_sequence SET seq=COALESCE((SELECT MAX(id) FROM push_tokens),0) WHERE name='\''push_tokens'\''; " +
    "UPDATE sqlite_sequence SET seq=COALESCE((SELECT MAX(id) FROM masked_locations),0) WHERE name='\''masked_locations'\''; " +
    "UPDATE sqlite_sequence SET seq=COALESCE((SELECT MAX(id) FROM subscriptions),0) WHERE name='\''subscriptions'\''; " +
    "COMMIT;\"\n" +
  "echo BACKUP_FILE=$BACKUP_FILE\n" +
  "sqlite3 $DB_FILE \"SELECT COUNT(*) FROM users WHERE email='\''$REVIEW_EMAIL'\''; SELECT seq FROM sqlite_sequence WHERE name='\''users'\'';\""
')

PARAMETERS=$(jq -n --arg command "$REMOTE_COMMAND" '{commands: [$command]}')
COMMAND_ID=$(
  aws ssm send-command \
    --region "$AWS_REGION" \
    --instance-ids "$INSTANCE_ID" \
    --document-name AWS-RunShellScript \
    --comment "Remove App Store review user" \
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
