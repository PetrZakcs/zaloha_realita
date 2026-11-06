-- iWau / Hra Reality — MVP1 completion: everything the original spec decides that doesn't need
-- client content. Run after 20261020130000_admin_phase_b.sql, before deploying the frontend.
--   1. Avatar levels 0–7, one per node (spec-21 §6).
--   2. Private proofs in their own private bucket; public buckets can no longer be listed.
--   3. Feed cards carry reward + theme (spec-17 §6 "Reward row").
--   4. Founder purchase as a share moment (spec-17 §14 "nákup").
--   5. Recurring referral reward from every Pass payment (spec-18). In-game only, never money.
--   6. Self-service account deletion (GDPR).
--   7. Admin: contact flags, segment, quality score (spec-21 §11) + extended export.
--   8. Business KPIs (spec-22): landing, time to first proof, Pass funnel, month-2 renewal.

-- ================================================================
-- SECTION 1 + 2: complete_challenge — avatar cap 7, private media
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
GRANT EXECUTE ON FUNCTION public.complete_challenge(text, text, text, boolean) TO authenticated;

-- ================================================================
-- SECTION 2: Storage
-- ================================================================

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('proofs-private', 'proofs-private', false, 52428800,
        ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/heic', 'image/heif',
              'video/mp4', 'video/webm', 'video/quicktime'])
ON CONFLICT (id) DO NOTHING;

-- A public bucket serves files by URL without any policy. These SELECT policies only added the
-- ability for anyone to LIST every file, including proofs marked private before this migration.
DROP POLICY IF EXISTS "Allow public read access to proofs bucket" ON storage.objects;
DROP POLICY IF EXISTS "Allow public read access to avatars" ON storage.objects;

DROP POLICY IF EXISTS "Owners read their own game media" ON storage.objects;
CREATE POLICY "Owners read their own game media"
  ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id IN ('proofs', 'proofs-private', 'avatars')
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

DROP POLICY IF EXISTS "Admins read game media" ON storage.objects;
CREATE POLICY "Admins read game media"
  ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id IN ('proofs', 'proofs-private', 'avatars') AND public.check_is_admin(auth.uid()));

DROP POLICY IF EXISTS "Owners upload private proofs" ON storage.objects;
CREATE POLICY "Owners upload private proofs"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'proofs-private' AND (storage.foldername(name))[1] = auth.uid()::text);

-- Needed for account deletion (the client removes its own files first).
DROP POLICY IF EXISTS "Owners delete their own game media" ON storage.objects;
CREATE POLICY "Owners delete their own game media"
  ON storage.objects FOR DELETE TO authenticated
  USING (
    bucket_id IN ('proofs', 'proofs-private', 'avatars')
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

-- ================================================================
-- SECTION 3: get_feed — reward row + theme
-- ================================================================

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
-- SECTION 4: Founder purchase is a share moment
-- ================================================================

ALTER TABLE public.share_rewards DROP CONSTRAINT IF EXISTS share_rewards_source_type_check;
ALTER TABLE public.share_rewards ADD CONSTRAINT share_rewards_source_type_check
  CHECK (source_type IN ('challenge', 'onboarding', 'season', 'pass'));

CREATE OR REPLACE FUNCTION public.claim_share_reward(p_source_type text, p_source_id text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_user_id  uuid := auth.uid();
  v_inserted int;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '28000';
  END IF;

  IF p_source_type = 'challenge' THEN
    IF NOT EXISTS (SELECT 1 FROM public.challenge_completions WHERE user_id = v_user_id AND challenge_id = p_source_id) THEN
      RAISE EXCEPTION 'Challenge not completed' USING ERRCODE = '42501';
    END IF;
  ELSIF p_source_type = 'onboarding' THEN
    IF p_source_id <> 'onboarding' OR NOT EXISTS (
      SELECT 1 FROM public.player_state WHERE user_id = v_user_id AND onboarding_completed_at IS NOT NULL
    ) THEN
      RAISE EXCEPTION 'Onboarding not completed' USING ERRCODE = '42501';
    END IF;
  ELSIF p_source_type = 'season' THEN
    IF p_source_id <> 'season-0' OR NOT EXISTS (SELECT 1 FROM public.season_reflections WHERE user_id = v_user_id) THEN
      RAISE EXCEPTION 'Season not completed' USING ERRCODE = '42501';
    END IF;
  ELSIF p_source_type = 'pass' THEN
    IF p_source_id <> 'founder' OR NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = v_user_id AND pass_holder) THEN
      RAISE EXCEPTION 'Pass not active' USING ERRCODE = '42501';
    END IF;
  ELSE
    RAISE EXCEPTION 'Unknown share source: %', p_source_type USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.share_rewards (user_id, source_type, source_id)
  VALUES (v_user_id, p_source_type, p_source_id)
  ON CONFLICT DO NOTHING;
  GET DIAGNOSTICS v_inserted = ROW_COUNT;
  IF v_inserted = 0 THEN
    RETURN false;
  END IF;

  PERFORM set_config('app.bypass_profile_guard', 'true', true);
  UPDATE public.profiles SET keys_balance = keys_balance + 1, xp = xp + 5 WHERE id = v_user_id;
  INSERT INTO public.key_transactions (user_id, amount, source, balance_after)
  SELECT v_user_id, 1, 'SHARE', keys_balance FROM public.profiles WHERE id = v_user_id;
  RETURN true;
END;
$$;

REVOKE ALL ON FUNCTION public.claim_share_reward(text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.claim_share_reward(text, text) TO authenticated;

-- ================================================================
-- SECTION 5: Pass payments + recurring referral reward
-- ================================================================
-- spec-18: "z každého nákupu hráče ve struktuře získává určité odměny na pravidelné bázi".
-- One level only (who invited the buyer) and in-game value only: keys + XP, never money, so
-- this stays a game mechanic and not a multi-level commission scheme. Sizes live in game_config.

INSERT INTO public.game_config (key, value, description, source) VALUES
  ('referral_purchase_keys', '1', 'Keys for the inviter on each Pass payment of an invited player', 'spec-18 (velikost orientační, doladit)'),
  ('referral_purchase_xp', '10', 'XP for the inviter on each Pass payment of an invited player', 'spec-18 (velikost orientační, doladit)')
ON CONFLICT (key) DO NOTHING;

-- stripe-webhook has always logged checkouts here, but no migration ever created the table, so
-- every insert failed with a logged warning and deposits weren't recorded anywhere.
CREATE TABLE IF NOT EXISTS public.payments (
  id         UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id    UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  stripe_payment_intent_id TEXT,
  type       TEXT NOT NULL,
  amount_czk INT NOT NULL DEFAULT 0,
  status     TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);

ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Admins read payments" ON public.payments;
CREATE POLICY "Admins read payments" ON public.payments
  FOR SELECT TO authenticated USING (public.check_is_admin(auth.uid()));

CREATE TABLE IF NOT EXISTS public.pass_invoices (
  stripe_invoice_id TEXT PRIMARY KEY,
  user_id        UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  amount_czk     INT NOT NULL DEFAULT 0,
  billing_reason TEXT,
  paid_at        TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_pass_invoices_user ON public.pass_invoices(user_id, paid_at);

ALTER TABLE public.pass_invoices ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Admins read pass invoices" ON public.pass_invoices;
CREATE POLICY "Admins read pass invoices" ON public.pass_invoices
  FOR SELECT TO authenticated USING (public.check_is_admin(auth.uid()));

CREATE TABLE IF NOT EXISTS public.referral_purchase_rewards (
  stripe_invoice_id TEXT PRIMARY KEY REFERENCES public.pass_invoices(stripe_invoice_id) ON DELETE CASCADE,
  referrer_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
  keys        INT NOT NULL,
  xp          INT NOT NULL,
  created_at  TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_referral_purchase_rewards_referrer ON public.referral_purchase_rewards(referrer_id);

ALTER TABLE public.referral_purchase_rewards ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Referrers read their purchase rewards" ON public.referral_purchase_rewards;
CREATE POLICY "Referrers read their purchase rewards" ON public.referral_purchase_rewards
  FOR SELECT TO authenticated USING (referrer_id = auth.uid() OR public.check_is_admin(auth.uid()));

-- Called by stripe-webhook on invoice.paid. Idempotent per invoice. Returns true when an inviter
-- was rewarded now.
CREATE OR REPLACE FUNCTION public.record_pass_payment(
  p_user_id uuid,
  p_invoice_id text,
  p_amount_czk int,
  p_billing_reason text
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_inserted int;
  v_referrer uuid;
  v_keys     int := GREATEST(public.cfg_num('referral_purchase_keys', 1)::int, 0);
  v_xp       int := GREATEST(public.cfg_num('referral_purchase_xp', 10)::int, 0);
BEGIN
  INSERT INTO public.pass_invoices (stripe_invoice_id, user_id, amount_czk, billing_reason)
  VALUES (p_invoice_id, p_user_id, COALESCE(p_amount_czk, 0), p_billing_reason)
  ON CONFLICT (stripe_invoice_id) DO NOTHING;
  GET DIAGNOSTICS v_inserted = ROW_COUNT;
  IF v_inserted = 0 OR COALESCE(p_amount_czk, 0) <= 0 THEN
    RETURN false;
  END IF;

  -- Only an activated invite counts — the same bar as every other referral reward.
  SELECT rs.referrer_id INTO v_referrer
  FROM public.referral_signups rs
  WHERE rs.referred_id = p_user_id AND rs.activated_at IS NOT NULL AND rs.referrer_id <> p_user_id;
  IF v_referrer IS NULL THEN
    RETURN false;
  END IF;

  INSERT INTO public.referral_purchase_rewards (stripe_invoice_id, referrer_id, keys, xp)
  VALUES (p_invoice_id, v_referrer, v_keys, v_xp);

  PERFORM set_config('app.bypass_profile_guard', 'true', true);
  UPDATE public.profiles SET keys_balance = keys_balance + v_keys, xp = xp + v_xp WHERE id = v_referrer;
  IF v_keys > 0 THEN
    INSERT INTO public.key_transactions (user_id, amount, source, balance_after)
    SELECT v_referrer, v_keys, 'REFERRAL', keys_balance FROM public.profiles WHERE id = v_referrer;
  END IF;

  INSERT INTO public.player_notifications (user_id, category, priority, title, body, link, ref_id)
  VALUES (v_referrer, 'social', 2, 'Odměna z tvé pozvánky',
          'Hráč, kterého jsi přivedl(a), je aktivní Founder. Máš +' || v_keys || ' klíč a +' || v_xp || ' XP.',
          '/profile', p_invoice_id);
  RETURN true;
END;
$$;

REVOKE ALL ON FUNCTION public.record_pass_payment(uuid, text, int, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.record_pass_payment(uuid, text, int, text) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.record_pass_payment(uuid, text, int, text) TO service_role;

-- ================================================================
-- SECTION 6: Account deletion
-- ================================================================

CREATE OR REPLACE FUNCTION public.delete_my_account()
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

  -- Stripe would keep charging a player whose account is gone.
  IF EXISTS (
    SELECT 1 FROM public.subscriptions
    WHERE user_id = v_user_id AND status IN ('active', 'trialing', 'past_due')
  ) THEN
    RAISE EXCEPTION 'active_subscription' USING ERRCODE = 'P0001';
  END IF;

  DELETE FROM public.feed_posts WHERE user_id = v_user_id;
  DELETE FROM public.profiles WHERE id = v_user_id;
  DELETE FROM auth.users WHERE id = v_user_id;
END;
$$;

REVOKE ALL ON FUNCTION public.delete_my_account() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.delete_my_account() TO authenticated;

-- ================================================================
-- SECTION 7: Admin — contact flags, segment, quality score
-- ================================================================

CREATE TABLE IF NOT EXISTS public.player_admin_flags (
  user_id    UUID PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
  contact_ok BOOLEAN NOT NULL DEFAULT false,
  segment    TEXT CHECK (segment IN ('core', 'whale', 'leader', 'ambassador', 'risk')),
  note       TEXT CHECK (char_length(note) <= 1000),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);

ALTER TABLE public.player_admin_flags ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Admins manage player flags" ON public.player_admin_flags;
CREATE POLICY "Admins manage player flags" ON public.player_admin_flags
  FOR ALL TO authenticated
  USING (public.check_is_admin(auth.uid()))
  WITH CHECK (public.check_is_admin(auth.uid()));

-- 0–100 from what a player actually did: public proofs, active days, reactions received, invited
-- qualified players; reports against them count down.
CREATE OR REPLACE FUNCTION public.player_quality_score(p_user_id uuid)
RETURNS int
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT GREATEST(0, LEAST(100,
      LEAST((SELECT count(*) FROM public.feed_posts fp WHERE fp.user_id = p_user_id AND fp.type = 'PROOF' AND fp.is_public) * 8, 40)
    + LEAST((SELECT count(*) FROM public.player_active_days d WHERE d.user_id = p_user_id) * 4, 28)
    + LEAST((SELECT COALESCE(sum(COALESCE(fp.reactions_fire, 0) + COALESCE(fp.reactions_plant, 0) + COALESCE(fp.reactions_eye, 0)), 0)
             FROM public.feed_posts fp WHERE fp.user_id = p_user_id), 16)
    + LEAST((SELECT count(*) FROM public.referral_signups rs WHERE rs.referrer_id = p_user_id AND rs.qualified_at IS NOT NULL) * 8, 16)
    - (SELECT count(*) FROM public.feed_reports r JOIN public.feed_posts fp ON fp.id = r.post_id WHERE fp.user_id = p_user_id) * 10
  ))::int;
$$;

REVOKE ALL ON FUNCTION public.player_quality_score(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.player_quality_score(uuid) TO authenticated;

DROP FUNCTION IF EXISTS public.admin_players_export();

CREATE OR REPLACE FUNCTION public.admin_players_export()
RETURNS TABLE (
  id uuid,
  display_name text,
  email text,
  created_at timestamptz,
  last_active_at timestamptz,
  lifetime_level int,
  lifetime_title text,
  xp int,
  uzel int,
  keys_balance int,
  current_streak int,
  pass_holder boolean,
  onboarding_completed boolean,
  completed_quests bigint,
  proofs bigint,
  meaningful_days bigint,
  referred_by text,
  invited bigint,
  invited_activated bigint,
  invited_qualified bigint,
  quality_score int,
  contact_ok boolean,
  segment text
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NOT public.check_is_admin(auth.uid()) THEN
    RAISE EXCEPTION 'Admins only' USING ERRCODE = '42501';
  END IF;
  RETURN QUERY
  SELECT p.id, p.display_name, p.email, p.created_at, p.last_active_at,
         public.lifetime_level(p.xp), public.lifetime_title(p.id),
         p.xp, p.uzel, p.keys_balance, p.current_streak, p.pass_holder,
         (ps.onboarding_completed_at IS NOT NULL),
         (SELECT count(*) FROM public.challenge_completions cc WHERE cc.user_id = p.id),
         (SELECT count(*) FROM public.feed_posts fp WHERE fp.user_id = p.id AND fp.type = 'PROOF'),
         (SELECT count(*) FROM public.player_active_days d WHERE d.user_id = p.id),
         p.referred_by_code,
         (SELECT count(*) FROM public.referral_signups rs WHERE rs.referrer_id = p.id),
         (SELECT count(*) FROM public.referral_signups rs WHERE rs.referrer_id = p.id AND rs.activated_at IS NOT NULL),
         (SELECT count(*) FROM public.referral_signups rs WHERE rs.referrer_id = p.id AND rs.qualified_at IS NOT NULL),
         public.player_quality_score(p.id),
         COALESCE(f.contact_ok, false),
         f.segment
  FROM public.profiles p
  LEFT JOIN public.player_state ps ON ps.user_id = p.id
  LEFT JOIN public.player_admin_flags f ON f.user_id = p.id
  ORDER BY p.created_at;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_players_export() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_players_export() TO authenticated;

-- ================================================================
-- SECTION 8: Business KPIs (spec-22)
-- ================================================================

CREATE OR REPLACE FUNCTION public.admin_kpi_business(p_days int DEFAULT 30)
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

  WITH ev AS (
    SELECT event_name, count(*) AS n, count(DISTINCT COALESCE(user_id::text, anon_id)) AS actors
    FROM public.analytics_events WHERE created_at >= v_since GROUP BY event_name
  ),
  cohort AS (
    SELECT p.id, p.created_at,
           (SELECT min(cc.completed_at) FROM public.challenge_completions cc WHERE cc.user_id = p.id) AS first_quest
    FROM public.profiles p WHERE p.created_at >= v_since
  ),
  buyers AS (
    SELECT i.user_id, min(i.paid_at) AS first_paid
    FROM public.pass_invoices i
    WHERE i.user_id IS NOT NULL AND i.amount_czk > 0
    GROUP BY i.user_id
  )
  SELECT jsonb_build_object(
    'entry', jsonb_build_object(
      'landing_views', COALESCE((SELECT actors FROM ev WHERE event_name = 'landing_viewed'), 0),
      'landing_clicks', COALESCE((SELECT actors FROM ev WHERE event_name = 'landing_cta_clicked'), 0),
      'registered', (SELECT count(*) FROM cohort),
      'median_minutes_to_first_quest', (
        SELECT round((percentile_cont(0.5) WITHIN GROUP (ORDER BY extract(epoch FROM first_quest - created_at) / 60.0))::numeric, 1)
        FROM cohort WHERE first_quest IS NOT NULL),
      'first_quest_within_24h', (SELECT count(*) FROM cohort WHERE first_quest <= created_at + interval '24 hours')
    ),
    'quest_timing', jsonb_build_object(
      'quest_starts', COALESCE((SELECT n FROM ev WHERE event_name = 'quest_start'), 0),
      'proofs', COALESCE((SELECT n FROM ev WHERE event_name = 'proof_submit'), 0),
      'avg_seconds_start_to_proof', (
        SELECT round(avg((metadata->>'seconds_since_start')::numeric))
        FROM public.analytics_events
        WHERE event_name = 'proof_submit' AND created_at >= v_since AND metadata->>'seconds_since_start' ~ '^[0-9]+$')
    ),
    'retention', jsonb_build_object(
      'd3_players', (
        SELECT count(DISTINCT c.id) FROM cohort c
        JOIN public.player_active_days d ON d.user_id = c.id AND d.day = (c.created_at)::date + 3),
      'avg_active_days_first_7', (
        SELECT round(avg(x.days)::numeric, 1) FROM (
          SELECT (SELECT count(*) FROM public.player_active_days d
                  WHERE d.user_id = c.id AND d.day < (c.created_at)::date + 7) AS days
          FROM cohort c) x)
    ),
    'feed', jsonb_build_object(
      'avg_session_seconds', (
        SELECT round(avg((metadata->>'seconds')::numeric))
        FROM public.analytics_events
        WHERE event_name = 'feed_session_end' AND created_at >= v_since AND metadata->>'seconds' ~ '^[0-9]+$')
    ),
    'pass_funnel', jsonb_build_object(
      'paywall_viewers', COALESCE((SELECT actors FROM ev WHERE event_name = 'paywall_opened'), 0),
      'checkout_started', COALESCE((SELECT actors FROM ev WHERE event_name = 'pass_checkout_started'), 0),
      'buyers', (SELECT count(*) FROM buyers WHERE first_paid >= v_since),
      'deposits', (SELECT count(*) FROM public.payments WHERE type = 'DEPOSIT_TEST' AND created_at >= v_since),
      'intent_next_theme', COALESCE((SELECT actors FROM ev WHERE event_name = 'purchase_intent_next_theme'), 0)
    ),
    -- spec-13 validation: Month 2 retention, counted only for buyers who already had a chance
    -- to renew.
    'renewal', jsonb_build_object(
      'eligible', (SELECT count(*) FROM buyers WHERE first_paid < timezone('utc', now()) - interval '32 days'),
      'renewed', (
        SELECT count(*) FROM buyers b
        WHERE b.first_paid < timezone('utc', now()) - interval '32 days'
          AND EXISTS (SELECT 1 FROM public.pass_invoices i
                      WHERE i.user_id = b.user_id AND i.amount_czk > 0 AND i.paid_at > b.first_paid + interval '20 days')),
      'referral_purchase_rewards', (SELECT count(*) FROM public.referral_purchase_rewards WHERE created_at >= v_since)
    ),
    'reference', jsonb_build_object(
      'completed', (SELECT count(*) FROM public.season_reflections WHERE created_at >= v_since),
      'avg_transformation', (SELECT round(avg(transformation_percent)) FROM public.season_reflections WHERE created_at >= v_since),
      'would_recommend', (SELECT count(*) FROM public.season_reflections WHERE would_recommend AND created_at >= v_since)
    )
  ) INTO v_result;

  RETURN v_result;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_kpi_business(int) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_kpi_business(int) TO authenticated;
