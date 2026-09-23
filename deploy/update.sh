#!/usr/bin/env bash
# Deploy the latest code to shopjhumka.in. Run as root on the VPS:
#   bash /var/www/shopjhumka.in/app/deploy/update.sh
#
# Touches only Jhumka: its own directory, its own database, its own service.
set -euo pipefail

APP=/var/www/shopjhumka.in/app
USER=jhumka
ENV_FILE=/etc/jhumka.env

[ -d "$APP" ] || { echo "No app at $APP"; exit 1; }
[ -r "$ENV_FILE" ] || { echo "No env file at $ENV_FILE"; exit 1; }

echo "→ Fetching the latest code"
sudo -u "$USER" git -C "$APP" pull --ff-only

echo "→ Installing dependencies"
sudo -u "$USER" bash -c "cd '$APP' && npm ci --include=dev --no-audit --no-fund"

echo "→ Building and applying migrations"
sudo -u "$USER" bash -c "set -a; . '$ENV_FILE'; set +a; cd '$APP' && npm run build && npm run db:migrate"

echo "→ Restarting the service"
systemctl restart jhumka
sleep 3

if systemctl is-active --quiet jhumka && [ "$(curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1:4321/)" = "200" ]; then
  echo "✓ shopjhumka.in updated and serving."
else
  echo "✗ Something is wrong — recent log:"
  journalctl -u jhumka -n 30 --no-pager
  exit 1
fi
