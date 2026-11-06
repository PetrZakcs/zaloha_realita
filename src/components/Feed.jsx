import { useNavigate } from 'react-router-dom';
import { useUserStore } from '../store/userStore';
import AppShell from './layout/AppShell';
import MobileFeed from './mobile/MobileFeed';
import DesktopFeed from './desktop/DesktopFeed';

// spec-17 §3: "Hráč nesmí feed vidět před prvním questem" — without the context the feed only
// lowers conversion. onboarding → first quest → first proof → first reward → feed.
export default function Feed() {
  const { user } = useUserStore();
  const navigate = useNavigate();

  if (user?.questsCompleted === 0) {
    return (
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '12px', padding: '32px 24px', textAlign: 'center' }}>
        <div style={{ fontFamily: "'Space Grotesk', sans-serif", fontWeight: 700, fontSize: '22px', color: '#F0F0F8' }}>Feed se odemkne po první výzvě</div>
        <div style={{ fontFamily: 'Inter', fontSize: '14px', color: '#9A9AB5', lineHeight: 1.5 }}>Nejdřív udělej svůj první zásah. Pak uvidíš, co dělají ostatní, a oni uvidí tebe.</div>
        <button type="button" onClick={() => navigate('/story')}
          style={{ marginTop: '6px', height: '46px', padding: '0 24px', background: '#7C3AED', color: '#fff', border: 'none', borderRadius: '14px', fontFamily: 'Inter', fontWeight: 700, fontSize: '15px', cursor: 'pointer' }}>
          Spustit první výzvu
        </button>
      </div>
    );
  }

  return (
    <AppShell 
      mobile={MobileFeed} 
      desktop={DesktopFeed} 
    />
  );
}
