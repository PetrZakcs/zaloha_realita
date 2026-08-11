import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { useEffect } from 'react';
import { supabase } from './api/supabaseClient';
import { track } from './lib/analytics';
import { useUserStore } from './store/userStore';
import Layout from './components/Layout';
import Dashboard from './components/Dashboard';
import Story from './components/Story';
import Feed from './components/Feed';
import Leaderboard from './components/Leaderboard';
import Profile from './components/Profile';
import AdminContentManager from './components/admin/AdminContentManager';
import Terms from './components/legal/Terms';
import Privacy from './components/legal/Privacy';
import './styles/index.css';

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
    // Check initial active session
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) {
        localStorage.setItem('userId', session.user.id);
        useUserStore.getState().handleOAuthSession(session);
      } else {
        // No active session — mark checked so the loading screen clears and
        // the splash / login UI can be shown.
        useUserStore.getState().setSessionChecked(true);
        useUserStore.getState().fetchFeedPosts();
        useUserStore.getState().fetchLeaderboard();
      }
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
    // Subscription kept alive for future cross-tab SIGNED_OUT sync.
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, _session) => {
      // No-op for now — all auth transitions handled at call sites above.
      void event;
    });

    track('app_opened', { date: new Date().toISOString().slice(0, 10) });

    return () => subscription.unsubscribe();
  }, []);

  return (
    <BrowserRouter>
      <Routes>
        <Route element={<Layout />}>
          <Route path="/" element={<Dashboard />} />
          <Route path="/story" element={<Story />} />
          <Route path="/feed" element={<Feed />} />
          <Route path="/leaderboard" element={<Leaderboard />} />
          <Route path="/profile" element={<Profile />} />
        </Route>
        <Route path="/admin" element={<AdminRoute />} />
        <Route path="/terms" element={<Terms />} />
        <Route path="/privacy" element={<Privacy />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;
