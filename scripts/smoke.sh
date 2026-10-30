#!/usr/bin/env bash
set -euo pipefail

# Smoke test for the compiled API.
#
# Builds the workspace, applies the Prisma migrations to a throwaway sqlite
# database, boots the compiled dist/main.js and checks that the public events
# endpoint answers with 200. This is the check that catches a broken runtime
# import, which the unit test suite cannot see because it loads the TypeScript
# sources.

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
API_DIR="$REPO_ROOT/api"

WORK_DIR="$(mktemp -d "${TMPDIR:-/tmp}/revytechai-vote-smoke.XXXXXX")"
DB_PATH="$WORK_DIR/smoke.db"
SERVER_LOG="$WORK_DIR/server.log"
SERVER_PID=""

cleanup() {
  if [ -n "$SERVER_PID" ] && kill -0 "$SERVER_PID" 2>/dev/null; then
    kill "$SERVER_PID" 2>/dev/null || true
    wait "$SERVER_PID" 2>/dev/null || true
  fi
  rm -rf "$WORK_DIR"
}
trap cleanup EXIT

free_port() {
  node -e "const net = require('net'); const server = net.createServer(); server.listen(0, '127.0.0.1', () => { const port = server.address().port; server.close(() => console.log(port)); });"
}

echo "==> Building the workspace"
pnpm -C "$REPO_ROOT/packages/tally" build
pnpm -C "$API_DIR" build

echo "==> Applying migrations to $DB_PATH"
(cd "$API_DIR" && DATABASE_URL="file:$DB_PATH" npx prisma migrate deploy)

PORT="$(free_port)"
BASE_URL="http://127.0.0.1:$PORT"

echo "==> Booting the API on port $PORT"
(
  cd "$API_DIR"
  exec env PORT="$PORT" DATABASE_URL="file:$DB_PATH" NODE_ENV=development COOKIE_SECURE=false \
    node dist/main.js
) >"$SERVER_LOG" 2>&1 &
SERVER_PID=$!

STATUS=""
for _ in $(seq 1 60); do
  if ! kill -0 "$SERVER_PID" 2>/dev/null; then
    echo "The API exited before it became ready." >&2
    cat "$SERVER_LOG" >&2
    exit 1
  fi

  STATUS="$(curl --silent --output "$WORK_DIR/events.json" --write-out '%{http_code}' \
    "$BASE_URL/api/v1/events" || true)"

  if [ "$STATUS" = "200" ]; then
    break
  fi

  sleep 1
done

if [ "$STATUS" != "200" ]; then
  echo "GET $BASE_URL/api/v1/events returned '$STATUS', expected '200'." >&2
  cat "$SERVER_LOG" >&2
  exit 1
fi

node -e "
const fs = require('fs');
const body = JSON.parse(fs.readFileSync('$WORK_DIR/events.json', 'utf8'));
if (!Array.isArray(body)) {
  throw new Error('expected a JSON array of events, got ' + typeof body);
}
console.log('==> GET /api/v1/events returned 200 with ' + body.length + ' event(s)');
"

echo "Smoke test passed."
