import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { lazy, Suspense, useEffect } from 'react';
import { supabase } from './api/supabaseClient';
import { track } from './lib/analytics';
import { captureTouch } from './lib/attribution';
import { useUserStore } from './store/userStore';
import Layout from './components/Layout';
import Dashboard from './components/Dashboard';
import IntegrationPhase from './components/IntegrationPhase';
import QuestMap from './components/QuestMap';
import Story from './components/Story';
import Feed from './components/Feed';
import Leaderboard from './components/Leaderboard';
import Profile from './components/Profile';
import PublicProfile from './components/PublicProfile';
import Inventory from './components/Inventory';
import PasswordRecoveryScreen from './components/onboarding/PasswordRecoveryScreen';
import './styles/index.css';

// Rarely opened, and no reason for every player to download the admin.
const AdminContentManager = lazy(() => import('./components/admin/AdminContentManager'));
const Terms = lazy(() => import('./components/legal/Terms'));
const Privacy = lazy(() => import('./components/legal/Privacy'));

// supabase-js removes the hash once it has processed it, so this is read at module load.
const OPENED_FROM_RECOVERY_LINK = window.location.hash.includes('type=recovery');

// Read once at module load too: child effects run first, and Layout's redirect into the feed
// replaces the URL before App's effect would see ?ref= or ?payment=.
let initialSearch = window.location.search;
const INITIAL_PATH = window.location.pathname;

const AdminRoute = () => {
  const { user } = useUserStore();
  const isAllowed = Boolean(user?.isAdmin);

  if (!isAllowed) {
    return (
      <div style={{
        background: '#0D0A18',
        color: '#fff',
        height: '100vh',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        fontFamily: 'Inter, sans-serif'
      }}>
        <h1 style={{ color: '#EF4444', fontFamily: "'Space Grotesk', sans-serif", fontSize: '24px', fontWeight: '700' }}>Přístup odepřen</h1>
        <p style={{ color: '#6B6B8A', marginTop: '10px', fontSize: '14px' }}>Nemáš oprávnění pro vstup do administrace.</p>
        <button 
          onClick={() => window.location.href = '/'}
          style={{
            background: '#7C3AED',
            color: '#fff',
            border: 'none',
            borderRadius: '10px',
            padding: '10px 20px',
            cursor: 'pointer',
            marginTop: '20px',
            fontWeight: '600',
            fontFamily: 'Inter',
            fontSize: '13px'
          }}
        >
          Zpět na hlavní panel
        </button>
      </div>
    );
  }
  return <AdminContentManager onClose={() => window.location.href = '/'} />;
};

function App() {
  useEffect(() => {
    // Capture ?ref=CODE (spec-7 referral links) as early as possible, before any redirect
    // (OAuth consent screen, email confirmation) can strip the query string. Persisted to
    // localStorage — same pattern as the optimistic `user`/`onboardingStep` — so it survives
    // through to whichever moment a fresh profile actually gets INSERTed
    // (handleOAuthSession() in authSlice.js), which may be a different page load entirely.
    // Never overwrites an already-pending code — first link a device saw wins, so bouncing
    // through a second, unrelated referral link before signing up doesn't reassign credit.
    // Now also keeps first/last touch (quest, share type) — src/lib/attribution.js.
    const search = initialSearch;
    initialSearch = '';
    const touch = captureTouch(search, INITIAL_PATH);
    if (touch) track('invite_landing_viewed', { share_type: touch.share_type || null, has_quest: !!touch.quest });

    // spec-11 monetization KPI: "% dokončí nákup" / "čas od vstupu do nákupu" — the actual
    // pass_holder flip happens server-side (stripe-webhook), invisible to the client, and
    // Stripe Checkout navigates the browser away entirely, so ?payment=success on return
    // (see stripe-checkout's successUrl in ModalManager.jsx) was previously the only signal
    // the client ever gets that a purchase happened — and nothing read it at all. Stripped
    // from the URL right after so a refresh doesn't re-fire it.
    const paymentResult = new URLSearchParams(search).get('payment');
    if (paymentResult) {
      window.history.replaceState({}, '', window.location.pathname);
    }
    if (paymentResult === 'success') {
      track('pass_purchase_completed');
      useUserStore.getState().awaitPassActivation();
    }

    if (OPENED_FROM_RECOVERY_LINK) useUserStore.getState().setPasswordRecovery(true);

    // Check initial active session
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) {
        localStorage.setItem('userId', session.user.id);
        useUserStore.getState().handleOAuthSession(session);
      } else {
        // No active session — mark checked so the loading screen clears and the landing can
        // be shown. A locally remembered player whose session is gone (expired, signed out
        // elsewhere) goes back to the landing too instead of a UI where every write fails.
        if (useUserStore.getState().onboarded) useUserStore.getState().clearLocalSession();
        useUserStore.getState().setSessionChecked(true);
        useUserStore.getState().fetchFeedPosts();
        useUserStore.getState().fetchLeaderboard();
      }
      useUserStore.getState().fetchGameConfig();
      // Real player count for social-proof copy (e.g. onboarding) — needed
      // pre-login too, so fetched unconditionally rather than in the branches above.
      useUserStore.getState().fetchPlayerCount();
    });

    // Auth listener — intentionally does NOT call handleOAuthSession here.
    //
    // Root cause of the re-login bug: Supabase fires the SIGNED_IN event
    // synchronously INSIDE signInWithPassword()'s own session processing,
    // BEFORE the JWT has fully propagated to the client. If this listener
    // called handleOAuthSession, its maybeSingle() query would run without
    // auth headers → RLS ("Allow users to read their own profile") blocks
    // the read → returns null → code thinks it's a new user → tries INSERT
    // → fails on PRIMARY KEY constraint → catch → user stuck on splash.
    //
    // Instead, each login path handles handleOAuthSession at the right moment:
    //   • Email/password: loginWithEmail() calls it directly AFTER
    //     signInWithPassword() resolves (JWT is guaranteed set by then).
    //   • OAuth redirect: a fresh page load runs getSession() above, which
    //     also fires only after the client has fully processed the hash token.
    //   • Email confirm link: same fresh-page-load path via getSession().
    //
    // The only transitions handled here are the ones no call site can see: a session ending on
    // its own / in another tab, and the password recovery link.
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'SIGNED_OUT' && useUserStore.getState().user) useUserStore.getState().clearLocalSession();
      if (event === 'PASSWORD_RECOVERY') useUserStore.getState().setPasswordRecovery(true);
    });

    track('app_opened', { date: new Date().toISOString().slice(0, 10) });

    return () => subscription.unsubscribe();
  }, []);

  return (
    <BrowserRouter>
      <PasswordRecoveryScreen />
      <Suspense fallback={<div style={{ background: '#0D0A18', height: '100vh' }} />}>
      <Routes>
        <Route element={<Layout />}>
          <Route path="/" element={<Dashboard />} />
          <Route path="/story" element={<Story />} />
          <Route path="/feed" element={<Feed />} />
          <Route path="/leaderboard" element={<Leaderboard />} />
          <Route path="/profile" element={<Profile />} />
          <Route path="/profile/:userId" element={<PublicProfile />} />
          <Route path="/inventory" element={<Inventory />} />
          <Route path="/integration" element={<IntegrationPhase />} />
          <Route path="/map" element={<QuestMap />} />
        </Route>
        <Route path="/admin" element={<AdminRoute />} />
        <Route path="/terms" element={<Terms />} />
        <Route path="/privacy" element={<Privacy />} />
      </Routes>
      </Suspense>
    </BrowserRouter>
  );
}

export default App;
