-- ================================================================
-- Game Bible v1.0 — MVP1 slice: everything the documents decide unambiguously.
-- Runs after 20260929120000_original_spec_completion.sql.
--
-- Points where the original spec and the Game Bible contradict each other are NOT decided
-- here (private-proof keys, Pass XP/feed boost, navigation, flexible 5/7 streak, share-moment
-- frequency, referral reward ladder) — existing behaviour stays until the client decides.
--
--   1. Data model "MVP1 BACKEND READY" (Progression): domains, seasons, guardians (Zaya),
--      theme → domain/season/guardian, quest metadata, several loops per node.
--   2. Progression event log (Progression "PROGRESSION EVENT MODEL").
--   3. Lifetime Level (orientational curve — final numbers belong to the game designer)
--      and Lifetime Titles NPC → Pozorovatel → Hráč (Progression "TITLE GATES").
--   4. Meaningful Active Days: the streak grows only from real actions, not app opens
--      (Retention "ACTIVE DAY", original spec "kolik dní v řadě hráč plní akce").
--   5. Reactions: max 1 reaction per player per post (Feed "MAX 1 REACTION TYPE / USER / POST").
--   6. Identity: auras, masks, titles, Season Mark + equip slots (Identity "MVP1").
--   7. Referral: Activated (onboarding done/skipped + first quest), Qualified (+3 meaningful
--      active days), Recruiter titles, dashboard, first/last-touch attribution, invite landing
--      context (Referral + Viral engines).
--   8. In-app notifications + preferences (Retention "NOTIFICATION ENGINE").
--   9. Feed: World/System cards, MVP ranking (recency, path relevance, actionability,
--      beginner boost, diversity), viewer's own reaction.
--  10. Player progress RPC (Next Move, theme/season progress, comeback state).
--  11. KPI views for activation and referrals.
-- ================================================================


-- ================================================================
-- SECTION 1: Data model — domains, seasons, guardians, quest metadata, loops
-- ================================================================

CREATE TABLE IF NOT EXISTS public.domains (
  id          TEXT PRIMARY KEY,
  name        TEXT NOT NULL,
  description TEXT,
  sort_order  INT DEFAULT 0,
  created_at  TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);

CREATE TABLE IF NOT EXISTS public.seasons (
  id         TEXT PRIMARY KEY,
  name       TEXT NOT NULL,
  starts_at  TIMESTAMP WITH TIME ZONE,
  ends_at    TIMESTAMP WITH TIME ZONE,
  is_active  BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);

CREATE TABLE IF NOT EXISTS public.guardians (
  id         TEXT PRIMARY KEY,
  name       TEXT NOT NULL,
  is_system  BOOLEAN DEFAULT FALSE,  -- Zaya is the system guide, not a contracted Guardian
  bio        TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);

ALTER TABLE public.domains   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.seasons   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.guardians ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow public read access to domains" ON public.domains;
CREATE POLICY "Allow public read access to domains" ON public.domains FOR SELECT USING (true);
DROP POLICY IF EXISTS "Allow admin write access to domains" ON public.domains;
CREATE POLICY "Allow admin write access to domains" ON public.domains
  FOR ALL TO authenticated USING (public.check_is_admin(auth.uid())) WITH CHECK (public.check_is_admin(auth.uid()));

DROP POLICY IF EXISTS "Allow public read access to seasons" ON public.seasons;
CREATE POLICY "Allow public read access to seasons" ON public.seasons FOR SELECT USING (true);
DROP POLICY IF EXISTS "Allow admin write access to seasons" ON public.seasons;
CREATE POLICY "Allow admin write access to seasons" ON public.seasons
  FOR ALL TO authenticated USING (public.check_is_admin(auth.uid())) WITH CHECK (public.check_is_admin(auth.uid()));

DROP POLICY IF EXISTS "Allow public read access to guardians" ON public.guardians;
CREATE POLICY "Allow public read access to guardians" ON public.guardians FOR SELECT USING (true);
DROP POLICY IF EXISTS "Allow admin write access to guardians" ON public.guardians;
CREATE POLICY "Allow admin write access to guardians" ON public.guardians
  FOR ALL TO authenticated USING (public.check_is_admin(auth.uid())) WITH CHECK (public.check_is_admin(auth.uid()));

-- Season name/dates are owed by the client; "Season 0" is the name the app already uses.
INSERT INTO public.seasons (id, name, is_active) VALUES ('season-0', 'Season 0', true)
ON CONFLICT (id) DO NOTHING;
INSERT INTO public.guardians (id, name, is_system, bio)
VALUES ('zaya', 'Zaya', true, 'Systémová průvodkyně Hry Reality.')
ON CONFLICT (id) DO NOTHING;

-- The existing `themes` table is the Theme Path.
ALTER TABLE public.themes ADD COLUMN IF NOT EXISTS domain_id TEXT REFERENCES public.domains(id) ON DELETE SET NULL;
ALTER TABLE public.themes ADD COLUMN IF NOT EXISTS season_id TEXT REFERENCES public.seasons(id) ON DELETE SET NULL;
ALTER TABLE public.themes ADD COLUMN IF NOT EXISTS guardian_id TEXT REFERENCES public.guardians(id) ON DELETE SET NULL;
ALTER TABLE public.themes ADD COLUMN IF NOT EXISTS transformation_promise TEXT;
UPDATE public.themes SET season_id = 'season-0' WHERE season_id IS NULL;
UPDATE public.themes SET guardian_id = 'zaya' WHERE guardian_id IS NULL;

-- Quest metadata (Progression "QUEST METADATA"). The existing `challenges` row is the quest;
-- a node can now hold several loops (Progression "NODES": "v MVP1 bude 7–9 Nodes a v každé
-- může být několik loopů. Toto držme!").
ALTER TABLE public.challenges ADD COLUMN IF NOT EXISTS quest_type TEXT NOT NULL DEFAULT 'standard';
ALTER TABLE public.challenges ADD COLUMN IF NOT EXISTS loop_order INT NOT NULL DEFAULT 1;
ALTER TABLE public.challenges ADD COLUMN IF NOT EXISTS is_mandatory BOOLEAN NOT NULL DEFAULT TRUE;
ALTER TABLE public.challenges ADD COLUMN IF NOT EXISTS difficulty SMALLINT;
ALTER TABLE public.challenges ADD COLUMN IF NOT EXISTS estimated_minutes INT;
ALTER TABLE public.challenges ADD COLUMN IF NOT EXISTS repeatability TEXT NOT NULL DEFAULT 'once';
ALTER TABLE public.challenges ADD COLUMN IF NOT EXISTS cooldown_hours INT;
ALTER TABLE public.challenges ADD COLUMN IF NOT EXISTS safety_class TEXT NOT NULL DEFAULT 'standard';
ALTER TABLE public.challenges ADD COLUMN IF NOT EXISTS guardian_id TEXT REFERENCES public.guardians(id) ON DELETE SET NULL;
ALTER TABLE public.challenges ADD COLUMN IF NOT EXISTS season_id TEXT REFERENCES public.seasons(id) ON DELETE SET NULL;
ALTER TABLE public.challenges ADD COLUMN IF NOT EXISTS mastery_dimensions TEXT[] NOT NULL DEFAULT '{}';
ALTER TABLE public.challenges ADD COLUMN IF NOT EXISTS affinity_eligible BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE public.challenges ADD COLUMN IF NOT EXISTS collection_conditions JSONB NOT NULL DEFAULT '{}'::jsonb;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'challenges_quest_type_check') THEN
    ALTER TABLE public.challenges ADD CONSTRAINT challenges_quest_type_check
      CHECK (quest_type IN ('micro', 'standard', 'deep', 'milestone', 'loop', 'mastery', 'community', 'world'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'challenges_repeatability_check') THEN
    ALTER TABLE public.challenges ADD CONSTRAINT challenges_repeatability_check
      CHECK (repeatability IN ('once', 'repeatable'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'challenges_difficulty_check') THEN
    ALTER TABLE public.challenges ADD CONSTRAINT challenges_difficulty_check
      CHECK (difficulty IS NULL OR difficulty BETWEEN 1 AND 5);
  END IF;
END $$;

UPDATE public.challenges SET season_id = 'season-0' WHERE season_id IS NULL;
UPDATE public.challenges SET guardian_id = 'zaya' WHERE guardian_id IS NULL;
UPDATE public.challenges SET estimated_minutes = CEIL(timebox_seconds / 60.0)::int
WHERE estimated_minutes IS NULL AND timebox_seconds IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_challenges_node_loop ON public.challenges(story_node_id, loop_order);

-- Same as the 20260925120000 version, except that only MANDATORY loops of the current node
-- must be done before moving on (optional loops stay playable).
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
  UPDATE public.profiles SET uzel = v_target_uzel WHERE id = v_user_id;

  RETURN QUERY SELECT v_target_uzel, 'advanced'::text;
END;
$$;

REVOKE ALL ON FUNCTION public.advance_node(boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.advance_node(boolean) TO authenticated;


-- ================================================================
-- SECTION 2: Progression event log
-- ================================================================

CREATE TABLE IF NOT EXISTS public.game_events (
  id         BIGSERIAL PRIMARY KEY,
  user_id    UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL,
  payload    JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_game_events_user ON public.game_events(user_id, created_at);
CREATE INDEX IF NOT EXISTS idx_game_events_type ON public.game_events(event_type, created_at);

ALTER TABLE public.game_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow users to read their own game events" ON public.game_events;
CREATE POLICY "Allow users to read their own game events" ON public.game_events
  FOR SELECT TO authenticated USING (auth.uid() = user_id OR public.check_is_admin(auth.uid()));
-- No write policy: only the SECURITY DEFINER triggers/functions below write here.

CREATE OR REPLACE FUNCTION public.log_game_event(p_user_id uuid, p_type text, p_payload jsonb DEFAULT '{}'::jsonb)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  INSERT INTO public.game_events (user_id, event_type, payload)
  VALUES (p_user_id, p_type, COALESCE(p_payload, '{}'::jsonb));
$$;

REVOKE ALL ON FUNCTION public.log_game_event(uuid, text, jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.log_game_event(uuid, text, jsonb) FROM anon, authenticated;


-- ================================================================
-- SECTION 3: Lifetime Level + Lifetime Titles
-- ================================================================

-- Progression "LEVEL CURVE" (orientační návrh — the game designer finalises it). Linear
-- between the anchor points, no hard cap: above level 100 each level costs 1 600 XP (the
-- slope of the last segment). Mirrored in src/lib/levels.js — keep both in sync.
CREATE OR REPLACE FUNCTION public.lifetime_level(p_xp int)
RETURNS int
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  v_levels int[] := ARRAY[1, 2, 3, 5, 10, 20, 30, 50, 75, 100];
  v_xp     int[] := ARRAY[0, 100, 230, 600, 2000, 6000, 12000, 30000, 60000, 100000];
  v_val    int := GREATEST(COALESCE(p_xp, 0), 0);
  i        int;
BEGIN
  IF v_val >= v_xp[10] THEN
    RETURN 100 + (v_val - v_xp[10]) / 1600;
  END IF;
  FOR i IN 1..9 LOOP
    IF v_val < v_xp[i + 1] THEN
      RETURN v_levels[i]
        + floor((v_val - v_xp[i])::numeric * (v_levels[i + 1] - v_levels[i]) / (v_xp[i + 1] - v_xp[i]))::int;
    END IF;
  END LOOP;
  RETURN 1;
END;
$$;

-- Progression "TITLE GATES": Pozorovatel = onboarding done; Hráč = minimal Lifetime Level
-- (2) + first completed real-world quest. Higher titles (Strážce…) need Theme Mastery,
-- which is not part of MVP1. NPC = onboarding skipped (original spec-14).
CREATE OR REPLACE FUNCTION public.lifetime_title(p_user_id uuid)
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT CASE
    WHEN ps.onboarding_completed_at IS NULL THEN 'NPC'
    WHEN public.lifetime_level(p.xp) >= 2
         AND EXISTS (SELECT 1 FROM public.challenge_completions cc WHERE cc.user_id = p.id) THEN 'Hráč'
    ELSE 'Pozorovatel'
  END
  FROM public.profiles p
  LEFT JOIN public.player_state ps ON ps.user_id = p.id
  WHERE p.id = p_user_id;
$$;

REVOKE ALL ON FUNCTION public.lifetime_title(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.lifetime_title(uuid) TO anon, authenticated;


-- ================================================================
-- SECTION 4: Identity items — auras, masks, titles, season marks + equip slots
-- ================================================================

CREATE TABLE IF NOT EXISTS public.identity_items (
  item_key    TEXT PRIMARY KEY,
  kind        TEXT NOT NULL CHECK (kind IN ('aura', 'mask', 'title', 'season_mark')),
  title       TEXT NOT NULL,
  description TEXT,
  rarity      TEXT NOT NULL DEFAULT 'common' CHECK (rarity IN ('common', 'rare', 'epic', 'legendary')),
  -- Identity "IDENTITY × HRA PASS": the Pass may give cosmetics, never earned status.
  acquisition TEXT NOT NULL DEFAULT 'earned' CHECK (acquisition IN ('earned', 'pass', 'legacy', 'admin')),
  unlock_hint TEXT,
  sort_order  INT DEFAULT 0,
  created_at  TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);

CREATE TABLE IF NOT EXISTS public.player_identity_items (
  user_id   UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
  item_key  TEXT REFERENCES public.identity_items(item_key) ON DELETE CASCADE NOT NULL,
  source    TEXT,
  earned_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL,
  PRIMARY KEY (user_id, item_key)
);

ALTER TABLE public.identity_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.player_identity_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow public read access to identity items" ON public.identity_items;
CREATE POLICY "Allow public read access to identity items" ON public.identity_items FOR SELECT USING (true);
DROP POLICY IF EXISTS "Allow admin write access to identity items" ON public.identity_items;
CREATE POLICY "Allow admin write access to identity items" ON public.identity_items
  FOR ALL TO authenticated USING (public.check_is_admin(auth.uid())) WITH CHECK (public.check_is_admin(auth.uid()));

-- Identity is meant to be seen ("co není vidět, nevytváří identity value").
DROP POLICY IF EXISTS "Allow public read access to player identity items" ON public.player_identity_items;
CREATE POLICY "Allow public read access to player identity items" ON public.player_identity_items
  FOR SELECT USING (true);

-- Recruiter titles (Referral "RECRUITER IDENTITY") and the Season 0 mark. Aura/mask content
-- is owed by the client — the catalog starts without them.
INSERT INTO public.identity_items (item_key, kind, title, description, rarity, acquisition, unlock_hint, sort_order) VALUES
  ('season-0-mark',            'season_mark', 'Season 0',       'Dokončil(a) Season 0.',                                  'rare',      'earned', 'Dokonči Season 0.', 1),
  ('recruiter-signaler',       'title',       'Signaler',       'Přivedl(a) prvního kvalifikovaného hráče.',              'common',    'earned', '1 kvalifikovaný hráč', 10),
  ('recruiter-connector',      'title',       'Connector',      'Přivedl(a) 5 kvalifikovaných hráčů.',                    'rare',      'earned', '5 kvalifikovaných hráčů', 11),
  ('recruiter-recruiter',      'title',       'Recruiter',      'Přivedl(a) 10 kvalifikovaných hráčů.',                   'rare',      'earned', '10 kvalifikovaných hráčů', 12),
  ('recruiter-player-builder', 'title',       'Player Builder', 'Přivedl(a) 25 kvalifikovaných hráčů.',                   'epic',      'earned', '25 kvalifikovaných hráčů', 13),
  ('recruiter-portal-maker',   'title',       'Portal Maker',   'Přivedl(a) 50 kvalifikovaných hráčů.',                   'epic',      'earned', '50 kvalifikovaných hráčů', 14),
  -- "100 + quality requirements" — granted manually after review, never automatically.
  ('recruiter-ambassador',     'title',       'Ambassador',     'Přivedl(a) 100+ kvalitních hráčů.',                      'legendary', 'admin',  '100 kvalifikovaných hráčů + kontrola kvality', 15)
ON CONFLICT (item_key) DO NOTHING;

ALTER TABLE public.player_state ADD COLUMN IF NOT EXISTS active_aura TEXT;
ALTER TABLE public.player_state ADD COLUMN IF NOT EXISTS active_mask TEXT;
ALTER TABLE public.player_state ADD COLUMN IF NOT EXISTS display_title TEXT;

-- Grants an identity item once; posts an identity moment to the feed for titles/masks/marks.
CREATE OR REPLACE FUNCTION public.grant_identity_item(p_user_id uuid, p_item_key text, p_source text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_inserted int;
  v_item     record;
  v_name     text;
BEGIN
  INSERT INTO public.player_identity_items (user_id, item_key, source)
  VALUES (p_user_id, p_item_key, p_source)
  ON CONFLICT DO NOTHING;
  GET DIAGNOSTICS v_inserted = ROW_COUNT;
  IF v_inserted = 0 THEN
    RETURN false;
  END IF;

  SELECT * INTO v_item FROM public.identity_items WHERE item_key = p_item_key;
  SELECT display_name INTO v_name FROM public.profiles WHERE id = p_user_id;

  INSERT INTO public.feed_posts (user_id, user_name, type, content, is_public)
  VALUES (p_user_id, COALESCE(v_name, 'Hráč'), 'STATUS',
          COALESCE(v_name, 'Hráč') || ' získal(a) ' ||
          CASE v_item.kind WHEN 'title' THEN 'titul ' WHEN 'mask' THEN 'masku ' WHEN 'aura' THEN 'auru ' ELSE 'značku ' END ||
          v_item.title || '.', true);

  INSERT INTO public.player_notifications (user_id, category, priority, title, body, link)
  VALUES (p_user_id, 'identity', 2, 'Nová identita', 'Získal(a) jsi: ' || v_item.title || '.', '/inventory');

  PERFORM public.log_game_event(p_user_id, 'identity_item_earned',
    jsonb_build_object('item_key', p_item_key, 'kind', v_item.kind, 'source', p_source));
  RETURN true;
END;
$$;

REVOKE ALL ON FUNCTION public.grant_identity_item(uuid, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.grant_identity_item(uuid, text, text) FROM anon, authenticated;

-- Equip slots (Identity "IDENTITY SLOT SYSTEM"): aura, mask, display title. NULL clears the
-- slot (the profile then shows the Lifetime Title / no aura / no mask).
CREATE OR REPLACE FUNCTION public.set_identity_slot(p_kind text, p_item_key text)
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
  IF p_kind NOT IN ('aura', 'mask', 'title') THEN
    RAISE EXCEPTION 'Unknown identity slot: %', p_kind USING ERRCODE = '22023';
  END IF;

  IF p_item_key IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.player_identity_items pii
    JOIN public.identity_items ii ON ii.item_key = pii.item_key
    WHERE pii.user_id = v_user_id AND pii.item_key = p_item_key AND ii.kind = p_kind
  ) THEN
    RAISE EXCEPTION 'You do not own this item' USING ERRCODE = '42501';
  END IF;

  UPDATE public.player_state
  SET active_aura   = CASE WHEN p_kind = 'aura'  THEN p_item_key ELSE active_aura END,
      active_mask   = CASE WHEN p_kind = 'mask'  THEN p_item_key ELSE active_mask END,
      display_title = CASE WHEN p_kind = 'title' THEN p_item_key ELSE display_title END
  WHERE user_id = v_user_id;
END;
$$;

REVOKE ALL ON FUNCTION public.set_identity_slot(text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.set_identity_slot(text, text) TO authenticated;

-- Season Mark on season completion.
CREATE OR REPLACE FUNCTION public.handle_season_completed()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  PERFORM public.grant_identity_item(NEW.user_id, 'season-0-mark', 'season');
  PERFORM public.log_game_event(NEW.user_id, 'season_completed', jsonb_build_object('season_id', 'season-0'));
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_handle_season_completed ON public.season_reflections;
CREATE TRIGGER trg_handle_season_completed
  AFTER INSERT ON public.season_reflections
  FOR EACH ROW EXECUTE FUNCTION public.handle_season_completed();


-- ================================================================
-- SECTION 5: In-app notifications + preferences (declared before the triggers that write them)
-- ================================================================

CREATE TABLE IF NOT EXISTS public.player_notifications (
  id         UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id    UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
  -- Retention "NOTIFICATION TAXONOMY"
  category   TEXT NOT NULL CHECK (category IN ('action', 'progress', 'social', 'identity', 'world', 'comeback', 'commerce', 'system')),
  -- Retention "NOTIFICATION PRIORITY": 0 safety/account … 4 commerce
  priority   SMALLINT NOT NULL DEFAULT 2 CHECK (priority BETWEEN 0 AND 4),
  title      TEXT NOT NULL,
  body       TEXT,
  link       TEXT,
  ref_id     TEXT,
  read_at    TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_player_notifications_user ON public.player_notifications(user_id, created_at DESC);

ALTER TABLE public.player_notifications ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow users to read their own notifications" ON public.player_notifications;
CREATE POLICY "Allow users to read their own notifications" ON public.player_notifications
  FOR SELECT TO authenticated USING (auth.uid() = user_id);

CREATE OR REPLACE FUNCTION public.mark_notifications_read(p_ids uuid[] DEFAULT NULL)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  UPDATE public.player_notifications
  SET read_at = timezone('utc', now())
  WHERE user_id = auth.uid() AND read_at IS NULL AND (p_ids IS NULL OR id = ANY(p_ids));
$$;

REVOKE ALL ON FUNCTION public.mark_notifications_read(uuid[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.mark_notifications_read(uuid[]) TO authenticated;

-- Retention "NOTIFICATION FREQUENCY": category opt-outs and quiet hours. Concrete caps are owed
-- by the client; quiet hours are off until the player sets them.
CREATE TABLE IF NOT EXISTS public.notification_preferences (
  user_id         UUID REFERENCES public.profiles(id) ON DELETE CASCADE PRIMARY KEY,
  categories_off  TEXT[] NOT NULL DEFAULT '{}',
  quiet_start     SMALLINT CHECK (quiet_start BETWEEN 0 AND 23),
  quiet_end       SMALLINT CHECK (quiet_end BETWEEN 0 AND 23),
  timezone        TEXT NOT NULL DEFAULT 'Europe/Prague',
  updated_at      TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);

ALTER TABLE public.notification_preferences ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow users to read their own notification preferences" ON public.notification_preferences;
CREATE POLICY "Allow users to read their own notification preferences" ON public.notification_preferences
  FOR SELECT TO authenticated USING (auth.uid() = user_id);

CREATE OR REPLACE FUNCTION public.set_notification_preferences(
  p_categories_off text[],
  p_quiet_start    smallint DEFAULT NULL,
  p_quiet_end      smallint DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_off     text[];
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '28000';
  END IF;
  -- Safety/account notifications cannot be switched off.
  SELECT COALESCE(array_agg(DISTINCT c), '{}') INTO v_off
  FROM unnest(COALESCE(p_categories_off, '{}')) AS c
  WHERE c IN ('action', 'progress', 'social', 'identity', 'world', 'comeback', 'commerce');

  INSERT INTO public.notification_preferences (user_id, categories_off, quiet_start, quiet_end, updated_at)
  VALUES (v_user_id, v_off, p_quiet_start, p_quiet_end, timezone('utc', now()))
  ON CONFLICT (user_id) DO UPDATE
  SET categories_off = EXCLUDED.categories_off,
      quiet_start = EXCLUDED.quiet_start,
      quiet_end = EXCLUDED.quiet_end,
      updated_at = EXCLUDED.updated_at;
END;
$$;

REVOKE ALL ON FUNCTION public.set_notification_preferences(text[], smallint, smallint) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.set_notification_preferences(text[], smallint, smallint) TO authenticated;


-- ================================================================
-- SECTION 6: Meaningful Active Days + streak from real actions
-- ================================================================

CREATE TABLE IF NOT EXISTS public.player_active_days (
  user_id    UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
  day        DATE NOT NULL,
  first_action TEXT NOT NULL,
  PRIMARY KEY (user_id, day)
);

ALTER TABLE public.player_active_days ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow users to read their own active days" ON public.player_active_days;
CREATE POLICY "Allow users to read their own active days" ON public.player_active_days
  FOR SELECT TO authenticated USING (auth.uid() = user_id OR public.check_is_admin(auth.uid()));

-- Backfill from completed quests (the only meaningful action recorded so far).
INSERT INTO public.player_active_days (user_id, day, first_action)
SELECT DISTINCT cc.user_id, (timezone('utc', cc.completed_at))::date, 'quest'
FROM public.challenge_completions cc
ON CONFLICT DO NOTHING;

-- Recompute every streak from meaningful days: length of the latest run of consecutive days,
-- 0 if that run ended before yesterday. (Previously app opens counted.)
DO $$
BEGIN
  PERFORM set_config('app.bypass_profile_guard', 'true', true);
  WITH runs AS (
    SELECT user_id, day, day - (row_number() OVER (PARTITION BY user_id ORDER BY day))::int AS grp
    FROM public.player_active_days
  ),
  islands AS (
    SELECT user_id, max(day) AS last_day, count(*)::int AS len
    FROM runs GROUP BY user_id, grp
  ),
  latest AS (
    SELECT DISTINCT ON (user_id) user_id, last_day, len FROM islands ORDER BY user_id, last_day DESC
  ),
  longest AS (
    SELECT user_id, max(len) AS longest FROM islands GROUP BY user_id
  )
  UPDATE public.profiles p
  SET current_streak = CASE WHEN l.last_day >= (timezone('utc', now()))::date - 1 THEN l.len ELSE 0 END,
      longest_streak = lo.longest
  FROM latest l JOIN longest lo ON lo.user_id = l.user_id
  WHERE p.id = l.user_id;

  UPDATE public.profiles p SET current_streak = 0, longest_streak = 0
  WHERE NOT EXISTS (SELECT 1 FROM public.player_active_days d WHERE d.user_id = p.id);
END $$;

-- Referral qualification (Referral "QUALIFIED REFERRAL": first quest + 3 meaningful active
-- days) and the referrer's Recruiter title. Called whenever a new active day is recorded.
CREATE OR REPLACE FUNCTION public.check_referral_qualification(p_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_referrer_id uuid;
  v_qualified   int;
BEGIN
  IF (SELECT count(*) FROM public.player_active_days WHERE user_id = p_user_id) < 3 THEN
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

  IF v_qualified >= 1  THEN PERFORM public.grant_identity_item(v_referrer_id, 'recruiter-signaler', 'referral'); END IF;
  IF v_qualified >= 5  THEN PERFORM public.grant_identity_item(v_referrer_id, 'recruiter-connector', 'referral'); END IF;
  IF v_qualified >= 10 THEN PERFORM public.grant_identity_item(v_referrer_id, 'recruiter-recruiter', 'referral'); END IF;
  IF v_qualified >= 25 THEN PERFORM public.grant_identity_item(v_referrer_id, 'recruiter-player-builder', 'referral'); END IF;
  IF v_qualified >= 50 THEN PERFORM public.grant_identity_item(v_referrer_id, 'recruiter-portal-maker', 'referral'); END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.check_referral_qualification(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.check_referral_qualification(uuid) FROM anon, authenticated;

-- Records a meaningful active day and grows the streak (consecutive days; the flexible
-- "5 z 7" variant is waiting on the client's decision). Fragment #2 ("Udrž streak 3 dny")
-- moved here from record_daily_activity().
CREATE OR REPLACE FUNCTION public.record_meaningful_day(p_user_id uuid, p_action text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_today    date := (timezone('utc', now()))::date;
  v_inserted int;
  v_had_yesterday boolean;
  v_streak   int;
BEGIN
  INSERT INTO public.player_active_days (user_id, day, first_action)
  VALUES (p_user_id, v_today, p_action)
  ON CONFLICT DO NOTHING;
  GET DIAGNOSTICS v_inserted = ROW_COUNT;
  IF v_inserted = 0 THEN
    RETURN;  -- already counted today
  END IF;

  v_had_yesterday := EXISTS (SELECT 1 FROM public.player_active_days WHERE user_id = p_user_id AND day = v_today - 1);

  PERFORM set_config('app.bypass_profile_guard', 'true', true);
  UPDATE public.profiles
  SET current_streak = CASE WHEN v_had_yesterday THEN COALESCE(current_streak, 0) + 1 ELSE 1 END,
      longest_streak = GREATEST(COALESCE(longest_streak, 0),
                                CASE WHEN v_had_yesterday THEN COALESCE(current_streak, 0) + 1 ELSE 1 END)
  WHERE id = p_user_id
  RETURNING current_streak INTO v_streak;

  IF v_streak >= 3 AND EXISTS (
    SELECT 1 FROM public.player_fragments
    WHERE user_id = p_user_id AND fragment_no = 1
      AND (timezone('utc', earned_at))::date <= v_today - 2
  ) THEN
    INSERT INTO public.player_fragments (user_id, fragment_no, code)
    VALUES (p_user_id, 2, public.fragment_code(p_user_id, 2))
    ON CONFLICT DO NOTHING;
  END IF;

  PERFORM public.log_game_event(p_user_id, 'meaningful_day', jsonb_build_object('action', p_action, 'streak', v_streak));
  PERFORM public.check_referral_qualification(p_user_id);
END;
$$;

REVOKE ALL ON FUNCTION public.record_meaningful_day(uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.record_meaningful_day(uuid, text) FROM anon, authenticated;

-- Presence only: last_active_at (comeback detection) and breaking a streak whose last
-- meaningful day is older than yesterday. App opens no longer grow the streak.
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
  v_today       date := (timezone('utc', now()))::date;
  v_last_date   date;
  v_last_day    date;
  v_days        int;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '28000';
  END IF;

  SELECT p.last_active_at, COALESCE(p.current_streak, 0)
  INTO v_last_active, v_streak
  FROM public.profiles p WHERE p.id = v_user_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Profile not found for user %', v_user_id USING ERRCODE = 'P0002';
  END IF;

  SELECT max(d.day) INTO v_last_day FROM public.player_active_days d WHERE d.user_id = v_user_id;
  IF v_streak > 0 AND (v_last_day IS NULL OR v_last_day < v_today - 1) THEN
    v_streak := 0;
  END IF;

  v_last_date := (timezone('utc', v_last_active))::date;
  v_days := CASE WHEN v_last_date IS NULL OR v_last_date = v_today THEN 0 ELSE v_today - v_last_date END;

  PERFORM set_config('app.bypass_profile_guard', 'true', true);
  UPDATE public.profiles
  SET current_streak = v_streak,
      last_active_at = timezone('utc', now())
  WHERE id = v_user_id;

  RETURN QUERY SELECT v_streak, v_days;
END;
$$;

REVOKE ALL ON FUNCTION public.record_daily_activity() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.record_daily_activity() TO authenticated;


-- ================================================================
-- SECTION 7: Referral — activation gate, qualification, attribution, dashboard, invite context
-- ================================================================

ALTER TABLE public.referral_signups ADD COLUMN IF NOT EXISTS qualified_at TIMESTAMP WITH TIME ZONE;
ALTER TABLE public.referral_signups ADD COLUMN IF NOT EXISTS source_type TEXT;
ALTER TABLE public.referral_signups ADD COLUMN IF NOT EXISTS source_quest_id TEXT;
ALTER TABLE public.referral_signups ADD COLUMN IF NOT EXISTS first_touch JSONB;
ALTER TABLE public.referral_signups ADD COLUMN IF NOT EXISTS last_touch JSONB;
ALTER TABLE public.referral_signups ADD COLUMN IF NOT EXISTS attributed_at TIMESTAMP WITH TIME ZONE;

-- Same reward ladder as 20260925130000 (1 = +1 key, 2 = free node, 3 = rare card, 5 = badge;
-- replacing it with the Game Bible ladder is an open client decision). New: activation also
-- requires onboarding done or skipped (Referral "ACTIVATED REFERRAL"), the referrer is
-- notified, and the event is logged.
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
  IF NOT EXISTS (
    SELECT 1 FROM public.player_state ps
    WHERE ps.user_id = NEW.user_id
      AND (ps.onboarding_completed_at IS NOT NULL OR ps.onboarding_skipped_at IS NOT NULL)
  ) THEN
    RETURN NEW;  -- re-checked on the next completed quest
  END IF;

  UPDATE public.referral_signups
  SET activated_at = timezone('utc', now())
  WHERE referred_id = NEW.user_id AND activated_at IS NULL
  RETURNING referrer_id INTO v_referrer_id;

  IF v_referrer_id IS NULL THEN
    RETURN NEW;  -- not referred, or already activated
  END IF;

  PERFORM public.log_game_event(NEW.user_id, 'referral_activated', jsonb_build_object('referrer_id', v_referrer_id));

  SELECT display_name INTO v_referrer_name FROM public.profiles WHERE id = v_referrer_id;
  SELECT count(*) INTO v_count
  FROM public.referral_signups
  WHERE referrer_id = v_referrer_id AND activated_at IS NOT NULL;

  INSERT INTO public.player_notifications (user_id, category, priority, title, body, link)
  VALUES (v_referrer_id, 'social', 2, 'Hráč aktivován',
          'Hráč, kterého jsi pozval(a), dokončil první quest. Aktivovaní: ' || v_count || '.', '/profile');

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

  -- Activation can land after the 3rd active day (onboarding gate) — re-check qualification.
  PERFORM public.check_referral_qualification(NEW.user_id);
  RETURN NEW;
END;
$$;

-- First/last referral touch (Viral "DEEP LINK ARCHITECTURE", Referral "FIRST TOUCH × LAST
-- TOUCH"). Written once, right after signup, for the player's own referral row only.
-- Only whitelisted keys are kept; values are truncated.
CREATE OR REPLACE FUNCTION public.sanitize_touch(p_touch jsonb)
RETURNS jsonb
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT COALESCE(jsonb_object_agg(key, left(value, 100)), '{}'::jsonb)
  FROM jsonb_each_text(CASE WHEN jsonb_typeof(p_touch) = 'object' THEN p_touch ELSE '{}'::jsonb END)
  WHERE key IN ('ref', 'quest', 'share_type', 'asset', 'campaign', 'at', 'landing');
$$;

CREATE OR REPLACE FUNCTION public.record_referral_attribution(p_first jsonb, p_last jsonb)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_first   jsonb := public.sanitize_touch(p_first);
  v_last    jsonb := public.sanitize_touch(p_last);
  v_updated int;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '28000';
  END IF;

  UPDATE public.referral_signups
  SET first_touch = v_first,
      last_touch = v_last,
      source_type = COALESCE(NULLIF(v_last->>'share_type', ''), NULLIF(v_first->>'share_type', ''), 'invite'),
      source_quest_id = CASE
        WHEN EXISTS (SELECT 1 FROM public.challenges c WHERE c.id = COALESCE(v_last->>'quest', v_first->>'quest'))
        THEN COALESCE(v_last->>'quest', v_first->>'quest') END,
      attributed_at = timezone('utc', now())
  WHERE referred_id = v_user_id AND attributed_at IS NULL;
  GET DIAGNOSTICS v_updated = ROW_COUNT;
  RETURN v_updated > 0;
END;
$$;

REVOKE ALL ON FUNCTION public.record_referral_attribution(jsonb, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.record_referral_attribution(jsonb, jsonb) TO authenticated;

-- Referral "MVP1 DASHBOARD": "Přivedl jsi 7 hráčů · Activated · Qualified · Pending · Next".
CREATE OR REPLACE FUNCTION public.get_referral_dashboard()
RETURNS TABLE (
  invited int,
  pending int,
  activated int,
  qualified int,
  current_title text,
  next_title text,
  next_title_at int
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_inv int; v_act int; v_q int;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '28000';
  END IF;

  SELECT count(*),
         count(*) FILTER (WHERE activated_at IS NOT NULL),
         count(*) FILTER (WHERE qualified_at IS NOT NULL)
  INTO v_inv, v_act, v_q
  FROM public.referral_signups WHERE referrer_id = v_user_id;

  RETURN QUERY
  SELECT v_inv,
         v_inv - v_act,
         v_act - v_q,
         v_q,
         (SELECT ii.title FROM public.player_identity_items pii
          JOIN public.identity_items ii ON ii.item_key = pii.item_key
          WHERE pii.user_id = v_user_id AND ii.item_key LIKE 'recruiter-%'
          ORDER BY ii.sort_order DESC LIMIT 1),
         t.title, t.at
  FROM (VALUES ('Signaler', 1), ('Connector', 5), ('Recruiter', 10), ('Player Builder', 25), ('Portal Maker', 50), ('Ambassador', 100))
       AS t(title, at)
  WHERE t.at > v_q
  ORDER BY t.at
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN QUERY SELECT v_inv, v_inv - v_act, v_act - v_q, v_q,
      (SELECT ii.title FROM public.player_identity_items pii
       JOIN public.identity_items ii ON ii.item_key = pii.item_key
       WHERE pii.user_id = v_user_id AND ii.item_key LIKE 'recruiter-%'
       ORDER BY ii.sort_order DESC LIMIT 1),
      NULL::text, NULL::int;
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.get_referral_dashboard() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_referral_dashboard() TO authenticated;

-- Viral "VIRAL LANDING PAGE": "Vitex tě vyzval k Questu …, zabere …". Public (anon) — returns
-- only the inviter's public display name and the quest's public title.
CREATE OR REPLACE FUNCTION public.get_invite_context(p_code text, p_quest_id text DEFAULT NULL)
RETURNS TABLE (
  inviter_name text,
  quest_id text,
  quest_title text,
  quest_minutes int
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT p.display_name,
         c.id,
         c.title,
         c.estimated_minutes
  FROM public.profiles p
  LEFT JOIN public.challenges c ON c.id = p_quest_id
  WHERE p.referral_code = p_code
  LIMIT 1;
$$;

REVOKE ALL ON FUNCTION public.get_invite_context(text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_invite_context(text, text) TO anon, authenticated;


-- ================================================================
-- SECTION 8: Completion hooks — events, meaningful day, level-up, notifications
-- ================================================================

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
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_handle_completion_progress ON public.challenge_completions;
CREATE TRIGGER trg_handle_completion_progress
  AFTER INSERT ON public.challenge_completions
  FOR EACH ROW EXECUTE FUNCTION public.handle_completion_progress();

-- Level-ups and node changes, whatever wrote the XP / uzel.
CREATE OR REPLACE FUNCTION public.handle_profile_progress()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_old int := public.lifetime_level(OLD.xp);
  v_new int := public.lifetime_level(NEW.xp);
BEGIN
  IF v_new > v_old THEN
    PERFORM public.log_game_event(NEW.id, 'level_reached', jsonb_build_object('level', v_new));
    INSERT INTO public.player_notifications (user_id, category, priority, title, body, link)
    VALUES (NEW.id, 'progress', 2, 'Level ' || v_new, 'Posunul(a) ses na Level ' || v_new || '.', '/profile');
  END IF;
  IF NEW.uzel IS DISTINCT FROM OLD.uzel THEN
    PERFORM public.log_game_event(NEW.id, 'node_completed', jsonb_build_object('from', OLD.uzel, 'to', NEW.uzel));
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_handle_profile_progress ON public.profiles;
CREATE TRIGGER trg_handle_profile_progress
  AFTER UPDATE OF xp, uzel ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.handle_profile_progress();

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
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_handle_post_events ON public.feed_posts;
CREATE TRIGGER trg_handle_post_events
  AFTER INSERT ON public.feed_posts
  FOR EACH ROW EXECUTE FUNCTION public.handle_post_events();

CREATE OR REPLACE FUNCTION public.handle_card_events()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  PERFORM public.log_game_event(NEW.user_id, 'collection_item_earned', jsonb_build_object('card_key', NEW.card_key));
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_handle_card_events ON public.user_cards;
CREATE TRIGGER trg_handle_card_events
  AFTER INSERT ON public.user_cards
  FOR EACH ROW EXECUTE FUNCTION public.handle_card_events();


-- ================================================================
-- SECTION 9: Reactions — max 1 per player per post
-- ================================================================

-- Existing duplicates: keep each player's earliest reaction on a post, drop the rest and
-- take them off the counters.
DO $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT post_id, user_id, type FROM (
      SELECT post_id, user_id, type,
             row_number() OVER (PARTITION BY post_id, user_id ORDER BY created_at, type) AS rn
      FROM public.feed_reactions
    ) x WHERE rn > 1
  LOOP
    DELETE FROM public.feed_reactions WHERE post_id = r.post_id AND user_id = r.user_id AND type = r.type;
    UPDATE public.feed_posts SET
      reactions_fire = CASE WHEN r.type = 'fire' THEN GREATEST(COALESCE(reactions_fire, 0) - 1, 0) ELSE reactions_fire END,
      reactions_plant = CASE WHEN r.type = 'plant' THEN GREATEST(COALESCE(reactions_plant, 0) - 1, 0) ELSE reactions_plant END,
      reactions_lightning = CASE WHEN r.type = 'plant' THEN GREATEST(COALESCE(reactions_lightning, 0) - 1, 0) ELSE reactions_lightning END,
      reactions_eye = CASE WHEN r.type = 'eye' THEN GREATEST(COALESCE(reactions_eye, 0) - 1, 0) ELSE reactions_eye END
    WHERE id = r.post_id;
  END LOOP;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS uq_feed_reactions_one_per_player ON public.feed_reactions(post_id, user_id);

-- Same signature and return shape. Same type again = no-op; a different type switches the
-- player's single reaction. Reactions give no XP or keys (Progression "PUBLIC PROOF").
-- The author gets at most one unread "social" notification per post.
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
DECLARE
  v_user_id  uuid := auth.uid();
  v_type     text := CASE WHEN p_type = 'lightning' THEN 'plant' ELSE p_type END;
  v_previous text;
  v_author   uuid;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '28000';
  END IF;

  IF v_type NOT IN ('fire', 'plant', 'eye') THEN
    RAISE EXCEPTION 'Invalid reaction type: %', p_type USING ERRCODE = '22023';
  END IF;

  SELECT fp.user_id INTO v_author FROM public.feed_posts fp WHERE fp.id = p_post_id AND fp.is_public = true;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Post not found' USING ERRCODE = 'P0002';
  END IF;

  SELECT fr.type INTO v_previous FROM public.feed_reactions fr
  WHERE fr.post_id = p_post_id AND fr.user_id = v_user_id
  FOR UPDATE;

  IF v_previous IS NULL OR v_previous <> v_type THEN
    IF v_previous IS NOT NULL THEN
      DELETE FROM public.feed_reactions fr WHERE fr.post_id = p_post_id AND fr.user_id = v_user_id;
      UPDATE public.feed_posts fp SET
        reactions_fire = CASE WHEN v_previous = 'fire' THEN GREATEST(COALESCE(fp.reactions_fire, 0) - 1, 0) ELSE fp.reactions_fire END,
        reactions_plant = CASE WHEN v_previous = 'plant' THEN GREATEST(COALESCE(fp.reactions_plant, 0) - 1, 0) ELSE fp.reactions_plant END,
        reactions_lightning = CASE WHEN v_previous = 'plant' THEN GREATEST(COALESCE(fp.reactions_lightning, 0) - 1, 0) ELSE fp.reactions_lightning END,
        reactions_eye = CASE WHEN v_previous = 'eye' THEN GREATEST(COALESCE(fp.reactions_eye, 0) - 1, 0) ELSE fp.reactions_eye END
      WHERE fp.id = p_post_id;
    END IF;

    INSERT INTO public.feed_reactions (post_id, user_id, type) VALUES (p_post_id, v_user_id, v_type);
    UPDATE public.feed_posts fp SET
      reactions_fire = CASE WHEN v_type = 'fire' THEN COALESCE(fp.reactions_fire, 0) + 1 ELSE fp.reactions_fire END,
      reactions_plant = CASE WHEN v_type = 'plant' THEN COALESCE(fp.reactions_plant, 0) + 1 ELSE fp.reactions_plant END,
      reactions_lightning = CASE WHEN v_type = 'plant' THEN COALESCE(fp.reactions_lightning, 0) + 1 ELSE fp.reactions_lightning END,
      reactions_eye = CASE WHEN v_type = 'eye' THEN COALESCE(fp.reactions_eye, 0) + 1 ELSE fp.reactions_eye END
    WHERE fp.id = p_post_id;

    IF v_previous IS NULL AND v_author <> v_user_id AND NOT EXISTS (
      SELECT 1 FROM public.player_notifications n
      WHERE n.user_id = v_author AND n.ref_id = p_post_id::text AND n.read_at IS NULL
    ) THEN
      INSERT INTO public.player_notifications (user_id, category, priority, title, body, link, ref_id)
      VALUES (v_author, 'social', 3, 'Reakce na tvůj důkaz', 'Někdo zareagoval na tvůj důkaz.', '/feed', p_post_id::text);
    END IF;
  END IF;

  RETURN QUERY
  SELECT fp.reactions_fire, COALESCE(fp.reactions_plant, fp.reactions_lightning, 0), fp.reactions_eye
  FROM public.feed_posts fp
  WHERE fp.id = p_post_id;
END;
$$;

REVOKE ALL ON FUNCTION public.increment_feed_reaction(UUID, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.increment_feed_reaction(UUID, TEXT) FROM anon;
GRANT EXECUTE ON FUNCTION public.increment_feed_reaction(UUID, TEXT) TO authenticated;


-- ================================================================
-- SECTION 10: Feed — World/System cards + MVP ranking
-- ================================================================

-- Feed "MVP1 — POSTS": System/World Card. Published by an admin under the system name.
CREATE OR REPLACE FUNCTION public.publish_world_post(p_content text)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_text    text := NULLIF(btrim(COALESCE(p_content, '')), '');
  v_id      uuid;
BEGIN
  IF v_user_id IS NULL OR NOT public.check_is_admin(v_user_id) THEN
    RAISE EXCEPTION 'Admins only' USING ERRCODE = '42501';
  END IF;
  IF v_text IS NULL OR char_length(v_text) > 600 THEN
    RAISE EXCEPTION 'World post must have 1–600 characters' USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.feed_posts (user_id, user_name, type, content, is_public)
  VALUES (v_user_id, 'Hra Reality', 'WORLD', v_text, true)
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$$;

REVOKE ALL ON FUNCTION public.publish_world_post(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.publish_world_post(text) TO authenticated;

-- Feed Engine "MVP1 — ALGORITHM": recency, Theme/path relevance, beginner boost, basic
-- diversity, plus actionability (can the viewer play this quest?) — the reason the feed
-- exists ("Zkus taky"). The Pass multiplier is kept as before: original spec-20 wants it,
-- the Game Bible forbids paid reach — open client decision.
-- Return type changed (my_reaction, author_level) → drop first.
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
  author_title text
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
           ps.display_title,
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
        -- path relevance: how close the author's node is to the viewer's
        0.30 * CASE WHEN v.uzel IS NULL OR c.author_uzel IS NULL THEN 0.5
                    ELSE 1 - LEAST(abs(c.author_uzel - v.uzel), 8) / 8.0 END
        -- actionability: a quest the viewer has reached and not yet done
      + 0.20 * CASE
                 WHEN c.challenge_id IS NULL OR c.node_order IS NULL THEN 0
                 WHEN v.uid IS NOT NULL AND EXISTS (
                   SELECT 1 FROM public.challenge_completions cc
                   WHERE cc.user_id = v.uid AND cc.challenge_id = c.challenge_id) THEN 0.3
                 WHEN v.uzel IS NULL OR c.node_order <= v.uzel + 1 THEN 1
                 ELSE 0.4 END
        -- freshness: 48 h decay
      + 0.30 * exp(-extract(epoch FROM (timezone('utc', now()) - c.created_at)) / 3600.0 / 48.0)
      + 0.15 * LEAST(ln(1 + COALESCE(c.reactions_fire, 0) + COALESCE(c.reactions_plant, 0) + COALESCE(c.reactions_eye, 0)) / ln(51), 1)
      + 0.05 * random()
      )
      -- beginner boost: first proof, or an author in their first 7 days
      * CASE WHEN c.first_proof OR c.author_since > timezone('utc', now()) - interval '7 days' THEN 1.3 ELSE 1 END
      * CASE WHEN c.type = 'WORLD' THEN 1.2 WHEN c.type IN ('STATUS', 'COLLECTION') THEN 1.1 ELSE 1 END
      * CASE WHEN c.author_pass_holder THEN 1.25 ELSE 1 END
      AS base_score
    FROM candidates c CROSS JOIN viewer v
  ),
  diversified AS (
    -- basic diversity: each further post by the same author counts less
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
         (SELECT ii.title FROM public.identity_items ii WHERE ii.item_key = d.display_title)
  FROM diversified d
  ORDER BY d.score DESC
  LIMIT LEAST(GREATEST(COALESCE(p_limit, 50), 1), 100);
$$;

REVOKE ALL ON FUNCTION public.get_feed(int) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_feed(int) TO anon, authenticated;


-- ================================================================
-- SECTION 11: Player progress — Next Move, theme/season progress, comeback state
-- ================================================================

-- Progression "PLAYER HOME" ("Co mám udělat teď?") and Retention "COMEBACK ENGINE".
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
  absence_state text
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
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '28000';
  END IF;

  SELECT p.xp, p.uzel INTO v_profile FROM public.profiles p WHERE p.id = v_user_id;
  SELECT sn.id, sn.node_order, sn.title INTO v_node FROM public.story_nodes sn WHERE sn.node_order = v_profile.uzel LIMIT 1;
  SELECT max(d.day) INTO v_last FROM public.player_active_days d WHERE d.user_id = v_user_id;
  v_days := CASE WHEN v_last IS NULL THEN NULL ELSE (timezone('utc', now()))::date - v_last END;

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
    -- Retention "ABSENCE STATES" (thresholds calibrated later from real usage)
    CASE
      WHEN v_days IS NULL OR v_days < 3 THEN 'active'
      WHEN v_days < 7 THEN 'cooling'
      WHEN v_days < 30 THEN 'lapsed'
      WHEN v_days < 90 THEN 'dormant'
      ELSE 'deep_dormant'
    END
  FROM (SELECT 1) one
  LEFT JOIN LATERAL (
    -- next quest: the first unfinished mandatory loop on the path (current node, then the
    -- next ones); optional loops of the current node only when nothing mandatory is left
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
-- SECTION 12: Public profile fields
-- ================================================================

-- Appends Lifetime Level / identity slots; status_title now follows the Bible title gates.
-- Existing columns keep their order (CREATE OR REPLACE VIEW rule).
CREATE OR REPLACE VIEW public.profiles_public AS
SELECT p.id, p.display_name, p.xp, p.uzel, p.avatar_level, p.pass_holder, p.current_streak, p.showcase_card_keys,
       ps.avatar_url,
       ps.active_frame,
       (ps.onboarding_completed_at IS NOT NULL) AS onboarding_completed,
       public.lifetime_title(p.id) AS status_title,
       public.lifetime_level(p.xp) AS lifetime_level,
       ps.active_aura,
       ps.active_mask,
       (SELECT ii.title FROM public.identity_items ii WHERE ii.item_key = ps.display_title) AS display_title
FROM public.profiles p
LEFT JOIN public.player_state ps ON ps.user_id = p.id;

GRANT SELECT ON public.profiles_public TO anon, authenticated;


-- ================================================================
-- SECTION 13: KPI views (Retention "MVP1 RETENTION KPI", Referral/Viral "MVP1 … KPI")
-- SQL Editor / service role only.
-- ================================================================

-- Onboarding → Q1 → Q2 → Q3 per signup week.
CREATE OR REPLACE VIEW public.kpi_activation AS
SELECT date_trunc('week', p.created_at)::date AS signup_week,
       count(*) AS registered,
       count(*) FILTER (WHERE ps.onboarding_completed_at IS NOT NULL) AS onboarded,
       count(*) FILTER (WHERE q.n >= 1) AS q1,
       count(*) FILTER (WHERE q.n >= 2) AS q2,
       count(*) FILTER (WHERE q.n >= 3) AS q3
FROM public.profiles p
LEFT JOIN public.player_state ps ON ps.user_id = p.id
LEFT JOIN LATERAL (SELECT count(*) AS n FROM public.challenge_completions cc WHERE cc.user_id = p.id) q ON true
GROUP BY 1
ORDER BY 1 DESC;

-- Invited → Activated → Qualified by source.
CREATE OR REPLACE VIEW public.kpi_referrals AS
SELECT COALESCE(rs.source_type, 'unknown') AS source_type,
       count(*) AS registered,
       count(*) FILTER (WHERE rs.activated_at IS NOT NULL) AS activated,
       count(*) FILTER (WHERE rs.qualified_at IS NOT NULL) AS qualified,
       count(DISTINCT rs.referrer_id) AS referrers
FROM public.referral_signups rs
GROUP BY 1
ORDER BY 2 DESC;

REVOKE ALL ON public.kpi_activation FROM anon, authenticated;
REVOKE ALL ON public.kpi_referrals FROM anon, authenticated;
