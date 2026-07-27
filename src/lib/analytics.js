import { supabase } from '../api/supabaseClient';

const ANON_ID_KEY = 'analyticsAnonId';

function getAnonId() {
  let id = localStorage.getItem(ANON_ID_KEY);
  if (!id) {
    id = (crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`);
    localStorage.setItem(ANON_ID_KEY, id);
  }
  return id;
}

// Fire-and-forget event tracking. Never throws — a failed analytics write must not break the UX.
export async function track(eventName, metadata = {}) {
  try {
    const { data: { session } } = await supabase.auth.getSession();
    const { error } = await supabase.from('analytics_events').insert([{
      user_id: session?.user?.id || null,
      anon_id: getAnonId(),
      event_name: eventName,
      metadata
    }]);
    if (error) {
      console.warn(`Analytics event "${eventName}" failed to send.`, error);
    }
  } catch (e) {
    console.warn(`Analytics event "${eventName}" failed to send.`, e);
  }
}
