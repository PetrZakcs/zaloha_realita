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

// Game Bible event taxonomy (Retention "ANALYTICS EVENTS", Viral "ANALYTICS EVENT TAXONOMY",
// Feed "FEED ANALYTICS EVENTS", Identity "ANALYTICS EVENT MODEL"). Older call sites keep their
// names; they're stored under the Bible name with the old one in metadata.legacy_event, so
// KPIs use one vocabulary. KPI views still accept both for rows written before the switch.
export const EVENT_ALIASES = {
  app_opened: 'app_open',
  challenge_viewed: 'quest_view',
  challenge_started: 'quest_start',
  proof_submitted: 'proof_submit',
  try_too_clicked: 'feed_post_quest_opened',
  reaction_added: 'feed_post_reacted',
  post_reported: 'feed_post_reported',
  feed_impressions: 'feed_post_impression',
  invite_landing_viewed: 'viral_landing_viewed',
  referral_registration: 'viral_registration_completed',
  invite_clicked: 'invite_sent',
  next_move_clicked: 'next_move_opened',
  welcome_back_shown: 'comeback_view',
  identity_slot_set: 'identity_item_equipped',
  frame_equipped: 'identity_item_equipped',
  mystery_box_opened: 'reward_claim',
  share_reward_granted: 'viral_reward_granted',
  profile_viewed: 'identity_profile_viewed',
};

export function canonicalEvent(eventName, metadata = {}) {
  const canonical = EVENT_ALIASES[eventName];
  return canonical
    ? { name: canonical, metadata: { ...metadata, legacy_event: eventName } }
    : { name: eventName, metadata };
}

// Fire-and-forget event tracking. Never throws — a failed analytics write must not break the UX.
export async function track(rawName, rawMetadata = {}) {
  const { name: eventName, metadata } = canonicalEvent(rawName, rawMetadata);
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

// At most a few per page load: a render loop must not flood the events table.
let reportedErrors = 0;
export function reportClientError(error, details = {}) {
  console.error(error);
  if (reportedErrors >= 5) return;
  reportedErrors += 1;
  track('client_error', { message: String(error?.message || error).slice(0, 300), path: window.location.pathname, ...details });
}
