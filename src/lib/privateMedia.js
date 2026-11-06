import { supabase } from '../api/supabaseClient';

const PRIVATE_MARKER = '/storage/v1/object/authenticated/proofs-private/';

// Private proofs are stored as a reference into the owner-only bucket. This resolves one into a
// short-lived signed URL; anything else (public proofs) is already directly usable.
export async function resolveMediaUrl(url) {
  if (!url || !url.includes(PRIVATE_MARKER)) return url;
  const path = url.split(PRIVATE_MARKER)[1];
  const { data, error } = await supabase.storage.from('proofs-private').createSignedUrl(path, 3600);
  if (error) {
    console.warn('Could not sign private proof URL.', error);
    return null;
  }
  return data?.signedUrl || null;
}
