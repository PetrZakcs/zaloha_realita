-- SUPERSEDED for protect_profile_privileges() and advance_node() — see
-- supabase_migration_consolidated_functions.sql, which is now the single source of truth
-- for both. Run that file (after this one) to get the current live versions; re-running
-- THIS file's copies is harmless (idempotent) but stale — it won't include later
-- migrations' additions (referral credits, showcase/display-name guards, etc.).
--
-- iWAU / Hra Reality — soft-gate free players to 1 story node / day past the paywall
-- Run this once in the Supabase SQL Editor. Safe to re-run (idempotent).
--
-- MVP1 spec ("Strategie paywallu" / "Co je Pass"): advance_node() (see
-- supabase_migration_advance_node.sql) currently HARD-blocks a free player at any
-- requires_pass node — 'pass_required' just stops them cold with no way past it short of
-- buying the Pass. The spec instead wants a SOFT gate from node 4 onward: a free player
-- can still keep going, just at most 1 story node per calendar day (UTC), without the
-- Founder extras (highlighted proof, full certificate, Founder identity). The hard
-- paywall MOMENT still needs to fire (so the emotional upsell isn't lost) — the change is
-- that declining it no longer dead-ends the player.
--
-- Design: advance_node() gets one new optional parameter, p_use_free_daily (default
-- false), and profiles gets one new tracked column, free_node_advance_date.
--   • First time a free player reaches a gated node in a given call: still returns
--     'pass_required' (unchanged) so the client shows the paywall moment.
--   • If the player picks "Pokračovat zdarma" instead of buying the Pass, the client
--     re-calls advance_node(p_use_free_daily := true) — server checks that today's free
--     slot hasn't already been used (free_node_advance_date <> today), then allows the
--     advance and records today's date.
--   • If they've already used today's free slot and try again: 'daily_limit_reached'
--     instead of 'pass_required' — different client copy ("come back tomorrow" vs. "buy
--     the Pass"), same underlying block.
-- p_use_free_daily is an explicit intent flag, not a trusted value — same pattern as
-- complete_challenge()'s p_is_public: the server independently re-derives whether the
-- slot is actually free before honoring it.

-- ================================================================
-- SECTION 1: profiles.free_node_advance_date + updated column-privilege trigger
-- ================================================================

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS free_node_advance_date date;

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
  -- New: only advance_node()'s own bypass-guarded write may move this forward — otherwise
  -- a free player could just PATCH it themselves to "today" every day, or clear it back to
  -- NULL to keep re-triggering the paywall moment (harmless) or to grant themselves an
  -- extra free node the moment they hit an unrelated bug in this trigger.
  NEW.free_node_advance_date := OLD.free_node_advance_date;

  RETURN NEW;
END;
$$;

-- ================================================================
-- SECTION 2: advance_node() — soft-gate variant
-- ================================================================

-- The old zero-arg signature is a distinct overload from the new one-arg signature below;
-- CREATE OR REPLACE would leave it orphaned instead of replacing it, so drop it explicitly.
DROP FUNCTION IF EXISTS public.advance_node();

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
  v_today             date := (timezone('utc', now()))::date;
  v_current_node      record;
  v_next_node         record;
  v_target_uzel       int;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '28000';
  END IF;

  SELECT p.uzel, p.pass_holder, p.free_node_advance_date
  INTO v_uzel, v_pass_holder, v_free_advance_date
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
    IF v_free_advance_date IS NOT NULL AND v_free_advance_date = v_today THEN
      -- Already used today's one free story node — no amount of retrying (with or
      -- without p_use_free_daily) grants a second one today.
      RETURN QUERY SELECT v_uzel, 'daily_limit_reached'::text;
      RETURN;
    END IF;

    IF NOT p_use_free_daily THEN
      -- Surface the paywall moment first; don't silently spend today's free slot just
      -- because the player clicked "Pokračovat" without having seen/declined the Pass
      -- offer. The client re-calls with p_use_free_daily := true if they pick
      -- "Pokračovat zdarma" from that screen.
      RETURN QUERY SELECT v_uzel, 'pass_required'::text;
      RETURN;
    END IF;

    -- Free player opted in — this becomes today's one free advance.
    PERFORM set_config('app.bypass_profile_guard', 'true', true);
    UPDATE public.profiles SET free_node_advance_date = v_today WHERE id = v_user_id;
  END IF;

  PERFORM set_config('app.bypass_profile_guard', 'true', true);
  UPDATE public.profiles SET uzel = v_target_uzel WHERE id = v_user_id;

  RETURN QUERY SELECT v_target_uzel, 'advanced'::text;
END;
$$;

REVOKE ALL ON FUNCTION public.advance_node(boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.advance_node(boolean) TO authenticated;
