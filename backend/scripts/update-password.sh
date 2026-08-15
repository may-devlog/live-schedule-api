#!/bin/bash
# 本番環境（AWS EC2）のユーザーパスワードを更新するスクリプト
# 使用方法: EC2_INSTANCE_ID=i-xxxxxxxxxxxx ./update-password.sh <email> <password>
#
# 本番のSQLiteデータベースはEC2インスタンス上にあるため、AWS SSM経由で
# EC2上のcreate_userバイナリを直接実行してデータベースを更新します
# （.github/workflows/backup-db.yml と同じDATABASE_URL解決方法を使用）。
# 実行にはAWS CLIの設定と、対象EC2インスタンスへのSSM実行権限が必要です。

set -euo pipefail

if [ $# -ne 2 ]; then
    echo "使用方法: $0 <email> <password>"
    echo "例: $0 may04re@gmail.com newpassword123"
    exit 1
fi

EMAIL="$1"
PASSWORD="$2"

if [ -z "${EC2_INSTANCE_ID:-}" ]; then
    echo "エラー: 環境変数 EC2_INSTANCE_ID を設定してください（対象EC2インスタンスID）"
    exit 1
fi

echo "本番環境のユーザーパスワードを更新します"
echo "メールアドレス: $EMAIL"
echo "対象インスタンス: $EC2_INSTANCE_ID"
echo "警告: 本番環境のデータベースが直接更新されます。続行しますか？ (y/N)"
read -r response
if [[ ! "$response" =~ ^[Yy]$ ]]; then
    echo "更新をキャンセルしました"
    exit 0
fi

REMOTE_COMMAND=$(cat <<EOF
set -euo pipefail
SERVICE="live-schedule-api"
MAIN_PID="\$(systemctl show "\$SERVICE" --property=MainPID --value)"
WORKING_DIR="\$(systemctl show "\$SERVICE" --property=WorkingDirectory --value)"
if [[ -z "\$MAIN_PID" || "\$MAIN_PID" == "0" ]]; then
  echo "\$SERVICE service is not running." >&2
  exit 1
fi
DATABASE_URL="\$(tr '\0' '\n' < "/proc/\$MAIN_PID/environ" | sed -n 's/^DATABASE_URL=//p' | head -n 1)"
cd "\$WORKING_DIR"
DATABASE_URL="\$DATABASE_URL" ./target/release/create_user "$EMAIL" "$PASSWORD"
EOF
)

PARAMETERS="$(jq -n --arg command "$REMOTE_COMMAND" '{commands: [$command]}')"
COMMAND_ID="$(
  aws ssm send-command \
    --instance-ids "$EC2_INSTANCE_ID" \
    --document-name "AWS-RunShellScript" \
    --comment "Update live-schedule-api user password" \
    --parameters "$PARAMETERS" \
    --query "Command.CommandId" \
    --output text
)"
echo "SSM command ID: $COMMAND_ID"

aws ssm wait command-executed \
  --command-id "$COMMAND_ID" \
  --instance-id "$EC2_INSTANCE_ID"

aws ssm get-command-invocation \
  --command-id "$COMMAND_ID" \
  --instance-id "$EC2_INSTANCE_ID" \
  --query '{Status:Status,StandardOutput:StandardOutputContent,StandardError:StandardErrorContent}'
