#!/bin/bash
# Replays every migration on a throwaway local Postgres (with a minimal Supabase stub: auth,
# storage, roles, pg_cron/pg_net no-ops) and runs the game-flow test.
#
#   PG_BIN=/path/to/postgres/bin PGPORT=54329 supabase/tests/run_local.sh
#
# Needs a running Postgres 15+ reachable on 127.0.0.1:$PGPORT as superuser "postgres".
# Quick way without Docker:  python3 -m venv v && v/bin/pip install pgserver
#   PG_BIN=$(v/bin/python -c "import pgserver,os;print(os.path.dirname(pgserver.__file__)+'/pginstall/bin')")
#   $PG_BIN/initdb -D /tmp/iwau-pg -U postgres --auth=trust
#   $PG_BIN/pg_ctl -D /tmp/iwau-pg -o "-p 54329 -k '' -c listen_addresses=127.0.0.1" start
set -u
cd "$(dirname "$0")/../.."
PG_BIN=${PG_BIN:-}
PGPORT=${PGPORT:-54329}
P="${PG_BIN:+$PG_BIN/}psql -h 127.0.0.1 -p $PGPORT -U postgres"

$P -tA -c "drop database if exists iwau_test" -c "create database iwau_test" >/dev/null || exit 1
$P -d iwau_test -q -v ON_ERROR_STOP=1 -f supabase/tests/supabase_stub.sql || exit 1

# NOTE: 20260727131520_cleanup_legacy_schema.sql drops `challenges` and must run BEFORE the base
# schema (its own header says so) — its timestamp sorts it after. Production was set up by hand
# in the right order; a fresh environment has to do the same.
FILES="supabase/migrations/20260727131520_cleanup_legacy_schema.sql $(ls supabase/migrations/*.sql | grep -v cleanup_legacy)"
for f in $FILES; do
  out=$(sed -E 's/^CREATE EXTENSION IF NOT EXISTS ("uuid-ossp"|pg_cron|pg_net).*$//I' "$f" | $P -d iwau_test -q -v ON_ERROR_STOP=1 2>&1)
  if [ $? -ne 0 ]; then echo "FAIL $f"; echo "$out" | grep -i -A3 error | head -8; exit 1; fi
  echo "ok   $f"
done

echo "--- flow test"
$P -d iwau_test -v ON_ERROR_STOP=1 -f supabase/tests/flow_test.sql 2>&1 \
  | grep -v "^set_config\|^$\|^SET$\|^RESET$\|^INSERT\|^UPDATE\|^DELETE\|^DO$\|^Output format\|^Tuples\|^[0-9a-f]\{8\}-"
