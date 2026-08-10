-- iWAU / Hra Reality — Close profiles privilege-escalation, XP-farming, and PII-leak holes
-- Run this once in the Supabase SQL Editor. Safe to re-run (idempotent).
--
-- Three problems fixed together here, because they all touch public.profiles and are
-- meant to be applied as one coherent "lock down profiles" change:
--
-- 1. "Allow authenticated users to update their own profile" only has a USING clause.
--    Postgres reuses USING as the implicit WITH CHECK when none is given, but that only
--    constrains the ROW (auth.uid() = id, which never changes) — it says nothing about
--    which COLUMNS may change. Any logged-in user (including anonymous-auth players) can
--    currently open devtools and run:
--      supabase.from('profiles').update({ is_admin: true, xp: 999999, pass_holder: true })
--        .eq('id', myOwnId)
--    and it succeeds — full privilege escalation to admin, plus free XP/keys/Hra Pass.
--    Column-level GRANT/REVOKE can't fix this: Supabase/PostgREST authenticates every
--    logged-in user, including real admins, as the SAME Postgres role `authenticated` —
--    only row-aware logic (a trigger, which sees both OLD and NEW) can special-case
--    "is_admin = true for THIS caller", which the admin panel legitimately needs (it
--    edits other players' xp/keys_balance/pass_holder/is_admin from AdminContentManager).
--
-- 2. XP/keys have been computed client-side and written to profiles directly, before the
--    only anti-duplicate guard (challenge_completions' UNIQUE(user_id, challenge_id))
--    ever runs — so resubmitting the same proof (e.g. calling submitProof() again from
--    the console) re-grants the reward every time; only the ledger insert itself fails.
--    Fixed by moving the whole reward grant into one atomic, server-validated RPC.
--
-- 3. "Allow public read access to profiles" is USING (true) — anyone holding the public
--    anon key (i.e. anyone) can read every user's email, discord_user_id, and is_admin
--    flag. There was also no admin-specific SELECT policy — admins only ever got full
--    read via this same blanket-public policy, so removing it needs an explicit
--    replacement or the admin Players tab breaks.
--
-- Also fixes a latent bug found while designing this: there has never been an INSERT
-- policy on profiles. With RLS enabled and zero matching policies, Postgres denies by
-- default, so handleOAuthSession()'s profile INSERT for first-time OAuth signups has
-- been silently failing (swallowed by its own try/catch) this whole time.

-- ================================================================
-- SECTION 1: profiles column-privilege trigger + INSERT policy
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
  -- service_role (edge functions using the service key, e.g. stripe-webhook) always
  -- bypasses this guard; it already fully bypasses RLS too.
  IF auth.role() = 'service_role' THEN
    RETURN NEW;
  END IF;

  -- Trusted server-side RPCs (currently: complete_challenge) set this transaction-local
  -- flag right before their own validated, additive profile UPDATE.
  IF current_setting('app.bypass_profile_guard', true) = 'true' THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'INSERT' THEN
    -- Nobody can self-register as an admin or a paid Hra Pass holder. xp/keys_balance/uzel
    -- are left as client-provided on INSERT only — that's the existing "migrate local
    -- anonymous progress into a new account" feature (handleOAuthSession), a one-time,
    -- low-stakes trust boundary at signup, not a repeatable exploit.
    NEW.is_admin := false;
    NEW.pass_holder := false;
    RETURN NEW;
  END IF;

  -- TG_OP = 'UPDATE' from here.
  SELECT p.is_admin INTO is_caller_admin
  FROM public.profiles p
  WHERE p.id = auth.uid();

  IF COALESCE(is_caller_admin, false) THEN
    RETURN NEW; -- legitimate admin panel edit of any profile, incl. protected columns
  END IF;

  -- Regular user editing their own row (RLS already restricts which row this can be):
  -- protected columns can never move via a direct table UPDATE. They must go through
  -- complete_challenge() (xp/keys_balance/avatar_level) or the stripe-webhook edge
  -- function (pass_holder) — both exempted above.
  NEW.xp            := OLD.xp;
  NEW.keys_balance  := OLD.keys_balance;
  NEW.avatar_level  := OLD.avatar_level;
  NEW.pass_holder   := OLD.pass_holder;
  NEW.is_admin      := OLD.is_admin;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_protect_profile_privileges ON public.profiles;
CREATE TRIGGER trg_protect_profile_privileges
  BEFORE INSERT OR UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.protect_profile_privileges();

DROP POLICY IF EXISTS "Allow users to insert their own profile" ON public.profiles;
CREATE POLICY "Allow users to insert their own profile" ON public.profiles
  FOR INSERT WITH CHECK (auth.uid() = id);

-- WITH CHECK made explicit for clarity — functionally already implied by USING, but the
-- trigger above is what actually enforces column-level protection.
DROP POLICY IF EXISTS "Allow authenticated users to update their own profile" ON public.profiles;
CREATE POLICY "Allow authenticated users to update their own profile" ON public.profiles
  FOR UPDATE USING (auth.uid() = id) WITH CHECK (auth.uid() = id);

DROP POLICY IF EXISTS "Allow admins to update any profile" ON public.profiles;
CREATE POLICY "Allow admins to update any profile" ON public.profiles
  FOR UPDATE USING (
    EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.is_admin = true)
  ) WITH CHECK (
    EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.is_admin = true)
  );

-- ================================================================
-- SECTION 2: complete_challenge() RPC — atomic, server-validated rewards
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
  v_reward_xp      int;
  v_reward_keys    int;
  v_bonus_keys     int := 0;
  v_current_badges int;
  v_new_badges     int;
  v_new_xp         int;
  v_new_keys       int;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '28000';
  END IF;

  -- Server-side reward lookup; the client's reward numbers are never trusted.
  SELECT c.reward_xp, c.reward_keys INTO v_reward_xp, v_reward_keys
  FROM public.challenges c
  WHERE c.id = p_challenge_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Unknown challenge_id: %', p_challenge_id USING ERRCODE = 'P0002';
  END IF;

  IF p_is_public THEN
    v_bonus_keys := 1;
  END IF;

  -- Anti-duplicate-farming guard runs FIRST, in the same transaction as the reward
  -- grant. If already completed, the UNIQUE(user_id, challenge_id) constraint raises
  -- here — nothing below executes, nothing is committed.
  BEGIN
    INSERT INTO public.challenge_completions (user_id, challenge_id, completed_at)
    VALUES (v_user_id, p_challenge_id, timezone('utc', now()));
  EXCEPTION WHEN unique_violation THEN
    RETURN QUERY
      SELECT p.xp, p.keys_balance, p.avatar_level, true
      FROM public.profiles p WHERE p.id = v_user_id;
    RETURN;
  END;

  SELECT display_name, avatar_level INTO v_user_name, v_current_badges
  FROM public.profiles WHERE id = v_user_id;

  v_new_badges := CASE WHEN v_current_badges < 5 THEN v_current_badges + 1 ELSE v_current_badges END;

  -- Bypass the protect_profile_privileges() guard trigger for this single, already
  -- server-validated, additive write.
  PERFORM set_config('app.bypass_profile_guard', 'true', true);

  UPDATE public.profiles
  SET xp = xp + v_reward_xp,
      keys_balance = keys_balance + v_reward_keys + v_bonus_keys,
      avatar_level = v_new_badges
  WHERE id = v_user_id
  RETURNING xp, keys_balance, avatar_level INTO v_new_xp, v_new_keys, v_new_badges;

  INSERT INTO public.key_transactions (user_id, amount, source, balance_after)
  VALUES (
    v_user_id,
    v_reward_keys + v_bonus_keys,
    CASE WHEN p_is_public THEN 'PROOF_PUBLIC' ELSE 'CHALLENGE_COMPLETE' END,
    v_new_keys
  );

  INSERT INTO public.feed_posts (user_id, user_name, content, image_url, is_public)
  VALUES (
    v_user_id, v_user_name,
    COALESCE(p_proof_text, 'Prokázal jsem, že nejsem NPC! 🟢'),
    p_image_url, p_is_public
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
-- SECTION 3: profiles SELECT lockdown + profiles_public leaderboard view
-- ================================================================

DROP POLICY IF EXISTS "Allow public read access to profiles" ON public.profiles;

DROP POLICY IF EXISTS "Allow users to read their own profile" ON public.profiles;
CREATE POLICY "Allow users to read their own profile" ON public.profiles
  FOR SELECT USING (auth.uid() = id);

DROP POLICY IF EXISTS "Allow admins to read all profiles" ON public.profiles;
CREATE POLICY "Allow admins to read all profiles" ON public.profiles
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.is_admin = true)
  );

-- Public-safe subset for leaderboard/other-user display. Deliberately created without
-- security_invoker, so it runs with the view owner's privileges (the table owner bypasses
-- its own tables' RLS) and can show ALL users' rows, not just the caller's own — this is
-- the standard Supabase pattern for a public leaderboard off an RLS-protected table.
-- Supabase's linter will flag this as a "Security Definer View" warning; that's an
-- expected false positive here since the exposed column set is small and intentional.
CREATE OR REPLACE VIEW public.profiles_public AS
SELECT id, display_name, xp, uzel, avatar_level, pass_holder, current_streak
FROM public.profiles;

GRANT SELECT ON public.profiles_public TO anon, authenticated;
