-- get_player_count() — real total registered-player count for social-proof copy
-- (e.g. onboarding "X hráčů se přidalo"), which was previously a hardcoded fake
-- number in the UI. Granted to anon since it's shown on the pre-login onboarding
-- screen, before any session exists. SECURITY DEFINER + function (not a view) for
-- the same reason as get_leaderboard(): it needs to read across all of profiles,
-- which is otherwise locked to own-row/admin SELECT only.
CREATE OR REPLACE FUNCTION public.get_player_count()
RETURNS int
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public, pg_temp
AS $$
  SELECT COUNT(*)::int FROM public.profiles;
$$;

REVOKE ALL ON FUNCTION public.get_player_count() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_player_count() TO anon, authenticated;
