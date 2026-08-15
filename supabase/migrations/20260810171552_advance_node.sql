-- iWAU / Hra Reality — advance_node() RPC: server-validated story progression + real Hra Pass gating
-- Run this once in the Supabase SQL Editor. Safe to re-run (idempotent).
--
-- Two problems fixed:
--
-- 1. `uzel` (story progress) has always been written directly by the client
--    (`profiles.update({ uzel })`), with zero server-side validation of the transition —
--    a deliberately deferred gap from the profiles security lockdown (see
--    supabase_migration_profiles_security.sql), since it carried no monetary/privilege
--    value on its own. It does now (see #2), so it's closed here the same way
--    complete_challenge() closed the XP/keys gap: one SECURITY DEFINER RPC replaces the
--    direct table write.
--
-- 2. story_nodes.requires_pass has been set on nodes 5–8 in supabase_seed.sql since the
--    season was written, and the Dashboard renders a gold lock icon for them — but nothing
--    ever actually checked it. advanceNode() in gameplaySlice.js just moved `uzel` forward
--    regardless, so a non-paying player has always been able to walk straight through
--    "Hra Pass only" content for free. The lock icon was decorative.
--
-- Also updates protect_profile_privileges() (from supabase_migration_profiles_security.sql)
-- to lock `uzel` the same way as xp/keys_balance/pass_holder/is_admin — it was deliberately
-- left client-writable before because it carried no monetary/privilege value on its own;
-- now that it gates paid content, that exemption no longer holds. CREATE OR REPLACE is
-- idempotent, so re-running this against an already-migrated database just updates the
-- live trigger function in place.

CREATE OR REPLACE FUNCTION public.protect_profile_privileges()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  is_caller_admin boolean;
BEGIN
  -- service_role covers edge functions (stripe-webhook). auth.role() IS NULL covers direct
  -- DB sessions with no PostgREST/JWT context at all — the SQL Editor, a psql connection,
  -- migrations run by hand. Every request that actually goes through PostgREST (anon,
  -- authenticated, or service_role) always has a non-null role claim, so this only opens
  -- the gate for sessions that already have full, unrestricted DB access regardless of this
  -- trigger. Without it, even a superuser's `UPDATE profiles SET is_admin = true` run
  -- straight in the SQL Editor gets silently reset back to OLD by the block below.
  IF auth.role() = 'service_role' OR auth.role() IS NULL THEN
    RETURN NEW;
  END IF;

  IF current_setting('app.bypass_profile_guard', true) = 'true' THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'INSERT' THEN
    NEW.is_admin := false;
    NEW.pass_holder := false;
    RETURN NEW;
  END IF;

  SELECT p.is_admin INTO is_caller_admin
  FROM public.profiles p
  WHERE p.id = auth.uid();

  IF COALESCE(is_caller_admin, false) THEN
    RETURN NEW;
  END IF;

  NEW.xp            := OLD.xp;
  NEW.keys_balance  := OLD.keys_balance;
  NEW.avatar_level  := OLD.avatar_level;
  NEW.pass_holder   := OLD.pass_holder;
  NEW.is_admin      := OLD.is_admin;
  NEW.uzel          := OLD.uzel;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.advance_node()
RETURNS TABLE (
  new_uzel int,
  status text  -- 'advanced' | 'pass_required' | 'season_completed'
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_user_id      uuid := auth.uid();
  v_uzel         int;
  v_pass_holder  boolean;
  v_current_node record;
  v_next_node    record;
  v_target_uzel  int;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '28000';
  END IF;

  SELECT p.uzel, p.pass_holder INTO v_uzel, v_pass_holder
  FROM public.profiles p WHERE p.id = v_user_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Profile not found for user %', v_user_id USING ERRCODE = 'P0002';
  END IF;

  SELECT * INTO v_current_node FROM public.story_nodes WHERE node_order = v_uzel LIMIT 1;
  SELECT * INTO v_next_node FROM public.story_nodes WHERE node_order = v_uzel + 1 LIMIT 1;

  -- REFERENTIAL nodes are narrative-only dead ends with no challenge to play — season ends here.
  IF v_next_node.id IS NOT NULL AND v_next_node.type = 'REFERENTIAL' THEN
    RETURN QUERY SELECT v_uzel, 'season_completed'::text;
    RETURN;
  END IF;

  -- No next node defined and the current node is the FINAL boss — season complete, nothing
  -- further to advance into. Stops a resubmitted boss challenge from re-triggering this.
  IF v_next_node.id IS NULL AND v_current_node.type = 'FINAL' THEN
    RETURN QUERY SELECT v_uzel, 'season_completed'::text;
    RETURN;
  END IF;

  v_target_uzel := COALESCE(v_next_node.node_order, LEAST(v_uzel + 1, 9));

  -- The actual paywall gate. requires_pass was previously only a cosmetic lock icon.
  IF COALESCE(v_next_node.requires_pass, false) AND NOT COALESCE(v_pass_holder, false) THEN
    RETURN QUERY SELECT v_uzel, 'pass_required'::text;
    RETURN;
  END IF;

  -- Bypass the protect_profile_privileges() guard trigger for this single, already
  -- server-validated write.
  PERFORM set_config('app.bypass_profile_guard', 'true', true);

  UPDATE public.profiles SET uzel = v_target_uzel WHERE id = v_user_id;

  RETURN QUERY SELECT v_target_uzel, 'advanced'::text;
END;
$$;

REVOKE ALL ON FUNCTION public.advance_node() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.advance_node() TO authenticated;
