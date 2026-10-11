#!/usr/bin/env bash
# Nightly database backup (run by campuspulse-backup.timer; safe to run by hand):
#   sudo /srv/campus-pulse/deploy/lightsail/backup.sh
# Keeps 14 days on the server. If BACKUP_S3_URI is set in .env (e.g. s3://my-bucket/campus-pulse)
# and the AWS CLI is installed, each backup is also copied off the server, which survives losing
# the whole instance.
set -euo pipefail

APP_DIR=/srv/campus-pulse
BACKUP_DIR=/srv/campus-pulse-backups
install -d -o campuspulse -g campuspulse -m 700 "$BACKUP_DIR"

FILE="$(sudo -u campuspulse -H "$APP_DIR/.venv/bin/python" "$APP_DIR/manage.py" backup_db --dir "$BACKUP_DIR" --keep 14)"
echo "Backed up to $FILE ($(du -h "$FILE" | cut -f1))"

S3_URI="$(grep -E '^BACKUP_S3_URI=' "$APP_DIR/.env" | cut -d= -f2- || true)"
if [[ -n "$S3_URI" ]]; then
  aws s3 cp --only-show-errors "$FILE" "${S3_URI%/}/$(basename "$FILE")"
  echo "Copied to ${S3_URI%/}/"
fi
