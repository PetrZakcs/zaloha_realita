-- iWAU / Hra Reality — CONSOLIDATED single source of truth for shared functions
-- Run this once in the Supabase SQL Editor, AFTER every other supabase_migration_*.sql in
-- this repo has already been applied. Safe to re-run (idempotent).
--
-- WHY THIS FILE EXISTS: an automated review of this session's migrations found that
-- protect_profile_privileges(), advance_node(), complete_challenge(), submit_season_reflection()
-- and handle_referral_signup() each got redefined (CREATE OR REPLACE) in multiple migration
-- files as new features were layered on, with no numeric ordering between files. Whichever
-- file happens to be run last silently becomes the live behavior — in the order these were
-- actually run against this project, that already worked out correctly, but it was one
-- reordering away from e.g. referral_system.sql's protect_profile_privileges() (which does
-- NOT know about showcase_card_keys/display_name_change_used) silently overwriting
-- profile_showcase.sql's version and removing those guards.
--
-- From here on, THIS file is the only place these five functions are defined. The old
-- per-feature migration files (free_daily_node.sql, referral_system.sql, feed_enrichment.sql,
-- profile_showcase.sql, profiles_security.sql) keep their ALTER TABLE / CREATE TABLE /
-- policy / trigger-registration statements — those are genuinely one-time schema changes,
-- not duplicated — but a comment at the top of each now points here instead of carrying
-- their own copy of the function body. Nothing about already-applied schema changes is
-- touched or reverted by this file; it only re-declares (CREATE OR REPLACE / DROP+CREATE)
-- functions that already exist, using their current, already-live bodies.
--
-- Also folds in the "dead code" cleanup identified in the same review: setNickname() /
-- set_initial_nickname() / profiles.initial_nickname_set existed to let onboarding pick a
-- nickname without spending the player's one free Settings rename — but the onboarding
-- nickname-picking step itself was removed in the spec-3 flow rework (players get an
-- auto-generated name now, changeable later via Settings' changeDisplayNameOnce()), so
-- nothing has called setNickname()/set_initial_nickname() since. This file drops both the
-- function and the column. protect_profile_privileges() below is already updated to not
-- reference initial_nickname_set — if you run this file before removing the client-side
-- setNickname() call sites, nothing breaks (the RPC just won't exist to call).

-- ================================================================
-- SECTION 1: protect_profile_privileges() — final, single version
-- ================================================================

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

  IF NEW.display_name IS DISTINCT FROM OLD.display_name THEN
    IF COALESCE(OLD.display_name_change_used, false) THEN
      NEW.display_name := OLD.display_name; -- free change already spent — silently revert
    ELSE
      NEW.display_name_change_used := true; -- first-ever Settings change — allow it, consume it
    END IF;
  ELSE
    NEW.display_name_change_used := OLD.display_name_change_used;
  END IF;

  RETURN NEW;
END;
$$;

-- ================================================================
-- SECTION 2: dead code cleanup — set_initial_nickname() + initial_nickname_set
-- ================================================================

DROP FUNCTION IF EXISTS public.set_initial_nickname(text);
ALTER TABLE public.profiles DROP COLUMN IF EXISTS initial_nickname_set;

-- ================================================================
-- SECTION 3: advance_node() — final, single version
-- ================================================================

CREATE OR REPLACE FUNCTION public.advance_node(p_use_free_daily boolean DEFAULT false)
RETURNS TABLE (
  new_uzel int,
  status text  -- 'advanced' | 'pass_required' | 'daily_limit_reached' | 'season_completed'
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
-- SECTION 4: complete_challenge() — final, single version
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
  v_current_badges int;
  v_new_badges     int;
  v_new_xp         int;
  v_new_keys       int;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '28000';
  END IF;

  SELECT c.reward_xp, c.reward_keys INTO v_reward_xp, v_reward_keys
  FROM public.challenges c
  WHERE c.id = p_challenge_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Unknown challenge_id: %', p_challenge_id USING ERRCODE = 'P0002';
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
    COALESCE(p_proof_text, 'Prokázal jsem, že nejsem NPC! 🟢'),
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

-- ================================================================
-- SECTION 5: submit_season_reflection() — final, single version
-- ================================================================

CREATE OR REPLACE FUNCTION public.submit_season_reflection(
  p_percent           smallint,
  p_would_recommend   boolean,
  p_referral_intent   smallint,
  p_sentence_template smallint,
  p_sentence_text     text
)
RETURNS TABLE (
  transformation_percent smallint,
  already_submitted      boolean
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_user_id       uuid := auth.uid();
  v_user_name     text;
  v_sentence_text text := btrim(coalesce(p_sentence_text, ''));
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '28000';
  END IF;

  IF p_percent IS NULL OR p_percent < 0 OR p_percent > 100 THEN
    RAISE EXCEPTION 'transformation_percent must be between 0 and 100' USING ERRCODE = '22023';
  END IF;
  IF p_referral_intent IS NULL OR p_referral_intent < 0 OR p_referral_intent > 5 THEN
    RAISE EXCEPTION 'referral_intent must be between 0 and 5' USING ERRCODE = '22023';
  END IF;
  IF p_sentence_template IS NULL OR p_sentence_template < 1 OR p_sentence_template > 3 THEN
    RAISE EXCEPTION 'sentence_template must be between 1 and 3' USING ERRCODE = '22023';
  END IF;
  IF v_sentence_text = '' OR char_length(v_sentence_text) > 500 THEN
    RAISE EXCEPTION 'sentence_text must be 1–500 characters' USING ERRCODE = '22023';
  END IF;

  SELECT display_name INTO v_user_name FROM public.profiles WHERE id = v_user_id;

  BEGIN
    INSERT INTO public.season_reflections (
      user_id, transformation_percent, would_recommend, referral_intent, sentence_template, sentence_text
    ) VALUES (
      v_user_id, p_percent, COALESCE(p_would_recommend, false), p_referral_intent, p_sentence_template, v_sentence_text
    );
  EXCEPTION WHEN unique_violation THEN
    RETURN QUERY
      SELECT sr.transformation_percent, true
      FROM public.season_reflections sr WHERE sr.user_id = v_user_id;
    RETURN;
  END;

  INSERT INTO public.user_cards (user_id, card_key, sync_status, obtained_at)
  VALUES (v_user_id, 'light-bearer-season0', 'SYNCED', timezone('utc', now()))
  ON CONFLICT (user_id, card_key) DO NOTHING;

  INSERT INTO public.feed_posts (user_id, user_name, type, content, is_public)
  VALUES (v_user_id, COALESCE(v_user_name, 'Hráč'), 'STATUS', COALESCE(v_user_name, 'Hráč') || ' odemkl(a) odznak Light Bearer Season 0.', true);

  RETURN QUERY SELECT p_percent, false;
END;
$$;

-- ================================================================
-- SECTION 6: handle_referral_signup() — final, single version
-- ================================================================

CREATE OR REPLACE FUNCTION public.handle_referral_signup()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_referrer_id   uuid;
  v_referrer_name text;
  v_count         int;
BEGIN
  IF NEW.referred_by_code IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT id, display_name INTO v_referrer_id, v_referrer_name
  FROM public.profiles
  WHERE referral_code = NEW.referred_by_code AND id <> NEW.id;

  IF v_referrer_id IS NULL THEN
    RETURN NEW;
  END IF;

  INSERT INTO public.referral_signups (referrer_id, referred_id, referral_code)
  VALUES (v_referrer_id, NEW.id, NEW.referred_by_code)
  ON CONFLICT (referred_id) DO NOTHING;

  SELECT count(*) INTO v_count FROM public.referral_signups WHERE referrer_id = v_referrer_id;

  PERFORM set_config('app.bypass_profile_guard', 'true', true);

  IF v_count = 1 THEN
    UPDATE public.profiles SET keys_balance = keys_balance + 1 WHERE id = v_referrer_id;
    INSERT INTO public.key_transactions (user_id, amount, source, balance_after)
    SELECT v_referrer_id, 1, 'REFERRAL', keys_balance FROM public.profiles WHERE id = v_referrer_id;
  ELSIF v_count = 2 THEN
    UPDATE public.profiles SET free_node_credits = free_node_credits + 1 WHERE id = v_referrer_id;
  ELSIF v_count = 3 THEN
    INSERT INTO public.user_cards (user_id, card_key, sync_status, obtained_at)
    VALUES (v_referrer_id, 'referral-rare-3', 'SYNCED', timezone('utc', now()))
    ON CONFLICT (user_id, card_key) DO NOTHING;
    INSERT INTO public.feed_posts (user_id, user_name, type, content, is_public)
    VALUES (v_referrer_id, COALESCE(v_referrer_name, 'Hráč'), 'COLLECTION', COALESCE(v_referrer_name, 'Hráč') || ' získal(a) vzácnou kartu za pozvání přátel.', true);
  ELSIF v_count = 5 THEN
    INSERT INTO public.user_cards (user_id, card_key, sync_status, obtained_at)
    VALUES (v_referrer_id, 'referral-badge-5', 'SYNCED', timezone('utc', now()))
    ON CONFLICT (user_id, card_key) DO NOTHING;
    INSERT INTO public.feed_posts (user_id, user_name, type, content, is_public)
    VALUES (v_referrer_id, COALESCE(v_referrer_name, 'Hráč'), 'STATUS', COALESCE(v_referrer_name, 'Hráč') || ' získal(a) odznak Nositel Světla.', true);
  END IF;

  RETURN NEW;
END;
$$;
