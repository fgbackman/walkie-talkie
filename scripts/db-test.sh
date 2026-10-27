#!/usr/bin/env bash
# Applies every migration to a fresh, throwaway database and runs the
# authorisation tests in supabase/tests/security_test.sql against it.
#
#   DATABASE_URL=postgres://postgres:postgres@localhost:5432/postgres npm run test:db
#
# DATABASE_URL only needs to reach a server where you may CREATE DATABASE.
# The script creates its own database and drops it afterwards; it never
# touches the database named in the URL.
set -euo pipefail

: "${DATABASE_URL:?Set DATABASE_URL to a Postgres server you can create databases on}"
cd "$(dirname "$0")/.."

db="walkie_test_$(date +%s)_$$"
server() { psql "$DATABASE_URL" -X -q -v ON_ERROR_STOP=1 "$@"; }

# Swap the database name in the URL for ours.
url="$(node -e 'const u = new URL(process.argv[1]); u.pathname = "/" + process.argv[2]; console.log(u.toString())' "$DATABASE_URL" "$db")"
run() { psql "$url" -X -q -v ON_ERROR_STOP=1 "$@"; }

server -c "create database \"$db\""
trap 'server -c "drop database if exists \"$db\" with (force)" >/dev/null' EXIT

run -f supabase/tests/supabase_stub.sql

for m in supabase/migrations/*.sql; do
  fixture="supabase/tests/fixtures/before_$(basename "$m")"
  [[ -f "$fixture" ]] && run -f "$fixture"
  echo "migrate  $(basename "$m")"
  PGOPTIONS="-c client_min_messages=warning" run -f "$m"
done

run -f supabase/tests/security_test.sql
