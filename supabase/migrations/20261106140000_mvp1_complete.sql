-- iWau / Hra Reality — the rest of the April spec that doesn't need client input.
-- Run after 20261106130000_ai_moderation.sql, before deploying the frontend.
--   1. Pass progress boost (spec-9 D), identity unlock on activation (spec-4).
--   2. Integration phase, fragment cycles and the bridge layer (spec-2, spec-11). The text is
--      the example from the spec and stays editable in admin until the client supplies theirs.
--   3. Feed scoring by the spec's 0.4 / 0.3 / 0.2 / 0.1, rank-up status cards, curated cards.
--   4. Player's choice of what the public profile shows (spec-12 §2.4).
--   5. The KPIs from spec-11 that weren't reported yet.

INSERT INTO public.game_config (key, value, description, source) VALUES
  ('pass_xp_bonus_pct', '20', 'Pass: bonus XP za quest v procentech', 'spec-9 D, příklad'),
  ('pass_key_bonus_nodes', '[3, 5, 7]', 'Pass: uzly, kde veřejný důkaz dá +1 klíč navíc', 'spec-9 D, návrh milníků'),
  ('integration_xp', '15', 'XP za signál v integrační fázi', 'pracovní hodnota, doladí designér'),
  ('fragments_per_cycle', '5', 'Počet fragmentů v jednom cyklu', 'spec-11'),
  ('cycle_reward_keys', '1', 'Klíče za dokončený cyklus fragmentů', 'pracovní hodnota, doladí designér'),
  ('status_post_levels', '[2, 3, 5, 10, 20, 30, 50, 75, 100]', 'Levely, které vytvoří status kartu ve feedu', 'spec-6 §8 rank up')
ON CONFLICT (key) DO NOTHING;

-- ================================================================
-- SECTION 1: Pass
-- ================================================================

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

  -- Public proofs live in the public bucket, private ones in the owner-only bucket. A private
  -- proof must never be stored under a publicly readable URL, and vice versa.
  IF p_image_url IS NOT NULL THEN
    IF p_is_public AND p_image_url NOT LIKE '%/storage/v1/object/public/proofs/' || v_user_id::text || '/%' THEN
      RAISE EXCEPTION 'Invalid proof media URL' USING ERRCODE = '22023';
    END IF;
    IF NOT p_is_public AND p_image_url NOT LIKE '%/storage/v1/object/authenticated/proofs-private/' || v_user_id::text || '/%' THEN
      RAISE EXCEPTION 'Invalid private proof media URL' USING ERRCODE = '22023';
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

  -- spec-9 D "PROGRESS BOOST": faster, not pay-to-win. Both numbers live in game_config; set
  -- pass_xp_bonus_pct to 0 and pass_key_bonus_nodes to [] to switch it off.
  IF COALESCE(v_pass_holder, false) THEN
    v_reward_xp := round(v_reward_xp * (1 + public.cfg_num('pass_xp_bonus_pct', 20) / 100.0))::int;
    IF p_is_public
       AND public.cfg_json('pass_key_bonus_nodes', '[3, 5, 7]'::jsonb) @> to_jsonb(v_node_order)
       AND (SELECT count(*) FROM public.challenge_completions cc
            JOIN public.challenges ch ON ch.id = cc.challenge_id
            JOIN public.story_nodes sn ON sn.id = ch.story_node_id
            WHERE cc.user_id = v_user_id AND sn.node_order = v_node_order) = 1 THEN
      v_reward_keys := v_reward_keys + 1;
    END IF;
  END IF;

  -- spec-21 §6: LEVEL 1–7 = uzel 1–7, the avatar visibly changes after each node.
  v_new_badges := CASE WHEN v_current_badges < 7 THEN v_current_badges + 1 ELSE v_current_badges END;

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

REVOKE ALL ON FUNCTION public.complete_challenge(text, text, text, boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.complete_challenge(text, text, text, boolean) TO authenticated;

INSERT INTO public.identity_items (item_key, kind, title, description, rarity, acquisition, unlock_hint, sort_order, visual)
VALUES ('aura-founder-pass', 'aura', 'Aura aktivního hráče', 'Bonusový identitní prvek za aktivaci Passu.',
        'rare', 'pass', 'Aktivace Passu', 30, '{"color":"#F5B73F"}')
ON CONFLICT (item_key) DO NOTHING;

CREATE OR REPLACE FUNCTION public.handle_pass_activated()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NEW.pass_holder AND NOT COALESCE(OLD.pass_holder, false) THEN
    PERFORM public.grant_identity_item(NEW.id, 'aura-founder-pass', 'pass');
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.handle_pass_activated() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_handle_pass_activated ON public.profiles;
CREATE TRIGGER trg_handle_pass_activated
  AFTER UPDATE OF pass_holder ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.handle_pass_activated();

-- ================================================================
-- SECTION 2: Integration phase and bridge layer
-- ================================================================

CREATE TABLE IF NOT EXISTS public.integration_signals (
  id          TEXT PRIMARY KEY,
  phase       TEXT NOT NULL CHECK (phase IN ('integration', 'bridge')),
  sort_order  INT NOT NULL DEFAULT 0,
  unlock_day  INT NOT NULL DEFAULT 0,
  title       TEXT NOT NULL,
  body        TEXT NOT NULL DEFAULT '',
  prompt      TEXT NOT NULL DEFAULT '',
  is_active   BOOLEAN NOT NULL DEFAULT true
);

ALTER TABLE public.integration_signals ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins manage integration signals" ON public.integration_signals;
CREATE POLICY "Admins manage integration signals" ON public.integration_signals
  FOR ALL TO authenticated
  USING (public.check_is_admin(auth.uid()))
  WITH CHECK (public.check_is_admin(auth.uid()));

-- Example content from the spec (spec-2 "CO SE DĚJE V INTEGRACI", "STRUKTURA MEZIVRSTVY").
INSERT INTO public.integration_signals (id, phase, sort_order, unlock_day, title, body, prompt) VALUES
  ('int-1', 'integration', 1, 0, 'Co se změnilo?', 'První vrstva dokončena. Systém přechází do integrační fáze.', 'Napiš jednou větou, co se od začátku změnilo.'),
  ('int-2', 'integration', 2, 2, 'Dvě minuty', 'Malá akce, která drží směr.', 'Udělej 2minutovou akci a napiš, co to bylo.'),
  ('int-3', 'integration', 3, 4, 'Kdy jsi selhal?', 'Selhání je signál, ne konec hry.', 'Popiš jeden moment, kdy se ti to nepovedlo.'),
  ('int-4', 'integration', 4, 7, 'Kdy jsi obstál?', 'Všimni si, co už funguje.', 'Popiš jeden moment, kdy jsi obstál/a.'),
  ('int-5', 'integration', 5, 10, 'Reflexe týdne', 'Co z toho si necháš?', 'Napiš, co si z posledních dní bereš dál.'),
  ('bridge-1', 'bridge', 6, 7, 'Důsledky', 'Mezivrstva je méně o akci a více o smyslu.', 'Jak tvé akce ovlivnily okolí?'),
  ('bridge-2', 'bridge', 7, 9, 'Slepá místa', 'Kde je tvůj další krok?', 'Kde ses ještě vyhýbal/a změně?'),
  ('bridge-3', 'bridge', 8, 11, 'Identita 2.0', 'Porovnej se se sebou na začátku.', 'Kdo jsi teď oproti začátku?'),
  ('bridge-4', 'bridge', 9, 13, 'Komunitní propojení', 'Nejsi v tom sám/sama.', 'Reaguj na důkaz jiného hráče a napiš, co ti dal.'),
  ('bridge-5', 'bridge', 10, 15, 'Přenos', 'Co platí tady, může platit i jinde.', 'Jak to aplikuješ v jiné oblasti života?')
ON CONFLICT (id) DO NOTHING;

CREATE TABLE IF NOT EXISTS public.player_integration (
  user_id    UUID PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
  started_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);

CREATE TABLE IF NOT EXISTS public.integration_completions (
  user_id    UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  signal_id  TEXT NOT NULL REFERENCES public.integration_signals(id) ON DELETE CASCADE,
  answer     TEXT NOT NULL CHECK (char_length(answer) BETWEEN 1 AND 500),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL,
  PRIMARY KEY (user_id, signal_id)
);

ALTER TABLE public.player_integration ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.integration_completions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Players and admins read integration state" ON public.player_integration;
CREATE POLICY "Players and admins read integration state" ON public.player_integration
  FOR SELECT TO authenticated USING (user_id = auth.uid() OR public.check_is_admin(auth.uid()));

DROP POLICY IF EXISTS "Players and admins read integration answers" ON public.integration_completions;
CREATE POLICY "Players and admins read integration answers" ON public.integration_completions
  FOR SELECT TO authenticated USING (user_id = auth.uid() OR public.check_is_admin(auth.uid()));

CREATE OR REPLACE FUNCTION public.start_player_integration()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  INSERT INTO public.player_integration (user_id) VALUES (NEW.user_id) ON CONFLICT DO NOTHING;
  PERFORM public.log_game_event(NEW.user_id, 'integration_started', '{}'::jsonb);
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.start_player_integration() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_start_player_integration ON public.season_reflections;
CREATE TRIGGER trg_start_player_integration
  AFTER INSERT ON public.season_reflections
  FOR EACH ROW EXECUTE FUNCTION public.start_player_integration();

INSERT INTO public.player_integration (user_id, started_at)
SELECT user_id, created_at FROM public.season_reflections
ON CONFLICT DO NOTHING;

CREATE OR REPLACE FUNCTION public.get_integration_state()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_started timestamptz;
  v_day int;
  v_fragments int;
  v_per_cycle int := GREATEST(public.cfg_num('fragments_per_cycle', 5)::int, 1);
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '28000';
  END IF;

  SELECT started_at INTO v_started FROM public.player_integration WHERE user_id = v_user_id;
  IF v_started IS NULL THEN
    RETURN jsonb_build_object('active', false);
  END IF;

  v_day := floor(extract(epoch FROM (timezone('utc', now()) - v_started)) / 86400);
  SELECT count(*) INTO v_fragments FROM public.player_fragments WHERE user_id = v_user_id;

  RETURN jsonb_build_object(
    'active', true,
    'day', v_day,
    'fragments', v_fragments,
    'per_cycle', v_per_cycle,
    'cycles', v_fragments / v_per_cycle,
    'pass', COALESCE((SELECT pass_holder FROM public.profiles WHERE id = v_user_id), false),
    'signals', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'id', s.id, 'phase', s.phase, 'title', s.title, 'body', s.body, 'prompt', s.prompt,
        'unlock_day', s.unlock_day, 'unlocked', s.unlock_day <= v_day,
        'done', c.signal_id IS NOT NULL, 'answer', c.answer
      ) ORDER BY s.sort_order)
      FROM public.integration_signals s
      LEFT JOIN public.integration_completions c ON c.signal_id = s.id AND c.user_id = v_user_id
      WHERE s.is_active
    ), '[]'::jsonb)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.get_integration_state() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_integration_state() TO authenticated;

-- spec-2: Pass collects fragments, the free tier keeps XP without them.
CREATE OR REPLACE FUNCTION public.complete_integration_signal(p_signal_id text, p_answer text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_answer text := NULLIF(btrim(COALESCE(p_answer, '')), '');
  v_started timestamptz;
  v_signal public.integration_signals%ROWTYPE;
  v_pass boolean;
  v_xp int := public.cfg_num('integration_xp', 15)::int;
  v_per_cycle int := GREATEST(public.cfg_num('fragments_per_cycle', 5)::int, 1);
  v_cycle_keys int := 0;
  v_fragment_no int;
  v_fragments int;
  v_keys int;
  v_inserted int;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '28000';
  END IF;
  IF v_answer IS NULL OR char_length(v_answer) > 500 THEN
    RAISE EXCEPTION 'Answer must have 1–500 characters' USING ERRCODE = '22023';
  END IF;

  SELECT started_at INTO v_started FROM public.player_integration WHERE user_id = v_user_id;
  IF v_started IS NULL THEN
    RAISE EXCEPTION 'Integration has not started' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_signal FROM public.integration_signals WHERE id = p_signal_id AND is_active;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Unknown signal' USING ERRCODE = 'P0002';
  END IF;
  IF v_signal.unlock_day > floor(extract(epoch FROM (timezone('utc', now()) - v_started)) / 86400) THEN
    RAISE EXCEPTION 'Signal is still locked' USING ERRCODE = '42501';
  END IF;

  INSERT INTO public.integration_completions (user_id, signal_id, answer)
  VALUES (v_user_id, p_signal_id, v_answer)
  ON CONFLICT DO NOTHING;
  GET DIAGNOSTICS v_inserted = ROW_COUNT;
  IF v_inserted = 0 THEN
    RETURN jsonb_build_object('already_completed', true);
  END IF;

  SELECT pass_holder INTO v_pass FROM public.profiles WHERE id = v_user_id;

  IF COALESCE(v_pass, false) THEN
    SELECT COALESCE(max(fragment_no), 0) + 1 INTO v_fragment_no FROM public.player_fragments WHERE user_id = v_user_id;
    INSERT INTO public.player_fragments (user_id, fragment_no, code)
    VALUES (v_user_id, v_fragment_no, public.fragment_code(v_user_id, v_fragment_no));
    SELECT count(*) INTO v_fragments FROM public.player_fragments WHERE user_id = v_user_id;
    IF v_fragments % v_per_cycle = 0 THEN
      v_cycle_keys := public.cfg_num('cycle_reward_keys', 1)::int;
      PERFORM public.log_game_event(v_user_id, 'integration_cycle_completed', jsonb_build_object('cycles', v_fragments / v_per_cycle));
    END IF;
  END IF;

  PERFORM set_config('app.bypass_profile_guard', 'true', true);
  UPDATE public.profiles
  SET xp = xp + v_xp, keys_balance = keys_balance + v_cycle_keys
  WHERE id = v_user_id
  RETURNING keys_balance INTO v_keys;

  IF v_cycle_keys > 0 THEN
    INSERT INTO public.key_transactions (user_id, amount, source, balance_after)
    VALUES (v_user_id, v_cycle_keys, 'INTEGRATION_CYCLE', v_keys);
  END IF;

  PERFORM public.log_game_event(v_user_id, 'integration_signal_completed', jsonb_build_object('signal_id', p_signal_id, 'phase', v_signal.phase));
  PERFORM public.record_meaningful_day(v_user_id, 'integration');

  RETURN jsonb_build_object('already_completed', false, 'xp', v_xp, 'fragment', v_fragment_no, 'cycle_keys', v_cycle_keys);
END;
$$;

REVOKE ALL ON FUNCTION public.complete_integration_signal(text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.complete_integration_signal(text, text) TO authenticated;

-- ================================================================
-- SECTION 3: Feed
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
  created_at timestamptz,
  my_reaction text,
  author_level int,
  author_title text,
  author_primary_badge text,
  author_aura_color text,
  author_mask text,
  reward_xp int,
  reward_keys int,
  theme_name text
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
           c.reward_xp AS quest_xp, c.reward_keys AS quest_keys, t.name AS quest_theme,
           (fp.type IN ('PROOF', 'ONBOARDING') AND fp.created_at = (
              SELECT min(x.created_at) FROM public.feed_posts x
              WHERE x.user_id = fp.user_id AND x.type IN ('PROOF', 'ONBOARDING')
           )) AS first_proof
    FROM public.feed_posts fp
    LEFT JOIN public.profiles p ON p.id = fp.user_id
    LEFT JOIN public.player_state ps ON ps.user_id = fp.user_id
    LEFT JOIN public.challenges c ON c.id = fp.challenge_id
    LEFT JOIN public.story_nodes sn ON sn.id = c.story_node_id
    LEFT JOIN public.themes t ON t.id = sn.theme_id
    WHERE fp.is_public = true
      AND fp.moderation_status = 'approved'
      AND fp.created_at > timezone('utc', now()) - interval '30 days'
      AND NOT EXISTS (SELECT 1 FROM public.user_blocks b WHERE b.blocker_id = auth.uid() AND b.blocked_id = fp.user_id)
      AND NOT EXISTS (SELECT 1 FROM public.hidden_posts h WHERE h.user_id = auth.uid() AND h.post_id = fp.id)
    ORDER BY fp.created_at DESC
    LIMIT 300
  ),
  scored AS (
    SELECT c.*,
      (
        0.40 * (
          0.6 * CASE WHEN v.uzel IS NULL OR c.author_uzel IS NULL THEN 0.5
                     ELSE 1 - LEAST(abs(c.author_uzel - v.uzel), 8) / 8.0 END
        + 0.4 * CASE
                 WHEN c.challenge_id IS NULL OR c.node_order IS NULL THEN 0
                 WHEN v.uid IS NOT NULL AND EXISTS (
                   SELECT 1 FROM public.challenge_completions cc
                   WHERE cc.user_id = v.uid AND cc.challenge_id = c.challenge_id) THEN 0.3
                 WHEN v.uzel IS NULL OR c.node_order <= v.uzel + 1 THEN 1
                 ELSE 0.4 END
        )
      + 0.30 * exp(-extract(epoch FROM (timezone('utc', now()) - c.created_at)) / 3600.0 / 48.0)
      + 0.20 * LEAST(ln(1 + COALESCE(c.reactions_fire, 0) + COALESCE(c.reactions_plant, 0) + COALESCE(c.reactions_eye, 0)) / ln(51), 1)
      + 0.10 * random()
      )
      * CASE WHEN c.first_proof OR c.author_since > timezone('utc', now()) - interval '7 days' THEN 1.3 ELSE 1 END
      * CASE WHEN c.type IN ('WORLD', 'FEATURED') THEN 1.2 WHEN c.type IN ('STATUS', 'COLLECTION') THEN 1.1 ELSE 1 END
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
         (SELECT ii.title FROM public.identity_items ii WHERE ii.item_key = d.active_mask),
         d.quest_xp, d.quest_keys, d.quest_theme
  FROM diversified d
  ORDER BY d.score DESC
  LIMIT LEAST(GREATEST(COALESCE(p_limit, 50), 1), 100);
$$;


REVOKE ALL ON FUNCTION public.get_feed(int) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_feed(int) TO anon, authenticated;

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
    -- spec-6 §8 "rank up": only the levels worth showing, so the feed isn't full of them.
    IF public.cfg_json('status_post_levels', '[]'::jsonb) @> to_jsonb(v_new) THEN
      INSERT INTO public.feed_posts (user_id, user_name, type, content, is_public)
      VALUES (NEW.id, COALESCE(NEW.display_name, 'Hráč'), 'STATUS',
              COALESCE(NEW.display_name, 'Hráč') || ' dosáhl(a) Levelu ' || v_new || '.', true);
    END IF;
  END IF;
  IF NEW.uzel IS DISTINCT FROM OLD.uzel THEN
    PERFORM public.log_game_event(NEW.id, 'node_completed', jsonb_build_object('from', OLD.uzel, 'to', NEW.uzel));
  END IF;
  RETURN NEW;
END;
$$;

-- spec-6 §5 "Featured / curated cards": hand-picked moments published by an admin.
CREATE OR REPLACE FUNCTION public.publish_featured_post(p_content text, p_image_url text DEFAULT NULL)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_text text := NULLIF(btrim(COALESCE(p_content, '')), '');
  v_image text := NULLIF(btrim(COALESCE(p_image_url, '')), '');
  v_id uuid;
BEGIN
  IF v_user_id IS NULL OR NOT public.check_is_admin(v_user_id) THEN
    RAISE EXCEPTION 'Admins only' USING ERRCODE = '42501';
  END IF;
  IF v_text IS NULL OR char_length(v_text) > 600 THEN
    RAISE EXCEPTION 'Featured post must have 1–600 characters' USING ERRCODE = '22023';
  END IF;
  IF v_image IS NOT NULL AND v_image !~ '^https://' THEN
    RAISE EXCEPTION 'Image must be an https URL' USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.feed_posts (user_id, user_name, type, content, image_url, media_type, is_public)
  VALUES (v_user_id, 'Hra Reality', 'FEATURED', v_text, v_image, CASE WHEN v_image IS NOT NULL THEN 'image' END, true)
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$$;

REVOKE ALL ON FUNCTION public.publish_featured_post(text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.publish_featured_post(text, text) TO authenticated;

-- ================================================================
-- SECTION 4: What the public profile shows
-- ================================================================

CREATE TABLE IF NOT EXISTS public.player_privacy (
  user_id         UUID PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
  show_progress   BOOLEAN NOT NULL DEFAULT true,
  show_proofs     BOOLEAN NOT NULL DEFAULT true,
  show_collection BOOLEAN NOT NULL DEFAULT true,
  updated_at      TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);

ALTER TABLE public.player_privacy ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Anyone reads profile visibility" ON public.player_privacy;
CREATE POLICY "Anyone reads profile visibility" ON public.player_privacy FOR SELECT USING (true);

CREATE OR REPLACE FUNCTION public.set_my_privacy(p_show_progress boolean, p_show_proofs boolean, p_show_collection boolean)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '28000';
  END IF;
  INSERT INTO public.player_privacy (user_id, show_progress, show_proofs, show_collection)
  VALUES (auth.uid(), p_show_progress, p_show_proofs, p_show_collection)
  ON CONFLICT (user_id) DO UPDATE
  SET show_progress = EXCLUDED.show_progress, show_proofs = EXCLUDED.show_proofs,
      show_collection = EXCLUDED.show_collection, updated_at = timezone('utc', now());
END;
$$;

REVOKE ALL ON FUNCTION public.set_my_privacy(boolean, boolean, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_my_privacy(boolean, boolean, boolean) TO authenticated;

-- ================================================================
-- SECTION 5: KPIs from spec-11 not reported yet
-- ================================================================

CREATE OR REPLACE FUNCTION public.admin_kpi_extended(p_days int DEFAULT 30)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_since timestamptz := timezone('utc', now()) - make_interval(days => LEAST(GREATEST(COALESCE(p_days, 30), 1), 365));
  v_result jsonb;
BEGIN
  IF NOT public.check_is_admin(auth.uid()) THEN
    RAISE EXCEPTION 'Admins only' USING ERRCODE = '42501';
  END IF;

  WITH proof_counts AS (
    SELECT user_id, count(*) AS n FROM public.feed_posts
    WHERE type = 'PROOF' AND created_at >= v_since GROUP BY user_id
  ),
  first_paid AS (
    SELECT user_id, min(paid_at) AS paid_at FROM public.pass_invoices WHERE amount_czk > 0 GROUP BY user_id
  )
  SELECT jsonb_build_object(
    'proofs', jsonb_build_object(
      'players_1_plus', (SELECT count(*) FROM proof_counts),
      'players_3_plus', (SELECT count(*) FROM proof_counts WHERE n >= 3),
      'avg_per_player', (SELECT round(avg(n), 1) FROM proof_counts),
      'photo', (SELECT count(*) FROM public.feed_posts WHERE type = 'PROOF' AND created_at >= v_since AND media_type = 'image'),
      'video', (SELECT count(*) FROM public.feed_posts WHERE type = 'PROOF' AND created_at >= v_since AND media_type = 'video'),
      'text', (SELECT count(*) FROM public.feed_posts WHERE type = 'PROOF' AND created_at >= v_since AND image_url IS NULL),
      'public', (SELECT count(*) FROM public.feed_posts WHERE type = 'PROOF' AND created_at >= v_since AND is_public),
      'private', (SELECT count(*) FROM public.feed_posts WHERE type = 'PROOF' AND created_at >= v_since AND NOT is_public)
    ),
    'streaks', jsonb_build_object(
      '1_2', (SELECT count(*) FROM public.profiles WHERE current_streak BETWEEN 1 AND 2),
      '3_4', (SELECT count(*) FROM public.profiles WHERE current_streak BETWEEN 3 AND 4),
      '5_6', (SELECT count(*) FROM public.profiles WHERE current_streak BETWEEN 5 AND 6),
      '7_plus', (SELECT count(*) FROM public.profiles WHERE current_streak >= 7)
    ),
    'sessions', jsonb_build_object(
      'avg_per_player', (
        SELECT round(avg(n), 1) FROM (
          SELECT count(*) AS n FROM public.analytics_events
          WHERE event_name = 'app_open' AND created_at >= v_since AND user_id IS NOT NULL GROUP BY user_id
        ) s),
      'feed_openers', (SELECT count(DISTINCT user_id) FROM public.analytics_events WHERE event_name = 'feed_session_end' AND created_at >= v_since),
      'profile_viewers', (SELECT count(DISTINCT user_id) FROM public.analytics_events WHERE event_name = 'identity_profile_viewed' AND created_at >= v_since),
      'profile_views', (SELECT count(*) FROM public.analytics_events WHERE event_name = 'identity_profile_viewed' AND created_at >= v_since),
      'reacting_players', (SELECT count(DISTINCT user_id) FROM public.feed_reactions WHERE created_at >= v_since)
    ),
    'purchase', jsonb_build_object(
      'median_days_to_purchase', (
        SELECT round((percentile_cont(0.5) WITHIN GROUP (ORDER BY extract(epoch FROM (f.paid_at - p.created_at)) / 86400))::numeric, 1)
        FROM first_paid f JOIN public.profiles p ON p.id = f.user_id),
      'active_after_purchase', (
        SELECT count(*) FROM first_paid f
        WHERE EXISTS (SELECT 1 FROM public.game_events g WHERE g.user_id = f.user_id AND g.created_at > f.paid_at AND g.event_type = 'quest_completed'))
    ),
    'integration', jsonb_build_object(
      'started', (SELECT count(*) FROM public.player_integration),
      'signals_1_plus', (SELECT count(DISTINCT user_id) FROM public.integration_completions),
      'signals_3_plus', (SELECT count(*) FROM (SELECT user_id FROM public.integration_completions GROUP BY user_id HAVING count(*) >= 3) s),
      'fragments', (SELECT count(*) FROM public.player_fragments),
      'first_cycle_players', (SELECT count(*) FROM (SELECT user_id FROM public.player_fragments GROUP BY user_id HAVING count(*) >= GREATEST(public.cfg_num('fragments_per_cycle', 5)::int, 1)) s),
      'cycles', (SELECT COALESCE(sum(n / GREATEST(public.cfg_num('fragments_per_cycle', 5)::int, 1)), 0) FROM (SELECT count(*) AS n FROM public.player_fragments GROUP BY user_id) s),
      'bridge_players', (SELECT count(DISTINCT c.user_id) FROM public.integration_completions c JOIN public.integration_signals s ON s.id = c.signal_id WHERE s.phase = 'bridge')
    )
  ) INTO v_result;
  RETURN v_result;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_kpi_extended(int) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_kpi_extended(int) TO authenticated;
