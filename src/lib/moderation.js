import { supabase } from '../api/supabaseClient';

// Asks the server to check the caller's waiting public proofs, then refreshes the feed.
// Never throws: a failed call only means the post waits for the server's retry or an admin.
export async function requestProofModeration(onDone) {
  try {
    const { error } = await supabase.functions.invoke('moderate-proof');
    if (error) console.warn('Proof moderation request failed.', error);
    else if (onDone) onDone();
  } catch (e) {
    console.warn('Proof moderation request failed.', e);
  }
}
