-- iWAU / Hra Reality — Clean up superseded story nodes before re-seeding
-- Run this ONCE in the Supabase SQL Editor, BEFORE (re-)running supabase_seed.sql.
--
-- The story was renumbered from 9 nodes (0-8, with a separate INTRO node at 0) to
-- 9 nodes (1-9, intro folded into node 1's cutscene, node 9 is now a real playable
-- FINAL boss). The old 'n-intro' (node_order 0) and 'n-final' (node_order 8) rows
-- are no longer referenced by supabase_seed.sql and are safe to drop — but leaving
-- 'n-final' in place blocks re-seeding entirely: the new 'n-node-8' row would collide
-- with it on the story_nodes UNIQUE(theme_id, node_order) constraint, and the seed
-- script's ON CONFLICT clause only covers the id column, not that constraint, so the
-- INSERT would error out instead of updating.
--
-- Safe to re-run: DELETE on already-removed rows is a no-op.

DELETE FROM public.story_nodes WHERE id IN ('n-intro', 'n-final');
