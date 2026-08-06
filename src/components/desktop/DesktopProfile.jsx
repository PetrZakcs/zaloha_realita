import { useUserStore } from '../../store/userStore';
import { Settings as SettingsIcon, Shield, Flame, Leaf, Zap, Lock, Pencil } from 'lucide-react';
import HraPassCard from '../common/HraPassCard';

export default function DesktopProfile() {
  const { user, openModal } = useUserStore();

  const mockBadges = [
    { icon: <Shield size={24} />, rarity: 'rare', border: '#7C3AED', color: '#A78BFA', shadow: 'rgba(124,58,237,.3)' },
    { icon: <Flame size={24} />, rarity: 'legendary', border: '#F5B73F', color: '#F5B73F', shadow: 'rgba(245,183,63,.45)' },
    { icon: <Leaf size={24} />, rarity: 'success', border: '#22C55E', color: '#22C55E', shadow: 'rgba(34,197,94,.3)' },
    { icon: <Zap size={24} />, rarity: 'epic', border: '#4AA8FF', color: '#4AA8FF', shadow: 'rgba(74,168,255,.4)' }
  ];

  return (
    <div style={{
      flex: 1,
      overflow: 'hidden',
      display: 'flex',
      flexDirection: 'column',
      height: '100%',
      fontFamily: 'Inter, sans-serif'
    }}>
      <div style={{ flex: 1, overflowY: 'auto', padding: '28px 36px 36px', display: 'flex', flexDirection: 'column' }}>
        {/* Top Header Row with Settings */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '20px' }}>
          <div>
            <span style={{ fontFamily: 'Inter', fontWeight: '600', fontSize: '11px', letterSpacing: '.12em', textTransform: 'uppercase', color: '#6B6B8A' }}>
              Profil Hráče
            </span>
          </div>
          <span 
            onClick={() => openModal('settings')}
            style={{ 
              display: 'inline-flex', 
              width: '36px', 
              height: '36px', 
              borderRadius: '12px',
              background: '#241C3C',
              border: '1px solid #382C5C',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#9A9AB5', 
              cursor: 'pointer',
              transition: 'all 0.2s'
            }}
          >
            <SettingsIcon size={18} />
          </span>
        </div>

        {/* Avatar with circular progress ring + name row */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '24px' }}>
          <div style={{ position: 'relative', width: '112px', height: '112px', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <svg viewBox="0 0 112 112" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', transform: 'rotate(-90deg)' }}>
              <circle cx="56" cy="56" r="52" fill="none" stroke="#2A2142" strokeWidth="5"></circle>
              <circle cx="56" cy="56" r="52" fill="none" stroke="#7C3AED" strokeWidth="5" strokeLinecap="round" strokeDasharray="326.7" strokeDashoffset="140"></circle>
            </svg>
            <span style={{
              width: '92px',
              height: '92px',
              borderRadius: '50%',
              background: '#241C3C',
              border: '3px solid #15111E',
              boxShadow: '0 0 28px rgba(124,58,237,.55)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontFamily: "'Space Grotesk', sans-serif",
              fontWeight: '700',
              fontSize: '32px',
              color: '#A78BFA'
            }}>
              {(user?.name || 'PE').slice(0, 2).toUpperCase()}
            </span>
            {/* Pinned Badge Icon */}
            <span style={{
              position: 'absolute',
              bottom: '2px',
              right: '2px',
              width: '32px',
              height: '32px',
              borderRadius: '50%',
              background: '#2A1E10',
              border: '2px solid #F5B73F',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              boxShadow: '0 0 14px rgba(245,183,63,.6)'
            }}>
              <span style={{ display: 'inline-flex', width: '15px', height: '15px', color: '#F5B73F' }}><Flame size={15} /></span>
            </span>
          </div>

          <div style={{ flex: 1 }}>
            <div style={{ fontFamily: "'Space Grotesk', sans-serif", fontWeight: '700', fontSize: '28px', color: '#F0F0F8' }}>
              {user?.name || 'TemnýPozorovatel'}
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginTop: '8px' }}>
              <span style={{ fontFamily: 'Inter', fontWeight: '600', fontSize: '11px', color: '#A78BFA', background: '#241C3C', border: '0.5px solid #7C3AED', borderRadius: '20px', padding: '4px 12px' }}>
                {user?.rarity || 'Doer'}
              </span>
              <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: '13px', color: '#60A5FA' }}>
                {user?.xp || 0} XP
              </span>
            </div>
          </div>

          <button 
            onClick={() => openModal('nickname')}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              height: '42px',
              padding: '0 18px',
              background: 'rgba(124,58,237,0.12)',
              color: '#A78BFA',
              fontFamily: 'Inter',
              fontWeight: '600',
              fontSize: '13px',
              border: '1px solid #7C3AED',
              borderRadius: '14px',
              cursor: 'pointer',
              boxShadow: '0 0 12px rgba(124,58,237,0.25)',
              transition: 'all 0.2s'
            }}
          >
            <span style={{ display: 'inline-flex', width: '15px', height: '15px' }}><Pencil size={15} /></span>
            Upravit profil
          </button>
        </div>

        {/* User pledge quote */}
        <div style={{ borderLeft: '3px solid #7C3AED', paddingLeft: '16px', marginTop: '24px' }}>
          <span style={{ fontFamily: 'Inter', fontStyle: 'italic', fontSize: '14px', color: '#9A9AB5', lineHeight: '1.55' }}>
            „{user?.pledge || 'Jsem člověk, co přestal čekat a začal jednat.'}“
          </span>
        </div>

        {/* HRA PASS Promo Banner */}
        <div style={{ marginTop: '24px' }}>
          <HraPassCard />
        </div>

        {/* Stats row */}
        <div style={{ display: 'flex', gap: '16px', marginTop: '24px', flexShrink: 0 }}>
          <div style={{ flex: 1, background: '#15111E', border: '0.5px solid #2A2142', borderRadius: '18px', padding: '18px', textAlign: 'center' }}>
            <div style={{ fontFamily: "'Space Grotesk', sans-serif", fontWeight: '700', fontSize: '28px', color: '#F5B73F' }}>{user?.keys_count || 1}</div>
            <div style={{ fontFamily: 'Inter', fontSize: '11px', color: '#6B6B8A', marginTop: '3px' }}>klíčů</div>
          </div>
          <div style={{ flex: 1, background: '#15111E', border: '0.5px solid #2A2142', borderRadius: '18px', padding: '18px', textAlign: 'center' }}>
            <div style={{ fontFamily: "'Space Grotesk', sans-serif", fontWeight: '700', fontSize: '28px', color: '#F5B73F' }}>{user?.streak || 1}</div>
            <div style={{ fontFamily: 'Inter', fontSize: '11px', color: '#6B6B8A', marginTop: '3px' }}>dní v řadě</div>
          </div>
          <div style={{ flex: 1, background: '#15111E', border: '0.5px solid #2A2142', borderRadius: '18px', padding: '18px', textAlign: 'center' }}>
            <div style={{ fontFamily: "'Space Grotesk', sans-serif", fontWeight: '700', fontSize: '28px', color: '#22C55E' }}>12</div>
            <div style={{ fontFamily: 'Inter', fontSize: '11px', color: '#6B6B8A', marginTop: '3px' }}>výzev</div>
          </div>
          <div style={{ flex: 1, background: '#15111E', border: '0.5px solid #2A2142', borderRadius: '18px', padding: '18px', textAlign: 'center' }}>
            <div style={{ fontFamily: "'Space Grotesk', sans-serif", fontWeight: '700', fontSize: '28px', color: '#60A5FA' }}>#7</div>
            <div style={{ fontFamily: 'Inter', fontSize: '11px', color: '#6B6B8A', marginTop: '3px' }}>v žebříčku</div>
          </div>
        </div>

        {/* Badges Grid */}
        <div style={{ marginTop: '26px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '14px' }}>
            <span style={{ fontFamily: 'Inter', fontWeight: '600', fontSize: '11px', letterSpacing: '.12em', textTransform: 'uppercase', color: '#6B6B8A' }}>
              Odznaky · {user?.badges_count || 1} / 16
            </span>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(8, 1fr)', gap: '14px' }}>
            {[...Array(16)].map((_, i) => {
              const unlocked = i < (user?.badges_count || 1);
              if (unlocked) {
                const styleDef = mockBadges[i % mockBadges.length];
                return (
                  <div
                    key={i}
                    onClick={() => openModal('collections')}
                    style={{
                      aspectRatio: '1',
                      background: styleDef.rarity === 'legendary' ? 'linear-gradient(150deg,#3a2a10,#241a3d)' : '#241C3C',
                      border: `1.5px solid ${styleDef.border}`,
                      borderRadius: '16px',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      cursor: 'pointer',
                      boxShadow: `0 0 12px ${styleDef.shadow}`
                    }}
                  >
                    <span style={{ display: 'inline-flex', width: '24px', height: '24px', color: styleDef.color }}>
                      {styleDef.icon}
                    </span>
                  </div>
                );
              } else {
                return (
                  <div
                    key={i}
                    onClick={() => openModal('collections')}
                    style={{
                      aspectRatio: '1',
                      background: '#15111E',
                      border: '1.5px dashed #382C5C',
                      borderRadius: '16px',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      cursor: 'pointer'
                    }}
                  >
                    <span style={{ display: 'inline-flex', width: '20px', height: '20px', color: '#4A3D6E' }}>
                      <Lock size={18} />
                    </span>
                  </div>
                );
              }
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
