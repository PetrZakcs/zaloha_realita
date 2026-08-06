import { useUserStore } from '../../store/userStore';
import { Settings as SettingsIcon, Shield, Flame, Leaf, Zap, Lock, Sparkles, ChevronRight } from 'lucide-react';
import HraPassCard from '../common/HraPassCard';

export default function MobileProfile() {
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
      overflowY: 'auto',
      background: '#15111E',
      backgroundImage: 'radial-gradient(circle at 50% 0%, rgba(167, 139, 250, 0.16), transparent 42%)',
      fontFamily: 'Inter, sans-serif'
    }}>
      <div style={{ display: 'flex', flexDirection: 'column' }}>
        {/* Profile Card Header */}
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '14px 24px 0', position: 'relative' }}>
          <span 
            onClick={() => openModal('settings')}
            style={{ position: 'absolute', right: '20px', top: '12px', display: 'inline-flex', width: '22px', height: '22px', color: '#6B6B8A', cursor: 'pointer' }}
          >
            <SettingsIcon size={20} />
          </span>

          {/* Avatar with conic progress ring */}
          <div style={{ position: 'relative', width: '96px', height: '96px', display: 'flex', alignItems: 'center', justifycontent: 'center', justifyContent: 'center' }}>
            <svg viewBox="0 0 96 96" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', transform: 'rotate(-90deg)' }}>
              <circle cx="48" cy="48" r="44" fill="none" stroke="#2A2142" strokeWidth="4"></circle>
              <circle cx="48" cy="48" r="44" fill="none" stroke="#7C3AED" strokeWidth="4" strokeLinecap="round" strokeDasharray="276.5" strokeDashoffset="180"></circle>
            </svg>
            <span style={{
              width: '78px',
              height: '78px',
              borderRadius: '50%',
              background: '#241C3C',
              border: '2px solid #7C3AED',
              boxShadow: '0 0 18px rgba(124,58,237,.35)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontFamily: "'Space Grotesk', sans-serif",
              fontWeight: '700',
              fontSize: '26px',
              color: '#A78BFA'
            }}>
              {(user?.name || 'TP').slice(0, 2).toUpperCase()}
            </span>
            {/* Pinned Showcase Badge Pin */}
            <span style={{
              position: 'absolute',
              bottom: '-2px',
              right: '-2px',
              width: '28px',
              height: '28px',
              borderRadius: '50%',
              background: '#2A1E10',
              border: '2px solid #F5B73F',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              boxShadow: '0 0 10px rgba(245,183,63,.5)'
            }}>
              <span style={{ display: 'inline-flex', width: '13px', height: '13px', color: '#F5B73F' }}><Flame size={12} /></span>
            </span>
          </div>

          <div style={{ fontFamily: "'Space Grotesk', sans-serif", fontWeight: '700', fontSize: '20px', marginTop: '14px', color: '#F0F0F8' }}>
            {user?.name || 'TemnýPozorovatel'}
          </div>
          
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '6px' }}>
            <span style={{ fontFamily: 'Inter', fontWeight: '600', fontSize: '11px', color: '#A78BFA', background: '#241C3C', border: '0.5px solid #7C3AED', borderRadius: '20px', padding: '4px 11px' }}>
              {user?.rarity || 'Rare'}
            </span>
            <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: '11px', color: '#60A5FA' }}>
              {user?.xp || 240} XP
            </span>
          </div>
        </div>

        {/* Profile Pledge */}
        <div style={{ padding: '16px 24px 0' }}>
          <div style={{ borderLeft: '2px solid #7C3AED', paddingLeft: '12px' }}>
            <span style={{ fontFamily: 'Inter', fontStyle: 'italic', fontSize: '13px', color: '#9A9AB5', lineHeight: '1.5' }}>
              „{user?.pledge || 'Jsem člověk, co přestal čekat a začal jednat.'}“
            </span>
          </div>
        </div>

        {/* RPG Stats Grid (2 rows x 3 columns) */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '9px', padding: '16px 24px 0' }}>
          <div style={{ background: '#241C3C', border: '0.5px solid #382C5C', borderRadius: '16px', padding: '11px', textAlign: 'center' }}>
            <div style={{ fontFamily: "'Space Grotesk', sans-serif", fontWeight: '700', fontSize: '19px', color: '#F5B73F' }}>{user?.keys_count || 7}</div>
            <div style={{ fontFamily: 'Inter', fontSize: '9px', color: '#6B6B8A', marginTop: '2px' }}>klíčů</div>
          </div>
          <div style={{ background: '#241C3C', border: '0.5px solid #382C5C', borderRadius: '16px', padding: '11px', textAlign: 'center' }}>
            <div style={{ fontFamily: "'Space Grotesk', sans-serif", fontWeight: '700', fontSize: '19px', color: '#4AA8FF' }}>{user?.xp || 240}</div>
            <div style={{ fontFamily: 'Inter', fontSize: '9px', color: '#6B6B8A', marginTop: '2px' }}>XP</div>
          </div>
          <div style={{ background: '#241C3C', border: '0.5px solid #382C5C', borderRadius: '16px', padding: '11px', textAlign: 'center' }}>
            <div style={{ fontFamily: "'Space Grotesk', sans-serif", fontWeight: '700', fontSize: '19px', color: '#F5B73F' }}>{user?.streak || 5}</div>
            <div style={{ fontFamily: 'Inter', fontSize: '9px', color: '#6B6B8A', marginTop: '2px' }}>dní v řadě</div>
          </div>
          <div style={{ background: '#241C3C', border: '0.5px solid #382C5C', borderRadius: '16px', padding: '11px', textAlign: 'center' }}>
            <div style={{ fontFamily: "'Space Grotesk', sans-serif", fontWeight: '700', fontSize: '19px', color: '#22C55E' }}>12</div>
            <div style={{ fontFamily: 'Inter', fontSize: '9px', color: '#6B6B8A', marginTop: '2px' }}>výzev</div>
          </div>
          <div style={{ background: '#241C3C', border: '0.5px solid #382C5C', borderRadius: '16px', padding: '11px', textAlign: 'center' }}>
            <div style={{ fontFamily: "'Space Grotesk', sans-serif", fontWeight: '700', fontSize: '19px', color: '#A78BFA' }}>3</div>
            <div style={{ fontFamily: 'Inter', fontSize: '9px', color: '#6B6B8A', marginTop: '2px' }}>artefakty</div>
          </div>
          <div style={{ background: '#241C3C', border: '0.5px solid #382C5C', borderRadius: '16px', padding: '11px', textAlign: 'center' }}>
            <div style={{ fontFamily: "'Space Grotesk', sans-serif", fontWeight: '700', fontSize: '19px', color: '#22C55E' }}>12</div>
            <div style={{ fontFamily: 'Inter', fontSize: '9px', color: '#6B6B8A', marginTop: '2px' }}>zásahy</div>
          </div>
        </div>

        {/* HRA PASS Banner */}
        <div style={{ padding: '16px 24px 0' }}>
          <HraPassCard compact />
        </div>

        {/* Badges Grid */}
        <div style={{ padding: '20px 24px 0' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
            <span style={{ fontFamily: 'Inter', fontWeight: '600', fontSize: '10px', letterSpacing: '.12em', textTransform: 'uppercase', color: '#6B6B8A' }}>
              Odznaky
            </span>
            <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: '10px', color: '#A78BFA' }}>
              {user?.badges_count || 4} / 16 · {Math.round(((user?.badges_count || 4) / 16) * 100)} %
            </span>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '10px' }}>
            {/* Unlocked Badges */}
            {[...Array(16)].map((_, i) => {
              const unlocked = i < (user?.badges_count || 4);
              if (unlocked) {
                // Map style from mock list
                const styleDef = mockBadges[i % mockBadges.length];
                return (
                  <div
                    key={i}
                    onClick={() => openModal('collections')}
                    style={{
                      aspectRatio: '1',
                      background: styleDef.rarity === 'legendary' ? 'linear-gradient(150deg,#3a2a10,#241a3d)' : '#241a3d',
                      border: `1.5px solid ${styleDef.border}`,
                      borderRadius: '16px',
                      boxShadow: `0 0 12px ${styleDef.shadow}`,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      cursor: 'pointer'
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
                      background: '#1A142C',
                      border: '1.5px dashed #382C5C',
                      borderRadius: '16px',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      cursor: 'pointer'
                    }}
                  >
                    <span style={{ display: 'inline-flex', width: '20px', height: '20px', color: '#3a3a55' }}>
                      <Lock size={18} />
                    </span>
                  </div>
                );
              }
            })}
          </div>

          {/* Collections Link */}
          <div 
            onClick={() => openModal('collections')}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '11px',
              marginTop: '14px',
              background: '#1C1630',
              border: '0.5px solid #382C5C',
              borderRadius: '16px',
              padding: '12px 14px',
              cursor: 'pointer'
            }}
          >
            <span style={{
              width: '32px',
              height: '32px',
              borderRadius: '9px',
              background: '#241C3C',
              border: '0.5px solid #7C3AED',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0
            }}>
              <span style={{ display: 'inline-flex', width: '16px', height: '16px', color: '#A78BFA' }}><Sparkles size={16} /></span>
            </span>
            <div style={{ flex: 1 }}>
              <div style={{ fontFamily: 'Inter', fontWeight: '600', fontSize: '12px', color: '#F0F0F8' }}>Moje sbírky</div>
              <div style={{ fontFamily: 'Inter', fontSize: '10px', color: '#6B6B8A', marginTop: '1px' }}>Odznaky, artefakty a rarity album</div>
            </div>
            <span style={{ display: 'inline-flex', width: '16px', height: '16px', color: '#6B6B8A' }}><ChevronRight size={16} /></span>
          </div>
        </div>
      </div>
    </div>
  );
}
