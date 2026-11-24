#!/bin/bash
# Rehearses the production upgrade on a throwaway Postgres: replays migrations up to what
# production has, adds players and posts, then applies the remaining ones in order and checks
# that nothing was lost. Same setup as run_local.sh.
#
#   PG_BIN=/path/to/postgres/bin PGPORT=54329 supabase/tests/upgrade_test.sh
set -u
cd "$(dirname "$0")/../.."
PG_BIN=${PG_BIN:-}
PGPORT=${PGPORT:-54329}
LAST_IN_PROD=${LAST_IN_PROD:-20260925130000}
P="${PG_BIN:+$PG_BIN/}psql -h 127.0.0.1 -p $PGPORT -U postgres"

apply() {
  out=$(sed -E 's/^CREATE EXTENSION IF NOT EXISTS ("uuid-ossp"|pg_cron|pg_net).*$//I' "$1" | $P -d iwau_upgrade -q -v ON_ERROR_STOP=1 2>&1)
  if [ $? -ne 0 ]; then echo "FAIL $1"; echo "$out" | grep -i -A3 error | head -8; exit 1; fi
  echo "ok   $1"
}

$P -tA -c "drop database if exists iwau_upgrade" -c "create database iwau_upgrade" >/dev/null || exit 1
$P -d iwau_upgrade -q -v ON_ERROR_STOP=1 -f supabase/tests/supabase_stub.sql || exit 1

FILES="supabase/migrations/20260727131520_cleanup_legacy_schema.sql $(ls supabase/migrations/*.sql | grep -v cleanup_legacy)"
for f in $FILES; do
  [ "$(basename "$f" | cut -d_ -f1)" -le "$LAST_IN_PROD" ] && apply "$f"
done

echo "--- production-like data"
$P -d iwau_upgrade -q -v ON_ERROR_STOP=1 <<'SQL' || exit 1
INSERT INTO auth.users (id, email) VALUES
  ('11111111-1111-4111-8111-111111111111', 'a@example.com'),
  ('22222222-2222-4222-8222-222222222222', 'b@example.com') ON CONFLICT DO NOTHING;
INSERT INTO profiles (id, display_name, xp, uzel, keys_balance, avatar_level, pass_holder) VALUES
  ('11111111-1111-4111-8111-111111111111', 'Stará A', 300, 5, 4, 6, true),
  ('22222222-2222-4222-8222-222222222222', 'Starý B', 40, 1, 1, 1, false)
ON CONFLICT (id) DO UPDATE SET xp = EXCLUDED.xp, uzel = EXCLUDED.uzel, keys_balance = EXCLUDED.keys_balance,
  avatar_level = EXCLUDED.avatar_level, pass_holder = EXCLUDED.pass_holder;
INSERT INTO feed_posts (user_id, user_name, content, is_public, image_url) VALUES
  ('11111111-1111-4111-8111-111111111111', 'Stará A', 'starý veřejný', true, 'https://x/storage/v1/object/public/proofs/1/a.jpg'),
  ('22222222-2222-4222-8222-222222222222', 'Starý B', 'starý soukromý', false, 'https://x/storage/v1/object/public/proofs/2/b.jpg');
INSERT INTO feed_posts (user_id, user_name, content, is_public, hidden_by_reports) VALUES
  ('22222222-2222-4222-8222-222222222222', 'Starý B', 'skrytý nahlášením', false, true);
INSERT INTO subscriptions (stripe_subscription_id, user_id, status) VALUES ('sub_old', '11111111-1111-4111-8111-111111111111', 'active');
SQL

for f in $FILES; do
  [ "$(basename "$f" | cut -d_ -f1)" -gt "$LAST_IN_PROD" ] && apply "$f"
done

echo "--- after upgrade"
$P -d iwau_upgrade -tA -F ' | ' <<'SQL'
SELECT 'players kept (expect 2):', count(*) FROM profiles WHERE display_name IN ('Stará A', 'Starý B');
SELECT 'progress kept (expect 300 5 true):', xp, uzel, pass_holder FROM profiles WHERE display_name = 'Stará A';
SELECT 'subscription kept (expect 1):', count(*) FROM subscriptions WHERE stripe_subscription_id = 'sub_old';
SELECT 'old public stays approved:', moderation_status FROM feed_posts WHERE content = 'starý veřejný';
SELECT 'old private not moderated:', moderation_status FROM feed_posts WHERE content = 'starý soukromý';
SELECT 'old reported waits for admin:', moderation_status, hidden_by_reports FROM feed_posts WHERE content = 'skrytý nahlášením';
SELECT 'old public in feed (expect 1):', count(*) FROM get_feed(50) WHERE content = 'starý veřejný';
SELECT 'old private not in feed (expect 0):', count(*) FROM get_feed(50) WHERE content = 'starý soukromý';
SELECT 'pending after upgrade (expect 0):', count(*) FROM feed_posts WHERE moderation_status = 'pending';
SQL

echo "--- second run of the new migrations"
apply supabase/migrations/20261106130000_ai_moderation.sql
apply supabase/migrations/20261106140000_mvp1_complete.sql
