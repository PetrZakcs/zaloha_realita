import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Crown, Gift, Map, Share2, Sparkles, Trophy } from 'lucide-react';
import { supabase } from '../../api/supabaseClient';
import { useUserStore } from '../../store/userStore';

// spec-12 §4.2 Home menu, plus the way into the integration phase once the season is done.
export default function HomeQuickMenu() {
  const navigate = useNavigate();
  const { user, openModal } = useUserStore();
  const [integrationActive, setIntegrationActive] = useState(false);

  useEffect(() => {
    let cancelled = false;
    supabase.rpc('get_integration_state').then(({ data }) => {
      if (!cancelled) setIntegrationActive(!!data?.active);
    });
    return () => { cancelled = true; };
  }, []);

  const items = [
    ...(integrationActive ? [{ label: 'Integrace', Icon: Sparkles, onClick: () => navigate('/integration') }] : []),
    { label: 'Mystery boxy', Icon: Gift, onClick: () => openModal('mystery-box') },
    { label: 'Žebříček', Icon: Trophy, onClick: () => navigate('/leaderboard') },
    { label: 'Mapa questů', Icon: Map, onClick: () => navigate('/map') },
    { label: user?.passHolder ? 'Můj Pass' : 'Odemkni Pass', Icon: Crown, onClick: () => openModal('paywall') },
    { label: 'Sdílej', Icon: Share2, onClick: () => navigate('/profile') },
  ];

  return (
    <nav aria-label="Rychlé menu" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(96px, 1fr))', gap: '8px', flexShrink: 0 }}>
      {items.map(({ label, Icon, onClick }) => (
        <button
          key={label}
          type="button"
          onClick={onClick}
          style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '6px', minHeight: '64px', background: '#1C1630', border: '0.5px solid #382C5C', borderRadius: '14px', padding: '10px 6px', color: '#F0F0F8', fontFamily: 'Inter', fontSize: '11px', fontWeight: 600, cursor: 'pointer' }}
        >
          <span style={{ display: 'inline-flex', color: '#A78BFA' }}><Icon size={18} /></span>
          {label}
        </button>
      ))}
    </nav>
  );
}
