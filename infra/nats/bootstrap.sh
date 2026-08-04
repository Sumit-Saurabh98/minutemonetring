#!/usr/bin/env bash
set -euo pipefail

NATS_URL="${NATS_URL:-nats://localhost:4222}"

echo "Creating LOGS stream..."
if nats stream info LOGS --server "$NATS_URL" >/dev/null 2>&1; then
  echo "Stream LOGS already exists — skipping"
else
  nats stream add LOGS \
    --server "$NATS_URL" \
    --subjects "logs.ingest.>" \
    --storage file \
    --retention limits \
    --max-age 72h \
    --defaults
fi

echo "Creating log-writers consumer..."
if nats consumer info LOGS log-writers --server "$NATS_URL" >/dev/null 2>&1; then
  echo "Consumer log-writers already exists — skipping"
else
  nats consumer add LOGS log-writers \
    --server "$NATS_URL" \
    --filter "logs.ingest.>" \
    --ack explicit \
    --pull \
    --deliver all \
    --max-deliver 10 \
    --wait 30s \
    --defaults
fi

echo "Done."
nats stream info LOGS --server "$NATS_URL"
nats consumer info LOGS log-writers --server "$NATS_URL"
