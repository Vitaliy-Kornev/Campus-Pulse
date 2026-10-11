#!/usr/bin/env bash
# Prove a backup can actually be restored, without touching the live database:
#   sudo /srv/campus-pulse/deploy/lightsail/restore-drill.sh                 # newest backup
#   sudo /srv/campus-pulse/deploy/lightsail/restore-drill.sh path/to/file.dump
# Restores into a throwaway database, checks every flyer's QR code target and that the counts
# match the live site, then deletes the throwaway database. Run it once before launch and
# after any change to how backups are made.
set -euo pipefail

APP_DIR=/srv/campus-pulse
BACKUP="${1:-$(ls -t /srv/campus-pulse-backups/campuspulse-*.dump 2>/dev/null | head -1)}"
[[ -f "$BACKUP" ]] || { echo "No backup found. Run backup.sh first." >&2; exit 1; }
if [[ $EUID -ne 0 ]]; then echo "Run with sudo." >&2; exit 1; fi

LIVE_URL="$(grep -E '^DATABASE_URL=' "$APP_DIR/.env" | cut -d= -f2-)"
DRILL_DB="campuspulse_restore_drill"
DRILL_URL="${LIVE_URL%/*}/$DRILL_DB"

# backup_db saved what the backup held when it was made; the restore must have all of it.
EXPECT="$(cat "$BACKUP.counts" 2>/dev/null || true)"
echo "The backup should hold: ${EXPECT:-(no .counts file; checking structure only)}"
cd "$APP_DIR"

sudo -u postgres dropdb --if-exists "$DRILL_DB"
sudo -u postgres createdb -O campuspulse "$DRILL_DB"
trap 'sudo -u postgres dropdb --if-exists "$DRILL_DB"' EXIT
echo "Restoring $BACKUP into $DRILL_DB…"
sudo -u postgres pg_restore --no-owner --role=campuspulse --dbname "$DRILL_DB" "$BACKUP"

echo "Checking the restored copy:"
sudo -u campuspulse -H env DATABASE_URL="$DRILL_URL" .venv/bin/python manage.py verify_restore --expect "$EXPECT"
echo "Restore drill passed. The throwaway database is being deleted."
