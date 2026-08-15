-- iWAU / Hra Reality — Rename reserved-word "order" columns
-- Run this once in the Supabase SQL Editor, after supabase_schema.sql / supabase_seed.sql.
--
-- PostgREST reserves "order" as a top-level query parameter (it means ORDER BY), so a column
-- literally named "order" can never be filtered via .eq('order', ...) from the client — every
-- such request gets misparsed as a sort directive instead. Renaming is the only real fix.
-- Safe to re-run: no-ops if already renamed.

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='themes' AND column_name='order') THEN
    ALTER TABLE public.themes RENAME COLUMN "order" TO theme_order;
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='story_nodes' AND column_name='order') THEN
    ALTER TABLE public.story_nodes RENAME COLUMN "order" TO node_order;
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='challenge_steps' AND column_name='order') THEN
    ALTER TABLE public.challenge_steps RENAME COLUMN "order" TO step_order;
  END IF;
END $$;
