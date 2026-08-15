-- SUPERSEDED for protect_profile_privileges() — see
-- supabase_migration_consolidated_functions.sql, which also drops set_initial_nickname()
-- and profiles.initial_nickname_set (dead code — nothing calls either anymore, see that
-- file's header for why). The showcase_card_keys/display_name_change_used ALTER TABLE
-- below and set_showcase()/profiles_public are still the real, one-time source.
--
-- iWAU / Hra Reality — Profil/Inventář split (MVP1 spec-10)
-- Run this once in the Supabase SQL Editor. Safe to re-run (idempotent).
-- Requires supabase_migration_feed_enrichment.sql to already be applied (this migration
-- redeclares protect_profile_privileges() again, adding to its existing protected-column list).
--
-- spec-10's core principle: "PROFIL = co ukazuju (výběr), INVENTÁŘ = co vlastním (celek)".
-- Three concrete features needed for that split that nothing in the schema supported yet:
--
-- 1. Showcase — "hráč si vybere 1–3 věci, které chce ukázat" on their public profile, picked
--    from cards they actually own. Ownership must be server-validated (set_showcase() below),
--    not just a free-form client-writable column, or a player could "showcase" a card key
--    they never unlocked.
--
-- 2. Display name — spec-10 §3: "1x změna zdarma, další změny později monetizace". Today
--    updateUser() lets a player rename unlimited times via a plain client-side profiles
--    UPDATE. This adds the one-free-change cap at the trigger level (the only place that can
--    actually enforce it — a client-side check is trivially bypassed).
--
-- 3. Initial nickname vs. "a change" — the onboarding 'intro' step already lets a brand-new
--    player pick their real nickname over the auto-generated "Hráč_XXXXXX" placeholder
--    (setNickname() in authSlice.js). That's initial setup, not "a change" in the spirit of
--    spec-10 §3 — if it consumed the same one-free-change budget as #2, every player would
--    already be at zero free changes before they ever reach Settings. Given a separate,
--    one-time-only path (set_initial_nickname() below) instead of overloading #2's flag.

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS showcase_card_keys TEXT[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS display_name_change_used BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS initial_nickname_set BOOLEAN NOT NULL DEFAULT false;

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
    NEW.initial_nickname_set := false;
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
  -- showcase_card_keys: RPC-only (set_showcase() below) — needs ownership validation
  -- against user_cards that a generic column lock can't express.
  NEW.showcase_card_keys     := OLD.showcase_card_keys;
  -- initial_nickname_set: RPC-only (set_initial_nickname() below).
  NEW.initial_nickname_set   := OLD.initial_nickname_set;

  -- display_name: free-form for the owner, but capped at one voluntary change ever (this is
  -- the SETTINGS rename path — see set_initial_nickname() below for the separate onboarding
  -- path, which bypasses this trigger entirely and doesn't touch display_name_change_used).
  -- Folded into this same trigger, rather than a second one, specifically to avoid a
  -- BEFORE-trigger ordering hazard: a separate trigger flipping display_name_change_used to
  -- true here would otherwise run before-or-after this one unpredictably and could get its
  -- own write clobbered by the generic "revert to OLD" pass above.
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

CREATE OR REPLACE FUNCTION public.set_initial_nickname(p_name text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_name    text := btrim(coalesce(p_name, ''));
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '28000';
  END IF;
  IF v_name = '' OR char_length(v_name) > 40 THEN
    RAISE EXCEPTION 'Invalid nickname' USING ERRCODE = '22023';
  END IF;

  IF EXISTS (SELECT 1 FROM public.profiles WHERE id = v_user_id AND initial_nickname_set = true) THEN
    RAISE EXCEPTION 'Initial nickname already set' USING ERRCODE = '22023';
  END IF;

  PERFORM set_config('app.bypass_profile_guard', 'true', true);
  UPDATE public.profiles
  SET display_name = v_name, initial_nickname_set = true
  WHERE id = v_user_id;
END;
$$;

REVOKE ALL ON FUNCTION public.set_initial_nickname(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.set_initial_nickname(text) TO authenticated;

CREATE OR REPLACE FUNCTION public.set_showcase(p_card_keys text[])
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_user_id     uuid := auth.uid();
  v_keys        text[] := COALESCE(p_card_keys, '{}');
  v_owned_count int;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '28000';
  END IF;

  IF array_length(v_keys, 1) IS NOT NULL THEN
    IF array_length(v_keys, 1) > 3 THEN
      RAISE EXCEPTION 'Showcase can hold at most 3 cards' USING ERRCODE = '22023';
    END IF;

    SELECT count(DISTINCT card_key) INTO v_owned_count
    FROM public.user_cards
    WHERE user_id = v_user_id AND card_key = ANY(v_keys);

    IF v_owned_count < array_length(ARRAY(SELECT DISTINCT unnest(v_keys)), 1) THEN
      RAISE EXCEPTION 'Showcase can only contain cards you own' USING ERRCODE = '22023';
    END IF;
  END IF;

  PERFORM set_config('app.bypass_profile_guard', 'true', true);
  UPDATE public.profiles SET showcase_card_keys = v_keys WHERE id = v_user_id;
END;
$$;

REVOKE ALL ON FUNCTION public.set_showcase(text[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.set_showcase(text[]) TO authenticated;

-- profiles_public gains showcase_card_keys so a *viewer* can see another player's chosen
-- showcase too (spec-10's whole point of a showcase is that other people see it).
CREATE OR REPLACE VIEW public.profiles_public AS
SELECT id, display_name, xp, uzel, avatar_level, pass_holder, current_streak, showcase_card_keys
FROM public.profiles;

GRANT SELECT ON public.profiles_public TO anon, authenticated;
