#!/usr/bin/env bash
# Nightly backup: database dump + product photos, kept for 14 days.
# Installed as /opt/jhumka/deploy/backup.sh and run by jhumka-backup.timer.
set -euo pipefail
set -a; source /etc/jhumka.env; set +a

DEST=/var/backups/jhumka
STAMP=$(date +%Y%m%d-%H%M)
mkdir -p "$DEST/db" "$DEST/media"

pg_dump --format=custom --no-owner --dbname="$DATABASE_URL" --file="$DEST/db/jhumka-$STAMP.dump"
rsync -a --delete /var/lib/jhumka/media/ "$DEST/media/"

find "$DEST/db" -name 'jhumka-*.dump' -mtime +14 -delete
echo "Backup complete: $DEST/db/jhumka-$STAMP.dump"
