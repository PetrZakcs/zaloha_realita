-- iWAU / Hra Reality — Supabase PostgreSQL Database Setup
-- Run this script in the Supabase SQL Editor to provision all tables, indexes, and RLS policies.
-- Safe to re-run: every statement is idempotent (IF NOT EXISTS / DROP POLICY IF EXISTS first).

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 1. Profiles Table (Corresponds to User model in Prisma)
CREATE TABLE IF NOT EXISTS public.profiles (
  id UUID REFERENCES auth.users NOT NULL PRIMARY KEY,
  email TEXT UNIQUE,
  display_name TEXT UNIQUE NOT NULL,
  avatar_level INT DEFAULT 0,
  xp INT DEFAULT 240,
  uzel INT DEFAULT 0,
  keys_balance INT DEFAULT 7,
  current_streak INT DEFAULT 5,
  longest_streak INT DEFAULT 5,
  pledge TEXT DEFAULT 'Jsem člověk, co přestal čekat a začal jednat.',
  pass_holder BOOLEAN DEFAULT FALSE,
  referral_code TEXT UNIQUE,
  discord_user_id TEXT UNIQUE, -- Used for pairing with Airtable
  is_admin BOOLEAN DEFAULT FALSE, -- Access control flag for Admin CRUD Panel
  last_active_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);

-- Enable RLS on profiles
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow public read access to profiles" ON public.profiles;
CREATE POLICY "Allow public read access to profiles" ON public.profiles
  FOR SELECT USING (true);

DROP POLICY IF EXISTS "Allow authenticated users to update their own profile" ON public.profiles;
CREATE POLICY "Allow authenticated users to update their own profile" ON public.profiles
  FOR UPDATE USING (auth.uid() = id);

DROP POLICY IF EXISTS "Allow admins to update any profile" ON public.profiles;
CREATE POLICY "Allow admins to update any profile" ON public.profiles
  FOR UPDATE USING (
    EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.is_admin = true)
  );

-- 2. Themes Table
CREATE TABLE IF NOT EXISTS public.themes (
  id TEXT PRIMARY KEY,
  slug TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  theme_order INT DEFAULT 0,
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);

ALTER TABLE public.themes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow public read access to themes" ON public.themes;
CREATE POLICY "Allow public read access to themes" ON public.themes
  FOR SELECT USING (true);

DROP POLICY IF EXISTS "Allow admin write access to themes" ON public.themes;
CREATE POLICY "Allow admin write access to themes" ON public.themes
  FOR ALL USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE profiles.id = auth.uid() AND profiles.is_admin = true)
  );

-- 3. Story Nodes Table
CREATE TABLE IF NOT EXISTS public.story_nodes (
  id TEXT PRIMARY KEY,
  theme_id TEXT REFERENCES public.themes(id) ON DELETE CASCADE NOT NULL,
  node_order INT NOT NULL,
  type TEXT NOT NULL, -- 'INTRO', 'CHALLENGE', 'PAYWALL', 'REFERENTIAL', 'FINAL'
  title TEXT NOT NULL,
  cutscene_text TEXT NOT NULL,
  requires_pass BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL,
  UNIQUE(theme_id, node_order)
);

ALTER TABLE public.story_nodes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow public read access to story_nodes" ON public.story_nodes;
CREATE POLICY "Allow public read access to story_nodes" ON public.story_nodes
  FOR SELECT USING (true);

DROP POLICY IF EXISTS "Allow admin write access to story_nodes" ON public.story_nodes;
CREATE POLICY "Allow admin write access to story_nodes" ON public.story_nodes
  FOR ALL USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE profiles.id = auth.uid() AND profiles.is_admin = true)
  );

-- 4. Challenges Table
CREATE TABLE IF NOT EXISTS public.challenges (
  id TEXT PRIMARY KEY,
  story_node_id TEXT REFERENCES public.story_nodes(id) ON DELETE CASCADE NOT NULL,
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  why_text TEXT,
  proof_type TEXT NOT NULL, -- 'PHOTO', 'TEXT'
  timebox_seconds INT,
  reward_keys INT DEFAULT 1,
  reward_xp INT DEFAULT 10,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);

ALTER TABLE public.challenges ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow public read access to challenges" ON public.challenges;
CREATE POLICY "Allow public read access to challenges" ON public.challenges
  FOR SELECT USING (true);

DROP POLICY IF EXISTS "Allow admin write access to challenges" ON public.challenges;
CREATE POLICY "Allow admin write access to challenges" ON public.challenges
  FOR ALL USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE profiles.id = auth.uid() AND profiles.is_admin = true)
  );

-- 5. Challenge Steps Table
CREATE TABLE IF NOT EXISTS public.challenge_steps (
  id TEXT PRIMARY KEY,
  challenge_id TEXT REFERENCES public.challenges(id) ON DELETE CASCADE NOT NULL,
  step_order INT NOT NULL,
  text TEXT NOT NULL,
  UNIQUE(challenge_id, step_order)
);

ALTER TABLE public.challenge_steps ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow public read access to challenge_steps" ON public.challenge_steps;
CREATE POLICY "Allow public read access to challenge_steps" ON public.challenge_steps
  FOR SELECT USING (true);

DROP POLICY IF EXISTS "Allow admin write access to challenge_steps" ON public.challenge_steps;
CREATE POLICY "Allow admin write access to challenge_steps" ON public.challenge_steps
  FOR ALL USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE profiles.id = auth.uid() AND profiles.is_admin = true)
  );

-- 6. User Badges Table
CREATE TABLE IF NOT EXISTS public.user_badges (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
  badge_key TEXT NOT NULL,
  earned_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL,
  UNIQUE(user_id, badge_key)
);

ALTER TABLE public.user_badges ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow public read access to badges" ON public.user_badges;
CREATE POLICY "Allow public read access to badges" ON public.user_badges
  FOR SELECT USING (true);

DROP POLICY IF EXISTS "Allow users to insert their own earned badges" ON public.user_badges;
CREATE POLICY "Allow users to insert their own earned badges" ON public.user_badges
  FOR INSERT WITH CHECK (auth.uid() = user_id);

-- 7. User Cards Table (Airtable Sync Mirror Cache)
CREATE TABLE IF NOT EXISTS public.user_cards (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
  card_key TEXT NOT NULL,
  quantity INT DEFAULT 1,
  sync_status TEXT DEFAULT 'SYNCED', -- 'PENDING', 'SYNCED', 'FAILED'
  airtable_record_id TEXT,
  obtained_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL,
  UNIQUE(user_id, card_key)
);

ALTER TABLE public.user_cards ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow public read access to cards" ON public.user_cards;
CREATE POLICY "Allow public read access to cards" ON public.user_cards
  FOR SELECT USING (true);

DROP POLICY IF EXISTS "Allow users to insert/update their own cards" ON public.user_cards;
CREATE POLICY "Allow users to insert/update their own cards" ON public.user_cards
  FOR ALL USING (auth.uid() = user_id);

-- 8. Key Transactions Table (Ledger for anti-cheat and verification)
CREATE TABLE IF NOT EXISTS public.key_transactions (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
  amount INT NOT NULL,
  source TEXT NOT NULL, -- 'ONBOARDING', 'CHALLENGE_COMPLETE', 'STREAK', 'REFERRAL', 'ADMIN_GRANT'
  balance_after INT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);

ALTER TABLE public.key_transactions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow users to read their own key transactions" ON public.key_transactions;
CREATE POLICY "Allow users to read their own key transactions" ON public.key_transactions
  FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Allow users to insert their key transactions" ON public.key_transactions;
CREATE POLICY "Allow users to insert their key transactions" ON public.key_transactions
  FOR INSERT WITH CHECK (auth.uid() = user_id);

-- 9. Challenge Completions Table (Security gating for Node milestones)
CREATE TABLE IF NOT EXISTS public.challenge_completions (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
  challenge_id TEXT NOT NULL,
  started_at TIMESTAMP WITH TIME ZONE,
  completed_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL,
  is_suspicious BOOLEAN DEFAULT FALSE,
  suspicious_reason TEXT,
  UNIQUE(user_id, challenge_id)
);

ALTER TABLE public.challenge_completions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow public read access to challenge completions" ON public.challenge_completions;
CREATE POLICY "Allow public read access to challenge completions" ON public.challenge_completions
  FOR SELECT USING (true);

DROP POLICY IF EXISTS "Allow users to record challenge completions" ON public.challenge_completions;
CREATE POLICY "Allow users to record challenge completions" ON public.challenge_completions
  FOR INSERT WITH CHECK (auth.uid() = user_id);

-- 10. Feed Posts Table (Social feed stream)
CREATE TABLE IF NOT EXISTS public.feed_posts (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
  user_name TEXT NOT NULL,
  type TEXT DEFAULT 'PROOF', -- 'PROOF', 'STATUS', 'COLLECTION', 'FEATURED'
  content TEXT NOT NULL,
  reactions_fire INT DEFAULT 0,
  reactions_lightning INT DEFAULT 0,
  reactions_eye INT DEFAULT 0,
  is_public BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);

ALTER TABLE public.feed_posts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow public read access to public feed posts" ON public.feed_posts;
CREATE POLICY "Allow public read access to public feed posts" ON public.feed_posts
  FOR SELECT USING (is_public = TRUE);

DROP POLICY IF EXISTS "Allow users to create their own feed posts" ON public.feed_posts;
CREATE POLICY "Allow users to create their own feed posts" ON public.feed_posts
  FOR INSERT WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Allow users to update/react to feed posts" ON public.feed_posts;
CREATE POLICY "Allow users to update/react to feed posts" ON public.feed_posts
  FOR UPDATE USING (TRUE); -- Allows incrementing reaction counters for everyone

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_profiles_referral ON public.profiles(referral_code);
CREATE INDEX IF NOT EXISTS idx_feed_posts_created ON public.feed_posts(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_user_cards_sync ON public.user_cards(sync_status);
CREATE INDEX IF NOT EXISTS idx_key_transactions_user ON public.key_transactions(user_id);
