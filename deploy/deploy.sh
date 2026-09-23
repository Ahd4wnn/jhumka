#!/usr/bin/env bash
# Update the live shop: pull, install, build, migrate, restart. Run as the jhumka user:
#   /opt/jhumka/deploy/deploy.sh
set -euo pipefail
cd /opt/jhumka
set -a; source /etc/jhumka.env; set +a

git pull --ff-only
npm ci --no-audit --no-fund
npm run build
npm run db:migrate
sudo systemctl restart jhumka
sleep 2
systemctl is-active --quiet jhumka && echo "✓ Jhumka is live." || (journalctl -u jhumka -n 50 --no-pager; exit 1)
