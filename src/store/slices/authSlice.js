import { supabase } from '../../api/supabaseClient';
import { track } from '../../lib/analytics';

export const DEFAULT_USER = {
  name: 'NovýHráč',
  xp: 0,
  uzel: 1,
  streak: 1,
  keys_count: 1,
  badges_count: 1,
  pledge: 'Jsem člověk, co přestal čekat a začal jednat.',
  rarity: 'Common',
  passHolder: false,
  discord_user_id: null,
  isAdmin: false, // Security default; mapped from is_admin in Supabase profile
  email: null
};

export const createAuthSlice = (set, get) => {
  const localOnboarded = localStorage.getItem('onboarded') === 'true';
  let localUser = null;
  try {
    const u = localStorage.getItem('user');
    if (u) localUser = JSON.parse(u);
  } catch (e) {
    console.error('Failed parsing local user data', e);
  }
  const localOnboardingStep = localStorage.getItem('onboardingStep') || 'splash';

  return {
    onboarded: localOnboarded,
    onboardingStep: localOnboardingStep,
    user: localUser || (localOnboarded ? DEFAULT_USER : null),
    loading: false,
    unlockedCards: [],

    setOnboardingStep: (step) => {
      set({ onboardingStep: step });
      localStorage.setItem('onboardingStep', step);
    },

    nextOnboardingStep: () => {
      const step = get().onboardingStep;
      if (step === 'splash') get().setOnboardingStep('intro');
      else if (step === 'intro') get().setOnboardingStep('login');
      else if (step === 'login') get().setOnboardingStep('nickname');
      else if (step === 'nickname') get().setOnboardingStep('slib');
      else if (step === 'slib') get().setOnboardingStep('reward');
    },

    loadUnlockedCards: async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (session) {
          const { data, error } = await supabase
            .from('user_cards')
            .select('*')
            .eq('user_id', session.user.id);
          
          if (!error && data) {
            set({ unlockedCards: data });
          }
        }
      } catch (e) {
        console.warn('Failed to load user cards from Supabase.', e);
      }
    },

    updateUser: async (fields) => {
      const u = get().user;
      const base = u || { ...DEFAULT_USER };
      const updated = { ...base, ...fields };
      set({ user: updated });
      localStorage.setItem('user', JSON.stringify(updated));

      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (session) {
          await supabase.from('profiles').update({
            display_name: updated.name,
            pledge: updated.pledge,
            discord_user_id: updated.discord_user_id,
            xp: updated.xp,
            keys_balance: updated.keys_count,
            pass_holder: updated.passHolder,
            avatar_level: updated.badges_count
          }).eq('id', session.user.id);
        }
      } catch (e) {
        console.warn('Could not sync user updates with Supabase.', e);
      }
    },

    login: async (method) => {
      const randomName = 'Hráč_' + Math.floor(Math.random() * 1000);
      const newUser = {
        ...DEFAULT_USER,
        name: randomName,
        keys_count: DEFAULT_USER.keys_count + 1,
        xp: 0,
        uzel: 1, // story content now starts at node_order 1 (intro folded into node 1's cutscene)
        badges_count: 1
      };
      set({ user: newUser, onboardingStep: 'nickname' });
      localStorage.setItem('user', JSON.stringify(newUser));
      localStorage.setItem('onboardingStep', 'nickname');
      get().loadCurrentNodeData();
      track('login', { method });

      try {
        if (method === 'google' || method === 'discord') {
          await supabase.auth.signInWithOAuth({ 
            provider: method,
            options: {
              redirectTo: window.location.origin
            }
          });
        } else {
          await supabase.auth.signInAnonymously();
        }
      } catch (e) {
        console.warn('Supabase auth signin omitted, using local session.', e);
      }
    },

    setNickname: (name) => {
      get().updateUser({ name });
    },

    setPledge: (pledge) => {
      get().updateUser({ pledge });
    },

    completeOnboarding: () => {
      const u = get().user || { ...DEFAULT_USER };
      const updated = { ...u, xp: 10, keys_count: u.keys_count + 1 };
      set({ user: updated, onboarded: true, onboardingStep: 'done' });
      localStorage.setItem('user', JSON.stringify(updated));
      localStorage.setItem('onboarded', 'true');
      localStorage.removeItem('onboardingStep');
      get().updateUser({ xp: 10, keys_count: u.keys_count + 1 });
      get().loadCurrentNodeData();
      get().loadUnlockedCards();
      track('onboarding_completed');
    },

    logout: async () => {
      localStorage.removeItem('user');
      localStorage.removeItem('onboarded');
      localStorage.removeItem('onboardingStep');
      set({ user: null, onboarded: false, onboardingStep: 'splash', activeModal: null, activeStoryNode: null, activeStoryNodeSteps: [] });
      try {
        await supabase.auth.signOut();
      } catch (e) {
        console.warn('Supabase auth signout failed.', e);
      }
    },

    unlockPass: async () => {
      const u = get().user;
      if (u) {
        const updated = { ...u, passHolder: true };
        set({ user: updated, activeModal: null });
        localStorage.setItem('user', JSON.stringify(updated));

        try {
          const { data: { session } } = await supabase.auth.getSession();
          if (session) {
            await supabase.from('profiles').update({ pass_holder: true }).eq('id', session.user.id);
          }
        } catch (e) {
          console.warn('Failed syncing unlockPass to database.', e);
        }
      }
    },

    fetchUser: async (userId) => {
      try {
        const { data } = await supabase.from('profiles').select('*').eq('id', userId).single();
        if (data) {
          // Calculate streak from last_active_at
          let calculatedStreak = data.current_streak || 1;
          const todayStr = new Date().toISOString().slice(0, 10);
          const lastActiveStr = data.last_active_at ? new Date(data.last_active_at).toISOString().slice(0, 10) : null;

          if (lastActiveStr && lastActiveStr !== todayStr) {
            const yesterday = new Date();
            yesterday.setDate(yesterday.getDate() - 1);
            const yesterdayStr = yesterday.toISOString().slice(0, 10);

            if (lastActiveStr === yesterdayStr) {
              calculatedStreak += 1;
            } else {
              calculatedStreak = 1;
            }

            // Sync updated streak & last_active_at back to Supabase
            await supabase.from('profiles').update({
              current_streak: calculatedStreak,
              last_active_at: new Date().toISOString()
            }).eq('id', userId);
          }

          const mappedUser = {
            name: data.display_name || 'Hráč',
            xp: data.xp ?? 0,
            uzel: data.uzel ?? 1,
            streak: calculatedStreak,
            keys_count: data.keys_balance ?? 1,
            badges_count: data.avatar_level || 1,
            pledge: data.pledge || 'Jsem člověk, co přestal čekat a začal jednat.',
            rarity: data.xp > 300 ? 'Legendary' : (data.xp > 100 ? 'Rare' : 'Common'),
            passHolder: data.pass_holder || false,
            discord_user_id: data.discord_user_id || null,
            isAdmin: data.is_admin || false,
            email: data.email || null
          };
          set({ user: mappedUser, onboarded: true });
          localStorage.setItem('user', JSON.stringify(mappedUser));
          localStorage.setItem('onboarded', 'true');
          get().loadCurrentNodeData();
          get().loadUnlockedCards();
          get().fetchFeedPosts();
          get().fetchLeaderboard();
        }
      } catch (e) {
        console.warn('Supabase fetchUser failed, using local storage.');
      }
    },

    handleOAuthSession: async (session) => {
      if (!session?.user) return;
      try {
        const { data: existingProfile } = await supabase
          .from('profiles')
          .select('id')
          .eq('id', session.user.id)
          .maybeSingle();

        if (existingProfile) {
          await get().fetchUser(session.user.id);
        } else {
          const u = get().user || DEFAULT_USER;
          const { error: insertError } = await supabase.from('profiles').insert([{
            id: session.user.id,
            email: session.user.email,
            display_name: u.name || DEFAULT_USER.name,
            xp: u.xp ?? 0,
            uzel: u.uzel ?? 0,
            keys_balance: u.keys_count ?? DEFAULT_USER.keys_count,
            current_streak: u.streak ?? 0,
            avatar_level: u.badges_count ?? 0,
            pledge: u.pledge || DEFAULT_USER.pledge,
            pass_holder: u.passHolder || false,
            discord_user_id: u.discord_user_id || null
          }]);

          if (insertError) throw insertError;
          track('local_progress_migrated', { xp: u.xp, uzel: u.uzel, keys: u.keys_count, was_onboarded: get().onboarded });
        }
      } catch (e) {
        console.warn('Failed to resolve OAuth session profile.', e);
      }
    }
  };
};
