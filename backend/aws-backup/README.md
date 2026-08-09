# AWS database backup

The `Database Backup (AWS)` GitHub Actions workflow creates a consistent online
backup of the SQLite database on EC2, checks it with `PRAGMA integrity_check`,
compresses it, and uploads the backup plus its SHA-256 checksum to a private S3
bucket. No database file passes through GitHub and no long-lived AWS key is used.

## One-time setup

Prerequisites:

- The EC2 instance is managed by Systems Manager and has AWS CLI installed.
- The repository's `AWS_ROLE_ARN`, `AWS_REGION`, and `EC2_INSTANCE_ID` secrets used
  by the deploy workflow are working.
- You know the name of the IAM role attached to the EC2 instance. In the EC2
  console it is the instance's IAM role (not its instance profile name).

Deploy the backup bucket and attach its least-privilege policy to the EC2 role:

```bash
aws cloudformation deploy \
  --region ap-northeast-1 \
  --stack-name live-schedule-api-backup \
  --template-file backend/aws-backup/cloudformation.yml \
  --capabilities CAPABILITY_NAMED_IAM \
  --parameter-overrides Ec2InstanceRoleName=YOUR_EC2_ROLE_NAME RetentionDays=30
```

Get the generated bucket name:

```bash
aws cloudformation describe-stacks \
  --region ap-northeast-1 \
  --stack-name live-schedule-api-backup \
  --query 'Stacks[0].Outputs[?OutputKey==`BackupBucketName`].OutputValue' \
  --output text
```

In GitHub, open **Settings > Secrets and variables > Actions > Variables**, add
`AWS_BACKUP_BUCKET`, and set it to that bucket name. Then run **Database Backup
(AWS)** manually once. Confirm that the run logs end with `Backup completed`.

After the first successful AWS backup, delete the obsolete repository secrets
`FLY_API_TOKEN`, `B2_APPLICATION_KEY_ID`, `B2_APPLICATION_KEY`, and
`B2_BUCKET_NAME` if no other workflow uses them.

## Storage and retention

Objects are private, encrypted with S3-managed encryption, and rejected over
non-TLS connections. They are stored under:

```text
s3://BUCKET/database/YYYY/MM/app.db.YYYYMMDDTHHMMSSZ.gz
s3://BUCKET/database/YYYY/MM/app.db.YYYYMMDDTHHMMSSZ.gz.sha256
```

The default retention is 30 days. CloudFormation retains the bucket if the stack
is deleted, protecting backups from accidental stack deletion.

## Restore drill

Download a backup and its checksum on a trusted machine with S3 read access:

```bash
aws s3 cp s3://BUCKET/database/YYYY/MM/app.db.TIMESTAMP.gz .
aws s3 cp s3://BUCKET/database/YYYY/MM/app.db.TIMESTAMP.gz.sha256 .
sha256sum --check app.db.TIMESTAMP.gz.sha256
gunzip --keep app.db.TIMESTAMP.gz
sqlite3 app.db.TIMESTAMP 'PRAGMA integrity_check;'
```

The last command must print `ok`. Restoring it to production is intentionally a
separate maintenance operation: stop `live-schedule-api`, preserve the current
database, replace it with the verified file using the same owner and mode, and
then start the service. Do not overwrite a running SQLite database.

Run a restore drill periodically; an upload alone does not prove recoverability.
