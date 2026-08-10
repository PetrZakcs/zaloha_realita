import { supabase } from '../../api/supabaseClient';
import { track } from '../../lib/analytics';

// Ordered onboarding step sequences per platform, per the HANDOFF spec:
// 01 splash (logo/claim + Google/Discord/email auth, all on one screen) ->
// 02 intro (Zaya introduces herself + nickname, same screen) -> 03 slib
// (personal pledge, published as the player's first proof) -> 04 reward1
// (short auto-advancing badge+XP toast) -> 05 reward2 (full celebration +
// optional Hra Pass upsell -> Dashboard). Desktop gets an extra 'install'
// (PWA) step at the end, right before completeOnboarding() flips `onboarded`;
// mobile keeps its existing separate post-onboarding install banner instead
// (see PwaInstallBanner.jsx) and never uses 'install'.
export const MOBILE_ONBOARDING_STEPS = ['splash', 'intro', 'slib', 'reward1', 'reward2'];
export const DESKTOP_ONBOARDING_STEPS = ['splash', 'intro', 'slib', 'reward1', 'reward2', 'install'];

// Translates the handful of Supabase auth errors we actually expect to hit
// into Czech, matching this app's all-Czech-copy convention. Anything
// unrecognized falls back to a generic message rather than leaking raw
// English Supabase error text into the UI.
function mapSupabaseAuthError(error) {
  const msg = error?.message || '';
  if (/invalid login credentials/i.test(msg)) return 'Nesprávný e-mail nebo heslo.';
  if (/user already registered/i.test(msg)) return 'Účet s tímto e-mailem už existuje. Zkus se přihlásit.';
  if (/password should be at least/i.test(msg)) return 'Heslo je příliš krátké.';
  if (/email not confirmed/i.test(msg)) return 'E-mail ještě není potvrzený. Zkontroluj schránku.';
  if (/rate limit/i.test(msg)) return 'Příliš mnoho pokusů. Zkus to prosím za chvíli.';
  return 'Něco se nepovedlo. Zkus to prosím znovu.';
}

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

    nextOnboardingStep: (isMobile) => {
      const steps = isMobile ? MOBILE_ONBOARDING_STEPS : DESKTOP_ONBOARDING_STEPS;
      const idx = steps.indexOf(get().onboardingStep);
      // Unrecognized/legacy/wrong-platform step value (e.g. 'splash' persisted
      // from a mobile session, now being read on desktop) -> land on this
      // platform's first step instead of the old silent no-op dead end.
      const next = idx === -1 ? steps[0] : steps[Math.min(idx + 1, steps.length - 1)];
      get().setOnboardingStep(next);
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
          // xp / keys_balance / avatar_level are only ever changed via the
          // complete_challenge() RPC; pass_holder is only ever set by the
          // stripe-webhook edge function (service_role). The DB trigger from
          // supabase_migration_profiles_security.sql also rejects those columns
          // from this client path now, so writing them here would silently
          // no-op anyway — removed proactively instead of left to fail.
          await supabase.from('profiles').update({
            display_name: updated.name,
            pledge: updated.pledge,
            discord_user_id: updated.discord_user_id
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
      // Persist the optimistic user object only — NOT the onboarding step.
      // Advancing to 'nickname' here, before the redirect even fires, used
      // to flash the nickname screen for an instant and left the app
      // stranded on 'nickname' even if the user cancelled the Google/Discord
      // consent screen and came back. The step now only advances once
      // handleOAuthSession() confirms a real session actually landed
      // (App.jsx's onAuthStateChange -> handleOAuthSession) — consent screen
      // first, nickname/slib after, like it should be.
      set({ user: newUser });
      localStorage.setItem('user', JSON.stringify(newUser));
      track('login', { method });

      try {
        await supabase.auth.signInWithOAuth({
          provider: method,
          options: {
            redirectTo: window.location.origin
          }
        });
        // OAuth navigates the browser away to the provider's consent screen —
        // "success" here just means the redirect started, not that auth
        // completed. Nothing meaningful to return; the caller's loading UI
        // is moot past this point since the page is about to unload.
        return { success: true };
      } catch (e) {
        console.warn('Supabase auth signin omitted, using local session.', e);
        return { success: false };
      }
    },

    // Brand-new account via email/password. No page navigation happens (unlike
    // OAuth), so — same as login() above — we'd normally drive the local
    // onboarding step machine ourselves. But this Supabase project has
    // mailer_autoconfirm off, so signUp() usually comes back with no session
    // yet — the account only becomes real once the user clicks the
    // confirmation link. If we jumped to 'nickname' immediately regardless,
    // the login screen (and EmailAuthForm's "zkontroluj e-mail" interstitial)
    // would get unmounted right away, and the user would appear to be
    // onboarded without ever having a real session. So: only advance the step
    // when a session actually lands now. The optimistic user object is still
    // persisted to localStorage either way, so if the confirmation link is
    // opened in a fresh tab, that tab rehydrates it and
    // handleOAuthSession()'s new-profile branch picks up the right
    // name/bonus key instead of falling back to defaults.
    registerWithEmail: async (email, password) => {
      const randomName = 'Hráč_' + Math.floor(Math.random() * 1000);
      const newUser = {
        ...DEFAULT_USER,
        name: randomName,
        keys_count: DEFAULT_USER.keys_count + 1,
        xp: 0,
        uzel: 1,
        badges_count: 1,
        email
      };

      try {
        const { data, error } = await supabase.auth.signUp({
          email,
          password,
          options: { emailRedirectTo: window.location.origin }
        });
        if (error) {
          return { success: false, error: mapSupabaseAuthError(error) };
        }

        localStorage.setItem('user', JSON.stringify(newUser));

        const needsConfirmation = !data.session;
        if (!needsConfirmation) {
          set({ user: newUser, onboardingStep: 'intro' });
          localStorage.setItem('onboardingStep', 'intro');
          get().loadCurrentNodeData();
        } else {
          // Keep the in-memory user optimistic too (just not the onboarding
          // step) so the current tab's UI — name previews, etc. — has
          // something sensible while it waits.
          set({ user: newUser });
        }
        track('login', { method: 'email_register' });

        return { success: true, needsConfirmation };
      } catch (e) {
        console.warn('registerWithEmail failed.', e);
        return { success: false, error: 'Registraci se nepodařilo dokončit. Zkus to prosím znovu.' };
      }
    },

    // Existing account via email/password. Deliberately does NOT touch
    // onboardingStep (unlike login()/registerWithEmail above) — this is the
    // one action where forcing a step would be wrong: signInWithPassword also
    // doesn't navigate away, so a naive forced 'nickname' would flash that
    // screen at a returning user for a moment before the async
    // onAuthStateChange -> handleOAuthSession -> fetchUser chain resolves and
    // correctly flips `onboarded:true`. Just await the sign-in and let that
    // existing chain do its job.
    loginWithEmail: async (email, password) => {
      try {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) {
          return { success: false, error: mapSupabaseAuthError(error) };
        }
        track('login', { method: 'email_signin' });
        return { success: true };
      } catch (e) {
        console.warn('loginWithEmail failed.', e);
        return { success: false, error: 'Přihlášení se nezdařilo. Zkus to prosím znovu.' };
      }
    },

    setNickname: (name) => {
      get().updateUser({ name });
    },

    setPledge: (pledge) => {
      get().updateUser({ pledge });
    },

    // Onboarding's "slib" step is the app's real first micro-challenge (MVP1
    // §2.5/§6.2: a sub-60s micro-activation — write one "jsem člověk, co…"
    // sentence and publish it), not a private profile field. Persists the
    // pledge (existing updateUser behavior) and also inserts a real public
    // feed_posts row, so it counts as the player's first proof/UGC item.
    // Guarded by session like every other Supabase write mid-onboarding —
    // a session may not exist yet (e.g. still-unconfirmed email signup).
    submitPledge: async (pledgeText) => {
      await get().updateUser({ pledge: pledgeText });
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (session) {
          const u = get().user;
          const { error } = await supabase.from('feed_posts').insert([{
            user_id: session.user.id,
            user_name: u?.name || DEFAULT_USER.name,
            type: 'STATUS',
            content: pledgeText,
            is_public: true
          }]);
          if (error) throw error;
          get().fetchFeedPosts();
        }
      } catch (e) {
        console.warn('Failed to publish first-challenge feed post.', e);
      }
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

          // Discord already has a real, identifiable username — use it
          // instead of the random "Hráč_XXX" placeholder so a Discord signup
          // doesn't have to invent one from scratch; the nickname step still
          // lets them edit/confirm it like everyone else. Google's metadata
          // shape is less consistently a "handle" (often a full real name),
          // so left as the generated placeholder on purpose.
          const meta = session.user.user_metadata || {};
          const discordName = session.user.app_metadata?.provider === 'discord'
            ? (meta.full_name || meta.name || meta.preferred_username || meta.custom_claims?.global_name || null)
            : null;
          const resolvedName = discordName || u.name || DEFAULT_USER.name;

          const { error: insertError } = await supabase.from('profiles').insert([{
            id: session.user.id,
            email: session.user.email,
            display_name: resolvedName,
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

          // A freshly inserted profile always means a brand-new account that
          // still needs intro/slib/reward — force that regardless of
          // whatever the locally persisted step happened to be. Covers the
          // delayed email-confirmation case: the tab that clicks the
          // confirmation link may be a fresh one (onboardingStep defaulted
          // to 'splash') since registerWithEmail deliberately didn't advance
          // the step before the session existed.
          const finalUser = { ...DEFAULT_USER, ...u, name: resolvedName, email: session.user.email };
          set({ user: finalUser, onboardingStep: 'intro' });
          localStorage.setItem('user', JSON.stringify(finalUser));
          localStorage.setItem('onboardingStep', 'intro');
          get().loadCurrentNodeData();
          track('local_progress_migrated', { xp: u.xp, uzel: u.uzel, keys: u.keys_count, was_onboarded: get().onboarded });
        }
      } catch (e) {
        console.warn('Failed to resolve OAuth session profile.', e);
      }
    }
  };
};
