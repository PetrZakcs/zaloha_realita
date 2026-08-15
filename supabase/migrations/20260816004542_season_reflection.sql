-- iWAU / Hra Reality — "Referenční uzel" (season-close reflection node)
-- Run this once in the Supabase SQL Editor. Safe to re-run (idempotent).
-- Requires supabase_migration_profiles_security.sql to already be applied (reuses its
-- public.check_is_admin(uuid) helper).
--
-- MVP1 spec (spec-5, "Referenční uzel") describes a dedicated flow shown once a player
-- finishes the season (today: completing the FINAL 'Uzel 9 · Boss Fight' node) — slider
-- (% real transformation), NPS tap, a fill-in-the-blank transformation sentence, an
-- "identity lock" moment, a share card, and a "Hidden Node 8" unlock. The doc calls this
-- out as the app's main source of hard validation data (% transformace, NPS, referral
-- intent, UGC sentences) for MVP1's own stated goal of "300+ validních průchodů".
--
-- Before this migration, advance_node() (supabase_migration_advance_node.sql /
-- supabase_migration_free_daily_node.sql) already detects "current node is FINAL and
-- there's no next node" and returns status 'season_completed' — but the client just closed
-- the active modal on that status. This node was reachable in name only; nothing was ever
-- shown or captured. This migration adds the storage + RPC side; the client-side flow is
-- wired up separately in gameplaySlice.js / components/modals/SeasonReflectionFlow.jsx.

CREATE TABLE IF NOT EXISTS public.season_reflections (
  id                      UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id                 UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
  transformation_percent  SMALLINT NOT NULL CHECK (transformation_percent BETWEEN 0 AND 100),
  would_recommend         BOOLEAN NOT NULL,
  -- "Kolik lidí bys do toho vzal s sebou?" — spec's [0][1][2][3+] tap; 5 doubles as "5+".
  referral_intent         SMALLINT NOT NULL CHECK (referral_intent BETWEEN 0 AND 5),
  -- Which of the 3 spec template sentences the player picked (1..3) — kept alongside the
  -- filled-in text so admin/marketing can group UGC by prompt without re-parsing it.
  sentence_template       SMALLINT NOT NULL CHECK (sentence_template BETWEEN 1 AND 3),
  sentence_text           TEXT NOT NULL CHECK (char_length(btrim(sentence_text)) BETWEEN 1 AND 500),
  created_at              TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL,
  -- One reflection per player. MVP1 has exactly one season; if/when a second season ships,
  -- this needs a season_id column and the UNIQUE constraint becomes UNIQUE(user_id, season_id).
  UNIQUE(user_id)
);

ALTER TABLE public.season_reflections ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow users to read their own season reflection" ON public.season_reflections;
CREATE POLICY "Allow users to read their own season reflection" ON public.season_reflections
  FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Allow admins to read all season reflections" ON public.season_reflections;
CREATE POLICY "Allow admins to read all season reflections" ON public.season_reflections
  FOR SELECT USING (public.check_is_admin(auth.uid()));

-- Deliberately no client-facing INSERT/UPDATE policy — this feeds investor-facing metrics
-- (% transformation, NPS, referral intent), so, same as complete_challenge()/profiles,
-- writes only happen through the validated RPC below, never a direct client insert.

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
  v_user_id      uuid := auth.uid();
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

  -- Idempotent like complete_challenge(): a second submit attempt (double-click, retry
  -- after a flaky response) returns the existing row instead of erroring the UI.
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

  -- Hidden Node 8 unlock: "Light Bearer Season 0" badge. Reuses the user_cards mechanism
  -- the rest of the app already uses for collectibles/badges (complete_challenge(), the
  -- 'collections' modal) instead of the separate public.user_badges table — that table has
  -- an open client-writable INSERT policy and zero server validation, and nothing in the
  -- app currently reads from it; not something to build a real unlock on top of as-is.
  INSERT INTO public.user_cards (user_id, card_key, sync_status, obtained_at)
  VALUES (v_user_id, 'light-bearer-season0', 'SYNCED', timezone('utc', now()))
  ON CONFLICT (user_id, card_key) DO NOTHING;

  RETURN QUERY SELECT p_percent, false;
END;
$$;

REVOKE ALL ON FUNCTION public.submit_season_reflection(smallint, boolean, smallint, smallint, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.submit_season_reflection(smallint, boolean, smallint, smallint, text) TO authenticated;
