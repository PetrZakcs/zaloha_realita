-- SUPERSEDED for submit_season_reflection(), handle_referral_signup() and
-- complete_challenge() — see supabase_migration_consolidated_functions.sql. The
-- feed_posts.author_pass_holder column added below is still the real, one-time source.
--
-- iWAU / Hra Reality — feed enrichment: STATUS/COLLECTION posts + Founder marker (spec-6)
-- Run this once in the Supabase SQL Editor. Safe to re-run (idempotent).
-- Requires supabase_migration_season_reflection.sql and supabase_migration_referral_system.sql
-- to already be applied — this migration replaces those two RPCs' bodies, plus
-- complete_challenge() from supabase_migration_profiles_security.sql.
--
-- Two independent gaps closed together here because both are "the feed has the column but
-- nothing ever populated it":
--
-- 1. MVP1 spec-6 §8/§9: "Status cards" and "Collection/drop cards" are supposed to be ~15%
--    and ~10% of the feed mix respectively, triggered by moments like "first title/badge/
--    mask, rank up, Founder Pass activation" and "first box, rare card, milestone". Before
--    this migration, public.feed_posts.type existed as a column (default 'PROOF') but
--    nothing ever wrote a STATUS or COLLECTION row — every real feed post was a plain proof.
--    Wires up the highest-value, already-server-side trigger points this app has:
--      • submit_season_reflection() granting the "Light Bearer Season 0" Hidden Node badge
--      • handle_referral_signup() granting the 3-invite rare card / 5-invite badge
--      • stripe-webhook activating the Founder Pass (Deno/TS, not SQL — wired separately,
--        see supabase/functions/stripe-webhook/index.ts)
--
-- 2. spec-6 §15 "Pass zvýrazněné proofy": feed_posts never carried any signal of whether its
--    author held the Pass at post time, so proof cards had no way to show a Founder marker.
--    Adds feed_posts.author_pass_holder, set once by complete_challenge() at insert time.

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

  -- Status card (spec-6 §8) — a private reflection's numeric/text answers never leak here,
  -- only the fact that the badge was earned, same privacy line the profile/feed already
  -- draws between "what I did" (public) and "what I answered" (private).
  INSERT INTO public.feed_posts (user_id, user_name, type, content, is_public)
  VALUES (v_user_id, COALESCE(v_user_name, 'Hráč'), 'STATUS', COALESCE(v_user_name, 'Hráč') || ' odemkl(a) odznak Light Bearer Season 0.', true);

  RETURN QUERY SELECT p_percent, false;
END;
$$;

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
    -- Collection card (spec-6 §9) — "otevřel jsem box -> něco jsem získal -> je to vidět".
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

-- ================================================================
-- SECTION: Founder marker on proof cards (spec-6 §15 "Pass zvýrazněné proofy")
-- ================================================================
-- feed_posts didn't carry any signal of whether its author held the Pass at post time, so
-- the feed had no way to visually distinguish Founder proofs at all. Denormalized onto the
-- row (rather than joined from profiles at read time) so it reflects the Pass status *at
-- the moment the proof was made* — matches spec-9's "founder marker visible on profile,
-- feed, proof card" framing of it as a badge on the achievement, not a live join that would
-- retroactively re-skin someone's old proofs the day they buy the Pass.

ALTER TABLE public.feed_posts
  ADD COLUMN IF NOT EXISTS author_pass_holder BOOLEAN NOT NULL DEFAULT false;

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
