-- iWAU / Hra Reality — Real admin RLS enforcement
-- Run this once in the Supabase SQL Editor.
--
-- The "admin write access" policies on themes/story_nodes/challenges/challenge_steps
-- were all `USING (true)` — i.e. any authenticated user (not just admins) could write
-- directly to these tables via the Supabase REST API, completely bypassing the
-- client-side /admin route gate in App.jsx. The client-side check was the only thing
-- stopping a regular player from editing story content, and it's trivially bypassable
-- (call the REST API directly, or spoof localStorage). This makes the database itself
-- enforce is_admin, which is the real security boundary.
--
-- Also adds an admin-override on profiles UPDATE, since the current "users can only
-- update their own profile" policy silently blocked the admin panel's Players tab
-- (editing another player's XP/keys) even for a legitimate admin.

DROP POLICY IF EXISTS "Allow admin write access to themes" ON public.themes;
CREATE POLICY "Allow admin write access to themes" ON public.themes
  FOR ALL USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE profiles.id = auth.uid() AND profiles.is_admin = true)
  );

DROP POLICY IF EXISTS "Allow admin write access to story_nodes" ON public.story_nodes;
CREATE POLICY "Allow admin write access to story_nodes" ON public.story_nodes
  FOR ALL USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE profiles.id = auth.uid() AND profiles.is_admin = true)
  );

DROP POLICY IF EXISTS "Allow admin write access to challenges" ON public.challenges;
CREATE POLICY "Allow admin write access to challenges" ON public.challenges
  FOR ALL USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE profiles.id = auth.uid() AND profiles.is_admin = true)
  );

DROP POLICY IF EXISTS "Allow admin write access to challenge_steps" ON public.challenge_steps;
CREATE POLICY "Allow admin write access to challenge_steps" ON public.challenge_steps
  FOR ALL USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE profiles.id = auth.uid() AND profiles.is_admin = true)
  );

DROP POLICY IF EXISTS "Allow admins to update any profile" ON public.profiles;
CREATE POLICY "Allow admins to update any profile" ON public.profiles
  FOR UPDATE USING (
    EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.is_admin = true)
  );
