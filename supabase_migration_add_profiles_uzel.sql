-- iWAU / Hra Reality — Add missing uzel (story progress) column to profiles
-- Run this once in the Supabase SQL Editor.
--
-- advanceNode() in userStore.js has always tried to sync `profiles.uzel` on every
-- node completion, but the column never existed — the Supabase write silently failed
-- every time (caught by its own try/catch), so node progress could never actually
-- persist to the database even with a working auth session.

ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS uzel INT DEFAULT 0;
