-- ================================================================
-- MVP1 phase A — the rest of what the documents define, no client decisions needed.
-- Runs after 20261013120000_game_bible_mvp1.sql.
--
--   1. game_config: balancing values are server-configurable (Collection "ECONOMY
--      CONFIGURATION — Tyto hodnoty musí být server-configurable", Progression "CORE vs
--      BALANCING"). Seeded with the documents' numbers; `source` says where each comes from.
--   2. Lifetime Level / titles / referral qualification / absence states / box cadence read it.
--   3. XP for a completed Theme Node (+50) and Season (+500) (Progression "ZÍSKÁVÁNÍ XP").
--   4. First earned Mask: 3 core quests + 2 proofs + first theme checkpoint (Viral "PRVNÍ MASKA").
--   5. Referral fraud basics: daily cap on rewarded activations → held for admin review
--      (Referral "VELOCITY CAPS", "REWARD HOLDS").
--   6. Block player + hide post; report categories from Feed "REPORT CATEGORIES".
--   7. Primary Badge slot + aura/mask visuals for the feed card (Identity "VISIBILITY HIERARCHY").
--   8. Player progress adds the next box (Retention "D1 RETURN HOOK: 1/3 klíče…").
--   9. Retention KPIs: meaningful D1/D7/D30, active days / 7, proof/share/comeback rates.
-- ================================================================


-- ================================================================
-- SECTION 1: game_config
-- ================================================================

CREATE TABLE IF NOT EXISTS public.game_config (
  key         TEXT PRIMARY KEY,
  value       JSONB NOT NULL,
  description TEXT,
  source      TEXT,
  updated_at  TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL,
  updated_by  UUID
);

ALTER TABLE public.game_config ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow public read access to game config" ON public.game_config;
CREATE POLICY "Allow public read access to game config" ON public.game_config FOR SELECT USING (true);
DROP POLICY IF EXISTS "Allow admin write access to game config" ON public.game_config;
CREATE POLICY "Allow admin write access to game config" ON public.game_config
  FOR ALL TO authenticated USING (public.check_is_admin(auth.uid())) WITH CHECK (public.check_is_admin(auth.uid()));

INSERT INTO public.game_config (key, value, description, source) VALUES
  ('level_curve', '[[1,0],[2,100],[3,230],[5,600],[10,2000],[20,6000],[30,12000],[50,30000],[75,60000],[100,100000]]',
     'Lifetime Level → lifetime XP, linear between points', 'Progression · LEVEL CURVE (orientační, finál game designer)'),
  ('level_xp_after_curve', '1600', 'XP per level above the last point (slope of the last segment)', 'odvozeno z LEVEL CURVE'),
  ('xp_node_completed', '50', 'XP for completing a Theme Node', 'Progression · ZÍSKÁVÁNÍ XP'),
  ('xp_season_completed', '500', 'XP for completing the Season', 'Progression · ZÍSKÁVÁNÍ XP'),
  ('title_hrac_min_level', '2', 'Lifetime Level needed for the title Hráč (plus a completed quest)', 'Progression · TITLE GATES („minimální Lifetime Level“)'),
  ('keys_per_box', '3', 'Earned keys per Mystery Box', 'Progression · MYSTERY BOXES („každý 3. klíč“)'),
  ('referral_qualified_active_days', '3', 'Meaningful active days for a Qualified referral', 'Referral · QUALIFIED REFERRAL'),
  ('recruiter_thresholds', '{"recruiter-signaler":1,"recruiter-connector":5,"recruiter-recruiter":10,"recruiter-player-builder":25,"recruiter-portal-maker":50}',
     'Qualified referrals per Recruiter title (Ambassador is manual)', 'Referral · RECRUITER IDENTITY'),
  ('referral_reward_daily_cap', '5', 'Rewarded activations per referrer per 24 h; more go to review', 'Referral · VELOCITY CAPS (číslo doplnit)'),
  ('absence_days', '{"cooling":3,"lapsed":7,"dormant":30,"deep_dormant":90}', 'Days without a meaningful action', 'Retention · ABSENCE STATES'),
  ('first_mask_min_quests', '3', 'Completed quests for the first earned Mask', 'Viral · PRVNÍ MASKA'),
  ('first_mask_min_proofs', '2', 'Valid proofs for the first earned Mask', 'Viral · PRVNÍ MASKA'),
  ('first_mask_min_node', '2', 'Reached node (= first node done) as the first theme checkpoint', 'Viral · PRVNÍ MASKA („první Theme checkpoint“)'),
  ('feed_batch_size', '12', 'Cards before „Jsi v obraze“', 'Feed · FINITE SESSION (8–15)'),
  ('attribution_window_days', '30', 'Invite attribution window', 'Referral · ATTRIBUTION WINDOW (14–30)')
ON CONFLICT (key) DO NOTHING;

CREATE OR REPLACE FUNCTION public.cfg_num(p_key text, p_default numeric)
RETURNS numeric
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT COALESCE((SELECT (value #>> '{}')::numeric FROM public.game_config
                   WHERE key = p_key AND jsonb_typeof(value) = 'number'), p_default);
$$;

CREATE OR REPLACE FUNCTION public.cfg_json(p_key text, p_default jsonb)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT COALESCE((SELECT value FROM public.game_config WHERE key = p_key), p_default);
$$;


-- ================================================================
-- SECTION 2: config-driven level, title, box cadence
-- ================================================================

-- Same result as the 20261013 version while the curve is unchanged; now read from game_config.
CREATE OR REPLACE FUNCTION public.lifetime_level(p_xp int)
RETURNS int
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_curve jsonb := public.cfg_json('level_curve', '[[1,0],[2,100],[3,230],[5,600],[10,2000],[20,6000],[30,12000],[50,30000],[75,60000],[100,100000]]');
  v_after numeric := public.cfg_num('level_xp_after_curve', 1600);
  v_val   int := GREATEST(COALESCE(p_xp, 0), 0);
  v_n     int := jsonb_array_length(v_curve);
  i       int;
  l1 int; x1 int; l2 int; x2 int;
BEGIN
  IF v_val >= (v_curve->(v_n - 1)->>1)::int THEN
    RETURN (v_curve->(v_n - 1)->>0)::int + floor((v_val - (v_curve->(v_n - 1)->>1)::int) / GREATEST(v_after, 1))::int;
  END IF;
  FOR i IN 0..(v_n - 2) LOOP
    l1 := (v_curve->i->>0)::int; x1 := (v_curve->i->>1)::int;
    l2 := (v_curve->(i + 1)->>0)::int; x2 := (v_curve->(i + 1)->>1)::int;
    IF v_val < x2 THEN
      RETURN l1 + floor((v_val - x1)::numeric * (l2 - l1) / (x2 - x1))::int;
    END IF;
  END LOOP;
  RETURN 1;
END;
$$;

CREATE OR REPLACE FUNCTION public.lifetime_title(p_user_id uuid)
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT CASE
    WHEN ps.onboarding_completed_at IS NULL THEN 'NPC'
    WHEN public.lifetime_level(p.xp) >= public.cfg_num('title_hrac_min_level', 2)
         AND EXISTS (SELECT 1 FROM public.challenge_completions cc WHERE cc.user_id = p.id) THEN 'Hráč'
    ELSE 'Pozorovatel'
  END
  FROM public.profiles p
  LEFT JOIN public.player_state ps ON ps.user_id = p.id
  WHERE p.id = p_user_id;
$$;

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
  v_per_box int := GREATEST(public.cfg_num('keys_per_box', 3)::int, 1);
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

  v_due := (v_earned / v_per_box) - v_granted;

  IF v_due > 0 THEN
    INSERT INTO public.mystery_boxes (user_id, source)
    SELECT NEW.user_id, 'keys' FROM generate_series(1, v_due);
  END IF;

  RETURN NEW;
END;
$$;


-- ================================================================
-- SECTION 3: XP for node and season completion
-- ================================================================

-- Same as the 20261013 version + Progression "Theme Node completion +50 XP" when advancing.
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
      AND c.is_mandatory
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
  UPDATE public.profiles
  SET uzel = v_target_uzel,
      xp = xp + public.cfg_num('xp_node_completed', 50)::int
  WHERE id = v_user_id;

  PERFORM public.check_first_mask(v_user_id);

  RETURN QUERY SELECT v_target_uzel, 'advanced'::text;
END;
$$;

REVOKE ALL ON FUNCTION public.advance_node(boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.advance_node(boolean) TO authenticated;

-- Season Mark (20261013) + Progression "Season completion +500 XP".
CREATE OR REPLACE FUNCTION public.handle_season_completed()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  PERFORM public.grant_identity_item(NEW.user_id, 'season-0-mark', 'season');
  PERFORM set_config('app.bypass_profile_guard', 'true', true);
  UPDATE public.profiles SET xp = xp + public.cfg_num('xp_season_completed', 500)::int WHERE id = NEW.user_id;
  PERFORM public.log_game_event(NEW.user_id, 'season_completed', jsonb_build_object('season_id', 'season-0'));
  RETURN NEW;
END;
$$;


-- ================================================================
-- SECTION 4: First earned Mask (Viral "MASKA NESMÍ BÝT LEVNÝ ONBOARDING TOKEN" / "PRVNÍ MASKA")
-- ================================================================

ALTER TABLE public.identity_items ADD COLUMN IF NOT EXISTS visual JSONB NOT NULL DEFAULT '{}'::jsonb;

-- Working name from the Viral Engine example ("Vitex získal Masku Prvního zásahu"); final
-- name and artwork are owed by the client — editable in the admin catalog.
INSERT INTO public.identity_items (item_key, kind, title, description, rarity, acquisition, unlock_hint, sort_order, visual)
VALUES ('mask-first', 'mask', 'Maska Prvního zásahu',
        'Už nejsi člověk, který pouze vstoupil. Začal(a) jsi skutečně hrát.',
        'common', 'earned', '3 dokončené questy, 2 důkazy a první dokončený uzel', 20, '{"color":"#A78BFA"}')
ON CONFLICT (item_key) DO NOTHING;

CREATE OR REPLACE FUNCTION public.check_first_mask(p_user_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.player_identity_items WHERE user_id = p_user_id AND item_key = 'mask-first') THEN
    RETURN false;
  END IF;
  IF (SELECT count(*) FROM public.challenge_completions WHERE user_id = p_user_id) < public.cfg_num('first_mask_min_quests', 3)
     OR (SELECT count(*) FROM public.feed_posts WHERE user_id = p_user_id AND type = 'PROOF') < public.cfg_num('first_mask_min_proofs', 2)
     OR COALESCE((SELECT uzel FROM public.profiles WHERE id = p_user_id), 0) < public.cfg_num('first_mask_min_node', 2) THEN
    RETURN false;
  END IF;
  RETURN public.grant_identity_item(p_user_id, 'mask-first', 'first_mask');
END;
$$;

REVOKE ALL ON FUNCTION public.check_first_mask(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.check_first_mask(uuid) FROM anon, authenticated;

-- Also checked after each completed quest (the node may already be done).
CREATE OR REPLACE FUNCTION public.handle_completion_progress()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_quest record;
BEGIN
  SELECT c.quest_type, c.loop_order, sn.node_order INTO v_quest
  FROM public.challenges c JOIN public.story_nodes sn ON sn.id = c.story_node_id
  WHERE c.id = NEW.challenge_id;

  PERFORM public.log_game_event(NEW.user_id, 'quest_completed', jsonb_build_object(
    'challenge_id', NEW.challenge_id, 'quest_type', v_quest.quest_type,
    'loop_order', v_quest.loop_order, 'node_order', v_quest.node_order));
  PERFORM public.record_meaningful_day(NEW.user_id, 'quest');
  PERFORM public.check_first_mask(NEW.user_id);
  RETURN NEW;
END;
$$;


-- ================================================================
-- SECTION 5: Referral — config-driven qualification + daily reward cap with review holds
-- ================================================================

CREATE TABLE IF NOT EXISTS public.referral_reward_holds (
  id           UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  referrer_id  UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
  referred_id  UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL UNIQUE,
  ladder_step  INT NOT NULL,
  reason       TEXT NOT NULL,
  status       TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'released', 'rejected')),
  created_at   TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL,
  resolved_at  TIMESTAMP WITH TIME ZONE,
  resolved_by  UUID
);

ALTER TABLE public.referral_reward_holds ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow admins to read reward holds" ON public.referral_reward_holds;
CREATE POLICY "Allow admins to read reward holds" ON public.referral_reward_holds
  FOR SELECT TO authenticated USING (public.check_is_admin(auth.uid()));

-- The existing activation ladder (1 = +1 key, 2 = free node, 3 = rare card, 5 = badge),
-- factored out so an admin can release a held reward later.
CREATE OR REPLACE FUNCTION public.apply_referral_ladder_reward(p_referrer_id uuid, p_step int)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_name text;
BEGIN
  SELECT display_name INTO v_name FROM public.profiles WHERE id = p_referrer_id;
  PERFORM set_config('app.bypass_profile_guard', 'true', true);

  IF p_step = 1 THEN
    UPDATE public.profiles SET keys_balance = keys_balance + 1 WHERE id = p_referrer_id;
    INSERT INTO public.key_transactions (user_id, amount, source, balance_after)
    SELECT p_referrer_id, 1, 'REFERRAL', keys_balance FROM public.profiles WHERE id = p_referrer_id;
  ELSIF p_step = 2 THEN
    UPDATE public.profiles SET free_node_credits = free_node_credits + 1 WHERE id = p_referrer_id;
  ELSIF p_step = 3 THEN
    INSERT INTO public.user_cards (user_id, card_key, sync_status, obtained_at)
    VALUES (p_referrer_id, 'referral-rare-3', 'SYNCED', timezone('utc', now()))
    ON CONFLICT (user_id, card_key) DO NOTHING;
    INSERT INTO public.feed_posts (user_id, user_name, type, content, is_public)
    VALUES (p_referrer_id, COALESCE(v_name, 'Hráč'), 'COLLECTION',
            COALESCE(v_name, 'Hráč') || ' získal(a) vzácnou kartu za pozvání přátel.', true);
  ELSIF p_step = 5 THEN
    INSERT INTO public.user_cards (user_id, card_key, sync_status, obtained_at)
    VALUES (p_referrer_id, 'referral-badge-5', 'SYNCED', timezone('utc', now()))
    ON CONFLICT (user_id, card_key) DO NOTHING;
    INSERT INTO public.feed_posts (user_id, user_name, type, content, is_public)
    VALUES (p_referrer_id, COALESCE(v_name, 'Hráč'), 'STATUS',
            COALESCE(v_name, 'Hráč') || ' získal(a) odznak Nositel Světla.', true);
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.apply_referral_ladder_reward(uuid, int) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.apply_referral_ladder_reward(uuid, int) FROM anon, authenticated;

CREATE OR REPLACE FUNCTION public.handle_referral_activation()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_referrer_id uuid;
  v_count       int;
  v_recent      int;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.player_state ps
    WHERE ps.user_id = NEW.user_id
      AND (ps.onboarding_completed_at IS NOT NULL OR ps.onboarding_skipped_at IS NOT NULL)
  ) THEN
    RETURN NEW;
  END IF;

  UPDATE public.referral_signups
  SET activated_at = timezone('utc', now())
  WHERE referred_id = NEW.user_id AND activated_at IS NULL
  RETURNING referrer_id INTO v_referrer_id;

  IF v_referrer_id IS NULL THEN
    RETURN NEW;
  END IF;

  PERFORM public.log_game_event(NEW.user_id, 'referral_activated', jsonb_build_object('referrer_id', v_referrer_id));

  SELECT count(*),
         count(*) FILTER (WHERE activated_at > timezone('utc', now()) - interval '24 hours')
  INTO v_count, v_recent
  FROM public.referral_signups
  WHERE referrer_id = v_referrer_id AND activated_at IS NOT NULL;

  INSERT INTO public.player_notifications (user_id, category, priority, title, body, link)
  VALUES (v_referrer_id, 'social', 2, 'Hráč aktivován',
          'Hráč, kterého jsi pozval(a), dokončil první quest. Aktivovaní: ' || v_count || '.', '/profile');

  IF v_count IN (1, 2, 3, 5) THEN
    IF v_recent > public.cfg_num('referral_reward_daily_cap', 5) THEN
      -- Referral "REWARD HOLDS": unusual velocity → pending review, never an automatic ban.
      INSERT INTO public.referral_reward_holds (referrer_id, referred_id, ladder_step, reason)
      VALUES (v_referrer_id, NEW.user_id, v_count, 'velocity: ' || v_recent || ' activations / 24 h')
      ON CONFLICT (referred_id) DO NOTHING;
      PERFORM public.log_game_event(v_referrer_id, 'referral_reward_pending', jsonb_build_object('step', v_count));
    ELSE
      PERFORM public.apply_referral_ladder_reward(v_referrer_id, v_count);
      PERFORM public.log_game_event(v_referrer_id, 'referral_reward_granted', jsonb_build_object('step', v_count));
    END IF;
  END IF;

  PERFORM public.check_referral_qualification(NEW.user_id);
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.check_referral_qualification(p_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_referrer_id uuid;
  v_qualified   int;
  v_thresholds  jsonb := public.cfg_json('recruiter_thresholds',
    '{"recruiter-signaler":1,"recruiter-connector":5,"recruiter-recruiter":10,"recruiter-player-builder":25,"recruiter-portal-maker":50}');
  t record;
BEGIN
  IF (SELECT count(*) FROM public.player_active_days WHERE user_id = p_user_id)
     < public.cfg_num('referral_qualified_active_days', 3) THEN
    RETURN;
  END IF;

  UPDATE public.referral_signups
  SET qualified_at = timezone('utc', now())
  WHERE referred_id = p_user_id AND activated_at IS NOT NULL AND qualified_at IS NULL
  RETURNING referrer_id INTO v_referrer_id;

  IF v_referrer_id IS NULL THEN
    RETURN;
  END IF;

  PERFORM public.log_game_event(p_user_id, 'referral_qualified', jsonb_build_object('referrer_id', v_referrer_id));

  SELECT count(*) INTO v_qualified
  FROM public.referral_signups WHERE referrer_id = v_referrer_id AND qualified_at IS NOT NULL;

  INSERT INTO public.player_notifications (user_id, category, priority, title, body, link)
  VALUES (v_referrer_id, 'social', 2, 'Kvalifikovaný hráč',
          'Hráč, kterého jsi pozval(a), je ve hře naplno. Kvalifikovaní: ' || v_qualified || '.', '/profile');

  FOR t IN SELECT key, value FROM jsonb_each_text(v_thresholds) LOOP
    IF v_qualified >= t.value::int THEN
      PERFORM public.grant_identity_item(v_referrer_id, t.key, 'referral');
    END IF;
  END LOOP;
END;
$$;

-- Admin decision on a held reward.
CREATE OR REPLACE FUNCTION public.admin_resolve_referral_hold(p_hold_id uuid, p_release boolean)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_hold record;
BEGIN
  IF NOT public.check_is_admin(auth.uid()) THEN
    RAISE EXCEPTION 'Admins only' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO v_hold FROM public.referral_reward_holds WHERE id = p_hold_id AND status = 'pending' FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Hold not found or already resolved' USING ERRCODE = 'P0002';
  END IF;
  IF p_release THEN
    PERFORM public.apply_referral_ladder_reward(v_hold.referrer_id, v_hold.ladder_step);
  END IF;
  UPDATE public.referral_reward_holds
  SET status = CASE WHEN p_release THEN 'released' ELSE 'rejected' END,
      resolved_at = timezone('utc', now()), resolved_by = auth.uid()
  WHERE id = p_hold_id;
  PERFORM public.log_game_event(v_hold.referrer_id,
    CASE WHEN p_release THEN 'referral_reward_granted' ELSE 'referral_reward_reversed' END,
    jsonb_build_object('step', v_hold.ladder_step, 'hold_id', p_hold_id));
END;
$$;

REVOKE ALL ON FUNCTION public.admin_resolve_referral_hold(uuid, boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_resolve_referral_hold(uuid, boolean) TO authenticated;


-- ================================================================
-- SECTION 6: Block player, hide post, report categories
-- ================================================================

CREATE TABLE IF NOT EXISTS public.user_blocks (
  blocker_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
  blocked_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL,
  PRIMARY KEY (blocker_id, blocked_id),
  CHECK (blocker_id <> blocked_id)
);

CREATE TABLE IF NOT EXISTS public.hidden_posts (
  user_id    UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
  post_id    UUID REFERENCES public.feed_posts(id) ON DELETE CASCADE NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL,
  PRIMARY KEY (user_id, post_id)
);

ALTER TABLE public.user_blocks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.hidden_posts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow users to read their own blocks" ON public.user_blocks;
CREATE POLICY "Allow users to read their own blocks" ON public.user_blocks
  FOR SELECT TO authenticated USING (auth.uid() = blocker_id OR public.check_is_admin(auth.uid()));
DROP POLICY IF EXISTS "Allow users to read their own hidden posts" ON public.hidden_posts;
CREATE POLICY "Allow users to read their own hidden posts" ON public.hidden_posts
  FOR SELECT TO authenticated USING (auth.uid() = user_id);

CREATE OR REPLACE FUNCTION public.set_user_block(p_user_id uuid, p_block boolean)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '28000';
  END IF;
  IF p_user_id = auth.uid() THEN
    RAISE EXCEPTION 'Cannot block yourself' USING ERRCODE = '22023';
  END IF;
  IF p_block THEN
    INSERT INTO public.user_blocks (blocker_id, blocked_id) VALUES (auth.uid(), p_user_id) ON CONFLICT DO NOTHING;
  ELSE
    DELETE FROM public.user_blocks WHERE blocker_id = auth.uid() AND blocked_id = p_user_id;
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.hide_post(p_post_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '28000';
  END IF;
  INSERT INTO public.hidden_posts (user_id, post_id) VALUES (auth.uid(), p_post_id) ON CONFLICT DO NOTHING;
END;
$$;

REVOKE ALL ON FUNCTION public.set_user_block(uuid, boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.set_user_block(uuid, boolean) TO authenticated;
REVOKE ALL ON FUNCTION public.hide_post(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.hide_post(uuid) TO authenticated;

-- Feed "REPORT CATEGORIES": spam, harassment, sexual/inappropriate, dangerous activity,
-- misinformation, privacy violation, hate, self-harm concern, scam, other.
DO $$
DECLARE
  c text;
BEGIN
  FOR c IN SELECT conname FROM pg_constraint
           WHERE conrelid = 'public.feed_reports'::regclass AND contype = 'c'
             AND pg_get_constraintdef(oid) ILIKE '%reason%' LOOP
    EXECUTE format('ALTER TABLE public.feed_reports DROP CONSTRAINT %I', c);
  END LOOP;
  ALTER TABLE public.feed_reports ADD CONSTRAINT feed_reports_reason_check CHECK (reason IN (
    'spam', 'harassment', 'inappropriate', 'dangerous', 'misinformation', 'privacy', 'hate', 'self_harm', 'scam', 'other'));
END $$;


-- ================================================================
-- SECTION 7: Primary Badge + feed identity fields
-- ================================================================

ALTER TABLE public.player_state ADD COLUMN IF NOT EXISTS primary_badge TEXT;

CREATE OR REPLACE FUNCTION public.set_primary_badge(p_badge_key text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '28000';
  END IF;
  IF p_badge_key IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.user_badges WHERE user_id = auth.uid() AND badge_key = p_badge_key
  ) THEN
    RAISE EXCEPTION 'You do not own this badge' USING ERRCODE = '42501';
  END IF;
  UPDATE public.player_state SET primary_badge = p_badge_key WHERE user_id = auth.uid();
END;
$$;

REVOKE ALL ON FUNCTION public.set_primary_badge(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.set_primary_badge(text) TO authenticated;

-- Viewers who blocked the author / hid the post don't get it; otherwise identical ranking to
-- 20261013, plus the author's primary badge and aura/mask (Identity "VISIBILITY HIERARCHY":
-- feed shows avatar, frame, title, primary badge, subtle aura).
DROP FUNCTION IF EXISTS public.get_feed(int);

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
  created_at timestamptz,
  my_reaction text,
  author_level int,
  author_title text,
  author_primary_badge text,
  author_aura_color text,
  author_mask text
)
LANGUAGE sql
VOLATILE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  WITH viewer AS (
    SELECT auth.uid() AS uid,
           (SELECT uzel FROM public.profiles WHERE id = auth.uid()) AS uzel
  ),
  candidates AS (
    SELECT fp.*, p.uzel AS author_uzel, p.avatar_level AS author_badges, p.xp AS author_xp,
           p.created_at AS author_since,
           ps.active_frame, ps.avatar_url, (ps.onboarding_completed_at IS NOT NULL) AS onboarded,
           ps.display_title, ps.primary_badge, ps.active_aura, ps.active_mask,
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
      AND NOT EXISTS (SELECT 1 FROM public.user_blocks b WHERE b.blocker_id = auth.uid() AND b.blocked_id = fp.user_id)
      AND NOT EXISTS (SELECT 1 FROM public.hidden_posts h WHERE h.user_id = auth.uid() AND h.post_id = fp.id)
    ORDER BY fp.created_at DESC
    LIMIT 300
  ),
  scored AS (
    SELECT c.*,
      (
        0.30 * CASE WHEN v.uzel IS NULL OR c.author_uzel IS NULL THEN 0.5
                    ELSE 1 - LEAST(abs(c.author_uzel - v.uzel), 8) / 8.0 END
      + 0.20 * CASE
                 WHEN c.challenge_id IS NULL OR c.node_order IS NULL THEN 0
                 WHEN v.uid IS NOT NULL AND EXISTS (
                   SELECT 1 FROM public.challenge_completions cc
                   WHERE cc.user_id = v.uid AND cc.challenge_id = c.challenge_id) THEN 0.3
                 WHEN v.uzel IS NULL OR c.node_order <= v.uzel + 1 THEN 1
                 ELSE 0.4 END
      + 0.30 * exp(-extract(epoch FROM (timezone('utc', now()) - c.created_at)) / 3600.0 / 48.0)
      + 0.15 * LEAST(ln(1 + COALESCE(c.reactions_fire, 0) + COALESCE(c.reactions_plant, 0) + COALESCE(c.reactions_eye, 0)) / ln(51), 1)
      + 0.05 * random()
      )
      * CASE WHEN c.first_proof OR c.author_since > timezone('utc', now()) - interval '7 days' THEN 1.3 ELSE 1 END
      * CASE WHEN c.type = 'WORLD' THEN 1.2 WHEN c.type IN ('STATUS', 'COLLECTION') THEN 1.1 ELSE 1 END
      * CASE WHEN c.author_pass_holder THEN 1.25 ELSE 1 END
      AS base_score
    FROM candidates c CROSS JOIN viewer v
  ),
  diversified AS (
    SELECT s.*,
           s.base_score * power(0.7, row_number() OVER (PARTITION BY s.user_id ORDER BY s.base_score DESC) - 1) AS score
    FROM scored s
  )
  SELECT d.id, d.user_id, d.user_name, d.type, d.content, d.image_url, d.media_type,
         d.challenge_id, d.node_order, d.author_pass_holder, d.active_frame, d.avatar_url,
         d.author_badges, d.onboarded, d.first_proof,
         d.reactions_fire, COALESCE(d.reactions_plant, d.reactions_lightning, 0), d.reactions_eye, d.created_at,
         (SELECT fr.type FROM public.feed_reactions fr WHERE fr.post_id = d.id AND fr.user_id = auth.uid()),
         public.lifetime_level(d.author_xp),
         (SELECT ii.title FROM public.identity_items ii WHERE ii.item_key = d.display_title),
         (SELECT nr.title FROM public.node_rewards nr WHERE nr.badge_key = d.primary_badge),
         (SELECT ii.visual->>'color' FROM public.identity_items ii WHERE ii.item_key = d.active_aura),
         (SELECT ii.title FROM public.identity_items ii WHERE ii.item_key = d.active_mask)
  FROM diversified d
  ORDER BY d.score DESC
  LIMIT LEAST(GREATEST(COALESCE(p_limit, 50), 1), 100);
$$;

REVOKE ALL ON FUNCTION public.get_feed(int) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_feed(int) TO anon, authenticated;

-- A player blocked by the author cannot react to the author's posts.
CREATE OR REPLACE FUNCTION public.reaction_block_guard()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM public.feed_posts fp JOIN public.user_blocks b ON b.blocker_id = fp.user_id
    WHERE fp.id = NEW.post_id AND b.blocked_id = NEW.user_id
  ) THEN
    RAISE EXCEPTION 'Blocked by author' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_reaction_block_guard ON public.feed_reactions;
CREATE TRIGGER trg_reaction_block_guard
  BEFORE INSERT ON public.feed_reactions
  FOR EACH ROW EXECUTE FUNCTION public.reaction_block_guard();

-- Appends the primary badge / aura / mask; existing column order unchanged.
CREATE OR REPLACE VIEW public.profiles_public AS
SELECT p.id, p.display_name, p.xp, p.uzel, p.avatar_level, p.pass_holder, p.current_streak, p.showcase_card_keys,
       ps.avatar_url,
       ps.active_frame,
       (ps.onboarding_completed_at IS NOT NULL) AS onboarding_completed,
       public.lifetime_title(p.id) AS status_title,
       public.lifetime_level(p.xp) AS lifetime_level,
       ps.active_aura,
       ps.active_mask,
       (SELECT ii.title FROM public.identity_items ii WHERE ii.item_key = ps.display_title) AS display_title,
       (SELECT nr.title FROM public.node_rewards nr WHERE nr.badge_key = ps.primary_badge) AS primary_badge_title,
       (SELECT ii.visual->>'color' FROM public.identity_items ii WHERE ii.item_key = ps.active_aura) AS aura_color,
       (SELECT ii.title FROM public.identity_items ii WHERE ii.item_key = ps.active_mask) AS mask_title
FROM public.profiles p
LEFT JOIN public.player_state ps ON ps.user_id = p.id;

GRANT SELECT ON public.profiles_public TO anon, authenticated;


-- ================================================================
-- SECTION 8: Player progress — config thresholds + next box
-- ================================================================

DROP FUNCTION IF EXISTS public.get_player_progress();

CREATE OR REPLACE FUNCTION public.get_player_progress()
RETURNS TABLE (
  lifetime_level int,
  lifetime_title text,
  theme_done int,
  theme_total int,
  node_order int,
  node_title text,
  node_loops_done int,
  node_loops_total int,
  next_quest_id text,
  next_quest_title text,
  next_quest_minutes int,
  pending_boxes int,
  days_since_meaningful int,
  absence_state text,
  keys_toward_box int,
  keys_per_box int,
  season_name text
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
#variable_conflict use_column
DECLARE
  v_user_id uuid := auth.uid();
  v_profile record;
  v_node    record;
  v_last    date;
  v_days    int;
  v_abs     jsonb := public.cfg_json('absence_days', '{"cooling":3,"lapsed":7,"dormant":30,"deep_dormant":90}');
  v_per_box int := GREATEST(public.cfg_num('keys_per_box', 3)::int, 1);
  v_earned  int;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '28000';
  END IF;

  SELECT p.xp, p.uzel INTO v_profile FROM public.profiles p WHERE p.id = v_user_id;
  SELECT sn.id, sn.node_order, sn.title INTO v_node FROM public.story_nodes sn WHERE sn.node_order = v_profile.uzel LIMIT 1;
  SELECT max(d.day) INTO v_last FROM public.player_active_days d WHERE d.user_id = v_user_id;
  v_days := CASE WHEN v_last IS NULL THEN NULL ELSE (timezone('utc', now()))::date - v_last END;
  SELECT COALESCE(SUM(kt.amount), 0) INTO v_earned FROM public.key_transactions kt WHERE kt.user_id = v_user_id AND kt.amount > 0;

  RETURN QUERY
  SELECT
    public.lifetime_level(v_profile.xp),
    public.lifetime_title(v_user_id),
    (SELECT count(*)::int FROM public.challenges c JOIN public.challenge_completions cc
       ON cc.challenge_id = c.id AND cc.user_id = v_user_id WHERE c.is_mandatory),
    (SELECT count(*)::int FROM public.challenges c WHERE c.is_mandatory),
    v_node.node_order,
    v_node.title,
    (SELECT count(*)::int FROM public.challenges c JOIN public.challenge_completions cc
       ON cc.challenge_id = c.id AND cc.user_id = v_user_id WHERE c.story_node_id = v_node.id AND c.is_mandatory),
    (SELECT count(*)::int FROM public.challenges c WHERE c.story_node_id = v_node.id AND c.is_mandatory),
    nq.id, nq.title, nq.estimated_minutes,
    (SELECT count(*)::int FROM public.mystery_boxes mb WHERE mb.user_id = v_user_id AND mb.status = 'pending'),
    v_days,
    CASE
      WHEN v_days IS NULL OR v_days < (v_abs->>'cooling')::int THEN 'active'
      WHEN v_days < (v_abs->>'lapsed')::int THEN 'cooling'
      WHEN v_days < (v_abs->>'dormant')::int THEN 'lapsed'
      WHEN v_days < (v_abs->>'deep_dormant')::int THEN 'dormant'
      ELSE 'deep_dormant'
    END,
    v_earned % v_per_box,
    v_per_box,
    (SELECT s.name FROM public.seasons s WHERE s.is_active ORDER BY s.starts_at NULLS LAST LIMIT 1)
  FROM (SELECT 1) one
  LEFT JOIN LATERAL (
    SELECT c.id, c.title, c.estimated_minutes
    FROM public.challenges c
    JOIN public.story_nodes sn ON sn.id = c.story_node_id
    WHERE sn.node_order >= v_profile.uzel
      AND (c.is_mandatory OR sn.node_order = v_profile.uzel)
      AND NOT EXISTS (SELECT 1 FROM public.challenge_completions cc WHERE cc.user_id = v_user_id AND cc.challenge_id = c.id)
    ORDER BY (NOT c.is_mandatory), sn.node_order, c.loop_order, c.id
    LIMIT 1
  ) nq ON true;
END;
$$;

REVOKE ALL ON FUNCTION public.get_player_progress() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_player_progress() TO authenticated;


-- ================================================================
-- SECTION 9: Retention KPIs (Retention "MVP1 RETENTION KPI") — SQL Editor / admin RPC only
-- ================================================================

-- app opens: the client now logs Bible event names (app_open); older rows use app_opened.
CREATE OR REPLACE VIEW public.kpi_retention AS
WITH cohort AS (
  SELECT id AS user_id, (timezone('utc', created_at))::date AS signup_day FROM public.profiles
),
active_days AS (
  SELECT DISTINCT user_id, (timezone('utc', created_at))::date AS day
  FROM public.analytics_events WHERE event_name IN ('app_opened', 'app_open') AND user_id IS NOT NULL
)
SELECT c.signup_day,
       count(*) AS players,
       count(*) FILTER (WHERE EXISTS (SELECT 1 FROM active_days a WHERE a.user_id = c.user_id AND a.day = c.signup_day + 1)) AS d1,
       count(*) FILTER (WHERE EXISTS (SELECT 1 FROM active_days a WHERE a.user_id = c.user_id AND a.day = c.signup_day + 3)) AS d3,
       count(*) FILTER (WHERE EXISTS (SELECT 1 FROM active_days a WHERE a.user_id = c.user_id AND a.day = c.signup_day + 7)) AS d7
FROM cohort c
GROUP BY c.signup_day
ORDER BY c.signup_day DESC;

-- Retention "MEANINGFUL D7 / Reality Retention": a meaningful action within the window.
CREATE OR REPLACE VIEW public.kpi_reality_retention AS
WITH cohort AS (
  SELECT id AS user_id, (timezone('utc', created_at))::date AS signup_day FROM public.profiles
)
SELECT date_trunc('week', c.signup_day)::date AS signup_week,
       count(*) AS players,
       count(*) FILTER (WHERE EXISTS (SELECT 1 FROM public.player_active_days d WHERE d.user_id = c.user_id AND d.day = c.signup_day + 1)) AS d1,
       count(*) FILTER (WHERE EXISTS (SELECT 1 FROM public.player_active_days d WHERE d.user_id = c.user_id AND d.day BETWEEN c.signup_day + 1 AND c.signup_day + 7)) AS d7_window,
       count(*) FILTER (WHERE EXISTS (SELECT 1 FROM public.player_active_days d WHERE d.user_id = c.user_id AND d.day BETWEEN c.signup_day + 24 AND c.signup_day + 30)) AS d30_window
FROM cohort c
GROUP BY 1
ORDER BY 1 DESC;

-- Meaningful Active Days / 7, proof rate, share rate, comeback rate (last 7 / 30 days).
CREATE OR REPLACE VIEW public.kpi_engagement AS
WITH active7 AS (
  SELECT user_id, count(*) AS days FROM public.player_active_days
  WHERE day > (timezone('utc', now()))::date - 7 GROUP BY user_id
),
opens30 AS (
  SELECT DISTINCT user_id FROM public.analytics_events
  WHERE event_name IN ('app_opened', 'app_open') AND user_id IS NOT NULL
    AND created_at > timezone('utc', now()) - interval '30 days'
)
SELECT
  (SELECT count(*) FROM active7) AS meaningful_players_7d,
  (SELECT round(avg(days), 2) FROM active7) AS meaningful_days_per_player_7d,
  (SELECT count(*) FROM opens30) AS app_open_players_30d,
  (SELECT count(DISTINCT user_id) FROM public.feed_posts WHERE type = 'PROOF' AND created_at > timezone('utc', now()) - interval '30 days') AS proof_players_30d,
  (SELECT count(DISTINCT user_id) FROM public.analytics_events WHERE event_name = 'share_completed' AND created_at > timezone('utc', now()) - interval '30 days') AS share_players_30d,
  (SELECT count(*) FROM public.analytics_events WHERE event_name IN ('welcome_back_shown', 'comeback_view') AND created_at > timezone('utc', now()) - interval '30 days') AS comeback_views_30d,
  (SELECT count(*) FROM public.analytics_events WHERE event_name IN ('welcome_back_continue', 'comeback_continue') AND created_at > timezone('utc', now()) - interval '30 days') AS comeback_continues_30d;

REVOKE ALL ON public.kpi_retention, public.kpi_reality_retention, public.kpi_engagement FROM anon, authenticated;


-- ================================================================
-- SECTION 10: proof event also re-checks the first Mask (the proof row is written after the
-- completion row inside complete_challenge, so the completion trigger sees one proof less)
-- ================================================================

CREATE OR REPLACE FUNCTION public.handle_post_events()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NEW.type = 'PROOF' THEN
    PERFORM public.log_game_event(NEW.user_id, 'proof_submitted', jsonb_build_object(
      'post_id', NEW.id, 'challenge_id', NEW.challenge_id, 'is_public', NEW.is_public, 'media_type', NEW.media_type));
    PERFORM public.check_first_mask(NEW.user_id);
  END IF;
  RETURN NEW;
END;
$$;
