#!/usr/bin/env bash
# One-time server setup for Campus Pulse on an AWS Lightsail Ubuntu 24.04 instance.
#
#   sudo DOMAIN=campuspulse.app LE_EMAIL=you@example.com bash setup.sh
#
# Installs Python, Node.js, PostgreSQL, nginx, and certbot; clones the app; creates the database and
# .env; imports the UMN boards; starts gunicorn under systemd; and gets an HTTPS certificate.
# Safe to re-run: existing database, .env, and certificate are kept.
set -euo pipefail

DOMAIN="${DOMAIN:?Set DOMAIN, e.g. DOMAIN=campuspulse.app}"
# No apostrophes inside ${...:?}: bash treats them as quotes there.
LE_EMAIL="${LE_EMAIL:?Set LE_EMAIL, the email for HTTPS certificate expiry notices}"
REPO_URL="${REPO_URL:-https://github.com/Vitaliy-Kornev/Campus-Pulse.git}"
BRANCH="${BRANCH:-main}"
TIME_ZONE="${TIME_ZONE:-America/Chicago}"
APP_DIR=/srv/campus-pulse
APP_USER=campuspulse

if [[ $EUID -ne 0 ]]; then echo "Run with sudo." >&2; exit 1; fi
step() { printf '\n\033[1;34m==> %s\033[0m\n' "$*"; }

# Prefer IPv4 for every download (apt, git, pip, npm, curl). Where a server's IPv6 isn't routed,
# programs otherwise try IPv6 first and can hang for minutes per request.
if ! grep -q '^precedence ::ffff:0:0/96' /etc/gai.conf 2>/dev/null; then
  echo 'precedence ::ffff:0:0/96  100' >> /etc/gai.conf
fi

step "Checking that $DOMAIN points at this server"
# This server's public IPv4 address, from whichever lookup answers first (IPv4 only, short
# timeouts: on servers without working IPv6, curl can otherwise hang for minutes).
SERVER_IP=""
for url in https://checkip.amazonaws.com https://api.ipify.org https://ifconfig.me/ip; do
  SERVER_IP="$(curl -4 -fsS --max-time 10 "$url" 2>/dev/null | tr -d '[:space:]' || true)"
  [[ -n "$SERVER_IP" ]] && break
done
DNS_IP="$(getent ahostsv4 "$DOMAIN" | awk 'NR==1 {print $1}' || true)"
if [[ -z "$SERVER_IP" ]]; then
  echo "Couldn't look up this server's public IP; skipping the DNS check (HTTPS setup will fail later if DNS is wrong)." >&2
elif [[ "$DNS_IP" != "$SERVER_IP" ]]; then
  echo "DNS for $DOMAIN resolves to '${DNS_IP:-nothing}', but this server's public IP is $SERVER_IP." >&2
  echo "Create an A record for $DOMAIN pointing to $SERVER_IP (attach a Lightsail static IP first), wait a few minutes, and re-run." >&2
  exit 1
fi

step "Installing system packages"
export DEBIAN_FRONTEND=noninteractive
apt-get update -q
apt-get install -y -q python3 python3-venv python3-dev git nginx postgresql certbot python3-certbot-nginx
python3 -c 'import sys; assert sys.version_info >= (3, 12), "Python 3.12+ required (use Ubuntu 24.04)"'
# The React frontend needs Node.js 20.19+ to build; Ubuntu's own package is older, so use NodeSource.
if ! command -v node >/dev/null || ! node -e 'const [a,b]=process.versions.node.split(".").map(Number); process.exit(a>=22||(a===20&&b>=19)?0:1)'; then
  curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
  apt-get install -y -q nodejs
fi

step "Creating app user and fetching code"
id -u "$APP_USER" >/dev/null 2>&1 || useradd --system --home-dir "$APP_DIR" --shell /usr/sbin/nologin "$APP_USER"
if [[ ! -d "$APP_DIR/.git" ]]; then
  git clone --branch "$BRANCH" "$REPO_URL" "$APP_DIR"
fi
chown -R "$APP_USER:$APP_USER" "$APP_DIR"

step "Setting up PostgreSQL and .env"
ENV_FILE="$APP_DIR/.env"
FIRST_INSTALL=0
if [[ ! -f "$ENV_FILE" ]]; then
  FIRST_INSTALL=1
  DB_PASS="$(openssl rand -hex 24)"
  if sudo -u postgres psql -tAc "SELECT 1 FROM pg_roles WHERE rolname='campuspulse'" | grep -q 1; then
    sudo -u postgres psql -q -c "ALTER ROLE campuspulse WITH LOGIN PASSWORD '$DB_PASS'"
  else
    sudo -u postgres psql -q -c "CREATE ROLE campuspulse WITH LOGIN PASSWORD '$DB_PASS'"
  fi
  sudo -u postgres psql -tAc "SELECT 1 FROM pg_database WHERE datname='campuspulse'" | grep -q 1 \
    || sudo -u postgres createdb -O campuspulse campuspulse
  cat > "$ENV_FILE" <<ENV
DEBUG=False
SECRET_KEY=$(openssl rand -base64 48 | tr -d '\n=+/')
DATABASE_URL=postgres://campuspulse:$DB_PASS@localhost:5432/campuspulse
ALLOWED_HOSTS=$DOMAIN
CSRF_TRUSTED_ORIGINS=https://$DOMAIN
SITE_URL=https://$DOMAIN
TIME_ZONE=$TIME_ZONE
# Email (SES), the map key, S3 backups, and CloudWatch logging are added by
# deploy/aws/connect-server.sh.
ENV
  chown "$APP_USER:$APP_USER" "$ENV_FILE"
  chmod 600 "$ENV_FILE"
  echo "Wrote $ENV_FILE (keep SECRET_KEY unchanged: it also salts visitor hashes)."
else
  echo "Keeping existing $ENV_FILE"
fi

step "Installing dependencies, building the frontend, migrating, collecting static files"
bash "$APP_DIR/deploy/lightsail/deploy.sh" --no-pull --no-restart
if [[ $FIRST_INSTALL -eq 1 ]]; then
  sudo -u "$APP_USER" "$APP_DIR/.venv/bin/python" "$APP_DIR/manage.py" import_boards "$APP_DIR/boards_umn.csv"
fi

step "Starting gunicorn (systemd)"
install -m 644 "$APP_DIR/deploy/lightsail/campuspulse.service" /etc/systemd/system/campuspulse.service
systemctl daemon-reload
systemctl enable --now campuspulse
systemctl restart campuspulse

step "Scheduling nightly database backups"
install -m 644 "$APP_DIR/deploy/lightsail/campuspulse-backup.service" /etc/systemd/system/campuspulse-backup.service
install -m 644 "$APP_DIR/deploy/lightsail/campuspulse-backup.timer" /etc/systemd/system/campuspulse-backup.timer
systemctl daemon-reload
systemctl enable --now campuspulse-backup.timer

step "Configuring nginx"
sed "s/__DOMAIN__/$DOMAIN/g" "$APP_DIR/deploy/lightsail/nginx.conf" > /etc/nginx/sites-available/campuspulse
ln -sf /etc/nginx/sites-available/campuspulse /etc/nginx/sites-enabled/campuspulse
rm -f /etc/nginx/sites-enabled/default
install -m 644 "$APP_DIR/deploy/lightsail/nginx-default.conf" /etc/nginx/sites-available/campuspulse-default
ln -sf /etc/nginx/sites-available/campuspulse-default /etc/nginx/sites-enabled/campuspulse-default
nginx -t
systemctl reload nginx

step "Getting an HTTPS certificate from Let's Encrypt"
certbot --nginx -d "$DOMAIN" --non-interactive --agree-tos -m "$LE_EMAIL" --redirect --keep-until-expiring
systemctl reload nginx

step "Checking the site"
sleep 2
if curl -4 -fsS --max-time 20 "https://$DOMAIN/healthz" >/dev/null; then
  echo "https://$DOMAIN is up."
else
  echo "Health check failed. Logs: sudo journalctl -u campuspulse -n 100" >&2
  exit 1
fi

cat <<DONE

Done. Next:
  1. Paste the connect-server.sh command that provision.sh printed (email, map, backups, alerts).
  2. Create your admin account:
       sudo $APP_DIR/deploy/lightsail/manage.sh createsuperuser
  3. Open https://$DOMAIN, post a flyer, and scan its QR code on cellular data.
  4. Turn on automatic snapshots for this instance in the Lightsail console.
To deploy new code later:
       sudo $APP_DIR/deploy/lightsail/deploy.sh
DONE
