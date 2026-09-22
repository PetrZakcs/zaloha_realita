-- iWAU / Hra Reality — STRV Security Hardening & MVP 1 Spec Hardening
-- Migration: 20260922223600_security_and_spec_hardening.sql
-- Safe to re-run (idempotent).

-- ================================================================
-- SECTION 1: Secure feed_posts RLS & Atomic increment_feed_reaction RPC
-- ================================================================

-- Add reactions_plant (🌱) column according to MVP 1 spec (🔥 / 🌱 / 👁️)
ALTER TABLE public.feed_posts
  ADD COLUMN IF NOT EXISTS reactions_plant INT DEFAULT 0;

-- Backfill from reactions_lightning if exists
UPDATE public.feed_posts
SET reactions_plant = COALESCE(reactions_lightning, 0)
WHERE reactions_plant = 0 AND COALESCE(reactions_lightning, 0) > 0;

-- Drop insecure blanket update policy
DROP POLICY IF EXISTS "Allow users to update/react to feed posts" ON public.feed_posts;

-- Allow users to update only their own posts (e.g. content/visibility edits)
DROP POLICY IF EXISTS "Allow authors to update their own feed posts" ON public.feed_posts;
CREATE POLICY "Allow authors to update their own feed posts" ON public.feed_posts
  FOR UPDATE USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Atomic reaction increment function (prevents race conditions and post defacement)
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
BEGIN
  IF p_type NOT IN ('fire', 'plant', 'lightning', 'eye') THEN
    RAISE EXCEPTION 'Invalid reaction type: %', p_type USING ERRCODE = '22023';
  END IF;

  IF p_type = 'fire' THEN
    UPDATE public.feed_posts
    SET reactions_fire = COALESCE(reactions_fire, 0) + 1
    WHERE id = p_post_id;
  ELSIF p_type = 'plant' OR p_type = 'lightning' THEN
    UPDATE public.feed_posts
    SET reactions_plant = COALESCE(reactions_plant, 0) + 1,
        reactions_lightning = COALESCE(reactions_lightning, 0) + 1
    WHERE id = p_post_id;
  ELSIF p_type = 'eye' THEN
    UPDATE public.feed_posts
    SET reactions_eye = COALESCE(reactions_eye, 0) + 1
    WHERE id = p_post_id;
  END IF;

  RETURN QUERY
  SELECT fp.reactions_fire, COALESCE(fp.reactions_plant, fp.reactions_lightning, 0), fp.reactions_eye
  FROM public.feed_posts fp
  WHERE fp.id = p_post_id;
END;
$$;

REVOKE ALL ON FUNCTION public.increment_feed_reaction(UUID, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.increment_feed_reaction(UUID, TEXT) TO anon, authenticated;

-- ================================================================
-- SECTION 2: Lock down user_cards & user_badges RLS (Game integrity)
-- ================================================================

-- Direct client INSERT/UPDATE is revoked to prevent cheating;
-- cards & badges are granted strictly via server-side SECURITY DEFINER RPCs
-- (complete_challenge, submit_season_reflection, handle_referral_signup) or service_role.
DROP POLICY IF EXISTS "Allow users to insert/update their own cards" ON public.user_cards;
DROP POLICY IF EXISTS "Allow users to insert their own earned badges" ON public.user_badges;

-- ================================================================
-- SECTION 3: Hardened protect_profile_privileges() trigger
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
    -- Sanitize/cap initial client values on signup to prevent spoofed progress
    NEW.xp := LEAST(COALESCE(NEW.xp, 0), 50);
    NEW.uzel := LEAST(GREATEST(COALESCE(NEW.uzel, 1), 1), 1);
    NEW.keys_balance := LEAST(COALESCE(NEW.keys_balance, 1), 3);
    NEW.avatar_level := LEAST(COALESCE(NEW.avatar_level, 1), 1);
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
