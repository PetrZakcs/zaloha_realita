-- iWau / Hra Reality — AI moderation of public proofs, admin keeps the final word.
-- Run after 20261106120000_mvp1_finish.sql, before deploying the frontend + moderate-proof.
--   1. Every public player post starts hidden ('pending') and appears after approval.
--      Fail-closed: without the AI (no key, outage) posts wait for an admin.
--   2. Videos go straight to the admin queue: the AI only reads images and text.
--   3. moderate-proof claims posts and writes results through service-role-only RPCs.
--   4. Admin approves, takes down or deletes, every decision is logged.
-- Private proofs are seen only by their owner and admins, so they never reach the AI.

-- ================================================================
-- SECTION 1: Status on feed_posts
-- ================================================================

ALTER TABLE public.feed_posts
  ADD COLUMN IF NOT EXISTS moderation_status TEXT NOT NULL DEFAULT 'approved',
  ADD COLUMN IF NOT EXISTS moderation_reason TEXT,
  ADD COLUMN IF NOT EXISTS moderation_categories TEXT[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS moderated_by TEXT,
  ADD COLUMN IF NOT EXISTS moderated_at TIMESTAMP WITH TIME ZONE,
  ADD COLUMN IF NOT EXISTS moderation_attempts INT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS moderation_claimed_at TIMESTAMP WITH TIME ZONE;

ALTER TABLE public.feed_posts DROP CONSTRAINT IF EXISTS feed_posts_moderation_status_check;
ALTER TABLE public.feed_posts ADD CONSTRAINT feed_posts_moderation_status_check
  CHECK (moderation_status IN ('pending', 'needs_review', 'approved', 'rejected', 'not_required'));

-- Posts published before this migration stay visible; private ones are simply out of scope.
UPDATE public.feed_posts SET moderation_status = 'not_required'
WHERE type IN ('PROOF', 'ONBOARDING') AND is_public = false AND hidden_by_reports = false;

CREATE INDEX IF NOT EXISTS idx_feed_posts_moderation_queue
  ON public.feed_posts(created_at) WHERE moderation_status IN ('pending', 'needs_review');

-- A trigger rather than a change in every writer (complete_challenge, publish_pledge, ...), so a
-- future writer can't publish player content past moderation by forgetting a column.
CREATE OR REPLACE FUNCTION public.set_post_moderation_status()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  IF COALESCE(NEW.type, 'PROOF') NOT IN ('PROOF', 'ONBOARDING') THEN
    NEW.moderation_status := 'approved';
  ELSIF NOT NEW.is_public THEN
    NEW.moderation_status := 'not_required';
  ELSIF NEW.media_type = 'video' THEN
    NEW.moderation_status := 'needs_review';
    NEW.moderation_reason := 'Video kontroluje admin ručně.';
  ELSE
    NEW.moderation_status := 'pending';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_set_post_moderation_status ON public.feed_posts;
CREATE TRIGGER trg_set_post_moderation_status
  BEFORE INSERT ON public.feed_posts
  FOR EACH ROW EXECUTE FUNCTION public.set_post_moderation_status();

CREATE TABLE IF NOT EXISTS public.moderation_log (
  id         UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  -- No foreign key: the record of a decision has to outlive the deleted post.
  post_id    UUID NOT NULL,
  actor      TEXT NOT NULL,
  action     TEXT NOT NULL,
  categories TEXT[] NOT NULL DEFAULT '{}',
  reason     TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_moderation_log_post ON public.moderation_log(post_id, created_at DESC);

ALTER TABLE public.moderation_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins read the moderation log" ON public.moderation_log;
CREATE POLICY "Admins read the moderation log" ON public.moderation_log
  FOR SELECT TO authenticated USING (public.check_is_admin(auth.uid()));

-- ================================================================
-- SECTION 2: Visibility
-- ================================================================

-- Realtime follows this policy too, so a pending post is not even broadcast to other players.
DROP POLICY IF EXISTS "Allow public read access to public feed posts" ON public.feed_posts;
CREATE POLICY "Allow public read access to public feed posts" ON public.feed_posts
  FOR SELECT USING (is_public = TRUE AND moderation_status = 'approved');

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
         (SELECT ii.title FROM public.identity_items ii WHERE ii.item_key = d.active_mask),
         d.quest_xp, d.quest_keys, d.quest_theme
  FROM diversified d
  ORDER BY d.score DESC
  LIMIT LEAST(GREATEST(COALESCE(p_limit, 50), 1), 100);
$$;

REVOKE ALL ON FUNCTION public.get_feed(int) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_feed(int) TO anon, authenticated;

-- ================================================================
-- SECTION 3: moderate-proof (service role only)
-- ================================================================

-- A claim stops two runs paying for the same post. It expires, so a crashed run gets retried;
-- after 3 attempts the post goes to the admin queue instead of waiting forever.
CREATE OR REPLACE FUNCTION public.claim_posts_for_moderation(p_user_id uuid DEFAULT NULL, p_limit int DEFAULT 10)
RETURNS TABLE (id uuid, content text, image_url text, media_type text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
#variable_conflict use_column
BEGIN
  UPDATE public.feed_posts fp
  SET moderation_status = 'needs_review',
      moderation_reason = 'AI kontrola se nepodařila, rozhodni ručně.'
  WHERE fp.moderation_status = 'pending'
    AND fp.moderation_attempts >= 3
    AND fp.moderation_claimed_at < timezone('utc', now()) - interval '5 minutes';

  RETURN QUERY
  WITH picked AS (
    SELECT fp.id
    FROM public.feed_posts fp
    WHERE fp.moderation_status = 'pending'
      AND fp.moderation_attempts < 3
      AND (fp.moderation_claimed_at IS NULL
           OR fp.moderation_claimed_at < timezone('utc', now()) - interval '5 minutes')
      AND (p_user_id IS NULL OR fp.user_id = p_user_id)
    ORDER BY fp.created_at
    LIMIT LEAST(GREATEST(COALESCE(p_limit, 10), 1), 20)
    FOR UPDATE SKIP LOCKED
  )
  UPDATE public.feed_posts fp
  SET moderation_attempts = fp.moderation_attempts + 1,
      moderation_claimed_at = timezone('utc', now())
  FROM picked
  WHERE fp.id = picked.id
  RETURNING fp.id, fp.content, fp.image_url, fp.media_type;
END;
$$;

REVOKE ALL ON FUNCTION public.claim_posts_for_moderation(uuid, int) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_posts_for_moderation(uuid, int) TO service_role;

CREATE OR REPLACE FUNCTION public.notify_post_rejected(p_user_id uuid, p_post_id uuid)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  INSERT INTO public.player_notifications (user_id, category, priority, title, body, link, ref_id)
  VALUES (p_user_id, 'system', 0, 'Důkaz se nezobrazí ve feedu',
          'Tvůj důkaz neprošel kontrolou obsahu. Odměny ti zůstávají. Když si myslíš, že jde o omyl, ozvi se nám.',
          '/profile', p_post_id::text);
$$;

REVOKE ALL ON FUNCTION public.notify_post_rejected(uuid, uuid) FROM PUBLIC, anon, authenticated;

-- Only ever resolves a post still waiting: the AI must not overwrite an admin who was faster.
CREATE OR REPLACE FUNCTION public.apply_ai_moderation(
  p_post_id uuid,
  p_decision text,
  p_categories text[],
  p_reason text,
  p_model text
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_status text;
  v_user_id uuid;
BEGIN
  v_status := CASE p_decision WHEN 'allow' THEN 'approved' WHEN 'review' THEN 'needs_review' WHEN 'reject' THEN 'rejected' END;
  IF v_status IS NULL THEN
    RAISE EXCEPTION 'Unknown decision: %', p_decision USING ERRCODE = '22023';
  END IF;

  UPDATE public.feed_posts
  SET moderation_status = v_status,
      moderation_reason = left(p_reason, 500),
      moderation_categories = COALESCE(p_categories, '{}'),
      moderated_by = 'ai',
      moderated_at = timezone('utc', now())
  WHERE id = p_post_id AND moderation_status = 'pending'
  RETURNING user_id INTO v_user_id;

  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  INSERT INTO public.moderation_log (post_id, actor, action, categories, reason)
  VALUES (p_post_id, 'ai:' || COALESCE(p_model, 'unknown'), p_decision, COALESCE(p_categories, '{}'), left(p_reason, 500));

  IF v_status = 'rejected' AND v_user_id IS NOT NULL THEN
    PERFORM public.notify_post_rejected(v_user_id, p_post_id);
  END IF;

  RETURN v_status;
END;
$$;

REVOKE ALL ON FUNCTION public.apply_ai_moderation(uuid, text, text[], text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.apply_ai_moderation(uuid, text, text[], text, text) TO service_role;

-- ================================================================
-- SECTION 4: Admin decisions
-- ================================================================

CREATE OR REPLACE FUNCTION public.admin_moderate_post(p_post_id uuid, p_action text, p_note text DEFAULT NULL)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_post public.feed_posts%ROWTYPE;
  v_note text := left(NULLIF(btrim(COALESCE(p_note, '')), ''), 500);
BEGIN
  IF NOT public.check_is_admin(auth.uid()) THEN
    RAISE EXCEPTION 'Admin only' USING ERRCODE = '42501';
  END IF;
  IF p_action NOT IN ('approve', 'reject') THEN
    RAISE EXCEPTION 'Unknown action: %', p_action USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_post FROM public.feed_posts WHERE id = p_post_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Post not found' USING ERRCODE = 'P0002';
  END IF;
  -- A private proof lives in the owner-only bucket: "approving" it would publish what the player
  -- kept private, and its media would not even load for others.
  IF v_post.moderation_status = 'not_required' THEN
    RAISE EXCEPTION 'Private posts are not moderated' USING ERRCODE = '22023';
  END IF;

  IF p_action = 'approve' THEN
    UPDATE public.feed_posts
    SET moderation_status = 'approved',
        moderated_by = auth.uid()::text,
        moderated_at = timezone('utc', now()),
        moderation_reason = COALESCE(v_note, moderation_reason),
        -- Reviewed and fine: undo the automatic hide from reports.
        is_public = CASE WHEN hidden_by_reports THEN true ELSE is_public END,
        hidden_by_reports = false
    WHERE id = p_post_id;
    DELETE FROM public.feed_reports WHERE post_id = p_post_id;
  ELSE
    UPDATE public.feed_posts
    SET moderation_status = 'rejected',
        moderated_by = auth.uid()::text,
        moderated_at = timezone('utc', now()),
        moderation_reason = COALESCE(v_note, moderation_reason)
    WHERE id = p_post_id;
    IF v_post.moderation_status <> 'rejected' AND v_post.user_id IS NOT NULL THEN
      PERFORM public.notify_post_rejected(v_post.user_id, p_post_id);
    END IF;
  END IF;

  INSERT INTO public.moderation_log (post_id, actor, action, reason)
  VALUES (p_post_id, 'admin:' || auth.uid()::text, p_action, v_note);

  RETURN CASE p_action WHEN 'approve' THEN 'approved' ELSE 'rejected' END;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_moderate_post(uuid, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_moderate_post(uuid, text, text) TO authenticated;

-- Deleting a post has to remove the file too, otherwise taken-down media stays in storage.
DROP POLICY IF EXISTS "Admins delete game media" ON storage.objects;
CREATE POLICY "Admins delete game media"
  ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id IN ('proofs', 'proofs-private') AND public.check_is_admin(auth.uid()));

-- ================================================================
-- SECTION 5: Retry schedule — MANUAL STEP, same as retention push
-- ================================================================
-- Picks up posts whose first check failed (the app pokes moderate-proof right after a proof, this
-- is the safety net). Replace YOUR_PROJECT_REF, YOUR_ANON_KEY and YOUR_CRON_SECRET and run once in SQL Editor:
--
-- SELECT cron.schedule(
--   'moderate-proofs',
--   '* * * * *',
--   $$
--   SELECT net.http_post(
--     url := 'https://YOUR_PROJECT_REF.supabase.co/functions/v1/moderate-proof',
--     headers := jsonb_build_object('Content-Type', 'application/json', 'Authorization', 'Bearer YOUR_ANON_KEY', 'x-cron-secret', 'YOUR_CRON_SECRET'),
--     body := '{}'::jsonb
--   ) WHERE EXISTS (SELECT 1 FROM public.feed_posts WHERE moderation_status = 'pending');
--   $$
-- );
