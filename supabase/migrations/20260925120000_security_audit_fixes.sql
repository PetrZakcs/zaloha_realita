-- iWAU / Hra Reality — Security audit fixes (audit 2026-09-25)
-- Migration: 20260925120000_security_audit_fixes.sql
-- Requires: 20260922223600_security_and_spec_hardening.sql (latest protect_profile_privileges,
-- increment_feed_reaction) and 20260816004546_consolidated_functions.sql (latest complete_challenge,
-- advance_node).
-- Safe to re-run (idempotent).
--
-- Closes:
--   1. feed_posts: client could INSERT posts with arbitrary user_name/type/author_pass_holder/
--      reaction counts (impersonation, fake "Founder" status posts) and UPDATE its own counters.
--   2. increment_feed_reaction: callable by anon, no per-user dedup → unlimited inflation.
--   3. Game integrity: advance_node didn't require the current node's challenge to be completed,
--      and complete_challenge wasn't bound to the player's node → XP farm via direct RPC calls.
--   4. Client INSERT on challenge_completions / key_transactions (forgeable ledger), public read of
--      challenge_completions incl. is_suspicious.
--   5. proofs bucket: any file type/size at any path; p_image_url accepted any external URL.
--   6. analytics_events: spoofable user_id.
--   7. Profile columns the guard didn't lock: current_streak/longest_streak/last_active_at
--      (client-computed streak), discord_user_id (drives airtable-sync attribution), email,
--      referral_code.
--   8. Admin moderation had no RLS policy on feed_posts → hide/delete silently did nothing.

-- ================================================================
-- SECTION 1: feed_posts — server-only writes, admin moderation, length limits
-- ================================================================

DROP POLICY IF EXISTS "Allow users to create their own feed posts" ON public.feed_posts;
DROP POLICY IF EXISTS "Allow authors to update their own feed posts" ON public.feed_posts;
-- All feed_posts rows are now written by SECURITY DEFINER RPCs (complete_challenge,
-- publish_pledge, submit_season_reflection, handle_referral_signup) or service_role
-- (stripe-webhook) — never directly by the client.

DROP POLICY IF EXISTS "Allow admins to read all feed posts" ON public.feed_posts;
CREATE POLICY "Allow admins to read all feed posts" ON public.feed_posts
  FOR SELECT TO authenticated USING (public.check_is_admin(auth.uid()));

DROP POLICY IF EXISTS "Allow admins to update feed posts" ON public.feed_posts;
CREATE POLICY "Allow admins to update feed posts" ON public.feed_posts
  FOR UPDATE TO authenticated USING (public.check_is_admin(auth.uid()))
  WITH CHECK (public.check_is_admin(auth.uid()));

DROP POLICY IF EXISTS "Allow admins to delete feed posts" ON public.feed_posts;
CREATE POLICY "Allow admins to delete feed posts" ON public.feed_posts
  FOR DELETE TO authenticated USING (public.check_is_admin(auth.uid()));

-- NOT VALID: existing rows aren't re-checked, only new writes.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'feed_posts_content_length') THEN
    ALTER TABLE public.feed_posts
      ADD CONSTRAINT feed_posts_content_length CHECK (char_length(content) <= 1000) NOT VALID;
  END IF;
END $$;

-- Onboarding "slib" post (was a direct client INSERT in authSlice.submitPledge).
CREATE OR REPLACE FUNCTION public.publish_pledge(p_text text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_user_id   uuid := auth.uid();
  v_user_name text;
  v_pass      boolean;
  v_text      text := btrim(COALESCE(p_text, ''));
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '28000';
  END IF;
  IF char_length(v_text) = 0 OR char_length(v_text) > 280 THEN
    RAISE EXCEPTION 'Pledge must be 1–280 characters' USING ERRCODE = '22023';
  END IF;

  SELECT display_name, pass_holder INTO v_user_name, v_pass
  FROM public.profiles WHERE id = v_user_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Profile not found for user %', v_user_id USING ERRCODE = 'P0002';
  END IF;

  -- One onboarding pledge post per player — a replay would otherwise spam the feed.
  IF EXISTS (
    SELECT 1 FROM public.feed_posts
    WHERE user_id = v_user_id AND type = 'STATUS' AND content = v_text
  ) THEN
    RETURN;
  END IF;

  UPDATE public.profiles SET pledge = v_text WHERE id = v_user_id;

  INSERT INTO public.feed_posts (user_id, user_name, type, content, is_public, author_pass_holder)
  VALUES (v_user_id, v_user_name, 'STATUS', v_text, true, COALESCE(v_pass, false));
END;
$$;

REVOKE ALL ON FUNCTION public.publish_pledge(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.publish_pledge(text) TO authenticated;

-- ================================================================
-- SECTION 2: Reactions — one reaction of each type per player per post
-- ================================================================

CREATE TABLE IF NOT EXISTS public.feed_reactions (
  post_id    UUID REFERENCES public.feed_posts(id) ON DELETE CASCADE NOT NULL,
  user_id    UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
  type       TEXT NOT NULL CHECK (type IN ('fire', 'plant', 'eye')),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL,
  PRIMARY KEY (post_id, user_id, type)
);

ALTER TABLE public.feed_reactions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow users to read their own reactions" ON public.feed_reactions;
CREATE POLICY "Allow users to read their own reactions" ON public.feed_reactions
  FOR SELECT USING (auth.uid() = user_id);
-- No INSERT/UPDATE/DELETE policy: only increment_feed_reaction() below writes here.

-- Same signature and return shape as the 20260922 version, so the client call is unchanged.
-- A repeated reaction is a no-op that just returns the current counts.
CREATE OR REPLACE FUNCTION public.increment_feed_reaction(
  p_post_id UUID,
  p_type TEXT
)
RETURNS TABLE (
  reactions_fire INT,
  reactions_plant INT,
  reactions_eye INT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_user_id  uuid := auth.uid();
  v_type     text := CASE WHEN p_type = 'lightning' THEN 'plant' ELSE p_type END;
  v_inserted int;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '28000';
  END IF;

  IF v_type NOT IN ('fire', 'plant', 'eye') THEN
    RAISE EXCEPTION 'Invalid reaction type: %', p_type USING ERRCODE = '22023';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.feed_posts WHERE id = p_post_id AND is_public = true) THEN
    RAISE EXCEPTION 'Post not found' USING ERRCODE = 'P0002';
  END IF;

  INSERT INTO public.feed_reactions (post_id, user_id, type)
  VALUES (p_post_id, v_user_id, v_type)
  ON CONFLICT DO NOTHING;
  GET DIAGNOSTICS v_inserted = ROW_COUNT;

  IF v_inserted > 0 THEN
    IF v_type = 'fire' THEN
      UPDATE public.feed_posts
      SET reactions_fire = COALESCE(reactions_fire, 0) + 1
      WHERE id = p_post_id;
    ELSIF v_type = 'plant' THEN
      UPDATE public.feed_posts
      SET reactions_plant = COALESCE(reactions_plant, 0) + 1,
          reactions_lightning = COALESCE(reactions_lightning, 0) + 1
      WHERE id = p_post_id;
    ELSE
      UPDATE public.feed_posts
      SET reactions_eye = COALESCE(reactions_eye, 0) + 1
      WHERE id = p_post_id;
    END IF;
  END IF;

  RETURN QUERY
  SELECT fp.reactions_fire, COALESCE(fp.reactions_plant, fp.reactions_lightning, 0), fp.reactions_eye
  FROM public.feed_posts fp
  WHERE fp.id = p_post_id;
END;
$$;

REVOKE ALL ON FUNCTION public.increment_feed_reaction(UUID, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.increment_feed_reaction(UUID, TEXT) FROM anon;
GRANT EXECUTE ON FUNCTION public.increment_feed_reaction(UUID, TEXT) TO authenticated;

-- ================================================================
-- SECTION 3: Ledger tables — server-only writes, private reads
-- ================================================================

DROP POLICY IF EXISTS "Allow users to record challenge completions" ON public.challenge_completions;
DROP POLICY IF EXISTS "Allow users to insert their key transactions" ON public.key_transactions;

-- Was USING (true): exposed every player's completion timing and is_suspicious flag.
DROP POLICY IF EXISTS "Allow public read access to challenge completions" ON public.challenge_completions;
DROP POLICY IF EXISTS "Allow users to read their own challenge completions" ON public.challenge_completions;
CREATE POLICY "Allow users to read their own challenge completions" ON public.challenge_completions
  FOR SELECT TO authenticated USING (auth.uid() = user_id OR public.check_is_admin(auth.uid()));

-- ================================================================
-- SECTION 4: Game integrity — complete_challenge bound to the player's node,
--            advance_node gated on the current node's challenges
-- ================================================================

CREATE OR REPLACE FUNCTION public.complete_challenge(
  p_challenge_id text,
  p_proof_text   text DEFAULT NULL,
  p_image_url    text DEFAULT NULL,
  p_is_public    boolean DEFAULT true
)
RETURNS TABLE (
  new_xp int,
  new_keys_balance int,
  new_avatar_level int,
  already_completed boolean
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_user_id        uuid := auth.uid();
  v_user_name      text;
  v_pass_holder    boolean;
  v_reward_xp      int;
  v_reward_keys    int;
  v_node_order     int;
  v_uzel           int;
  v_current_badges int;
  v_new_badges     int;
  v_new_xp         int;
  v_new_keys       int;
  v_proof_text     text := NULLIF(btrim(COALESCE(p_proof_text, '')), '');
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '28000';
  END IF;

  SELECT c.reward_xp, c.reward_keys, sn.node_order
  INTO v_reward_xp, v_reward_keys, v_node_order
  FROM public.challenges c
  JOIN public.story_nodes sn ON sn.id = c.story_node_id
  WHERE c.id = p_challenge_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Unknown challenge_id: %', p_challenge_id USING ERRCODE = 'P0002';
  END IF;

  -- A challenge can only be completed once the player has reached its node. Previously any
  -- challenge id (they're all publicly readable) could be completed from node 1.
  SELECT p.uzel INTO v_uzel FROM public.profiles p WHERE p.id = v_user_id;
  IF v_node_order > COALESCE(v_uzel, 0) THEN
    RAISE EXCEPTION 'Challenge % belongs to a node the player has not reached', p_challenge_id
      USING ERRCODE = '42501';
  END IF;

  IF v_proof_text IS NOT NULL AND char_length(v_proof_text) > 500 THEN
    RAISE EXCEPTION 'Proof text too long (max 500 characters)' USING ERRCODE = '22023';
  END IF;

  -- Only accept proof photos the player uploaded to their own folder in the proofs bucket —
  -- not arbitrary external URLs embedded in the public feed.
  IF p_image_url IS NOT NULL
     AND p_image_url NOT LIKE '%/storage/v1/object/public/proofs/' || v_user_id::text || '/%' THEN
    RAISE EXCEPTION 'Invalid proof image URL' USING ERRCODE = '22023';
  END IF;

  IF NOT p_is_public THEN
    v_reward_keys := 0;
  END IF;

  BEGIN
    INSERT INTO public.challenge_completions (user_id, challenge_id, completed_at)
    VALUES (v_user_id, p_challenge_id, timezone('utc', now()));
  EXCEPTION WHEN unique_violation THEN
    RETURN QUERY
      SELECT p.xp, p.keys_balance, p.avatar_level, true
      FROM public.profiles p WHERE p.id = v_user_id;
    RETURN;
  END;

  SELECT display_name, avatar_level, pass_holder INTO v_user_name, v_current_badges, v_pass_holder
  FROM public.profiles WHERE id = v_user_id;

  v_new_badges := CASE WHEN v_current_badges < 5 THEN v_current_badges + 1 ELSE v_current_badges END;

  PERFORM set_config('app.bypass_profile_guard', 'true', true);

  UPDATE public.profiles
  SET xp = xp + v_reward_xp,
      keys_balance = keys_balance + v_reward_keys,
      avatar_level = v_new_badges
  WHERE id = v_user_id
  RETURNING xp, keys_balance, avatar_level INTO v_new_xp, v_new_keys, v_new_badges;

  INSERT INTO public.key_transactions (user_id, amount, source, balance_after)
  VALUES (
    v_user_id,
    v_reward_keys,
    CASE WHEN p_is_public THEN 'PROOF_PUBLIC' ELSE 'CHALLENGE_COMPLETE' END,
    v_new_keys
  );

  INSERT INTO public.feed_posts (user_id, user_name, content, image_url, is_public, author_pass_holder)
  VALUES (
    v_user_id, v_user_name,
    COALESCE(v_proof_text, 'Prokázal jsem, že nejsem NPC! 🟢'),
    p_image_url, p_is_public, COALESCE(v_pass_holder, false)
  );

  INSERT INTO public.user_cards (user_id, card_key, sync_status, obtained_at)
  VALUES (v_user_id, p_challenge_id || '-card', 'SYNCED', timezone('utc', now()))
  ON CONFLICT (user_id, card_key) DO NOTHING;

  RETURN QUERY SELECT v_new_xp, v_new_keys, v_new_badges, false;
END;
$$;

REVOKE ALL ON FUNCTION public.complete_challenge(text, text, text, boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.complete_challenge(text, text, text, boolean) TO authenticated;

-- Adds status 'challenge_required': the current node's challenge(s) must be completed before
-- moving on. Nodes without a challenge (pure story nodes) advance as before.
CREATE OR REPLACE FUNCTION public.advance_node(p_use_free_daily boolean DEFAULT false)
RETURNS TABLE (
  new_uzel int,
  status text  -- 'advanced' | 'pass_required' | 'daily_limit_reached' | 'season_completed' | 'challenge_required'
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_user_id           uuid := auth.uid();
  v_uzel              int;
  v_pass_holder       boolean;
  v_free_advance_date date;
  v_free_credits      int;
  v_today             date := (timezone('utc', now()))::date;
  v_current_node      record;
  v_next_node         record;
  v_target_uzel       int;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '28000';
  END IF;

  SELECT p.uzel, p.pass_holder, p.free_node_advance_date, p.free_node_credits
  INTO v_uzel, v_pass_holder, v_free_advance_date, v_free_credits
  FROM public.profiles p WHERE p.id = v_user_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Profile not found for user %', v_user_id USING ERRCODE = 'P0002';
  END IF;

  SELECT * INTO v_current_node FROM public.story_nodes WHERE node_order = v_uzel LIMIT 1;
  SELECT * INTO v_next_node FROM public.story_nodes WHERE node_order = v_uzel + 1 LIMIT 1;

  IF v_current_node.id IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.challenges c
    WHERE c.story_node_id = v_current_node.id
      AND NOT EXISTS (
        SELECT 1 FROM public.challenge_completions cc
        WHERE cc.user_id = v_user_id AND cc.challenge_id = c.id
      )
  ) THEN
    RETURN QUERY SELECT v_uzel, 'challenge_required'::text;
    RETURN;
  END IF;

  IF v_next_node.id IS NOT NULL AND v_next_node.type = 'REFERENTIAL' THEN
    RETURN QUERY SELECT v_uzel, 'season_completed'::text;
    RETURN;
  END IF;

  IF v_next_node.id IS NULL AND v_current_node.type = 'FINAL' THEN
    RETURN QUERY SELECT v_uzel, 'season_completed'::text;
    RETURN;
  END IF;

  v_target_uzel := COALESCE(v_next_node.node_order, LEAST(v_uzel + 1, 9));

  IF COALESCE(v_next_node.requires_pass, false) AND NOT COALESCE(v_pass_holder, false) THEN
    IF COALESCE(v_free_credits, 0) > 0 THEN
      PERFORM set_config('app.bypass_profile_guard', 'true', true);
      UPDATE public.profiles SET free_node_credits = free_node_credits - 1 WHERE id = v_user_id;
    ELSE
      IF v_free_advance_date IS NOT NULL AND v_free_advance_date = v_today THEN
        RETURN QUERY SELECT v_uzel, 'daily_limit_reached'::text;
        RETURN;
      END IF;

      IF NOT p_use_free_daily THEN
        RETURN QUERY SELECT v_uzel, 'pass_required'::text;
        RETURN;
      END IF;

      PERFORM set_config('app.bypass_profile_guard', 'true', true);
      UPDATE public.profiles SET free_node_advance_date = v_today WHERE id = v_user_id;
    END IF;
  END IF;

  PERFORM set_config('app.bypass_profile_guard', 'true', true);
  UPDATE public.profiles SET uzel = v_target_uzel WHERE id = v_user_id;

  RETURN QUERY SELECT v_target_uzel, 'advanced'::text;
END;
$$;

REVOKE ALL ON FUNCTION public.advance_node(boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.advance_node(boolean) TO authenticated;

-- ================================================================
-- SECTION 5: Storage — proofs bucket limits and per-user folders
-- ================================================================

UPDATE storage.buckets
SET file_size_limit = 10485760, -- 10 MB
    allowed_mime_types = ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/heic', 'image/heif']
WHERE id = 'proofs';

-- Client uploads to `${auth.uid()}/${timestamp}.${ext}` (gameplaySlice.submitProof).
DROP POLICY IF EXISTS "Allow authenticated uploads to proofs bucket" ON storage.objects;
CREATE POLICY "Allow authenticated uploads to proofs bucket"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'proofs'
    AND auth.role() = 'authenticated'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

-- ================================================================
-- SECTION 6: analytics_events — no spoofed user_id
-- ================================================================

DROP POLICY IF EXISTS "Allow public insert to analytics_events" ON public.analytics_events;
CREATE POLICY "Allow public insert to analytics_events" ON public.analytics_events
  FOR INSERT WITH CHECK (
    (user_id IS NULL OR user_id = auth.uid())
    AND char_length(event_name) <= 100
  );

-- ================================================================
-- SECTION 7: Profile guard — lock streak/activity, discord id, email, referral code
-- ================================================================

-- Server-side streak (was computed in the browser and written straight to profiles).
-- Returns days since the previous activity so the client can still show 'welcome-back'.
CREATE OR REPLACE FUNCTION public.record_daily_activity()
RETURNS TABLE (
  current_streak int,
  days_since_last_active int
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_user_id     uuid := auth.uid();
  v_last_active timestamptz;
  v_streak      int;
  v_longest     int;
  v_today       date := (timezone('utc', now()))::date;
  v_last_date   date;
  v_days        int;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '28000';
  END IF;

  SELECT p.last_active_at, COALESCE(p.current_streak, 0), COALESCE(p.longest_streak, 0)
  INTO v_last_active, v_streak, v_longest
  FROM public.profiles p WHERE p.id = v_user_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Profile not found for user %', v_user_id USING ERRCODE = 'P0002';
  END IF;

  v_last_date := (timezone('utc', v_last_active))::date;

  IF v_last_date IS NOT NULL AND v_last_date = v_today THEN
    RETURN QUERY SELECT v_streak, 0;
    RETURN;
  END IF;

  v_days := CASE WHEN v_last_date IS NULL THEN 0 ELSE v_today - v_last_date END;
  v_streak := CASE WHEN v_days = 1 THEN v_streak + 1 ELSE 1 END;

  PERFORM set_config('app.bypass_profile_guard', 'true', true);
  UPDATE public.profiles
  SET current_streak = v_streak,
      longest_streak = GREATEST(v_longest, v_streak),
      last_active_at = timezone('utc', now())
  WHERE id = v_user_id;

  RETURN QUERY SELECT v_streak, v_days;
END;
$$;

REVOKE ALL ON FUNCTION public.record_daily_activity() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.record_daily_activity() TO authenticated;

-- discord_user_id comes from the verified Discord identity in auth.identities, never from
-- client input (it's what airtable-sync attributes cards to).
CREATE OR REPLACE FUNCTION public.sync_discord_identity()
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
DECLARE
  v_user_id    uuid := auth.uid();
  v_discord_id text;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '28000';
  END IF;

  SELECT COALESCE(i.provider_id, i.identity_data->>'provider_id', i.identity_data->>'sub', i.identity_data->>'id')
  INTO v_discord_id
  FROM auth.identities i
  WHERE i.user_id = v_user_id AND i.provider = 'discord'
  LIMIT 1;

  IF v_discord_id IS NULL THEN
    RETURN NULL;
  END IF;

  PERFORM set_config('app.bypass_profile_guard', 'true', true);
  UPDATE public.profiles SET discord_user_id = v_discord_id
  WHERE id = v_user_id AND discord_user_id IS DISTINCT FROM v_discord_id;

  RETURN v_discord_id;
END;
$$;

REVOKE ALL ON FUNCTION public.sync_discord_identity() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.sync_discord_identity() TO authenticated;

-- referral_code is always derived from the id — a client-supplied value on INSERT could
-- otherwise claim someone else's vanity code.
CREATE OR REPLACE FUNCTION public.set_default_referral_code()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  NEW.referral_code := upper(substr(replace(NEW.id::text, '-', ''), 1, 8));
  RETURN NEW;
END;
$$;

-- Same as the 20260922 version plus the newly locked columns (marked NEW).
CREATE OR REPLACE FUNCTION public.protect_profile_privileges()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  is_caller_admin boolean;
BEGIN
  IF auth.role() = 'service_role' OR auth.role() IS NULL THEN
    RETURN NEW;
  END IF;

  IF current_setting('app.bypass_profile_guard', true) = 'true' THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'INSERT' THEN
    NEW.is_admin := false;
    NEW.pass_holder := false;
    NEW.free_node_credits := 0;
    NEW.showcase_card_keys := '{}';
    NEW.display_name_change_used := false;
    NEW.xp := LEAST(COALESCE(NEW.xp, 0), 50);
    NEW.uzel := LEAST(GREATEST(COALESCE(NEW.uzel, 1), 1), 1);
    NEW.keys_balance := LEAST(COALESCE(NEW.keys_balance, 1), 3);
    NEW.avatar_level := LEAST(COALESCE(NEW.avatar_level, 1), 1);
    NEW.current_streak := 0;                                   -- NEW
    NEW.longest_streak := 0;                                   -- NEW
    NEW.last_active_at := NULL;                                -- NEW (first record_daily_activity() starts the streak)
    NEW.discord_user_id := NULL;                               -- NEW (set by sync_discord_identity())
    NEW.email := COALESCE(NULLIF(auth.jwt()->>'email', ''), NEW.email); -- NEW
    RETURN NEW;
  END IF;

  SELECT p.is_admin INTO is_caller_admin
  FROM public.profiles p
  WHERE p.id = auth.uid();

  IF COALESCE(is_caller_admin, false) THEN
    RETURN NEW;
  END IF;

  NEW.xp                     := OLD.xp;
  NEW.keys_balance           := OLD.keys_balance;
  NEW.avatar_level           := OLD.avatar_level;
  NEW.pass_holder            := OLD.pass_holder;
  NEW.is_admin               := OLD.is_admin;
  NEW.uzel                   := OLD.uzel;
  NEW.free_node_advance_date := OLD.free_node_advance_date;
  NEW.referred_by_code       := OLD.referred_by_code;
  NEW.free_node_credits      := OLD.free_node_credits;
  NEW.showcase_card_keys     := OLD.showcase_card_keys;
  NEW.current_streak         := OLD.current_streak;          -- NEW
  NEW.longest_streak         := OLD.longest_streak;          -- NEW
  NEW.last_active_at         := OLD.last_active_at;          -- NEW
  NEW.discord_user_id        := OLD.discord_user_id;         -- NEW
  NEW.email                  := OLD.email;                   -- NEW
  NEW.referral_code          := OLD.referral_code;           -- NEW

  IF NEW.display_name IS DISTINCT FROM OLD.display_name THEN
    IF COALESCE(OLD.display_name_change_used, false) THEN
      NEW.display_name := OLD.display_name;
    ELSE
      NEW.display_name_change_used := true;
    END IF;
  ELSE
    NEW.display_name_change_used := OLD.display_name_change_used;
  END IF;

  RETURN NEW;
END;
$$;

-- The original schema defaulted every new player to a 5-day streak.
ALTER TABLE public.profiles ALTER COLUMN current_streak SET DEFAULT 0;
ALTER TABLE public.profiles ALTER COLUMN longest_streak SET DEFAULT 0;

-- ================================================================
-- SECTION 8: Stripe — webhook idempotency and subscription → user mapping
-- ================================================================

-- Written only by stripe-webhook (service_role). No client policies.
CREATE TABLE IF NOT EXISTS public.stripe_events (
  id           TEXT PRIMARY KEY,        -- Stripe event.id
  type         TEXT NOT NULL,
  processed_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);
ALTER TABLE public.stripe_events ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.subscriptions (
  stripe_subscription_id TEXT PRIMARY KEY,
  user_id                UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
  stripe_customer_id     TEXT,
  status                 TEXT NOT NULL,
  created_at             TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL,
  updated_at             TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);
ALTER TABLE public.subscriptions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow users to read their own subscriptions" ON public.subscriptions;
CREATE POLICY "Allow users to read their own subscriptions" ON public.subscriptions
  FOR SELECT USING (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_subscriptions_user ON public.subscriptions(user_id);
