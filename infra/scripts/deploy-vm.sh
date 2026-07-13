#!/bin/bash
# Pull main and rebuild the stack on the azure vm. Called by the Deploy
# workflow over ssh, or by hand if you're on the box.
set -euo pipefail
cd "$(dirname "$0")/../.."

git fetch --quiet origin main
git reset --quiet --hard origin/main

# .env is not in the repo and must survive the reset
[ -f .env ] || { echo "no .env on this box, refusing to deploy" >&2; exit 1; }

docker compose -f docker-compose.azure.yml up -d --build

# give it a moment to bind before we call it a success
for i in $(seq 1 30); do
  if curl -fsS http://localhost/health >/dev/null 2>&1; then
    echo "deployed $(git rev-parse --short HEAD)"
    exit 0
  fi
  sleep 2
done

echo "health check never came up after 60s" >&2
docker compose -f docker-compose.azure.yml logs --tail 30 app >&2
exit 1
