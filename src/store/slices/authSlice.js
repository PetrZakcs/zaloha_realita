import { supabase } from '../../api/supabaseClient';
import { track } from '../../lib/analytics';
import { getTouches } from '../../lib/attribution';
import { compressImage } from '../../lib/compressImage';
import { unsubscribeFromPush } from '../../lib/push';
import { requestProofModeration } from '../../lib/moderation';

// Ordered onboarding step sequences per platform — spec-14 (the newer flow, login first):
//   landing (hero + CTA, no session) -> login (the only step touching Supabase Auth) ->
//   identity (optional nickname + photo; skipping keeps the auto-generated name, and from here
//   the whole onboarding can be skipped → NPC state) -> first-reward (+50 XP, granted by the
//   server, first share moment) -> slib (onboarding proof, published to the feed with its own
//   look, +1 key; skippable, then no key) -> avatar-upgrade (Stav 0 → Stav 1) -> mystery-box
//   (first drop, second share moment) -> transition ("Další úroveň je připravena", then straight
//   into the first story node).
// Desktop gets an extra 'install' (PWA) step right before the transition; mobile keeps its
// separate post-onboarding install banner instead (see PwaInstallBanner.jsx).
export const MOBILE_ONBOARDING_STEPS = ['landing', 'login', 'entry', 'identity', 'first-reward', 'slib', 'avatar-upgrade', 'mystery-box', 'transition'];
export const DESKTOP_ONBOARDING_STEPS = ['landing', 'login', 'entry', 'identity', 'first-reward', 'slib', 'avatar-upgrade', 'mystery-box', 'install', 'transition'];

// Steps a signed-in player can be in the middle of. A reload here must resume the flow instead
// of dropping them into the game with half the rewards missing.
const POST_LOGIN_STEPS = ['entry', 'identity', 'first-reward', 'slib', 'avatar-upgrade', 'mystery-box', 'install', 'transition'];

const LOCAL_SESSION_KEYS = ['user', 'userId', 'onboarded', 'onboardingStep', 'proofsSubmittedCount', 'glitchMomentShown'];

// Discord's real user id (a "snowflake") is what airtable-sync needs as the join key for
// the Airtable rewards sync. It's resolved server-side by the sync_discord_identity() RPC
// from the verified Discord identity in auth.identities — the client can't write
// profiles.discord_user_id directly any more (protect_profile_privileges locks it), since a
// client-supplied id let any player attribute cards to someone else's Airtable record.
async function syncDiscordIdentity(session) {
  if (session.user.app_metadata?.provider !== 'discord') return;
  const { error } = await supabase.rpc('sync_discord_identity');
  if (error) console.warn('[Auth] sync_discord_identity failed:', error.message);
}

// Translates the handful of Supabase auth errors we actually expect to hit
// into Czech, matching this app's all-Czech-copy convention. Anything
// unrecognized falls back to a generic message rather than leaking raw
// English Supabase error text into the UI.
// profiles.display_name is UNIQUE NOT NULL — the old 'Hráč_' + 0-999
// generator only had 1000 possible values, so after enough test signups a
// collision became a real, repeatable failure: the INSERT would fail on the
// unique constraint, get swallowed by handleOAuthSession's catch block, and
// leave a genuinely-authenticated user stuck with no profiles row at all
// (looked exactly like being logged out, even though the OAuth login had
// actually succeeded). Wide enough keyspace here that a first collision is
// unlikely; handleOAuthSession also retries with a fresh name on conflict
// as a second line of defense.
function generateRandomName() {
  return 'Hráč_' + Math.floor(Math.random() * 1000000);
}

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
  email: null,
  referralCode: null, // mapped from profiles.referral_code, server-generated — see supabase_migration_referral_system.sql
  freeNodeCredits: 0, // referral-earned pass-gate skips (2-invite reward); consumed by advance_node()
  showcaseCardKeys: [], // up to 3 owned card keys the player chose to feature — see set_showcase()
  displayNameChangeUsed: false // spec-10 §3: one free rename ever, enforced server-side
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
  // Values from before the login-first rework ('entry', 'reward2', …) restart at the landing.
  const storedStep = localStorage.getItem('onboardingStep');
  const localOnboardingStep = DESKTOP_ONBOARDING_STEPS.includes(storedStep) ? storedStep : 'landing';

  return {
    onboarded: localOnboarded,
    onboardingStep: localOnboardingStep,
    user: localUser || (localOnboarded ? DEFAULT_USER : null),
    loading: false,
    unlockedCards: [],
    // Internal bookkeeping only (not meant to be read by components) — see
    // handleOAuthSession's race guard below.
    _handlingOAuthSessionId: null,
    // True once the initial Supabase session check has fully resolved (either
    // a profile was loaded and onboarded:true set, or no session was found and
    // the splash screen should be shown). When localOnboarded is already true
    // from localStorage there's nothing to wait for — skip the loading state.
    sessionChecked: localOnboarded,

    // Set by fetchUser() when a returning session crosses a calendar-day boundary since
    // last_active_at — drives the 'welcome-back' modal (D1 hook / 48h+ retention, spec-3
    // §14C / spec-8 §7). null = no return session detected yet this load.
    welcomeBackDays: null,

    setOnboardingStep: (step) => {
      set({ onboardingStep: step });
      localStorage.setItem('onboardingStep', step);
      // spec-14 "Všechna data z onboardingu zaznamenávat" — every step view, so drop-off
      // per step is measurable.
      track('onboarding_step_viewed', { step });
    },

    setSessionChecked: (checked) => set({ sessionChecked: checked }),

    nextOnboardingStep: (isMobile) => {
      const steps = isMobile ? MOBILE_ONBOARDING_STEPS : DESKTOP_ONBOARDING_STEPS;
      const idx = steps.indexOf(get().onboardingStep);
      // Unrecognized/legacy/wrong-platform step value (e.g. an old 'splash'/'intro'
      // persisted from before the spec-3 rework, or a mobile step being read on desktop)
      // -> land on this platform's first step instead of the old silent no-op dead end.
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

    // spec-10 §2E "SHOWCASE SLOTY" — up to 3 owned cards a player picks to feature on their
    // public profile. Ownership is validated server-side (set_showcase() RPC), not here —
    // ALL_CARDS/isCardUnlocked already filters the picker UI to owned cards, but the RPC is
    // the actual trust boundary.
    setShowcase: async (cardKeys) => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session) return { success: false };
        const { error } = await supabase.rpc('set_showcase', { p_card_keys: cardKeys });
        if (error) throw error;

        const u = get().user;
        const updated = { ...(u || { ...DEFAULT_USER }), showcaseCardKeys: cardKeys };
        set({ user: updated });
        localStorage.setItem('user', JSON.stringify(updated));
        return { success: true };
      } catch (e) {
        console.warn('set_showcase failed.', e);
        return { success: false };
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
            pledge: updated.pledge
          }).eq('id', session.user.id);
        }
      } catch (e) {
        console.warn('Could not sync user updates with Supabase.', e);
      }
    },

    login: async (method) => {
      const randomName = generateRandomName();
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
      const randomName = generateRandomName();
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
          set({ user: newUser, onboardingStep: 'entry' });
          localStorage.setItem('onboardingStep', 'entry');
          get().loadCurrentNodeData();
          // Drive the actual profiles-row creation directly too, same reason
          // as loginWithEmail — don't leave it solely to the async listener.
          localStorage.setItem('userId', data.session.user.id);
          get().handleOAuthSession(data.session);
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

    // Existing account via email/password. Deliberately does NOT force
    // onboardingStep (unlike login()/registerWithEmail above) — a naive
    // forced 'avatar-upgrade' would flash that screen at a returning user.
    // It DOES call handleOAuthSession itself with the session signInWithPassword
    // just handed back, rather than only waiting on App.jsx's onAuthStateChange
    // listener to eventually deliver the same session — that passive path is
    // what silently stalled ("nefunguje přihlašování") when the listener took
    // a moment (or, on some browsers, didn't fire promptly) to catch up: the
    // button would flip back to normal with no visible error and no visible
    // success either. Calling it directly here makes success deterministic;
    // the listener still fires too, but handleOAuthSession's own in-flight
    // guard makes that redundant call a no-op instead of a race.
    loginWithEmail: async (email, password) => {
      try {
        const { data, error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) {
          return { success: false, error: mapSupabaseAuthError(error) };
        }
        track('login', { method: 'email_signin' });
        if (data?.session) {
          localStorage.setItem('userId', data.session.user.id);
          await get().handleOAuthSession(data.session);

          // handleOAuthSession succeeded IFF the player is in the game or resuming onboarding.
          // Otherwise (e.g. profile missing in DB, INSERT policy not set, any other silent
          // failure) give the user a visible error instead of leaving them stuck.
          if (!get().onboarded && !POST_LOGIN_STEPS.includes(get().onboardingStep)) {
            console.error('[Auth] loginWithEmail: no profile after handleOAuthSession.');
            return {
              success: false,
              error: 'Profil se nepodařilo načíst. Zkus to prosím znovu za chvíli.'
            };
          }
        }
        return { success: true };
      } catch (e) {
        console.warn('loginWithEmail failed.', e);
        return { success: false, error: 'Přihlášení se nezdařilo. Zkus to prosím znovu.' };
      }
    },

    // Settings-driven rename, post-onboarding — capped at one free change ever, enforced
    // server-side by protect_profile_privileges()'s display_name_change_used logic (a
    // client-side check alone would be trivially bypassed). Returns success:false with an
    // error message rather than silently no-op'ing so Settings can show *why* it didn't
    // save instead of just reverting quietly on the next fetch.
    changeDisplayNameOnce: async (name) => {
      const trimmed = (name || '').trim();
      if (!trimmed) return { success: false, error: 'Zadej přezdívku.' };

      if (get().user?.displayNameChangeUsed) {
        return { success: false, error: 'Změnu jména jsi už jednou využil/a.' };
      }

      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session) return { success: false, error: 'Nejsi přihlášen/a.' };

        const { data, error } = await supabase
          .from('profiles')
          .update({ display_name: trimmed })
          .eq('id', session.user.id)
          .select('display_name, display_name_change_used')
          .single();
        if (error) throw error;

        // The trigger silently reverts display_name (and leaves display_name_change_used
        // as-is) if the free change was already spent by another tab/device in the
        // meantime — the returned row tells us whether it actually took.
        if (data.display_name !== trimmed) {
          return { success: false, error: 'Změnu jména jsi už jednou využil/a.' };
        }

        const u = get().user;
        const updated = { ...(u || { ...DEFAULT_USER }), name: data.display_name, displayNameChangeUsed: !!data.display_name_change_used };
        set({ user: updated });
        localStorage.setItem('user', JSON.stringify(updated));
        return { success: true };
      } catch (e) {
        console.warn('changeDisplayNameOnce failed.', e);
        return { success: false, error: 'Změnu jména se nepodařilo uložit.' };
      }
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
          // publish_pledge() writes the post server-side with the profile's real name —
          // feed_posts no longer accepts direct client INSERTs.
          const { error } = await supabase.rpc('publish_pledge', { p_text: pledgeText });
          if (error) throw error;
          requestProofModeration(get().fetchFeedPosts);
          get().fetchFeedPosts();
        }
      } catch (e) {
        console.warn('Failed to publish first-challenge feed post.', e);
      }
    },

    // Rewards (+50 XP, avatar Stav 1) are granted by the server (complete_onboarding) —
    // the client used to write xp/keys itself, which the profile guard silently ignored.
    // Grants the onboarding rewards (idempotent) without leaving the onboarding flow — called
    // when the reward screen shows, so it displays real numbers and the share reward can be
    // claimed right there.
    grantOnboardingRewards: async () => {
      try {
        const { data, error } = await supabase.rpc('complete_onboarding');
        if (error) throw error;
        const row = Array.isArray(data) ? data[0] : data;
        const u = get().user || { ...DEFAULT_USER };
        const updated = row
          ? { ...u, onboardingCompleted: true, xp: row.new_xp, keys_count: row.new_keys_balance, badges_count: row.new_avatar_level }
          : { ...u, onboardingCompleted: true };
        set({ user: updated });
        localStorage.setItem('user', JSON.stringify(updated));
        return true;
      } catch (e) {
        console.warn('complete_onboarding failed.', e);
        return false;
      }
    },

    completeOnboarding: async () => {
      await get().grantOnboardingRewards();
      const updated = { ...(get().user || { ...DEFAULT_USER }), onboardingCompleted: true };
      set({ user: updated, onboarded: true, onboardingStep: 'done' });
      localStorage.setItem('user', JSON.stringify(updated));
      localStorage.setItem('onboarded', 'true');
      localStorage.removeItem('onboardingStep');
      get().loadCurrentNodeData();
      get().loadUnlockedCards();
      get().fetchMysteryBoxes();
      track('onboarding_completed');
    },

    // spec-14 "Onboarding lze přeskočit" — the player lands in the game as an NPC (grey
    // avatar, auto name, no onboarding XP/keys) and is nudged to finish activation later.
    skipOnboarding: async (step) => {
      track('onboarding_skipped', { step });
      try {
        const { error } = await supabase.rpc('skip_onboarding');
        if (error) throw error;
      } catch (e) {
        console.warn('skip_onboarding failed.', e);
      }
      const u = get().user || { ...DEFAULT_USER };
      const updated = { ...u, onboardingCompleted: false };
      set({ user: updated, onboarded: true, onboardingStep: 'done' });
      localStorage.setItem('user', JSON.stringify(updated));
      localStorage.setItem('onboarded', 'true');
      localStorage.removeItem('onboardingStep');
      get().loadCurrentNodeData();
      get().loadUnlockedCards();
    },

    // spec-14 "Kdo jsi jako hráč?" — one nickname during onboarding, not counted as the
    // one free rename. Returns { success } or { error } (Czech copy).
    setInitialNickname: async (name) => {
      const { data, error } = await supabase.rpc('set_initial_nickname', { p_name: name });
      if (error) {
        if (error.code === '23505') return { error: 'Tahle přezdívka už je obsazená.' };
        if (error.code === '22023') return { error: 'Přezdívka musí mít 3–20 znaků (písmena, čísla, mezera, _ nebo -).' };
        return { error: 'Přezdívku se nepodařilo uložit.' };
      }
      const updated = { ...(get().user || DEFAULT_USER), name: data };
      set({ user: updated });
      localStorage.setItem('user', JSON.stringify(updated));
      track('onboarding_nickname_set');
      return { success: true };
    },

    // spec-14 "Vložit foto". Uploaded to avatars/<uid>/…, then linked via set_avatar_url().
    uploadAvatar: async (rawFile) => {
      if (!rawFile) return { error: 'Vyber fotku.' };
      // Avatars never need more than 512 px — shrinking first also lets bigger photos through.
      let file;
      try {
        file = await compressImage(rawFile, { maxSide: 512 });
      } catch (e) {
        return { error: 'Tenhle formát fotky neumíme zpracovat. Použij JPG nebo PNG.' };
      }
      if (file.size > 2 * 1024 * 1024) return { error: 'Fotka může mít maximálně 2 MB.' };
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return { error: 'Nejdřív se přihlas.' };
      const ext = (file.name.split('.').pop() || 'jpg').toLowerCase();
      const path = `${session.user.id}/${Date.now()}.${ext}`;
      const { error: uploadError } = await supabase.storage.from('avatars').upload(path, file);
      if (uploadError) return { error: 'Fotku se nepodařilo nahrát (JPG, PNG, WebP nebo HEIC do 2 MB).' };
      const url = supabase.storage.from('avatars').getPublicUrl(path).data?.publicUrl || null;
      const { error } = await supabase.rpc('set_avatar_url', { p_url: url });
      if (error) return { error: 'Fotku se nepodařilo uložit.' };
      const updated = { ...(get().user || DEFAULT_USER), avatarUrl: url };
      set({ user: updated });
      localStorage.setItem('user', JSON.stringify(updated));
      track('avatar_photo_uploaded');
      return { success: true };
    },

    removeAvatar: async () => {
      const { error } = await supabase.rpc('set_avatar_url', { p_url: null });
      if (error) return { error: 'Nepodařilo se odebrat fotku.' };
      const updated = { ...(get().user || DEFAULT_USER), avatarUrl: null };
      set({ user: updated });
      localStorage.setItem('user', JSON.stringify(updated));
      return { success: true };
    },

    // spec-12 §2.4 "3–5 odemykatelných rámečků" — unlock rules are enforced by set_active_frame().
    setActiveFrame: async (frameKey) => {
      const { error } = await supabase.rpc('set_active_frame', { p_frame: frameKey });
      if (error) return { error: 'Tenhle rámeček ještě nemáš odemčený.' };
      const updated = { ...(get().user || DEFAULT_USER), activeFrame: frameKey };
      set({ user: updated });
      localStorage.setItem('user', JSON.stringify(updated));
      track('frame_equipped', { frame: frameKey });
      return { success: true };
    },

    // Earned node badges (spec-15) + glitch code fragments (spec-12 §9) for Profil/Inventář.
    badges: [],
    badgeCatalog: [],
    fragments: [],
    loadIdentityExtras: async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session) return;
        const [{ data: owned }, { data: catalog }, { data: fragments }] = await Promise.all([
          supabase.from('user_badges').select('badge_key, earned_at').eq('user_id', session.user.id),
          supabase.from('node_rewards').select('*').order('node_order'),
          supabase.from('player_fragments').select('fragment_no, code, earned_at').eq('user_id', session.user.id).order('fragment_no')
        ]);
        set({ badges: owned || [], badgeCatalog: catalog || [], fragments: fragments || [] });
      } catch (e) {
        console.warn('Failed to load badges/fragments.', e);
      }
    },

    // spec-15 "za sdílení +1 klíč navíc (hráč musí vědět)" / spec-17 §14 "+1 key +5 XP".
    // Once per share moment (server-enforced). Returns true when the reward was granted now.
    claimShareReward: async (sourceType, sourceId) => {
      try {
        const { data, error } = await supabase.rpc('claim_share_reward', { p_source_type: sourceType, p_source_id: sourceId });
        if (error) throw error;
        if (data === true) {
          const u = get().user || DEFAULT_USER;
          const updated = { ...u, keys_count: (u.keys_count || 0) + 1, xp: (u.xp || 0) + 5 };
          set({ user: updated });
          localStorage.setItem('user', JSON.stringify(updated));
          track('share_reward_granted', { source_type: sourceType });
          get().fetchMysteryBoxes();
        }
        return data === true;
      } catch (e) {
        console.warn('claim_share_reward failed.', e);
        return false;
      }
    },

    // Forgets the signed-in player on this device. Also used when the session ends on its own
    // (expired token, sign-out in another tab) — without this the app kept showing a player
    // whose every write then failed.
    clearLocalSession: () => {
      LOCAL_SESSION_KEYS.forEach(key => localStorage.removeItem(key));
      set({ user: null, onboarded: false, onboardingStep: 'landing', activeModal: null, activeStoryNode: null, activeStoryNodeSteps: [], sessionChecked: true });
    },

    logout: async () => {
      // This device must stop getting the player's notifications (the next player may use it).
      await unsubscribeFromPush();
      get().clearLocalSession();
      try {
        await supabase.auth.signOut();
      } catch (e) {
        console.warn('Supabase auth signout failed.', e);
      }
    },

    requestPasswordReset: async (email) => {
      const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo: window.location.origin });
      track('password_reset_requested');
      // Same answer whether the account exists or not, so this can't be used to probe e-mails.
      if (error && /rate limit/i.test(error.message || '')) return { error: 'Příliš mnoho pokusů. Zkus to prosím za chvíli.' };
      return { success: true };
    },

    passwordRecovery: false,
    setPasswordRecovery: (value) => set({ passwordRecovery: value }),

    setNewPassword: async (password) => {
      const { error } = await supabase.auth.updateUser({ password });
      if (error) {
        console.warn('Password update failed.', error);
        return { error: /different from the old/i.test(error.message || '') ? 'Nové heslo musí být jiné než to staré.' : 'Heslo se nepodařilo změnit. Otevři odkaz z e-mailu znovu.' };
      }
      track('password_reset_completed');
      set({ passwordRecovery: false });
      return { success: true };
    },

    // GDPR: removes the player's files first (only the client can list them under RLS), then the
    // account. A live subscription blocks it server-side, Stripe would keep charging otherwise.
    deleteAccount: async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return { error: 'Nejsi přihlášen/a.' };
      const uid = session.user.id;
      for (const bucket of ['proofs', 'proofs-private', 'avatars']) {
        const { data: files } = await supabase.storage.from(bucket).list(uid, { limit: 1000 });
        if (files?.length) await supabase.storage.from(bucket).remove(files.map(f => `${uid}/${f.name}`));
      }
      const { error } = await supabase.rpc('delete_my_account');
      if (error) {
        console.warn('delete_my_account failed.', error);
        return { error: /active_subscription/.test(error.message || '') ? 'Nejdřív zruš předplatné v Nastavení. Pak můžeš účet smazat.' : 'Účet se nepodařilo smazat. Zkus to prosím znovu.' };
      }
      await unsubscribeFromPush();
      get().clearLocalSession();
      await supabase.auth.signOut().catch(() => {});
      return { success: true };
    },


    fetchUser: async (userId) => {
      try {
        const { data } = await supabase.from('profiles').select('*').eq('id', userId).single();
        if (data) {
          // Identity state that only RPCs write (onboarding status, photo, frame).
          const { data: psData } = await supabase.from('player_state').select('*').eq('user_id', userId).maybeSingle();
          const ps = Array.isArray(psData) ? psData[0] : psData;
          const [{ count: questsCompleted }, { count: priorSubscriptions }] = await Promise.all([
            supabase.from('challenge_completions').select('challenge_id', { count: 'exact', head: true }).eq('user_id', userId),
            supabase.from('subscriptions').select('stripe_subscription_id', { count: 'exact', head: true }).eq('user_id', userId),
          ]);

          // Streak + last_active_at are computed server-side by record_daily_activity()
          // (the client used to compute the streak and write it straight to profiles).
          // It's a no-op on repeat calls within the same UTC day.
          let calculatedStreak = data.current_streak || 1;
          const { data: activity, error: activityError } = await supabase.rpc('record_daily_activity');
          const activityRow = Array.isArray(activity) ? activity[0] : activity;
          if (activityError) {
            console.warn('record_daily_activity failed.', activityError);
          } else if (activityRow) {
            calculatedStreak = activityRow.current_streak;
            // MVP1 spec-3 §14C "D1 hook uvnitř appky" / spec-8 §7 "Po 48h neaktivity" — a
            // return session after a calendar-day gap. The RPC only reports a gap on the
            // first call of the day, so this fires once per actual return.
            if (activityRow.days_since_last_active >= 1 && !get().activeModal) {
              set({ welcomeBackDays: activityRow.days_since_last_active, activeModal: 'welcome-back' });
            }
          }

          const mappedUser = {
            id: data.id,
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
            email: data.email || null,
            referralCode: data.referral_code || null,
            freeNodeCredits: data.free_node_credits || 0,
            showcaseCardKeys: data.showcase_card_keys || [],
            displayNameChangeUsed: !!data.display_name_change_used,
            // No player_state row = profile predates the onboarding tracking → treat as done.
            onboardingCompleted: ps ? !!ps.onboarding_completed_at : true,
            avatarUrl: ps?.avatar_url || null,
            activeFrame: ps?.active_frame || null,
            activeAura: ps?.active_aura || null,
            activeMask: ps?.active_mask || null,
            displayTitle: ps?.display_title || null,
            primaryBadge: ps?.primary_badge || null,
            // Drives "feed only after the first quest" (spec-17 §3).
            questsCompleted: questsCompleted ?? 0,
            // spec-13: a player who ever had the Pass comes back at the later price.
            passLapsed: !data.pass_holder && (priorSubscriptions ?? 0) > 0
          };

          // A signed-in player mid-onboarding resumes it (a new device starts at 'entry').
          const finished = ps ? !!(ps.onboarding_completed_at || ps.onboarding_skipped_at) : true;
          const midFlow = POST_LOGIN_STEPS.includes(get().onboardingStep);
          if (!finished || midFlow) {
            set({ user: mappedUser, onboarded: false, onboardingStep: midFlow ? get().onboardingStep : 'entry' });
            localStorage.setItem('user', JSON.stringify(mappedUser));
            localStorage.removeItem('onboarded');
            get().loadCurrentNodeData();
            return;
          }

          set({ user: mappedUser, onboarded: true });
          localStorage.setItem('user', JSON.stringify(mappedUser));
          localStorage.setItem('onboarded', 'true');
          get().loadCurrentNodeData();
          get().loadUnlockedCards();
          get().fetchFeedPosts();
          get().fetchLeaderboard();
          // Resolved ahead of time so advanceNode()'s season_completed branch knows
          // whether to open the reflection flow or not the moment the season finishes,
          // instead of racing a fresh check at that exact moment. See
          // supabase_migration_season_reflection.sql.
          get().checkSeasonReflectionStatus();
          get().fetchReferralStats();
          get().fetchMysteryBoxes();
          get().loadIdentityExtras();
          get().fetchPlayerProgress();
          get().fetchNotifications();
          get().fetchIdentityItems();
          get().fetchBlockedUsers();
        }
      } catch (e) {
        console.warn('Supabase fetchUser failed, using local storage.');
        // If we have cached user data from a previous successful login AND
        // localStorage says the user was onboarded, restore that state rather
        // than leaving them on the splash screen because of a transient network
        // error. They'll get stale profile data until the next successful fetch.
        if (!get().onboarded && localStorage.getItem('onboarded') === 'true') {
          const cachedUser = get().user;
          if (cachedUser) set({ onboarded: true });
        }
      }
    },

    // handleOAuthSession — called when a Supabase session lands (new login,
    // OAuth redirect, or page-load with an existing session).
    //
    // Strategy (simpler than the old maybeSingle-first approach):
    //   1. Try fetchUser() directly — SELECT * succeeds when the JWT is valid
    //      and the profile exists (the common path for returning users).
    //   2. If fetchUser comes back empty (profile genuinely doesn't exist yet),
    //      INSERT a new profile row and start onboarding.
    //   3. If INSERT fails because the row already exists (23505 on primary
    //      key), fetchUser again as fallback — this covers any residual edge
    //      case where step 1 somehow missed the row.
    //
    // Why this is more robust than the old maybeSingle() approach:
    //   maybeSingle() returns { data: null } for BOTH "row not found" AND
    //   "RLS denied / network error" — they're indistinguishable. The old code
    //   treated both as "new user", tried to INSERT, hit a primary-key
    //   constraint on an existing user, and silently left them on splash.
    //   Using fetchUser first means the common re-login path never touches
    //   INSERT at all.
    handleOAuthSession: async (session) => {
      if (!session?.user) return;

      // Idempotency guard — getSession() and onAuthStateChange can both
      // deliver the same session on a fresh OAuth redirect; the guard turns
      // the second call into a no-op instead of a concurrent race.
      if (get()._handlingOAuthSessionId === session.user.id) return;
      set({ _handlingOAuthSessionId: session.user.id });

      try {
        const userId = session.user.id;

        // ── Step 1: try to load an existing profile ──────────────────────
        const { data: profileRow, error: fetchError } = await supabase
          .from('profiles')
          .select('*')
          .eq('id', userId)
          .maybeSingle();

        if (profileRow) {
          // Backfill discord_user_id for accounts created before it was ever captured —
          // every Discord login is a free chance to pick it up without a migration.
          if (!profileRow.discord_user_id) {
            await syncDiscordIdentity(session);
          }
          await get().fetchUser(userId);
          return;
        }

        if (fetchError) {
          console.warn('[Auth] profile SELECT error:', fetchError.code, fetchError.message);
        }

        // ── Step 2: no profile → INSERT (new user) ───────────────────────
        const u = get().user || DEFAULT_USER;

        const meta = session.user.user_metadata || {};
        const discordName = session.user.app_metadata?.provider === 'discord'
          ? (meta.full_name || meta.name || meta.preferred_username || meta.custom_claims?.global_name || null)
          : null;
        let attemptName = discordName || u.name || DEFAULT_USER.name;
        // Captured on first app load from ?ref=CODE (see App.jsx) and, per that comment,
        // may have been sitting in localStorage since a completely different page load
        // (OAuth consent screen, email confirmation link). Only ever benefits the
        // REFERRER once handle_referral_signup() resolves it server-side — this account
        // itself gets nothing from setting it, so an unknown/garbage/self code is harmless.
        const referredByCode = localStorage.getItem('pendingReferralCode') || null;

        for (let attempt = 0; attempt < 5; attempt++) {
          const { error } = await supabase.from('profiles').insert([{
            id: userId,
            email: session.user.email,
            display_name: attemptName,
            xp: u.xp ?? 0,
            uzel: u.uzel ?? 0,
            keys_balance: u.keys_count ?? DEFAULT_USER.keys_count,
            current_streak: u.streak ?? 0,
            avatar_level: u.badges_count ?? 0,
            pledge: u.pledge || DEFAULT_USER.pledge,
            pass_holder: u.passHolder || false,
            referred_by_code: referredByCode
          }]);
          if (!error) {
            localStorage.removeItem('pendingReferralCode');
            localStorage.removeItem('pendingReferralExplicit');
            if (referredByCode) {
              // First/last touch for the referral row (Referral "FIRST TOUCH × LAST TOUCH").
              const { first, last } = getTouches();
              const { error: attributionError } = await supabase.rpc('record_referral_attribution', { p_first: first, p_last: last });
              if (attributionError) console.warn('record_referral_attribution failed.', attributionError);
              track('referral_registration', { share_type: last?.share_type || first?.share_type || null });
            }
            await syncDiscordIdentity(session);
            break;
          }

          console.warn('[Auth] INSERT error:', error.code, error.message, error.details);

          // display_name collision → retry with a new name
          const isNameCollision = error.code === '23505' && /display_name/i.test(error.message || error.details || '');
          if (isNameCollision) {
            attemptName = discordName
              ? `${discordName}_${Math.floor(Math.random() * 10000)}`
              : generateRandomName();
            continue;
          }

          // primary-key collision OR any other error → profile might exist after all
          // (handles both 23505 and 42501 permission-denied when INSERT policy is missing)
          console.warn('[Auth] INSERT failed non-recoverable — trying fetchUser fallback');
          await get().fetchUser(userId);
          return;
        }

        // Fresh profile inserted → brand-new account. Auth just succeeded, so the next thing
        // they see is the post-login half of the flow, not the auth screen again.
        const finalUser = { ...DEFAULT_USER, ...u, id: userId, name: attemptName, email: session.user.email, questsCompleted: 0 };
        set({ user: finalUser, onboardingStep: 'identity' });
        localStorage.setItem('user', JSON.stringify(finalUser));
        localStorage.setItem('onboardingStep', 'entry');
        get().loadCurrentNodeData();
        track('local_progress_migrated', { xp: u.xp, uzel: u.uzel, keys: u.keys_count, was_onboarded: get().onboarded });

      } catch (e) {
        console.warn('[handleOAuthSession] fatal error:', e);
      } finally {
        set({ _handlingOAuthSessionId: null, sessionChecked: true });
      }
    }
  };
};
