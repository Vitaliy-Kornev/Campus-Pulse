#!/usr/bin/env bash
# Run a Django management command as the app user, e.g.
#   sudo /srv/campus-pulse/deploy/lightsail/manage.sh createsuperuser
set -euo pipefail
cd /srv/campus-pulse
exec sudo -u campuspulse -H .venv/bin/python manage.py "$@"
