#!/usr/bin/env bash
# Connect the Lightsail server to the AWS services provision.sh created. Paste the exact command
# provision.sh printed; it looks like:
#
#   sudo /srv/campus-pulse/deploy/aws/connect-server.sh AWS_REGION=us-east-2 AWS_ACCESS_KEY_ID=... ...
#
# Installs the AWS CLI (for nightly backups to S3) and the CloudWatch agent (ships the app's log so
# errors email you), writes the email, map, and backup settings into .env, and restarts the app.
# Safe to re-run, e.g. with a new access key.
set -euo pipefail

if [[ $EUID -ne 0 ]]; then echo "Run with sudo." >&2; exit 1; fi
for arg in "$@"; do
  [[ "$arg" == *=* ]] || { echo "Expected KEY=value, got: $arg" >&2; exit 2; }
  declare "${arg%%=*}=${arg#*=}"
done
: "${AWS_REGION:?}" "${AWS_ACCESS_KEY_ID:?}" "${AWS_SECRET_ACCESS_KEY:?}" "${EMAIL_HOST_PASSWORD:?}"
: "${AWS_LOCATION_API_KEY:?}" "${BACKUP_S3_URI:?}" "${LOG_GROUP:?}" "${DOMAIN:?}"

APP_DIR=/srv/campus-pulse
APP_USER=campuspulse
ENV_FILE="$APP_DIR/.env"
LOG_DIR=/var/log/campuspulse
step() { printf '\n\033[1;34m==> %s\033[0m\n' "$*"; }

# Replace KEY in .env (or add it), without echoing secrets.
set_env() {
  local key="$1" value="$2"
  sed -i "/^#\? *$key=/d" "$ENV_FILE"
  printf '%s=%s\n' "$key" "$value" >> "$ENV_FILE"
}

step "Saving AWS credentials for backups and the log agent (readable by root only)"
install -d -m 700 /root/.aws
cat > /root/.aws/credentials <<CREDS
[default]
aws_access_key_id = $AWS_ACCESS_KEY_ID
aws_secret_access_key = $AWS_SECRET_ACCESS_KEY

[AmazonCloudWatchAgent]
aws_access_key_id = $AWS_ACCESS_KEY_ID
aws_secret_access_key = $AWS_SECRET_ACCESS_KEY
CREDS
printf '[default]\nregion = %s\n\n[profile AmazonCloudWatchAgent]\nregion = %s\n' "$AWS_REGION" "$AWS_REGION" > /root/.aws/config
chmod 600 /root/.aws/credentials /root/.aws/config

step "Installing the AWS CLI"
command -v aws >/dev/null || [[ -x /snap/bin/aws ]] || snap install aws-cli --classic

step "Writing settings to .env"
set_env AWS_REGION "$AWS_REGION"
set_env AWS_LOCATION_API_KEY "$AWS_LOCATION_API_KEY"
set_env EMAIL_HOST "email-smtp.$AWS_REGION.amazonaws.com"
set_env EMAIL_HOST_USER "$AWS_ACCESS_KEY_ID"
set_env EMAIL_HOST_PASSWORD "$EMAIL_HOST_PASSWORD"
set_env DEFAULT_FROM_EMAIL "Campus Pulse <noreply@$DOMAIN>"
set_env BACKUP_S3_URI "$BACKUP_S3_URI"
set_env LOG_FILE "$LOG_DIR/app.log"
chown "$APP_USER:$APP_USER" "$ENV_FILE"
chmod 600 "$ENV_FILE"

step "App log file, rotated daily"
install -d -o "$APP_USER" -g "$APP_USER" -m 750 "$LOG_DIR"
cat > /etc/logrotate.d/campuspulse <<ROTATE
$LOG_DIR/*.log {
    daily
    rotate 14
    compress
    delaycompress
    missingok
    notifempty
    create 640 $APP_USER $APP_USER
}
ROTATE

step "Installing the CloudWatch agent"
if [[ ! -x /opt/aws/amazon-cloudwatch-agent/bin/amazon-cloudwatch-agent-ctl ]]; then
  ARCH="$(dpkg --print-architecture)"
  curl -4 -fsSL --max-time 120 "https://amazoncloudwatch-agent.s3.amazonaws.com/ubuntu/$ARCH/latest/amazon-cloudwatch-agent.deb" -o /tmp/cwagent.deb
  dpkg -i -E /tmp/cwagent.deb >/dev/null
  rm -f /tmp/cwagent.deb
fi
cat > /opt/aws/amazon-cloudwatch-agent/etc/common-config.toml <<TOML
[credentials]
  shared_credential_profile = "AmazonCloudWatchAgent"
  shared_credential_file = "/root/.aws/credentials"
TOML
cat > /opt/aws/amazon-cloudwatch-agent/etc/campus-pulse.json <<JSON
{
  "agent": {"region": "$AWS_REGION", "run_as_user": "root"},
  "logs": {"logs_collected": {"files": {"collect_list": [
    {"file_path": "$LOG_DIR/app.log", "log_group_name": "$LOG_GROUP", "log_stream_name": "{hostname}", "timezone": "UTC"}
  ]}}}
}
JSON
/opt/aws/amazon-cloudwatch-agent/bin/amazon-cloudwatch-agent-ctl -a fetch-config -m onPremise -s \
  -c file:/opt/aws/amazon-cloudwatch-agent/etc/campus-pulse.json >/dev/null

step "Restarting Campus Pulse"
systemctl restart campuspulse
sleep 3
curl -fsS "http://127.0.0.1:8000/healthz" -H "Host: $DOMAIN" >/dev/null && echo "App is up."

step "Taking a first backup to S3"
/srv/campus-pulse/deploy/lightsail/backup.sh

cat <<DONE

Connected. To check everything works:
  - Map: open https://$DOMAIN/map (Amazon Location map under the board tags).
  - Email: use "Forgot password" with your address. Until SES production access is approved,
    AWS only delivers to addresses verified in the SES console.
  - Logs: CloudWatch, then Log groups, then $LOG_GROUP.
  - Backups: listed under $BACKUP_S3_URI in the S3 console.
DONE
