#!/usr/bin/env bash
# P0 acceptance tests — requires infra + all services running.
set -euo pipefail

ADMIN="${ADMIN_URL:-http://localhost:3002}"
INGEST="${INGEST_URL:-http://localhost:3001}"
QUERY="${QUERY_URL:-http://localhost:3003}"

PASS=0
FAIL=0

ok() { echo "✅ PASS: $1"; PASS=$((PASS + 1)); }
bad() { echo "❌ FAIL: $1"; FAIL=$((FAIL + 1)); }

rand() { openssl rand -hex 4; }

echo "=== P0 Acceptance Tests ==="
echo "admin=$ADMIN ingest=$INGEST query=$QUERY"
echo

# --- Test 1: full loop ---
echo "--- Test 1: register → org → project → key → ingest → search ---"
EMAIL="p0-$(rand)@test.local"
PASSWD="password123"
curl -sf -X POST "$ADMIN/v1/auth/register" \
  -H "Content-Type: application/json" \
  -d "{\"email\":\"$EMAIL\",\"password\":\"$PASSWD\"}" >/dev/null

TOKEN=$(curl -sf -X POST "$ADMIN/v1/auth/login" \
  -H "Content-Type: application/json" \
  -d "{\"email\":\"$EMAIL\",\"password\":\"$PASSWD\"}" \
  | python3 -c "import sys,json; print(json.load(sys.stdin)['accessToken'])")

ORG_ID=$(curl -sf -X POST "$ADMIN/v1/orgs" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"name":"P0 Org"}' \
  | python3 -c "import sys,json; print(json.load(sys.stdin)['id'])")

PROJECT_ID=$(curl -sf -X POST "$ADMIN/v1/orgs/$ORG_ID/projects" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"name":"P0 Project","slug":"p0-'$(rand)'"}' \
  | python3 -c "import sys,json; print(json.load(sys.stdin)['id'])")

API_KEY=$(curl -sf -X POST "$ADMIN/v1/projects/$PROJECT_ID/api-keys" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"name":"p0-key"}' \
  | python3 -c "import sys,json; print(json.load(sys.stdin)['secret'])")

EVENT_ID=$(python3 -c "import uuid; print(uuid.uuid4())")
MSG="p0-acceptance-$(rand)"

HTTP=$(curl -s -o /tmp/p0-ingest.json -w "%{http_code}" -X POST "$INGEST/v1/logs" \
  -H "Authorization: Bearer $API_KEY" \
  -H "Content-Type: application/json" \
  -d "{\"events\":[{\"level\":\"info\",\"message\":\"$MSG\",\"eventId\":\"$EVENT_ID\"}]}")

if [ "$HTTP" = "202" ]; then
  sleep 3
  COUNT=$(curl -sf -X POST "$QUERY/v1/projects/$PROJECT_ID/logs/search" \
    -H "Authorization: Bearer $TOKEN" \
    -H "Content-Type: application/json" \
    -d "{\"from\":\"2020-01-01T00:00:00.000Z\",\"to\":\"2030-01-01T00:00:00.000Z\",\"query\":\"$MSG\",\"limit\":10}" \
    | python3 -c "import sys,json; print(len(json.load(sys.stdin).get('events',[])))")
  if [ "$COUNT" -ge 1 ]; then ok "full loop — search returned $COUNT event(s)"
  else bad "full loop — ingest 202 but search returned 0 events"; fi
else
  bad "full loop — ingest returned HTTP $HTTP"
fi

# --- Test 2: bad API key ---
echo "--- Test 2: bad API key → 401 ---"
HTTP=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$INGEST/v1/logs" \
  -H "Authorization: Bearer mmt_live_deadbeefdead_mmt_live_deadbeefdeadbeefdeadbeefdeadbeefdeadbeef" \
  -H "Content-Type: application/json" \
  -d '{"events":[{"level":"info","message":"x","eventId":"00000000-0000-0000-0000-000000000001"}]}')
if [ "$HTTP" = "401" ]; then ok "bad API key → 401"
else bad "bad API key → expected 401 got $HTTP"; fi

# --- Test 3: over quota → 429 ---
echo "--- Test 3: over hard quota → 429 + Retry-After ---"
DAY=$(date -u +%Y-%m-%d)
docker exec mmt-redis redis-cli SET "usage:${PROJECT_ID}:${DAY}" 99999 EX 172800 >/dev/null
HTTP=$(curl -s -D /tmp/p0-headers.txt -o /tmp/p0-quota.json -w "%{http_code}" -X POST "$INGEST/v1/logs" \
  -H "Authorization: Bearer $API_KEY" \
  -H "Content-Type: application/json" \
  -d "{\"events\":[{\"level\":\"info\",\"message\":\"quota\",\"eventId\":\"$(python3 -c 'import uuid; print(uuid.uuid4())')\"},{\"level\":\"info\",\"message\":\"quota2\",\"eventId\":\"$(python3 -c 'import uuid; print(uuid.uuid4())')\"}]}")
RETRY=$(grep -i '^retry-after:' /tmp/p0-headers.txt | tr -d '\r' || true)
docker exec mmt-redis redis-cli DEL "usage:${PROJECT_ID}:${DAY}" >/dev/null
if [ "$HTTP" = "429" ] && [ -n "$RETRY" ]; then ok "quota → 429 with Retry-After"
elif [ "$HTTP" = "429" ]; then bad "quota → 429 but missing Retry-After header"
else bad "quota → expected 429 got $HTTP"; fi

# --- Test 4: duplicate eventId dedup in search ---
echo "--- Test 4: duplicate eventId → search returns 1 row ---"
DUP_ID=$(python3 -c "import uuid; print(uuid.uuid4())")
DUP_MSG="p0-dedup-$(rand)"
for i in 1 2; do
  curl -sf -X POST "$INGEST/v1/logs" \
    -H "Authorization: Bearer $API_KEY" \
    -H "Content-Type: application/json" \
    -d "{\"events\":[{\"level\":\"info\",\"message\":\"$DUP_MSG\",\"eventId\":\"$DUP_ID\"}]}" >/dev/null
done
sleep 3
DUP_COUNT=$(curl -sf -X POST "$QUERY/v1/projects/$PROJECT_ID/logs/search" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d "{\"from\":\"2020-01-01T00:00:00.000Z\",\"to\":\"2030-01-01T00:00:00.000Z\",\"query\":\"$DUP_MSG\",\"limit\":100}" \
  | python3 -c "import sys,json; print(len(json.load(sys.stdin).get('events',[])))")
if [ "$DUP_COUNT" = "1" ]; then ok "duplicate eventId → search returns 1 row"
else bad "duplicate eventId → expected 1 row got $DUP_COUNT"; fi

# --- Test 5: user B → user A project → 403 ---
echo "--- Test 5: user B cannot search user A project → 403 ---"
EMAIL_B="p0b-$(rand)@test.local"
curl -sf -X POST "$ADMIN/v1/auth/register" \
  -H "Content-Type: application/json" \
  -d "{\"email\":\"$EMAIL_B\",\"password\":\"$PASSWD\"}" >/dev/null
TOKEN_B=$(curl -sf -X POST "$ADMIN/v1/auth/login" \
  -H "Content-Type: application/json" \
  -d "{\"email\":\"$EMAIL_B\",\"password\":\"$PASSWD\"}" \
  | python3 -c "import sys,json; print(json.load(sys.stdin)['accessToken'])")
HTTP=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$QUERY/v1/projects/$PROJECT_ID/logs/search" \
  -H "Authorization: Bearer $TOKEN_B" \
  -H "Content-Type: application/json" \
  -d '{"from":"2020-01-01T00:00:00.000Z","to":"2030-01-01T00:00:00.000Z","limit":10}')
if [ "$HTTP" = "403" ]; then ok "user B → user A project → 403"
else bad "user B → expected 403 got $HTTP"; fi

# --- Test 6: ClickHouse down → ingest 202 → recovery ---
echo "--- Test 6: ClickHouse down → ingest 202 → lag drains ---"
CH_MSG="p0-ch-down-$(rand)"
CH_EVENT=$(python3 -c "import uuid; print(uuid.uuid4())")
docker stop mmt-clickhouse >/dev/null
HTTP=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$INGEST/v1/logs" \
  -H "Authorization: Bearer $API_KEY" \
  -H "Content-Type: application/json" \
  -d "{\"events\":[{\"level\":\"info\",\"message\":\"$CH_MSG\",\"eventId\":\"$CH_EVENT\"}]}")
docker start mmt-clickhouse >/dev/null
if [ "$HTTP" = "202" ]; then
  echo "   waiting for ClickHouse + worker to drain (up to 60s)…"
  FOUND=0
  for i in $(seq 1 30); do
    sleep 2
    COUNT=$(curl -sf -X POST "$QUERY/v1/projects/$PROJECT_ID/logs/search" \
      -H "Authorization: Bearer $TOKEN" \
      -H "Content-Type: application/json" \
      -d "{\"from\":\"2020-01-01T00:00:00.000Z\",\"to\":\"2030-01-01T00:00:00.000Z\",\"query\":\"$CH_MSG\",\"limit\":10}" \
      2>/dev/null \
      | python3 -c "import sys,json; print(len(json.load(sys.stdin).get('events',[])))" 2>/dev/null || echo 0)
    if [ "$COUNT" -ge 1 ]; then FOUND=1; break; fi
  done
  if [ "$FOUND" = "1" ]; then ok "CH down → ingest 202 → lag drained, event searchable"
  else bad "CH down → ingest 202 but event not found after restart"; fi
else
  docker start mmt-clickhouse >/dev/null 2>&1 || true
  bad "CH down → expected ingest 202 got $HTTP"; fi

echo
echo "=== Results: $PASS passed, $FAIL failed ==="
[ "$FAIL" -eq 0 ]
