import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { useEffect } from 'react';
import { supabase } from './api/supabaseClient';
import { useUserStore } from './store/userStore';
import Layout from './components/Layout';
import Dashboard from './components/Dashboard';
import Story from './components/Story';
import Feed from './components/Feed';
import Leaderboard from './components/Leaderboard';
import Profile from './components/Profile';
import AdminContentManager from './components/admin/AdminContentManager';
import './styles/index.css';

const ADMIN_EMAILS = [
  'admin@iwau.cz',
  'klient@iwau.cz',
  'test@iwau.cz',
  'petr@iwau.cz'
];

const AdminRoute = () => {
  const { user } = useUserStore();
  const isAllowed = user?.isAdmin || (user?.email && ADMIN_EMAILS.includes(user.email.toLowerCase()));

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
    // Auth listener
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (session) {
        localStorage.setItem('userId', session.user.id);
      }
    });

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
      </Routes>
    </BrowserRouter>
  );
}

export default App;
