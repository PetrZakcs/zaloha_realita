-- iWAU / Hra Reality — One-time cleanup of legacy scaffolding tables
-- Run this ONCE in the Supabase SQL Editor, BEFORE (re-)running supabase_schema.sql.
--
-- These 5 tables (users, feed, challenges, submissions, user_rewards) were an earlier,
-- unused schema attempt that conflicts by name with the tables the app actually runs on
-- (profiles, feed_posts, challenges w/ story_node_id, ...). Confirmed disposable — only
-- contained a single test row. CASCADE drops their foreign-key dependents together.

DROP TABLE IF EXISTS public.submissions CASCADE;
DROP TABLE IF EXISTS public.user_rewards CASCADE;
DROP TABLE IF EXISTS public.feed CASCADE;
DROP TABLE IF EXISTS public.challenges CASCADE;
DROP TABLE IF EXISTS public.users CASCADE;
