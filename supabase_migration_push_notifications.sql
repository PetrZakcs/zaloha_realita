-- iWAU / Hra Reality — Web Push retention notifications (MVP1 spec-3 §14A "D1 notifikace")
-- Run this once in the Supabase SQL Editor. Safe to re-run (idempotent).
--
-- Part B of the retention-hook work (part A — the in-app 'welcome-back' modal — needed no
-- schema changes, see fetchUser()/ModalManager.jsx). This part is for reaching a player who
-- does NOT have the app open: browser Web Push, sent by a scheduled Edge Function
-- (supabase/functions/send-retention-push) that pg_cron below fires twice a day.
--
-- IMPORTANT — things a SQL migration cannot do, that still need doing by hand:
--   1. Generate a VAPID keypair (e.g. `npx web-push generate-vapid-keys`) and set
--      VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT as Edge Function secrets
--      (`supabase secrets set ...` or the dashboard) — the private key must NEVER be
--      committed to the repo. The public key also needs to reach the client build as
--      REACT_APP_VAPID_PUBLIC_KEY (.env.local — see src/lib/push.js).
--   2. Deploy supabase/functions/send-retention-push.
--   3. Run SECTION 3 below to actually schedule it — it references net.http_post with a
--      hardcoded project URL + service_role key placeholder that must be filled in first.
--
-- The send-retention-push Edge Function itself uses the `web-push` npm package via esm.sh
-- (same import pattern already used by stripe-webhook in this repo) — this has NOT been
-- execution-tested against a real deployed Edge Function in this session (no Deno runtime
-- available to run it against); everything in this SQL file has been reasoned through
-- carefully but, unlike the rest of this app's migrations, wasn't verifiable by a build step.
-- Test a manual invoke before trusting the cron schedule.

-- ================================================================
-- SECTION 1: push_subscriptions — one row per browser/device a player has enabled push on
-- ================================================================

CREATE TABLE IF NOT EXISTS public.push_subscriptions (
  id         UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id    UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
  endpoint   TEXT NOT NULL UNIQUE,
  p256dh     TEXT NOT NULL,
  auth       TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);

ALTER TABLE public.push_subscriptions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow users to manage their own push subscriptions" ON public.push_subscriptions;
CREATE POLICY "Allow users to manage their own push subscriptions" ON public.push_subscriptions
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- ================================================================
-- SECTION 2: push_notification_log — dedup guard so a cron overlap/retry (or the morning
-- and evening runs both matching the same player under a looser query) never double-sends.
-- ================================================================

CREATE TABLE IF NOT EXISTS public.push_notification_log (
  id        UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id   UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
  kind      TEXT NOT NULL, -- 'morning' | 'evening' | 'inactive_48h'
  sent_date DATE NOT NULL DEFAULT (timezone('utc', now()))::date,
  UNIQUE(user_id, kind, sent_date)
);

ALTER TABLE public.push_notification_log ENABLE ROW LEVEL SECURITY;
-- No policies at all — this table is only ever touched by send-retention-push using the
-- service_role key, which bypasses RLS entirely. Nothing here is meant to be client-readable.

-- ================================================================
-- SECTION 3: pg_cron schedule — fires send-retention-push twice a day.
--
-- MANUAL STEP REQUIRED: replace YOUR_PROJECT_REF and YOUR_SERVICE_ROLE_KEY below before
-- running this section (the rest of the file is safe to run as-is). Get both from
-- Project Settings → API in the Supabase dashboard. The service_role key is a secret —
-- this SQL runs once in the SQL Editor and the key ends up stored in cron.job, visible to
-- anyone with SQL Editor / postgres access to this project (i.e. you and other admins) —
-- same trust level as any other service_role usage in this project already.
-- ================================================================

CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

-- 08:00 UTC — "Včera jsi začal, dnes můžeš pokračovat" (spec-3 §14A ráno)
SELECT cron.schedule(
  'retention-push-morning',
  '0 8 * * *',
  $$
  SELECT net.http_post(
    url := 'https://YOUR_PROJECT_REF.supabase.co/functions/v1/send-retention-push',
    headers := jsonb_build_object('Content-Type', 'application/json', 'Authorization', 'Bearer YOUR_SERVICE_ROLE_KEY'),
    body := jsonb_build_object('kind', 'morning')
  );
  $$
);

-- 20:00 UTC — "Zastavil ses. Teď pokračuj." (spec-3 §14A večer) + 48h+ variant in the same run
SELECT cron.schedule(
  'retention-push-evening',
  '0 20 * * *',
  $$
  SELECT net.http_post(
    url := 'https://YOUR_PROJECT_REF.supabase.co/functions/v1/send-retention-push',
    headers := jsonb_build_object('Content-Type', 'application/json', 'Authorization', 'Bearer YOUR_SERVICE_ROLE_KEY'),
    body := jsonb_build_object('kind', 'evening')
  );
  $$
);

-- To inspect/remove later:
--   SELECT * FROM cron.job;
--   SELECT cron.unschedule('retention-push-morning');
