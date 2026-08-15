-- iWAU / Hra Reality — Analytics events table
-- Run this once in the Supabase SQL Editor (Project > SQL Editor > New query).
-- Captures activation / retention / completion / virality / monetization events per MVP1 PRD §7.

CREATE TABLE IF NOT EXISTS public.analytics_events (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  anon_id TEXT NOT NULL,
  event_name TEXT NOT NULL,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);

ALTER TABLE public.analytics_events ENABLE ROW LEVEL SECURITY;

-- Events can be written by anyone (incl. pre-login/anonymous visitors), but only read back
-- via the SQL Editor / service role — never exposed to the client.
DROP POLICY IF EXISTS "Allow public insert to analytics_events" ON public.analytics_events;
CREATE POLICY "Allow public insert to analytics_events" ON public.analytics_events
  FOR INSERT WITH CHECK (true);

CREATE INDEX IF NOT EXISTS idx_analytics_events_name_created ON public.analytics_events(event_name, created_at);
CREATE INDEX IF NOT EXISTS idx_analytics_events_anon ON public.analytics_events(anon_id);
CREATE INDEX IF NOT EXISTS idx_analytics_events_user ON public.analytics_events(user_id);
