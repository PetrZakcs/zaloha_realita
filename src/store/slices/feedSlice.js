import { supabase } from '../../api/supabaseClient';
import { track } from '../../lib/analytics';

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

    fetchFeedPosts: async () => {
      try {
        const { data, error } = await supabase
          .from('feed_posts')
          .select('*')
          .eq('is_public', true)
          .order('created_at', { ascending: false })
          .limit(50);

        if (!error && data) {
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
