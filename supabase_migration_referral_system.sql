-- SUPERSEDED for protect_profile_privileges(), advance_node() and handle_referral_signup()
-- — see supabase_migration_consolidated_functions.sql. The rest of this file (referral_code
-- generation trigger, referral_signups table + policies) is still the real source for those.
--
-- iWAU / Hra Reality — referral system (MVP1 spec-7 "REFERRAL SYSTÉM")
-- Run this once in the Supabase SQL Editor. Safe to re-run (idempotent).
-- Requires supabase_migration_free_daily_node.sql to already be applied (this migration's
-- advance_node() replaces that one's body, same (boolean) signature — no DROP needed).
--
-- Every player already has a unique `referral_code` column (public.profiles, added long
-- before this migration) but nothing has ever generated, displayed, or acted on it. This
-- migration wires up the whole loop from spec-7's reward table:
--   1 invite -> +1 klíč | 2 invite -> instant unlock uzel | 3 invite -> rare karta | 5 invite -> badge
-- plus the "Odemknout zdarma: přiveď 2 hráče" earn-to-unlock alternative to the Pass
-- referenced in the paywall (spec-4/spec-9) — that's what the "2 invite" reward actually
-- becomes mechanically: one stored, referral-earned skip of the next requires_pass gate,
-- redeemed by advance_node() the same way the 1-node/day free allowance already is.
-- Deliberately NOT a full Pass-equivalent unlock — spec-9 is explicit this must stay a
-- supplement, never a replacement ("nesmí nahradit Pass, jen doplnit").

-- ================================================================
-- SECTION 1: referral_code auto-generation + new profiles columns
-- ================================================================

-- Derived from the row's own already-unique id, so no collision retry loop is needed —
-- unlike a random code, this can never collide as long as profiles.id doesn't.
CREATE OR REPLACE FUNCTION public.set_default_referral_code()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NEW.referral_code IS NULL THEN
    NEW.referral_code := upper(substr(replace(NEW.id::text, '-', ''), 1, 8));
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_set_default_referral_code ON public.profiles;
CREATE TRIGGER trg_set_default_referral_code
  BEFORE INSERT ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.set_default_referral_code();

-- Backfill real accounts created before this migration existed.
UPDATE public.profiles
SET referral_code = upper(substr(replace(id::text, '-', ''), 1, 8))
WHERE referral_code IS NULL;

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS referred_by_code TEXT,
  ADD COLUMN IF NOT EXISTS free_node_credits INT NOT NULL DEFAULT 0;

-- ================================================================
-- SECTION 2: referral_signups (audit log + the source of truth for invite counts)
-- ================================================================

CREATE TABLE IF NOT EXISTS public.referral_signups (
  id            UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  referrer_id   UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
  referred_id   UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL UNIQUE,
  referral_code TEXT NOT NULL,
  created_at    TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);

ALTER TABLE public.referral_signups ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow referrers to read their own referral signups" ON public.referral_signups;
CREATE POLICY "Allow referrers to read their own referral signups" ON public.referral_signups
  FOR SELECT USING (auth.uid() = referrer_id);

DROP POLICY IF EXISTS "Allow admins to read all referral signups" ON public.referral_signups;
CREATE POLICY "Allow admins to read all referral signups" ON public.referral_signups
  FOR SELECT USING (public.check_is_admin(auth.uid()));

-- No client INSERT policy — only handle_referral_signup() below (SECURITY DEFINER,
-- fired by the profiles INSERT trigger) ever writes here.

-- ================================================================
-- SECTION 3: handle_referral_signup() — grants milestone rewards, fully server-side
-- ================================================================

CREATE OR REPLACE FUNCTION public.handle_referral_signup()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_referrer_id uuid;
  v_count       int;
BEGIN
  IF NEW.referred_by_code IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT id INTO v_referrer_id
  FROM public.profiles
  WHERE referral_code = NEW.referred_by_code AND id <> NEW.id;

  IF v_referrer_id IS NULL THEN
    -- Unknown or self-referential code — ignore silently. Never block a signup over it.
    RETURN NEW;
  END IF;

  INSERT INTO public.referral_signups (referrer_id, referred_id, referral_code)
  VALUES (v_referrer_id, NEW.id, NEW.referred_by_code)
  ON CONFLICT (referred_id) DO NOTHING;

  SELECT count(*) INTO v_count FROM public.referral_signups WHERE referrer_id = v_referrer_id;

  -- Each branch fires exactly once — v_count only ever increases by 1 per signup, so it
  -- passes through 1, 2, 3, 4, 5 in order; no separate "already granted" flag needed.
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
  ELSIF v_count = 5 THEN
    INSERT INTO public.user_cards (user_id, card_key, sync_status, obtained_at)
    VALUES (v_referrer_id, 'referral-badge-5', 'SYNCED', timezone('utc', now()))
    ON CONFLICT (user_id, card_key) DO NOTHING;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_handle_referral_signup ON public.profiles;
CREATE TRIGGER trg_handle_referral_signup
  AFTER INSERT ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.handle_referral_signup();

-- ================================================================
-- SECTION 4: protect_profile_privileges() — lock the two new columns
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
    -- free_node_credits must start at 0 for everyone — without this, a client could hand
    -- itself unlimited paywall-gate skips by just including free_node_credits in its own
    -- signup INSERT payload. referred_by_code stays client-settable at INSERT time on
    -- purpose (same trust boundary as the existing xp/keys/uzel migration-on-signup
    -- values) — it only benefits the REFERRER, once handle_referral_signup() verifies the
    -- code actually resolves to a real other player.
    NEW.free_node_credits := 0;
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

  RETURN NEW;
END;
$$;

-- ================================================================
-- SECTION 5: advance_node() — spend a referral credit before falling back to the daily gate
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
      -- Referral-earned "instant unlock" credit (2-invite reward) — takes priority over
      -- the daily free allowance below: it was earned, it's finite, and spec-9 frames it
      -- as immediate, not something to wait a day to redeem.
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
