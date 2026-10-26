#!/usr/bin/env bash
# Respaldo diario: pg_dump formato custom + gzip, 7 locales, copia a R2 (si hay remoto rclone "r2").
set -euo pipefail
cd /opt/broadcastflow
DIR=/var/backups/broadcastflow; mkdir -p "$DIR"
F="$DIR/broadcastflow-$(date +%Y%m%d-%H%M%S).dump.gz"
docker compose -f docker-compose.prod.yml exec -T postgres pg_dump -U broadcastflow -d broadcastflow -Fc | gzip -9 > "$F.tmp"
mv "$F.tmp" "$F"; chmod 600 "$F"
ls -1t "$DIR"/broadcastflow-*.dump.gz | tail -n +8 | xargs -r rm -f
if rclone listremotes 2>/dev/null | grep -q '^r2:'; then
  rclone copy "$F" r2:broadcastflow-backups/daily/ --s3-no-check-bucket
fi
echo "ok $F"
