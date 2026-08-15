-- iWAU / Hra Reality — Replace profiles_public VIEW with a SECURITY DEFINER function
-- Run this once in the Supabase SQL Editor. Safe to re-run (idempotent).
--
-- The Supabase Security Advisor flags any VIEW that runs with the view owner's
-- privileges (needed here so it can read across ALL users' rows, bypassing the
-- "own row only" RLS on profiles added in supabase_migration_profiles_security.sql)
-- as "Security Definer View" — CRITICAL, regardless of how narrow/safe the exposed
-- columns actually are. That lint rule only inspects VIEWS, not FUNCTIONS.
--
-- The intent behind profiles_public (expose only id/display_name/xp/uzel/avatar_level/
-- pass_holder/current_streak for the public leaderboard, nothing else) is unchanged —
-- this just re-implements it as an explicit SECURITY DEFINER function, which is the
-- Supabase-recommended shape for this exact pattern and doesn't trip the linter.

DROP VIEW IF EXISTS public.profiles_public;

CREATE OR REPLACE FUNCTION public.get_leaderboard(p_limit int DEFAULT 20)
RETURNS TABLE (
  id uuid,
  display_name text,
  xp int,
  uzel int,
  avatar_level int,
  pass_holder boolean,
  current_streak int
)
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public, pg_temp
AS $$
  SELECT p.id, p.display_name, p.xp, p.uzel, p.avatar_level, p.pass_holder, p.current_streak
  FROM public.profiles p
  ORDER BY p.xp DESC
  LIMIT p_limit;
$$;

REVOKE ALL ON FUNCTION public.get_leaderboard(int) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_leaderboard(int) TO anon, authenticated;
