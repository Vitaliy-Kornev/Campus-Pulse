#!/usr/bin/env bash
# Deploy the latest code: pull, install dependencies, build the frontend, migrate, collect static, restart.
#   sudo /srv/campus-pulse/deploy/lightsail/deploy.sh
set -euo pipefail

APP_DIR=/srv/campus-pulse
APP_USER=campuspulse
PULL=1
RESTART=1
for arg in "$@"; do
  case "$arg" in
    --no-pull) PULL=0 ;;
    --no-restart) RESTART=0 ;;
    *) echo "Unknown option: $arg" >&2; exit 2 ;;
  esac
done
if [[ $EUID -ne 0 ]]; then echo "Run with sudo." >&2; exit 1; fi
as_app() { sudo -u "$APP_USER" -H "$@"; }

cd "$APP_DIR"
if [[ $PULL -eq 1 ]]; then
  as_app git pull --ff-only
fi
[[ -d .venv ]] || as_app python3 -m venv .venv
as_app .venv/bin/pip install --quiet --upgrade pip
as_app .venv/bin/pip install --quiet -r requirements.txt
(cd frontend && as_app npm ci --no-audit --no-fund --loglevel=error && as_app npm run build)
as_app .venv/bin/python manage.py migrate --noinput
as_app .venv/bin/python manage.py collectstatic --noinput --verbosity 0
as_app .venv/bin/python manage.py check --deploy --fail-level ERROR

# Drop requests for other hostnames before they reach the app (servers set up before this existed).
if [[ ! -e /etc/nginx/sites-enabled/campuspulse-default ]] || ! cmp -s deploy/lightsail/nginx-default.conf /etc/nginx/sites-available/campuspulse-default; then
  install -m 644 deploy/lightsail/nginx-default.conf /etc/nginx/sites-available/campuspulse-default
  ln -sf /etc/nginx/sites-available/campuspulse-default /etc/nginx/sites-enabled/campuspulse-default
  if nginx -t 2>/dev/null; then
    systemctl reload nginx
  else
    rm -f /etc/nginx/sites-enabled/campuspulse-default
    echo "Warning: nginx rejected the catch-all config, so it was left out. Check: sudo nginx -t" >&2
  fi
fi

if [[ $RESTART -eq 1 ]]; then
  systemctl restart campuspulse
  echo "Deployed $(as_app git log -1 --format='%h %s')"
fi
