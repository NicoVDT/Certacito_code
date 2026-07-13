#!/bin/bash
# Certacito deploy script - rebuild frontend + restart all services
set -e
repo="$(cd "$(dirname "$0")/../.." && pwd)"
echo "[deploy] Building frontend..."
cd "$repo/frontend"
npx vite build 2>&1 | tail -2

echo "[deploy] Deploying to nginx..."
rm -rf /var/www/certacito/*
cp -r dist/* /var/www/certacito/
chown -R www-data:www-data /var/www/certacito
sed -i 's|<title>Project Assignment Task</title>|<title>Certacito.ai - AI Governance Platform</title>|' /var/www/certacito/index.html

echo "[deploy] Restarting API..."
systemctl restart certacito-api

echo "[deploy] Verifying..."
# uvicorn takes ~15s to come up, don't false-alarm
api_ok=0
for i in $(seq 1 20); do
  if curl -sf http://localhost:8000/health > /dev/null; then api_ok=1; break; fi
  sleep 2
done
[ "$api_ok" = "1" ] && echo "[deploy] API: OK" || echo "[deploy] API: FAILED"
curl -sf http://localhost/ > /dev/null && echo "[deploy] Frontend: OK" || echo "[deploy] Frontend: FAILED"

echo "[deploy] Done!"
