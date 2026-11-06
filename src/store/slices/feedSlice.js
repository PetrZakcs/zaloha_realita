import { supabase } from '../../api/supabaseClient';
import { track } from '../../lib/analytics';

// One shape for get_feed() rows and realtime INSERT payloads (the latter lack the joined
// author fields, which simply stay empty until the next fetch).
export function mapFeedRow(p) {
  return {
    id: p.id,
    user_id: p.user_id || null,
    user_name: p.user_name || 'Hráč',
    type: p.type || 'PROOF',
    author_pass_holder: !!p.author_pass_holder,
    author_frame: p.author_frame || null,
    author_avatar_url: p.author_avatar_url || null,
    author_avatar_level: p.author_avatar_level ?? null,
    author_onboarded: p.author_onboarded ?? true,
    is_first_proof: !!p.is_first_proof,
    content: p.content,
    image_url: p.image_url || null,
    media_type: p.media_type || (p.image_url ? 'image' : null),
    challenge_id: p.challenge_id || null,
    challenge_node_order: p.challenge_node_order ?? null,
    reactions_fire: p.reactions_fire || 0,
    reactions_plant: p.reactions_plant ?? p.reactions_lightning ?? 0,
    reactions_lightning: p.reactions_plant ?? p.reactions_lightning ?? 0,
    reactions_eye: p.reactions_eye || 0,
    created_at: p.created_at,
    is_public: p.is_public ?? true,
    // Game Bible MVP1: the viewer's single reaction, Lifetime Level and equipped title
    my_reaction: p.my_reaction || null,
    author_level: p.author_level ?? null,
    author_title: p.author_title || null,
    author_primary_badge: p.author_primary_badge || null,
    author_aura_color: p.author_aura_color || null,
    author_mask: p.author_mask || null,
    reward_xp: p.reward_xp ?? null,
    reward_keys: p.reward_keys ?? null,
    theme_name: p.theme_name || null
  };
}

const COUNTER = { fire: 'reactions_fire', plant: 'reactions_plant', eye: 'reactions_eye' };

// Feed Engine "MAX 1 REACTION TYPE / USER / POST": the same reaction again is a no-op, a
// different one switches. Mirrors increment_feed_reaction() for the optimistic update.
export function applyReaction(item, type) {
  if (!COUNTER[type] || item.my_reaction === type) return item;
  const next = { ...item, my_reaction: type };
  if (item.my_reaction && COUNTER[item.my_reaction]) {
    next[COUNTER[item.my_reaction]] = Math.max(0, (item[COUNTER[item.my_reaction]] || 0) - 1);
  }
  next[COUNTER[type]] = (item[COUNTER[type]] || 0) + 1;
  next.reactions_lightning = next.reactions_plant;
  return next;
}

export const createFeedSlice = (set, get) => {
  let feedChannel = null;

  const setupFeedRealtime = () => {
    if (feedChannel) return;
    try {
      feedChannel = supabase
        .channel('public:feed_posts')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'feed_posts' }, (payload) => {
          // Admins can also receive non-public rows (their RLS policy sees everything) —
          // the feed only ever shows public posts.
          if (payload.eventType === 'INSERT') {
            if (!payload.new.is_public) return;
            if (get().blockedUserIds.includes(payload.new.user_id)) return;
            const newItem = mapFeedRow(payload.new);
            set(state => ({ feed: [newItem, ...state.feed.filter(x => x.id !== newItem.id)] }));
          } else if (payload.eventType === 'UPDATE') {
            // Hidden by reports / moderation → drop it from the visible feed.
            if (payload.new.is_public === false) {
              set(state => ({ feed: state.feed.filter(item => item.id !== payload.new.id) }));
              return;
            }
            set(state => ({
              feed: state.feed.map(item => item.id === payload.new.id ? {
                ...item,
                reactions_fire: payload.new.reactions_fire || 0,
                reactions_plant: payload.new.reactions_plant ?? payload.new.reactions_lightning ?? 0,
                reactions_lightning: payload.new.reactions_plant ?? payload.new.reactions_lightning ?? 0,
                reactions_eye: payload.new.reactions_eye || 0
              } : item)
            }));
          }
        })
        .subscribe();
    } catch (e) {
      console.warn('Realtime subscription failed, using local offline state.', e);
    }
  };

  setupFeedRealtime();

  return {
    // Real data only — an empty world renders an empty state, never demo players.
    feed: [],
    leaderboard: [],
    weeklyTopDoers: null,
    // null = not loaded yet. Real social-proof copy (e.g. onboarding) must
    // render nothing rather than a fake/zero number while this is null.
    playerCount: null,

    fetchPlayerCount: async () => {
      try {
        const { data, error } = await supabase.rpc('get_player_count');
        if (!error && typeof data === 'number') {
          set({ playerCount: data });
        }
      } catch (e) {
        console.warn('Failed to fetch real player count from Supabase.', e);
      }
    },

    // Ranked server-side per spec-17 §12 (similarity / recency / engagement / randomness +
    // boosts for first proofs, status moments and Founder Pass) — get_feed().
    fetchFeedPosts: async () => {
      try {
        const { data, error } = await supabase.rpc('get_feed', { p_limit: 50 });
        if (!error && data) {
          set({ feed: data.map(mapFeedRow) });
        }
      } catch (e) {
        console.warn('Failed to fetch real feed posts from Supabase.', e);
      }
    },

    fetchLeaderboard: async () => {
      try {
        const { data, error } = await supabase.rpc('get_leaderboard', { p_limit: 20 });

        if (!error && data) {
          const mappedLeaderboard = data.map((p, idx) => ({
            id: p.id,
            name: p.display_name || `Hráč_${idx + 1}`,
            rarity: p.xp > 300 ? 'Legendary' : (p.xp > 100 ? 'Rare' : 'Common'),
            xp: p.xp || 0,
            uzel: p.uzel || 0,
            badges_count: p.avatar_level || 1
          }));
          set({ leaderboard: mappedLeaderboard });
        }
      } catch (e) {
        console.warn('Failed to fetch real leaderboard from Supabase.', e);
      }
    },

    // MVP1 spec-12 §5.3 "Top Doers this week" — 5 players by XP earned since Monday.
    fetchWeeklyTopDoers: async () => {
      try {
        const { data, error } = await supabase.rpc('get_weekly_top_doers', { p_limit: 5 });
        if (!error && data) {
          set({
            weeklyTopDoers: data.map((p, idx) => ({
              id: p.id,
              name: p.display_name || `Hráč_${idx + 1}`,
              xp: p.week_xp || 0,
              completions: p.week_completions || 0,
              badges_count: p.avatar_level || 1,
              passHolder: !!p.pass_holder
            }))
          });
        }
      } catch (e) {
        console.warn('Failed to fetch weekly top doers.', e);
      }
    },

    // Report → server records it; three distinct reporters hide the post pending admin review.
    reportPost: async (postId, reason) => {
      track('post_reported', { post_id: postId, reason });
      const { data, error } = await supabase.rpc('report_post', { p_post_id: postId, p_reason: reason });
      if (error) {
        console.warn('report_post failed.', error);
        return { success: false };
      }
      if (data === true) {
        set(state => ({ feed: state.feed.filter(item => item.id !== postId) }));
      }
      return { success: true, hidden: data === true };
    },

    // Feed "USER CONTROLS": hide a post / block a player (server-side, see 20261020120000).
    blockedUserIds: [],
    // Realtime INSERTs bypass get_feed()'s block filter, so the client has to know the list.
    fetchBlockedUsers: async () => {
      const uid = get().user?.id;
      if (!uid) return;
      const { data, error } = await supabase.from('user_blocks').select('blocked_id').eq('blocker_id', uid);
      if (!error) set({ blockedUserIds: (data || []).map(b => b.blocked_id) });
    },
    hidePost: async (postId) => {
      set(state => ({ feed: state.feed.filter(item => item.id !== postId) }));
      track('feed_post_hidden', { post_id: postId });
      const { error } = await supabase.rpc('hide_post', { p_post_id: postId });
      if (error) console.warn('hide_post failed.', error);
    },
    blockUser: async (userId) => {
      if (!userId) return;
      set(state => ({
        feed: state.feed.filter(item => item.user_id !== userId),
        blockedUserIds: [...new Set([...state.blockedUserIds, userId])]
      }));
      track('player_blocked', {});
      const { error } = await supabase.rpc('set_user_block', { p_user_id: userId, p_block: true });
      if (error) console.warn('set_user_block failed.', error);
    },

    addReaction: async (postId, type) => {
      const normalizedType = (type === 'lightning' || type === 'plant') ? 'plant' : type;
      const current = get().feed.find(item => item.id === postId);
      if (current?.my_reaction === normalizedType) return;
      // spec-11 "FEED & SOCIAL" KPI: reaction count / % hráčů co reagují
      track('reaction_added', { post_id: postId, reaction_type: normalizedType, switched_from: current?.my_reaction || null });

      // Optimistic state update
      set(state => ({
        feed: state.feed.map(item => (item.id === postId ? applyReaction(item, normalizedType) : item))
      }));

      try {
        // Atomic server increment via SECURITY DEFINER RPC
        const { data, error } = await supabase.rpc('increment_feed_reaction', {
          p_post_id: postId,
          p_type: normalizedType
        });
        if (error) throw error;

        if (data && data.length > 0) {
          const row = data[0];
          set(state => ({
            feed: state.feed.map(item => item.id === postId ? {
              ...item,
              reactions_fire: row.reactions_fire,
              reactions_plant: row.reactions_plant,
              reactions_lightning: row.reactions_plant,
              reactions_eye: row.reactions_eye
            } : item)
          }));
        }
      } catch (e) {
        console.warn('Failed to register atomic reaction via RPC.', e);
      }
    }
  };
};
