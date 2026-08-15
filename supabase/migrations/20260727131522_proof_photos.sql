-- iWAU / Hra Reality — Proof photo upload support
-- Run this once in the Supabase SQL Editor (Project > SQL Editor > New query).

-- 1. Add image_url column to feed_posts to store the uploaded proof photo
ALTER TABLE public.feed_posts ADD COLUMN IF NOT EXISTS image_url TEXT;

-- 2. Create a public storage bucket for proof photos
INSERT INTO storage.buckets (id, name, public)
VALUES ('proofs', 'proofs', true)
ON CONFLICT (id) DO NOTHING;

-- 3. Allow any authenticated (incl. anonymous-sign-in) user to upload proof photos
DROP POLICY IF EXISTS "Allow authenticated uploads to proofs bucket" ON storage.objects;
CREATE POLICY "Allow authenticated uploads to proofs bucket"
  ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'proofs' AND auth.role() = 'authenticated');

-- 4. Allow public read access to proof photos (bucket is public, but explicit policy keeps intent clear)
DROP POLICY IF EXISTS "Allow public read access to proofs bucket" ON storage.objects;
CREATE POLICY "Allow public read access to proofs bucket"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'proofs');
