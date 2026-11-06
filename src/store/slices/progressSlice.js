import { supabase } from '../../api/supabaseClient';
import { track } from '../../lib/analytics';
import { configureLevels } from '../../lib/levels';

// Game Bible MVP1 state: player progress (Next Move, Lifetime Level/Title, theme progress,
// comeback state), in-app notifications + preferences, referral dashboard, identity items,
// invite landing context. All values come from server RPCs/tables — nothing is invented.
export const createProgressSlice = (set, get) => ({
  playerProgress: null,
  // Server-side balancing values (game_config) — public read.
  gameConfig: {},

  fetchGameConfig: async () => {
    try {
      const { data, error } = await supabase.from('game_config').select('key, value');
      if (error) throw error;
      const config = Object.fromEntries((data || []).map(r => [r.key, r.value]));
      configureLevels(config.level_curve, config.level_xp_after_curve);
      set({ gameConfig: config });
    } catch (e) {
      console.warn('Failed to load game config — using defaults.', e);
    }
  },
  notificationsList: [],
  notificationPrefs: null,
  referralDashboard: null,
  identityCatalog: [],
  ownedIdentityItems: [],
  identityItemsLoaded: false,
  inviteContext: null,

  fetchPlayerProgress: async () => {
    try {
      const { data, error } = await supabase.rpc('get_player_progress');
      if (error) throw error;
      const row = Array.isArray(data) ? data[0] : data;
      set({ playerProgress: row || null });
      return row || null;
    } catch (e) {
      console.warn('get_player_progress failed.', e);
      return null;
    }
  },

  fetchNotifications: async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;
      const { data, error } = await supabase
        .from('player_notifications')
        .select('id, category, priority, title, body, link, read_at, created_at')
        .eq('user_id', session.user.id)
        .order('created_at', { ascending: false })
        .limit(30);
      if (!error) set({ notificationsList: data || [] });
    } catch (e) {
      console.warn('Failed to load notifications.', e);
    }
  },

  markNotificationsRead: async (ids = null) => {
    const now = new Date().toISOString();
    set(state => ({
      notificationsList: state.notificationsList.map(n => (!n.read_at && (!ids || ids.includes(n.id)) ? { ...n, read_at: now } : n))
    }));
    const { error } = await supabase.rpc('mark_notifications_read', { p_ids: ids });
    if (error) console.warn('mark_notifications_read failed.', error);
  },

  fetchNotificationPrefs: async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;
      const { data } = await supabase.from('notification_preferences').select('*').eq('user_id', session.user.id).maybeSingle();
      set({ notificationPrefs: data || { categories_off: [], quiet_start: null, quiet_end: null } });
    } catch (e) {
      console.warn('Failed to load notification preferences.', e);
    }
  },

  saveNotificationPrefs: async ({ categoriesOff, quietStart, quietEnd }) => {
    const { error } = await supabase.rpc('set_notification_preferences', {
      p_categories_off: categoriesOff,
      p_quiet_start: quietStart ?? null,
      p_quiet_end: quietEnd ?? null
    });
    if (error) {
      console.warn('set_notification_preferences failed.', error);
      return { error: 'Nastavení se nepodařilo uložit.' };
    }
    set({ notificationPrefs: { categories_off: categoriesOff, quiet_start: quietStart ?? null, quiet_end: quietEnd ?? null } });
    track('notification_prefs_saved', { off: categoriesOff, quiet: quietStart != null });
    return {};
  },

  fetchReferralDashboard: async () => {
    try {
      const { data, error } = await supabase.rpc('get_referral_dashboard');
      if (error) throw error;
      set({ referralDashboard: (Array.isArray(data) ? data[0] : data) || null });
    } catch (e) {
      console.warn('get_referral_dashboard failed.', e);
    }
  },

  fetchIdentityItems: async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const [{ data: catalog }, owned] = await Promise.all([
        supabase.from('identity_items').select('*').order('sort_order'),
        session
          ? supabase.from('player_identity_items').select('item_key, earned_at, source').eq('user_id', session.user.id)
          : Promise.resolve({ data: [] })
      ]);
      const previous = get().ownedIdentityItems;
      const ownedNow = owned?.data || [];
      const loadedBefore = get().identityItemsLoaded;
      set({ identityCatalog: catalog || [], ownedIdentityItems: ownedNow, identityItemsLoaded: true });
      if (loadedBefore) {
        const fresh = ownedNow.find(o => !previous.some(p => p.item_key === o.item_key));
        const item = fresh && (catalog || []).find(c => c.item_key === fresh.item_key);
        if (item) {
          set({ identityReveal: { ...item, earned_at: fresh.earned_at, source: fresh.source } });
          track('identity_item_unlocked', { item_id: item.item_key, item_type: item.kind, rarity: item.rarity, source: fresh.source });
        }
      }
    } catch (e) {
      console.warn('Failed to load identity items.', e);
    }
  },

  // Identity "IDENTITY SLOT SYSTEM: 1× Primary Badge" — must be an owned badge.
  setPrimaryBadge: async (badgeKey) => {
    const { error } = await supabase.rpc('set_primary_badge', { p_badge_key: badgeKey });
    if (error) {
      console.warn('set_primary_badge failed.', error);
      return { error: 'Nepodařilo se uložit.' };
    }
    const u = get().user;
    if (u) {
      const updated = { ...u, primaryBadge: badgeKey };
      set({ user: updated });
      localStorage.setItem('user', JSON.stringify(updated));
    }
    track('identity_item_equipped', { kind: 'badge', item_key: badgeKey });
    return {};
  },

  // Identity "IDENTITY MOMENTS": a newly earned identity item gets a reveal (equip + share).
  identityReveal: null,
  clearIdentityReveal: () => set({ identityReveal: null }),

  // kind: 'aura' | 'mask' | 'title'; itemKey null clears the slot.
  setIdentitySlot: async (kind, itemKey) => {
    const { error } = await supabase.rpc('set_identity_slot', { p_kind: kind, p_item_key: itemKey });
    if (error) {
      console.warn('set_identity_slot failed.', error);
      return { error: 'Nepodařilo se uložit.' };
    }
    const field = { aura: 'activeAura', mask: 'activeMask', title: 'displayTitle' }[kind];
    const u = get().user;
    if (u && field) {
      const updated = { ...u, [field]: itemKey };
      set({ user: updated });
      localStorage.setItem('user', JSON.stringify(updated));
    }
    track('identity_slot_set', { kind, item_key: itemKey });
    return {};
  },

  // Equipped aura colour / mask title of the signed-in player (for their own avatar).
  ownIdentityVisual: () => {
    const { user, identityCatalog } = get();
    const find = (key) => identityCatalog.find(i => i.item_key === key);
    return {
      auraColor: find(user?.activeAura)?.visual?.color || null,
      maskTitle: find(user?.activeMask)?.title || null,
    };
  },

  // Viral "VIRAL LANDING PAGE" — who invited me and to which quest (public RPC, works logged out).
  fetchInviteContext: async (code, questId) => {
    if (!code) return null;
    try {
      const { data, error } = await supabase.rpc('get_invite_context', { p_code: code, p_quest_id: questId || null });
      if (error) throw error;
      const row = (Array.isArray(data) ? data[0] : data) || null;
      set({ inviteContext: row });
      return row;
    } catch (e) {
      console.warn('get_invite_context failed.', e);
      return null;
    }
  },
});
