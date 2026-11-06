-- ================================================================
-- MVP1 phase B — admin backoffice data.
-- Runs after 20261020120000_mvp1_phase_a.sql. All functions are admin-only.
--
--   1. admin_kpi_snapshot(): Retention "RETENTION DASHBOARD" (activation, D1/D7/D30, reality
--      retention, quest funnel), Viral/Referral "MVP1 KPI" (share → landing → registration →
--      activation, K by source), Feed "FEED HEALTH DASHBOARD" (supply, impressions,
--      recognition coverage, action propagation, negative feedback).
--   2. admin_review_queue(): suspicious completions, held referral rewards, referrers with
--      many registrations and few activations (Referral "RECRUITER QUALITY RATE").
--   3. admin_players_export(): rows for the CSV export (original spec "export dat").
-- ================================================================

CREATE OR REPLACE FUNCTION public.admin_kpi_snapshot(p_days int DEFAULT 30)
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
  ge AS (
    SELECT event_type, count(*) AS n, count(DISTINCT user_id) AS players
    FROM public.game_events WHERE created_at >= v_since GROUP BY event_type
  ),
  public_proofs AS (
    SELECT fp.id, fp.created_at FROM public.feed_posts fp
    WHERE fp.type = 'PROOF' AND fp.is_public AND fp.created_at >= v_since
  )
  SELECT jsonb_build_object(
    'period_days', LEAST(GREATEST(COALESCE(p_days, 30), 1), 365),
    'totals', jsonb_build_object(
      'players', (SELECT count(*) FROM public.profiles),
      'new_players', (SELECT count(*) FROM public.profiles WHERE created_at >= v_since),
      'pass_holders', (SELECT count(*) FROM public.profiles WHERE pass_holder),
      'meaningful_players', (SELECT count(DISTINCT user_id) FROM public.player_active_days WHERE day >= v_since::date)
    ),
    'activation', COALESCE((SELECT jsonb_agg(to_jsonb(a)) FROM (SELECT * FROM public.kpi_activation LIMIT 12) a), '[]'),
    'reality_retention', COALESCE((SELECT jsonb_agg(to_jsonb(r)) FROM (SELECT * FROM public.kpi_reality_retention LIMIT 12) r), '[]'),
    'engagement', (SELECT to_jsonb(e) FROM public.kpi_engagement e),
    'node_funnel', COALESCE((SELECT jsonb_agg(to_jsonb(n)) FROM public.kpi_node_funnel n), '[]'),
    'proofs', (SELECT to_jsonb(p) FROM public.kpi_proofs p),
    'quest_funnel', jsonb_build_object(
      'quest_view', COALESCE((SELECT sum(n) FROM ev WHERE event_name IN ('quest_view', 'challenge_viewed')), 0),
      'quest_start', COALESCE((SELECT sum(n) FROM ev WHERE event_name IN ('quest_start', 'challenge_started')), 0),
      'quest_completed', COALESCE((SELECT n FROM ge WHERE event_type = 'quest_completed'), 0),
      'node_completed', COALESCE((SELECT n FROM ge WHERE event_type = 'node_completed'), 0),
      'season_completed', COALESCE((SELECT n FROM ge WHERE event_type = 'season_completed'), 0)
    ),
    'viral_funnel', jsonb_build_object(
      'share_started', COALESCE((SELECT n FROM ev WHERE event_name = 'share_started'), 0),
      'share_completed', COALESCE((SELECT n FROM ev WHERE event_name = 'share_completed'), 0),
      'sharers', COALESCE((SELECT actors FROM ev WHERE event_name = 'share_completed'), 0),
      'invites_sent', COALESCE((SELECT sum(n) FROM ev WHERE event_name IN ('invite_sent', 'invite_clicked')), 0),
      'landing_views', COALESCE((SELECT sum(n) FROM ev WHERE event_name IN ('viral_landing_viewed', 'invite_landing_viewed')), 0),
      'referred_registrations', (SELECT count(*) FROM public.referral_signups WHERE created_at >= v_since),
      'referred_activations', (SELECT count(*) FROM public.referral_signups WHERE activated_at >= v_since),
      'referred_qualified', (SELECT count(*) FROM public.referral_signups WHERE qualified_at >= v_since),
      -- Viral "DEDUPLICATED PRODUCT K" (simplified): unique referred players activated in the
      -- period / activated players who were not themselves activated via referral in the period.
      -- Each referred player has one referral row, so they count once.
      'k_deduplicated', (
        SELECT CASE WHEN count(*) = 0 THEN NULL
               ELSE round((SELECT count(*) FROM public.referral_signups WHERE activated_at >= v_since)::numeric / count(*), 3) END
        FROM public.profiles p
        WHERE EXISTS (SELECT 1 FROM public.challenge_completions cc WHERE cc.user_id = p.id)
          AND NOT EXISTS (SELECT 1 FROM public.referral_signups rs WHERE rs.referred_id = p.id AND rs.activated_at >= v_since)
      )
    ),
    'referrals_by_source', COALESCE((SELECT jsonb_agg(to_jsonb(k)) FROM public.kpi_referrals k), '[]'),
    'feed_health', jsonb_build_object(
      'posts', (SELECT count(*) FROM public.feed_posts WHERE created_at >= v_since AND is_public),
      'impressions', COALESCE((SELECT sum((metadata->>'count')::int) FROM public.analytics_events
                               WHERE created_at >= v_since AND event_name IN ('feed_post_impression', 'feed_impressions')), 0),
      'reactions', (SELECT count(*) FROM public.feed_reactions WHERE created_at >= v_since),
      -- Feed "RECOGNITION COVERAGE": public proofs with a reaction within 24 h
      'public_proofs', (SELECT count(*) FROM public_proofs),
      'proofs_reacted_24h', (SELECT count(*) FROM public_proofs pp WHERE EXISTS (
          SELECT 1 FROM public.feed_reactions fr WHERE fr.post_id = pp.id AND fr.created_at <= pp.created_at + interval '24 hours')),
      -- Feed "ACTION PROPAGATION": quests opened from someone else's proof
      'quest_opens_from_feed', COALESCE((SELECT sum(n) FROM ev WHERE event_name IN ('feed_post_quest_opened', 'try_too_clicked')), 0),
      'feed_end_reached', COALESCE((SELECT n FROM ev WHERE event_name = 'feed_end_reached'), 0),
      'hidden', (SELECT count(*) FROM public.hidden_posts WHERE created_at >= v_since),
      'reports', (SELECT count(*) FROM public.feed_reports WHERE created_at >= v_since),
      'blocks', (SELECT count(*) FROM public.user_blocks WHERE created_at >= v_since)
    )
  ) INTO v_result;

  RETURN v_result;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_kpi_snapshot(int) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_kpi_snapshot(int) TO authenticated;

CREATE OR REPLACE FUNCTION public.admin_review_queue()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NOT public.check_is_admin(auth.uid()) THEN
    RAISE EXCEPTION 'Admins only' USING ERRCODE = '42501';
  END IF;

  RETURN jsonb_build_object(
    'suspicious_completions', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'user_id', cc.user_id, 'display_name', p.display_name, 'challenge_id', cc.challenge_id,
        'completed_at', cc.completed_at, 'reason', cc.suspicious_reason) ORDER BY cc.completed_at DESC)
      FROM public.challenge_completions cc JOIN public.profiles p ON p.id = cc.user_id
      WHERE cc.is_suspicious), '[]'),
    'referral_holds', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'id', h.id, 'referrer', r.display_name, 'referred', d.display_name, 'step', h.ladder_step,
        'reason', h.reason, 'created_at', h.created_at) ORDER BY h.created_at)
      FROM public.referral_reward_holds h
      JOIN public.profiles r ON r.id = h.referrer_id
      JOIN public.profiles d ON d.id = h.referred_id
      WHERE h.status = 'pending'), '[]'),
    -- Referral "RECRUITER QUALITY RATE": many registrations, few activations
    'low_quality_referrers', COALESCE((
      SELECT jsonb_agg(to_jsonb(x) ORDER BY x.registered DESC) FROM (
        SELECT p.display_name, count(*) AS registered,
               count(*) FILTER (WHERE rs.activated_at IS NOT NULL) AS activated,
               round(count(*) FILTER (WHERE rs.activated_at IS NOT NULL)::numeric / count(*), 2) AS activation_rate
        FROM public.referral_signups rs JOIN public.profiles p ON p.id = rs.referrer_id
        GROUP BY p.display_name
        HAVING count(*) >= 5 AND count(*) FILTER (WHERE rs.activated_at IS NOT NULL)::numeric / count(*) < 0.2
      ) x), '[]')
  );
END;
$$;

REVOKE ALL ON FUNCTION public.admin_review_queue() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_review_queue() TO authenticated;

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
  invited_qualified bigint
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
         (SELECT count(*) FROM public.referral_signups rs WHERE rs.referrer_id = p.id AND rs.qualified_at IS NOT NULL)
  FROM public.profiles p
  LEFT JOIN public.player_state ps ON ps.user_id = p.id
  ORDER BY p.created_at;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_players_export() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_players_export() TO authenticated;
