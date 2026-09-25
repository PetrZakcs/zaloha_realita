-- iWAU / Hra Reality — MVP1 (original spec) delivery gaps
-- Migration: 20260925130000_mvp1_spec_debt.sql
-- Requires: 20260925120000_security_audit_fixes.sql
-- Safe to re-run (idempotent).
--
-- Closes original-spec gaps that are backend logic (survive the upcoming redesign):
--   1. Paywall after node 3 (spec-13/19: Pass unlocks nodes 4+, free = 1 node/day).
--   2. Referral rewards count ACTIVATED players (first completed challenge), not signups
--      (spec-4 "přiveď 2 aktivované hráče — musí projít onboardingem").
--   3. Report button + auto-hide after 3 reports + admin queue (spec-12 §8.3 moderation).
--   4. "Top Doers this week" — 5 players (spec-12 §5.3).
--   5. Mystery box for every 3rd earned key (spec-12 §2.1). Box CONTENT is configured in
--      mystery_box_pool — Season 0 album cards are NOT in the pool (each has its own earning
--      condition on album.hrareality.cz), so the pool starts empty until the client supplies it.

-- ================================================================
-- SECTION 1: Paywall after node 3
-- ================================================================

UPDATE public.story_nodes
SET requires_pass = (node_order >= 4)
WHERE type IS DISTINCT FROM 'REFERENTIAL';

-- ================================================================
-- SECTION 2: Referral rewards on activation
-- ================================================================

ALTER TABLE public.referral_signups
  ADD COLUMN IF NOT EXISTS activated_at TIMESTAMP WITH TIME ZONE;

-- Signup now only records the relationship; rewards move to handle_referral_activation().
CREATE OR REPLACE FUNCTION public.handle_referral_signup()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_referrer_id uuid;
BEGIN
  IF NEW.referred_by_code IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT id INTO v_referrer_id
  FROM public.profiles
  WHERE referral_code = NEW.referred_by_code AND id <> NEW.id;

  IF v_referrer_id IS NULL THEN
    RETURN NEW;
  END IF;

  INSERT INTO public.referral_signups (referrer_id, referred_id, referral_code)
  VALUES (v_referrer_id, NEW.id, NEW.referred_by_code)
  ON CONFLICT (referred_id) DO NOTHING;

  RETURN NEW;
END;
$$;

-- Fires on a player's first completed challenge: marks their referral as activated and grants
-- the referrer's milestone reward for their Nth activated player (same ladder as before:
-- 1 = +1 key, 2 = free node unlock, 3 = rare card, 5 = badge).
CREATE OR REPLACE FUNCTION public.handle_referral_activation()
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
  UPDATE public.referral_signups
  SET activated_at = timezone('utc', now())
  WHERE referred_id = NEW.user_id AND activated_at IS NULL
  RETURNING referrer_id INTO v_referrer_id;

  IF v_referrer_id IS NULL THEN
    RETURN NEW;  -- not referred, or already activated
  END IF;

  SELECT display_name INTO v_referrer_name FROM public.profiles WHERE id = v_referrer_id;
  SELECT count(*) INTO v_count
  FROM public.referral_signups
  WHERE referrer_id = v_referrer_id AND activated_at IS NOT NULL;

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
    VALUES (v_referrer_id, COALESCE(v_referrer_name, 'Hráč'), 'COLLECTION',
            COALESCE(v_referrer_name, 'Hráč') || ' získal(a) vzácnou kartu za pozvání přátel.', true);
  ELSIF v_count = 5 THEN
    INSERT INTO public.user_cards (user_id, card_key, sync_status, obtained_at)
    VALUES (v_referrer_id, 'referral-badge-5', 'SYNCED', timezone('utc', now()))
    ON CONFLICT (user_id, card_key) DO NOTHING;
    INSERT INTO public.feed_posts (user_id, user_name, type, content, is_public)
    VALUES (v_referrer_id, COALESCE(v_referrer_name, 'Hráč'), 'STATUS',
            COALESCE(v_referrer_name, 'Hráč') || ' získal(a) odznak Nositel Světla.', true);
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_handle_referral_activation ON public.challenge_completions;
CREATE TRIGGER trg_handle_referral_activation
  AFTER INSERT ON public.challenge_completions
  FOR EACH ROW EXECUTE FUNCTION public.handle_referral_activation();

-- Players referred before this migration who have already completed a challenge count as
-- activated (their referrers already received the old signup-based rewards).
UPDATE public.referral_signups rs
SET activated_at = (
  SELECT min(cc.completed_at) FROM public.challenge_completions cc WHERE cc.user_id = rs.referred_id
)
WHERE rs.activated_at IS NULL
  AND EXISTS (SELECT 1 FROM public.challenge_completions cc WHERE cc.user_id = rs.referred_id);

-- ================================================================
-- SECTION 3: Report button, auto-hide, admin queue
-- ================================================================

ALTER TABLE public.feed_posts
  ADD COLUMN IF NOT EXISTS hidden_by_reports BOOLEAN NOT NULL DEFAULT false;

CREATE TABLE IF NOT EXISTS public.feed_reports (
  post_id     UUID REFERENCES public.feed_posts(id) ON DELETE CASCADE NOT NULL,
  reporter_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
  reason      TEXT NOT NULL CHECK (reason IN ('spam', 'inappropriate', 'harassment', 'dangerous', 'privacy', 'other')),
  created_at  TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL,
  PRIMARY KEY (post_id, reporter_id)
);

ALTER TABLE public.feed_reports ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow admins to read reports" ON public.feed_reports;
CREATE POLICY "Allow admins to read reports" ON public.feed_reports
  FOR SELECT TO authenticated USING (public.check_is_admin(auth.uid()));

DROP POLICY IF EXISTS "Allow admins to delete reports" ON public.feed_reports;
CREATE POLICY "Allow admins to delete reports" ON public.feed_reports
  FOR DELETE TO authenticated USING (public.check_is_admin(auth.uid()));

-- Three different players reporting a post hides it from the feed until an admin reviews it
-- (spec-12: "Bez moderace riskujeme porn/spam"). Returns whether the post is now hidden.
CREATE OR REPLACE FUNCTION public.report_post(p_post_id uuid, p_reason text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_author  uuid;
  v_reports int;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '28000';
  END IF;

  SELECT user_id INTO v_author FROM public.feed_posts WHERE id = p_post_id AND is_public = true;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Post not found' USING ERRCODE = 'P0002';
  END IF;
  IF v_author = v_user_id THEN
    RAISE EXCEPTION 'Cannot report your own post' USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.feed_reports (post_id, reporter_id, reason)
  VALUES (p_post_id, v_user_id, p_reason)
  ON CONFLICT (post_id, reporter_id) DO NOTHING;

  SELECT count(*) INTO v_reports FROM public.feed_reports WHERE post_id = p_post_id;

  IF v_reports >= 3 THEN
    UPDATE public.feed_posts
    SET is_public = false, hidden_by_reports = true
    WHERE id = p_post_id;
    RETURN true;
  END IF;

  RETURN false;
END;
$$;

REVOKE ALL ON FUNCTION public.report_post(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.report_post(uuid, text) TO authenticated;

-- ================================================================
-- SECTION 4: Top Doers this week (5 players)
-- ================================================================

-- XP earned from challenge completions since Monday 00:00 Prague time.
CREATE OR REPLACE FUNCTION public.get_weekly_top_doers(p_limit int DEFAULT 5)
RETURNS TABLE (
  id uuid,
  display_name text,
  avatar_level int,
  pass_holder boolean,
  week_xp int,
  week_completions int
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT p.id, p.display_name, p.avatar_level, p.pass_holder,
         SUM(c.reward_xp)::int AS week_xp,
         COUNT(*)::int AS week_completions
  FROM public.challenge_completions cc
  JOIN public.challenges c ON c.id = cc.challenge_id
  JOIN public.profiles p ON p.id = cc.user_id
  WHERE cc.completed_at >= (date_trunc('week', now() AT TIME ZONE 'Europe/Prague') AT TIME ZONE 'Europe/Prague')
  GROUP BY p.id, p.display_name, p.avatar_level, p.pass_holder
  ORDER BY week_xp DESC, week_completions DESC, min(cc.completed_at) ASC
  LIMIT LEAST(GREATEST(COALESCE(p_limit, 5), 1), 20);
$$;

REVOKE ALL ON FUNCTION public.get_weekly_top_doers(int) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_weekly_top_doers(int) TO anon, authenticated;

-- ================================================================
-- SECTION 5: Mystery box for every 3rd earned key
-- ================================================================

-- What a box can contain. Filled by the team/admin (client to supply content) — intentionally
-- not seeded with Season 0 album cards, which each have their own earning condition.
CREATE TABLE IF NOT EXISTS public.mystery_box_pool (
  card_key    TEXT PRIMARY KEY,
  title       TEXT NOT NULL,
  rarity      TEXT NOT NULL CHECK (rarity IN ('common', 'rare', 'epic', 'legendary')),
  description TEXT,
  weight      INT NOT NULL DEFAULT 100 CHECK (weight > 0),
  active      BOOLEAN NOT NULL DEFAULT true,
  created_at  TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);

ALTER TABLE public.mystery_box_pool ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow public read access to box pool" ON public.mystery_box_pool;
CREATE POLICY "Allow public read access to box pool" ON public.mystery_box_pool
  FOR SELECT USING (true);

DROP POLICY IF EXISTS "Allow admin write access to box pool" ON public.mystery_box_pool;
CREATE POLICY "Allow admin write access to box pool" ON public.mystery_box_pool
  FOR ALL TO authenticated
  USING (public.check_is_admin(auth.uid()))
  WITH CHECK (public.check_is_admin(auth.uid()));

CREATE TABLE IF NOT EXISTS public.mystery_boxes (
  id         UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id    UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
  source     TEXT NOT NULL DEFAULT 'keys',
  status     TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'opened')),
  card_key   TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL,
  opened_at  TIMESTAMP WITH TIME ZONE
);

ALTER TABLE public.mystery_boxes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow users to read their own boxes" ON public.mystery_boxes;
CREATE POLICY "Allow users to read their own boxes" ON public.mystery_boxes
  FOR SELECT USING (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_mystery_boxes_user ON public.mystery_boxes(user_id, status);

-- Every key credit in the ledger checks whether the player crossed another multiple of 3
-- lifetime-earned keys. Keys stay spendable — the box is a milestone reward, not a purchase.
CREATE OR REPLACE FUNCTION public.grant_earned_mystery_boxes()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_earned  int;
  v_granted int;
  v_due     int;
BEGIN
  IF NEW.amount <= 0 THEN
    RETURN NEW;
  END IF;

  SELECT COALESCE(SUM(amount), 0) INTO v_earned
  FROM public.key_transactions
  WHERE user_id = NEW.user_id AND amount > 0;

  SELECT count(*) INTO v_granted
  FROM public.mystery_boxes
  WHERE user_id = NEW.user_id AND source = 'keys';

  v_due := (v_earned / 3) - v_granted;

  IF v_due > 0 THEN
    INSERT INTO public.mystery_boxes (user_id, source)
    SELECT NEW.user_id, 'keys' FROM generate_series(1, v_due);
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_grant_earned_mystery_boxes ON public.key_transactions;
CREATE TRIGGER trg_grant_earned_mystery_boxes
  AFTER INSERT ON public.key_transactions
  FOR EACH ROW EXECUTE FUNCTION public.grant_earned_mystery_boxes();

-- Opens one of the caller's pending boxes: weighted random pick among active pool items the
-- player doesn't own yet. Server-side, so the client can't choose or re-roll the result.
CREATE OR REPLACE FUNCTION public.open_mystery_box(p_box_id uuid)
RETURNS TABLE (
  card_key text,
  title text,
  rarity text,
  description text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
#variable_conflict use_column
DECLARE
  v_user_id    uuid := auth.uid();
  v_user_name  text;
  v_item       record;
  v_first_box  boolean;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '28000';
  END IF;

  PERFORM 1 FROM public.mystery_boxes
  WHERE id = p_box_id AND user_id = v_user_id AND status = 'pending'
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Box not found or already opened' USING ERRCODE = 'P0002';
  END IF;

  -- Weighted random (Efraimidis–Spirakis): smallest -ln(u)/weight wins.
  SELECT pool.card_key, pool.title, pool.rarity, pool.description INTO v_item
  FROM public.mystery_box_pool pool
  WHERE pool.active
    AND NOT EXISTS (
      SELECT 1 FROM public.user_cards uc
      WHERE uc.user_id = v_user_id AND uc.card_key = pool.card_key
    )
  ORDER BY -ln(1.0 - random()) / pool.weight
  LIMIT 1;

  IF v_item.card_key IS NULL THEN
    RAISE EXCEPTION 'Mystery box pool is empty' USING ERRCODE = 'P0002';
  END IF;

  SELECT NOT EXISTS (
    SELECT 1 FROM public.mystery_boxes WHERE user_id = v_user_id AND status = 'opened'
  ) INTO v_first_box;

  UPDATE public.mystery_boxes
  SET status = 'opened', card_key = v_item.card_key, opened_at = timezone('utc', now())
  WHERE id = p_box_id;

  INSERT INTO public.user_cards (user_id, card_key, sync_status, obtained_at)
  VALUES (v_user_id, v_item.card_key, 'SYNCED', timezone('utc', now()))
  ON CONFLICT (user_id, card_key) DO NOTHING;

  -- Feed shows significant drops only (spec-17: first box, rare+), not every common card.
  IF v_first_box OR v_item.rarity IN ('rare', 'epic', 'legendary') THEN
    SELECT display_name INTO v_user_name FROM public.profiles WHERE id = v_user_id;
    INSERT INTO public.feed_posts (user_id, user_name, type, content, is_public)
    VALUES (
      v_user_id, COALESCE(v_user_name, 'Hráč'), 'COLLECTION',
      CASE WHEN v_first_box
        THEN COALESCE(v_user_name, 'Hráč') || ' otevřel(a) svůj první Mystery Box: ' || v_item.title || '.'
        ELSE COALESCE(v_user_name, 'Hráč') || ' získal(a) vzácnou kartu ' || v_item.title || '.'
      END,
      true
    );
  END IF;

  RETURN QUERY SELECT v_item.card_key, v_item.title, v_item.rarity, v_item.description;
END;
$$;

REVOKE ALL ON FUNCTION public.open_mystery_box(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.open_mystery_box(uuid) TO authenticated;
