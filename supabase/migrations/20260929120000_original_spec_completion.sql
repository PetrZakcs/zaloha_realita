-- iWAU / Hra Reality — completing the remaining original MVP1 spec (specifikace 12–22)
-- Migration: 20260929120000_original_spec_completion.sql
-- Requires: 20260925130000_mvp1_spec_debt.sql
-- Safe to re-run (idempotent).
--
--   1. Server-side onboarding: rewards granted by the server (+50 XP, +1 key for the first
--      public proof), skip → NPC state, one-time nickname during onboarding (spec-14).
--   2. Proof media: video uploads (spec-12 §2.3 "foto/video"), feed_posts.media_type,
--      feed_posts.challenge_id for "Zkus taky" deep links (spec-17 §6).
--   3. Avatar photo (spec-14 "Vložit foto").
--   4. Feed ranking per spec-17 §12 (similarity .4 / recency .3 / engagement .2 /
--      randomness .1) with boosts: first proof, status/collection, Founder Pass (spec-20).
--   5. Share reward: +1 key +5 XP, once per share moment (spec-15, spec-17 §14).
--   6. Node badges (spec-15: "První zásah", "Level 1: Doer") + status feed posts.
--   7. Unlockable avatar frames (spec-12 §2.4 "3–5 odemykatelných rámečků") + Founder frame.
--   8. Glitch moment code fragments (spec-12 §9): #1 at the 3rd proof, #2 after a 3-day streak.
--   9. Players can read their own private proofs ("moje důkazy", spec-17 §2); admin reads
--      for the player detail (spec-21 §11); KPI views (spec-22).

-- ================================================================
-- SECTION 1: Player state + server-side onboarding
-- ================================================================

-- Per-player state that must only change through RPCs (no client write policies).
CREATE TABLE IF NOT EXISTS public.player_state (
  user_id                 UUID PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
  onboarding_completed_at TIMESTAMP WITH TIME ZONE,
  onboarding_skipped_at   TIMESTAMP WITH TIME ZONE,
  nickname_set_at         TIMESTAMP WITH TIME ZONE,
  avatar_url              TEXT,
  active_frame            TEXT,
  updated_at              TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);

ALTER TABLE public.player_state ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow public read access to player state" ON public.player_state;
CREATE POLICY "Allow public read access to player state" ON public.player_state
  FOR SELECT USING (true);

-- Everyone who already has a profile has been through onboarding in the old flow.
INSERT INTO public.player_state (user_id, onboarding_completed_at)
SELECT id, created_at FROM public.profiles
ON CONFLICT (user_id) DO NOTHING;

-- New profiles start at zero; onboarding rewards come from complete_onboarding()/publish_pledge()
-- instead of whatever the client sent in the INSERT. Runs after trg_protect_profile_privileges
-- (triggers fire in name order) and only for client inserts.
CREATE OR REPLACE FUNCTION public.reset_new_profile_progress()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF auth.role() = 'authenticated' THEN
    NEW.xp := 0;
    NEW.keys_balance := 0;
    NEW.avatar_level := 0;
    NEW.uzel := 1;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_reset_new_profile_progress ON public.profiles;
CREATE TRIGGER trg_reset_new_profile_progress
  BEFORE INSERT ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.reset_new_profile_progress();

CREATE OR REPLACE FUNCTION public.create_player_state()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  INSERT INTO public.player_state (user_id) VALUES (NEW.id) ON CONFLICT (user_id) DO NOTHING;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_create_player_state ON public.profiles;
CREATE TRIGGER trg_create_player_state
  AFTER INSERT ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.create_player_state();

-- spec-14 "FIRST REWARD: +50 XP, Status Pozorovatel Level 1" + avatar Stav 0 → Stav 1.
-- Idempotent: a second call returns the current values without granting again.
CREATE OR REPLACE FUNCTION public.complete_onboarding()
RETURNS TABLE (new_xp int, new_keys_balance int, new_avatar_level int, granted boolean)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_xp      int;
  v_keys    int;
  v_level   int;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '28000';
  END IF;

  INSERT INTO public.player_state (user_id) VALUES (v_user_id) ON CONFLICT (user_id) DO NOTHING;

  UPDATE public.player_state
  SET onboarding_completed_at = timezone('utc', now()), onboarding_skipped_at = NULL,
      updated_at = timezone('utc', now())
  WHERE user_id = v_user_id AND onboarding_completed_at IS NULL;

  IF NOT FOUND THEN
    RETURN QUERY SELECT p.xp, p.keys_balance, p.avatar_level, false FROM public.profiles p WHERE p.id = v_user_id;
    RETURN;
  END IF;

  PERFORM set_config('app.bypass_profile_guard', 'true', true);
  UPDATE public.profiles
  SET xp = xp + 50, avatar_level = GREATEST(avatar_level, 1)
  WHERE id = v_user_id
  RETURNING xp, keys_balance, avatar_level INTO v_xp, v_keys, v_level;

  RETURN QUERY SELECT v_xp, v_keys, v_level, true;
END;
$$;

REVOKE ALL ON FUNCTION public.complete_onboarding() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.complete_onboarding() TO authenticated;

-- spec-14: onboarding can be skipped; the player stays an NPC (grey avatar, auto name) until
-- they finish activation later.
CREATE OR REPLACE FUNCTION public.skip_onboarding()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_user_id uuid := auth.uid();
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '28000';
  END IF;
  INSERT INTO public.player_state (user_id) VALUES (v_user_id) ON CONFLICT (user_id) DO NOTHING;
  UPDATE public.player_state
  SET onboarding_skipped_at = timezone('utc', now()), updated_at = timezone('utc', now())
  WHERE user_id = v_user_id AND onboarding_completed_at IS NULL;
END;
$$;

REVOKE ALL ON FUNCTION public.skip_onboarding() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.skip_onboarding() TO authenticated;

-- spec-14 "Kdo jsi jako hráč? Vytvoř svou přezdívku" — once, during onboarding, without
-- spending the one free rename from spec-21 §3.
CREATE OR REPLACE FUNCTION public.set_initial_nickname(p_name text)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_name    text := btrim(COALESCE(p_name, ''));
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '28000';
  END IF;
  IF v_name !~ '^[A-Za-z0-9_ ÁČĎÉĚÍŇÓŘŠŤÚŮÝŽáčďéěíňóřšťúůýž-]{3,20}$' THEN
    RAISE EXCEPTION 'Nickname must be 3–20 letters, digits, spaces, _ or -' USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.player_state (user_id) VALUES (v_user_id) ON CONFLICT (user_id) DO NOTHING;
  IF EXISTS (
    SELECT 1 FROM public.player_state
    WHERE user_id = v_user_id AND (onboarding_completed_at IS NOT NULL OR nickname_set_at IS NOT NULL)
  ) THEN
    RAISE EXCEPTION 'Initial nickname already set' USING ERRCODE = '42501';
  END IF;

  PERFORM set_config('app.bypass_profile_guard', 'true', true);
  UPDATE public.profiles SET display_name = v_name WHERE id = v_user_id;  -- unique_violation → taken
  UPDATE public.player_state SET nickname_set_at = timezone('utc', now()), updated_at = timezone('utc', now())
  WHERE user_id = v_user_id;
  RETURN v_name;
END;
$$;

REVOKE ALL ON FUNCTION public.set_initial_nickname(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.set_initial_nickname(text) TO authenticated;

-- Onboarding pledge = the first public proof (spec-14 §4): now type ONBOARDING (rendered
-- differently in the feed) and worth +1 key, once.
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

  IF EXISTS (SELECT 1 FROM public.feed_posts WHERE user_id = v_user_id AND type IN ('ONBOARDING', 'STATUS') AND content = v_text) THEN
    RETURN;
  END IF;

  PERFORM set_config('app.bypass_profile_guard', 'true', true);
  UPDATE public.profiles SET pledge = v_text WHERE id = v_user_id;

  INSERT INTO public.feed_posts (user_id, user_name, type, content, is_public, author_pass_holder)
  VALUES (v_user_id, v_user_name, 'ONBOARDING', v_text, true, COALESCE(v_pass, false));

  IF NOT EXISTS (SELECT 1 FROM public.key_transactions WHERE user_id = v_user_id AND source = 'ONBOARDING') THEN
    UPDATE public.profiles SET keys_balance = keys_balance + 1 WHERE id = v_user_id;
    INSERT INTO public.key_transactions (user_id, amount, source, balance_after)
    SELECT v_user_id, 1, 'ONBOARDING', keys_balance FROM public.profiles WHERE id = v_user_id;
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.publish_pledge(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.publish_pledge(text) TO authenticated;

-- ================================================================
-- SECTION 2: Proof media (video), challenge link on posts
-- ================================================================

ALTER TABLE public.feed_posts ADD COLUMN IF NOT EXISTS media_type TEXT;
ALTER TABLE public.feed_posts ADD COLUMN IF NOT EXISTS challenge_id TEXT;

UPDATE public.feed_posts SET media_type = 'image' WHERE image_url IS NOT NULL AND media_type IS NULL;

-- Photos stay ≤ 10 MB client-side; the bucket-wide cap has to fit short videos.
UPDATE storage.buckets
SET file_size_limit = 52428800, -- 50 MB
    allowed_mime_types = ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/heic', 'image/heif',
                               'video/mp4', 'video/webm', 'video/quicktime']
WHERE id = 'proofs';

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
  v_media_type     text;
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

  SELECT p.uzel INTO v_uzel FROM public.profiles p WHERE p.id = v_user_id;
  IF v_node_order > COALESCE(v_uzel, 0) THEN
    RAISE EXCEPTION 'Challenge % belongs to a node the player has not reached', p_challenge_id
      USING ERRCODE = '42501';
  END IF;

  IF v_proof_text IS NOT NULL AND char_length(v_proof_text) > 500 THEN
    RAISE EXCEPTION 'Proof text too long (max 500 characters)' USING ERRCODE = '22023';
  END IF;

  IF p_image_url IS NOT NULL THEN
    IF p_image_url NOT LIKE '%/storage/v1/object/public/proofs/' || v_user_id::text || '/%' THEN
      RAISE EXCEPTION 'Invalid proof media URL' USING ERRCODE = '22023';
    END IF;
    v_media_type := CASE WHEN lower(p_image_url) ~ '\.(mp4|webm|mov)$' THEN 'video' ELSE 'image' END;
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

  INSERT INTO public.feed_posts (user_id, user_name, content, image_url, media_type, challenge_id, is_public, author_pass_holder)
  VALUES (
    v_user_id, v_user_name,
    COALESCE(v_proof_text, 'Prokázal jsem, že nejsem NPC! 🟢'),
    p_image_url, v_media_type, p_challenge_id, p_is_public, COALESCE(v_pass_holder, false)
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
-- SECTION 3: Avatar photo
-- ================================================================

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('avatars', 'avatars', true, 2097152, ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif'])
ON CONFLICT (id) DO UPDATE
SET public = true, file_size_limit = 2097152,
    allowed_mime_types = ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif'];

DROP POLICY IF EXISTS "Allow users to upload their own avatar" ON storage.objects;
CREATE POLICY "Allow users to upload their own avatar"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'avatars'
    AND auth.role() = 'authenticated'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

DROP POLICY IF EXISTS "Allow public read access to avatars" ON storage.objects;
CREATE POLICY "Allow public read access to avatars"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'avatars');

-- NULL removes the photo (back to the default avatar).
CREATE OR REPLACE FUNCTION public.set_avatar_url(p_url text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_user_id uuid := auth.uid();
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '28000';
  END IF;
  IF p_url IS NOT NULL AND p_url NOT LIKE '%/storage/v1/object/public/avatars/' || v_user_id::text || '/%' THEN
    RAISE EXCEPTION 'Invalid avatar URL' USING ERRCODE = '22023';
  END IF;
  INSERT INTO public.player_state (user_id, avatar_url) VALUES (v_user_id, p_url)
  ON CONFLICT (user_id) DO UPDATE SET avatar_url = EXCLUDED.avatar_url, updated_at = timezone('utc', now());
END;
$$;

REVOKE ALL ON FUNCTION public.set_avatar_url(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.set_avatar_url(text) TO authenticated;

-- ================================================================
-- SECTION 4: Unlockable frames (spec-12 §2.4, spec-21 §6) + Founder frame (spec-20)
-- ================================================================

-- frame-1..frame-5 unlock with avatar level 1..5; frame-founder needs an active Pass.
CREATE OR REPLACE FUNCTION public.set_active_frame(p_frame text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_level   int;
  v_pass    boolean;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '28000';
  END IF;

  SELECT avatar_level, pass_holder INTO v_level, v_pass FROM public.profiles WHERE id = v_user_id;

  IF p_frame IS NOT NULL AND NOT (
    (p_frame ~ '^frame-[1-5]$' AND COALESCE(v_level, 0) >= substr(p_frame, 7)::int)
    OR (p_frame = 'frame-founder' AND COALESCE(v_pass, false))
  ) THEN
    RAISE EXCEPTION 'Frame % is locked', p_frame USING ERRCODE = '42501';
  END IF;

  INSERT INTO public.player_state (user_id, active_frame) VALUES (v_user_id, p_frame)
  ON CONFLICT (user_id) DO UPDATE SET active_frame = EXCLUDED.active_frame, updated_at = timezone('utc', now());
END;
$$;

REVOKE ALL ON FUNCTION public.set_active_frame(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.set_active_frame(text) TO authenticated;

-- ================================================================
-- SECTION 5: Node badges, glitch fragments
-- ================================================================

-- Which badge a node grants. Editable by admins; content can change per theme.
CREATE TABLE IF NOT EXISTS public.node_rewards (
  node_order  INT PRIMARY KEY,
  badge_key   TEXT NOT NULL UNIQUE,
  title       TEXT NOT NULL,
  description TEXT NOT NULL,
  rarity      TEXT NOT NULL DEFAULT 'common' CHECK (rarity IN ('common', 'rare', 'epic', 'legendary'))
);

ALTER TABLE public.node_rewards ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow public read access to node rewards" ON public.node_rewards;
CREATE POLICY "Allow public read access to node rewards" ON public.node_rewards
  FOR SELECT USING (true);

DROP POLICY IF EXISTS "Allow admin write access to node rewards" ON public.node_rewards;
CREATE POLICY "Allow admin write access to node rewards" ON public.node_rewards
  FOR ALL TO authenticated
  USING (public.check_is_admin(auth.uid()))
  WITH CHECK (public.check_is_admin(auth.uid()));

-- spec-15: node 3 "První zásah" (first publicly visible badge), node 7 "Level 1: Doer".
INSERT INTO public.node_rewards (node_order, badge_key, title, description, rarity) VALUES
  (3, 'prvni-zasah', 'První zásah', 'Udělal(a) jsi první skutečný zásah do svého okolí.', 'common'),
  (7, 'level-1-doer', 'Level 1: Doer', 'Dokončil(a) jsi celou transformační linku sezóny.', 'rare')
ON CONFLICT (node_order) DO NOTHING;

CREATE TABLE IF NOT EXISTS public.player_fragments (
  user_id     UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
  fragment_no INT NOT NULL,
  code        TEXT NOT NULL,
  earned_at   TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL,
  PRIMARY KEY (user_id, fragment_no)
);

ALTER TABLE public.player_fragments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow users to read their own fragments" ON public.player_fragments;
CREATE POLICY "Allow users to read their own fragments" ON public.player_fragments
  FOR SELECT TO authenticated USING (auth.uid() = user_id OR public.check_is_admin(auth.uid()));

CREATE OR REPLACE FUNCTION public.fragment_code(p_user_id uuid, p_no int)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT 'HR-' || lpad(p_no::text, 2, '0') || '-' || upper(substr(md5(p_user_id::text || ':' || p_no::text), 1, 6));
$$;

-- On each completion: the node's badge (+ status post), and fragment #1 at the 3rd proof.
CREATE OR REPLACE FUNCTION public.handle_completion_rewards()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_reward     record;
  v_user_name  text;
  v_inserted   int;
  v_completion_count int;
BEGIN
  SELECT nr.* INTO v_reward
  FROM public.challenges c
  JOIN public.story_nodes sn ON sn.id = c.story_node_id
  JOIN public.node_rewards nr ON nr.node_order = sn.node_order
  WHERE c.id = NEW.challenge_id;

  IF v_reward.badge_key IS NOT NULL THEN
    INSERT INTO public.user_badges (user_id, badge_key)
    VALUES (NEW.user_id, v_reward.badge_key)
    ON CONFLICT (user_id, badge_key) DO NOTHING;
    GET DIAGNOSTICS v_inserted = ROW_COUNT;

    IF v_inserted > 0 THEN
      SELECT display_name INTO v_user_name FROM public.profiles WHERE id = NEW.user_id;
      INSERT INTO public.feed_posts (user_id, user_name, type, content, is_public)
      VALUES (NEW.user_id, COALESCE(v_user_name, 'Hráč'), 'STATUS',
              COALESCE(v_user_name, 'Hráč') || ' získal(a) odznak ' || v_reward.title || '.', true);
    END IF;
  END IF;

  SELECT count(*) INTO v_completion_count FROM public.challenge_completions WHERE user_id = NEW.user_id;
  IF v_completion_count = 3 THEN
    INSERT INTO public.player_fragments (user_id, fragment_no, code)
    VALUES (NEW.user_id, 1, public.fragment_code(NEW.user_id, 1))
    ON CONFLICT DO NOTHING;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_handle_completion_rewards ON public.challenge_completions;
CREATE TRIGGER trg_handle_completion_rewards
  AFTER INSERT ON public.challenge_completions
  FOR EACH ROW EXECUTE FUNCTION public.handle_completion_rewards();

-- Same as the 20260925120000 version, plus fragment #2 ("Udrž streak 3 dny a odemkneš další
-- fragment") once the streak reaches 3 days after fragment #1 was earned.
CREATE OR REPLACE FUNCTION public.record_daily_activity()
RETURNS TABLE (
  current_streak int,
  days_since_last_active int
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
#variable_conflict use_column
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

  IF v_streak >= 3 AND EXISTS (
    SELECT 1 FROM public.player_fragments
    WHERE user_id = v_user_id AND fragment_no = 1
      AND (timezone('utc', earned_at))::date <= v_today - 2
  ) THEN
    INSERT INTO public.player_fragments (user_id, fragment_no, code)
    VALUES (v_user_id, 2, public.fragment_code(v_user_id, 2))
    ON CONFLICT DO NOTHING;
  END IF;

  RETURN QUERY SELECT v_streak, v_days;
END;
$$;

REVOKE ALL ON FUNCTION public.record_daily_activity() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.record_daily_activity() TO authenticated;

-- ================================================================
-- SECTION 6: Share reward (spec-15 "za sdílení +1 klíč navíc", spec-17 §14 "+1 key +5 XP")
-- ================================================================

CREATE TABLE IF NOT EXISTS public.share_rewards (
  user_id     UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
  source_type TEXT NOT NULL CHECK (source_type IN ('challenge', 'onboarding', 'season')),
  source_id   TEXT NOT NULL,
  created_at  TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL,
  PRIMARY KEY (user_id, source_type, source_id)
);

ALTER TABLE public.share_rewards ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow users to read their own share rewards" ON public.share_rewards;
CREATE POLICY "Allow users to read their own share rewards" ON public.share_rewards
  FOR SELECT TO authenticated USING (auth.uid() = user_id OR public.check_is_admin(auth.uid()));

-- One reward per share moment: a completed challenge, the onboarding signal, the season card.
-- Returns true if granted, false if this moment was already rewarded.
CREATE OR REPLACE FUNCTION public.claim_share_reward(p_source_type text, p_source_id text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_user_id  uuid := auth.uid();
  v_inserted int;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '28000';
  END IF;

  IF p_source_type = 'challenge' THEN
    IF NOT EXISTS (SELECT 1 FROM public.challenge_completions WHERE user_id = v_user_id AND challenge_id = p_source_id) THEN
      RAISE EXCEPTION 'Challenge not completed' USING ERRCODE = '42501';
    END IF;
  ELSIF p_source_type = 'onboarding' THEN
    IF p_source_id <> 'onboarding' OR NOT EXISTS (
      SELECT 1 FROM public.player_state WHERE user_id = v_user_id AND onboarding_completed_at IS NOT NULL
    ) THEN
      RAISE EXCEPTION 'Onboarding not completed' USING ERRCODE = '42501';
    END IF;
  ELSIF p_source_type = 'season' THEN
    IF p_source_id <> 'season-0' OR NOT EXISTS (SELECT 1 FROM public.season_reflections WHERE user_id = v_user_id) THEN
      RAISE EXCEPTION 'Season not completed' USING ERRCODE = '42501';
    END IF;
  ELSE
    RAISE EXCEPTION 'Unknown share source: %', p_source_type USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.share_rewards (user_id, source_type, source_id)
  VALUES (v_user_id, p_source_type, p_source_id)
  ON CONFLICT DO NOTHING;
  GET DIAGNOSTICS v_inserted = ROW_COUNT;
  IF v_inserted = 0 THEN
    RETURN false;
  END IF;

  PERFORM set_config('app.bypass_profile_guard', 'true', true);
  UPDATE public.profiles SET keys_balance = keys_balance + 1, xp = xp + 5 WHERE id = v_user_id;
  INSERT INTO public.key_transactions (user_id, amount, source, balance_after)
  SELECT v_user_id, 1, 'SHARE', keys_balance FROM public.profiles WHERE id = v_user_id;
  RETURN true;
END;
$$;

REVOKE ALL ON FUNCTION public.claim_share_reward(text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.claim_share_reward(text, text) TO authenticated;

-- ================================================================
-- SECTION 7: Ranked feed (spec-17 §12)
-- ================================================================

CREATE OR REPLACE FUNCTION public.get_feed(p_limit int DEFAULT 50)
RETURNS TABLE (
  id uuid,
  user_id uuid,
  user_name text,
  type text,
  content text,
  image_url text,
  media_type text,
  challenge_id text,
  challenge_node_order int,
  author_pass_holder boolean,
  author_frame text,
  author_avatar_url text,
  author_avatar_level int,
  author_onboarded boolean,
  is_first_proof boolean,
  reactions_fire int,
  reactions_plant int,
  reactions_eye int,
  created_at timestamptz
)
LANGUAGE sql
VOLATILE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  WITH viewer AS (
    SELECT (SELECT uzel FROM public.profiles WHERE id = auth.uid()) AS uzel
  ),
  candidates AS (
    SELECT fp.*, p.uzel AS author_uzel, p.avatar_level AS author_level,
           ps.active_frame, ps.avatar_url, (ps.onboarding_completed_at IS NOT NULL) AS onboarded,
           sn.node_order AS node_order,
           (fp.type IN ('PROOF', 'ONBOARDING') AND fp.created_at = (
              SELECT min(x.created_at) FROM public.feed_posts x
              WHERE x.user_id = fp.user_id AND x.type IN ('PROOF', 'ONBOARDING')
           )) AS first_proof
    FROM public.feed_posts fp
    LEFT JOIN public.profiles p ON p.id = fp.user_id
    LEFT JOIN public.player_state ps ON ps.user_id = fp.user_id
    LEFT JOIN public.challenges c ON c.id = fp.challenge_id
    LEFT JOIN public.story_nodes sn ON sn.id = c.story_node_id
    WHERE fp.is_public = true
      AND fp.created_at > timezone('utc', now()) - interval '30 days'
    ORDER BY fp.created_at DESC
    LIMIT 300
  ),
  scored AS (
    SELECT c.*,
      (
        0.4 * CASE WHEN v.uzel IS NULL OR c.author_uzel IS NULL THEN 0.5
                   ELSE 1 - LEAST(abs(c.author_uzel - v.uzel), 8) / 8.0 END
      + 0.3 * exp(-extract(epoch FROM (timezone('utc', now()) - c.created_at)) / 3600.0 / 48.0)
      + 0.2 * LEAST(ln(1 + COALESCE(c.reactions_fire, 0) + COALESCE(c.reactions_plant, 0) + COALESCE(c.reactions_eye, 0)) / ln(51), 1)
      + 0.1 * random()
      )
      * CASE WHEN c.first_proof THEN 1.3 ELSE 1 END
      * CASE WHEN c.type IN ('STATUS', 'COLLECTION') THEN 1.15 ELSE 1 END
      * CASE WHEN c.author_pass_holder THEN 1.25 ELSE 1 END   -- spec-20 "+20–30 % visibility"
      AS score
    FROM candidates c CROSS JOIN viewer v
  )
  SELECT s.id, s.user_id, s.user_name, s.type, s.content, s.image_url, s.media_type,
         s.challenge_id, s.node_order, s.author_pass_holder, s.active_frame, s.avatar_url,
         s.author_level, s.onboarded, s.first_proof,
         s.reactions_fire, COALESCE(s.reactions_plant, s.reactions_lightning, 0), s.reactions_eye, s.created_at
  FROM scored s
  ORDER BY s.score DESC
  LIMIT LEAST(GREATEST(COALESCE(p_limit, 50), 1), 100);
$$;

REVOKE ALL ON FUNCTION public.get_feed(int) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_feed(int) TO anon, authenticated;

-- ================================================================
-- SECTION 8: Own proofs, public profile fields, admin reads
-- ================================================================

-- "Sekce, kde uvidíme všechny své proofy" — including private ones (spec-17 §2).
DROP POLICY IF EXISTS "Allow authors to read their own feed posts" ON public.feed_posts;
CREATE POLICY "Allow authors to read their own feed posts" ON public.feed_posts
  FOR SELECT TO authenticated USING (auth.uid() = user_id);

-- Appends identity fields; existing columns keep their order (CREATE OR REPLACE VIEW rule).
CREATE OR REPLACE VIEW public.profiles_public AS
SELECT p.id, p.display_name, p.xp, p.uzel, p.avatar_level, p.pass_holder, p.current_streak, p.showcase_card_keys,
       ps.avatar_url,
       ps.active_frame,
       (ps.onboarding_completed_at IS NOT NULL) AS onboarding_completed,
       -- spec-14/16 status ladder: NPC (onboarding skipped) → Pozorovatel → Hráč (season done)
       CASE
         WHEN EXISTS (SELECT 1 FROM public.season_reflections sr WHERE sr.user_id = p.id) THEN 'Hráč'
         WHEN ps.onboarding_completed_at IS NOT NULL THEN 'Pozorovatel'
         ELSE 'NPC'
       END AS status_title
FROM public.profiles p
LEFT JOIN public.player_state ps ON ps.user_id = p.id;

GRANT SELECT ON public.profiles_public TO anon, authenticated;

-- Admin player detail (spec-21 §11: pass status, referral status, activity).
DROP POLICY IF EXISTS "Allow admins to read all key transactions" ON public.key_transactions;
CREATE POLICY "Allow admins to read all key transactions" ON public.key_transactions
  FOR SELECT TO authenticated USING (public.check_is_admin(auth.uid()));

DROP POLICY IF EXISTS "Allow admins to read all subscriptions" ON public.subscriptions;
CREATE POLICY "Allow admins to read all subscriptions" ON public.subscriptions
  FOR SELECT TO authenticated USING (public.check_is_admin(auth.uid()));

DROP POLICY IF EXISTS "Allow admins to read all boxes" ON public.mystery_boxes;
CREATE POLICY "Allow admins to read all boxes" ON public.mystery_boxes
  FOR SELECT TO authenticated USING (public.check_is_admin(auth.uid()));

-- ================================================================
-- SECTION 9: KPI views (spec-22) — SQL Editor / service role only
-- ================================================================

-- Core game funnel: how many players completed each node's challenge (spec-22 "CORE GAME").
CREATE OR REPLACE VIEW public.kpi_node_funnel AS
SELECT sn.node_order, sn.title, count(DISTINCT cc.user_id) AS players_completed
FROM public.story_nodes sn
LEFT JOIN public.challenges c ON c.story_node_id = sn.id
LEFT JOIN public.challenge_completions cc ON cc.challenge_id = c.id
GROUP BY sn.node_order, sn.title
ORDER BY sn.node_order;

-- Retention by signup day: returned on day 1 / 3 / 7 (any app_opened event), spec-22 "RETENTION".
CREATE OR REPLACE VIEW public.kpi_retention AS
WITH cohort AS (
  SELECT id AS user_id, (timezone('utc', created_at))::date AS signup_day FROM public.profiles
),
active_days AS (
  SELECT DISTINCT user_id, (timezone('utc', created_at))::date AS day
  FROM public.analytics_events WHERE event_name = 'app_opened' AND user_id IS NOT NULL
)
SELECT c.signup_day,
       count(*) AS players,
       count(*) FILTER (WHERE EXISTS (SELECT 1 FROM active_days a WHERE a.user_id = c.user_id AND a.day = c.signup_day + 1)) AS d1,
       count(*) FILTER (WHERE EXISTS (SELECT 1 FROM active_days a WHERE a.user_id = c.user_id AND a.day = c.signup_day + 3)) AS d3,
       count(*) FILTER (WHERE EXISTS (SELECT 1 FROM active_days a WHERE a.user_id = c.user_id AND a.day = c.signup_day + 7)) AS d7
FROM cohort c
GROUP BY c.signup_day
ORDER BY c.signup_day DESC;

-- Proofs: public vs private, photo/video vs text, per player (spec-22 "PROOF SYSTÉM").
CREATE OR REPLACE VIEW public.kpi_proofs AS
SELECT count(*) AS proofs,
       count(DISTINCT user_id) AS players_with_proof,
       count(*) FILTER (WHERE is_public) AS public_proofs,
       count(*) FILTER (WHERE NOT is_public) AS private_proofs,
       count(*) FILTER (WHERE media_type = 'image') AS photo_proofs,
       count(*) FILTER (WHERE media_type = 'video') AS video_proofs,
       count(*) FILTER (WHERE media_type IS NULL) AS text_proofs
FROM public.feed_posts
WHERE type = 'PROOF';

REVOKE ALL ON public.kpi_node_funnel, public.kpi_retention, public.kpi_proofs FROM anon, authenticated;
