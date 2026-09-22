import { supabase } from '../../api/supabaseClient';
import { track } from '../../lib/analytics';

export const DEFAULT_FEED = [
  {
    id: 'f1',
    user_name: 'NeonLiška',
    rarity: 'Rare',
    type: 'PROOF',
    content: 'Sebrala 3 kelímky 🟢',
    reactions_fire: 34,
    reactions_plant: 12,
    reactions_lightning: 12,
    reactions_eye: 84,
    created_at: new Date(Date.now() - 600000).toISOString(),
    is_public: true
  },
  {
    id: 'f2',
    user_name: 'RychlýDoer',
    rarity: 'Rare',
    type: 'PROOF',
    content: 'Napsal kámošce po půl roce',
    reactions_fire: 21,
    reactions_plant: 5,
    reactions_lightning: 5,
    reactions_eye: 46,
    created_at: new Date(Date.now() - 3600000).toISOString(),
    is_public: true
  },
  {
    id: 'f3',
    user_name: 'Kometa',
    rarity: 'Legendary',
    // Demo variety only — real STATUS posts come from server-side triggers
    // (submit_season_reflection(), handle_referral_signup(), stripe-webhook).
    type: 'STATUS',
    content: 'Dokončil jsem celou Season 0 a sejmul bossa! 👑',
    reactions_fire: 120,
    reactions_plant: 44,
    reactions_lightning: 44,
    reactions_eye: 382,
    created_at: new Date(Date.now() - 7200000).toISOString(),
    is_public: true
  }
];

export const DEFAULT_LEADERBOARD = [
  { id: 'u1', name: 'Kometa', rarity: 'Legendary', xp: 412, uzel: 9, badges_count: 10 },
  { id: 'u2', name: 'Vlk_42', rarity: 'Rare', xp: 388, uzel: 8, badges_count: 8 },
  { id: 'u3', name: 'NeonLiška', rarity: 'Rare', xp: 310, uzel: 6, badges_count: 6 },
  { id: 'u4', name: 'RychlýDoer', rarity: 'Rare', xp: 285, uzel: 5, badges_count: 5 },
  { id: 'u5', name: 'TemnýPozorovatel', rarity: 'Rare', xp: 240, uzel: 3, badges_count: 4, is_self: true },
  { id: 'u6', name: 'GreenDoer', rarity: 'Common', xp: 180, uzel: 3, badges_count: 3 },
  { id: 'u7', name: 'ActivePlayer', rarity: 'Common', xp: 150, uzel: 2, badges_count: 2 },
  { id: 'u8', name: 'Shadow', rarity: 'Common', xp: 120, uzel: 2, badges_count: 2 }
];

export const createFeedSlice = (set, get) => {
  let feedChannel = null;

  const setupFeedRealtime = () => {
    if (feedChannel) return;
    try {
      feedChannel = supabase
        .channel('public:feed_posts')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'feed_posts' }, (payload) => {
          if (payload.eventType === 'INSERT') {
            const newItem = {
              id: payload.new.id,
              user_id: payload.new.user_id || null,
              user_name: payload.new.user_name || 'Hráč',
              rarity: 'Rare',
              type: payload.new.type || 'PROOF',
              author_pass_holder: !!payload.new.author_pass_holder,
              content: payload.new.content,
              image_url: payload.new.image_url || null,
              reactions_fire: payload.new.reactions_fire || 0,
              reactions_plant: payload.new.reactions_plant ?? payload.new.reactions_lightning ?? 0,
              reactions_lightning: payload.new.reactions_plant ?? payload.new.reactions_lightning ?? 0,
              reactions_eye: payload.new.reactions_eye || 0,
              created_at: payload.new.created_at,
              is_public: payload.new.is_public
            };
            set(state => ({ feed: [newItem, ...state.feed.filter(x => x.id !== newItem.id)] }));
          } else if (payload.eventType === 'UPDATE') {
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
    feed: DEFAULT_FEED,
    leaderboard: DEFAULT_LEADERBOARD,
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

    fetchFeedPosts: async () => {
      try {
        const { data, error } = await supabase
          .from('feed_posts')
          .select('*')
          .eq('is_public', true)
          .order('created_at', { ascending: false })
          .limit(50);

        if (!error && data && data.length > 0) {
          const mappedPosts = data.map(p => ({
            id: p.id,
            user_id: p.user_id || null,
            user_name: p.user_name || 'Doer',
            rarity: 'Rare',
            type: p.type || 'PROOF',
            author_pass_holder: !!p.author_pass_holder,
            content: p.content,
            image_url: p.image_url || null,
            reactions_fire: p.reactions_fire || 0,
            reactions_plant: p.reactions_plant ?? p.reactions_lightning ?? 0,
            reactions_lightning: p.reactions_plant ?? p.reactions_lightning ?? 0,
            reactions_eye: p.reactions_eye || 0,
            created_at: p.created_at,
            is_public: p.is_public
          }));
          set({ feed: mappedPosts });
        }
      } catch (e) {
        console.warn('Failed to fetch real feed posts from Supabase.', e);
      }
    },

    fetchLeaderboard: async () => {
      try {
        const { data, error } = await supabase.rpc('get_leaderboard', { p_limit: 20 });

        if (!error && data && data.length > 0) {
          const currentUser = get().user;
          const mappedLeaderboard = data.map((p, idx) => ({
            id: p.id,
            name: p.display_name || `Hráč_${idx + 1}`,
            rarity: p.xp > 300 ? 'Legendary' : (p.xp > 100 ? 'Rare' : 'Common'),
            xp: p.xp || 0,
            uzel: p.uzel || 0,
            badges_count: p.avatar_level || 1,
            is_self: currentUser && currentUser.email === p.email
          }));
          set({ leaderboard: mappedLeaderboard });
        }
      } catch (e) {
        console.warn('Failed to fetch real leaderboard from Supabase.', e);
      }
    },

    addReaction: async (postId, type) => {
      const normalizedType = (type === 'lightning' || type === 'plant') ? 'plant' : type;
      // spec-11 "FEED & SOCIAL" KPI: reaction count / % hráčů co reagují
      track('reaction_added', { post_id: postId, reaction_type: normalizedType });

      // Optimistic state update
      set(state => ({
        feed: state.feed.map(item => {
          if (item.id === postId) {
            if (normalizedType === 'fire') return { ...item, reactions_fire: (item.reactions_fire || 0) + 1 };
            if (normalizedType === 'plant') {
              const newVal = (item.reactions_plant || item.reactions_lightning || 0) + 1;
              return { ...item, reactions_plant: newVal, reactions_lightning: newVal };
            }
            if (normalizedType === 'eye') return { ...item, reactions_eye: (item.reactions_eye || 0) + 1 };
          }
          return item;
        })
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
