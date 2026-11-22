#!/usr/bin/env bash
set -Eeuo pipefail
export SUPPLIER_BASE_URL="http://127.0.0.1:${PORT:-3000}"
children=()
cleanup() {
  trap - EXIT INT TERM
  for pid in "${children[@]}"; do kill -TERM "$pid" 2>/dev/null || true; done
  wait || true
}
trap cleanup EXIT INT TERM
redis-server --bind 127.0.0.1 --port 6379 --save '' --appendonly no --maxmemory 32mb --maxmemory-policy noeviction &
children+=("$!")
temporal server start-dev --ip 127.0.0.1 --port 7233 --db-filename /tmp/hotel-temporal.db --headless --log-level warn &
children+=("$!")
ready=false
for attempt in $(seq 1 90); do
  if temporal operator cluster health --address 127.0.0.1:7233 >/dev/null 2>&1 && redis-cli ping >/dev/null 2>&1; then ready=true; break; fi
  sleep 1
done
if [ "$ready" != true ]; then echo 'Dependencies failed to start' >&2; exit 1; fi
node --max-old-space-size=96 dist/server.js &
children+=("$!")
node --max-old-space-size=160 dist/worker.js &
children+=("$!")
# Any child exit restarts the entire demo rather than leaving a misleadingly
# live HTTP process without its worker, Redis, or orchestration server.
set +e
wait -n
exit 1
