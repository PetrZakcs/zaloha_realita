import { useUserStore } from '../../store/userStore';
import { Settings as SettingsIcon, Shield, Flame, Leaf, Zap, Lock, Pencil } from 'lucide-react';

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
      {/* Banner background graphic */}
      <div style={{
        height: '120px',
        background: 'linear-gradient(120deg,#2A1F4A,#15111E)',
        position: 'relative',
        flexShrink: 0,
        backgroundImage: 'radial-gradient(circle at 80% 30%,rgba(124,58,237,.4),transparent 50%)'
      }}>
        <span 
          onClick={() => openModal('settings')}
          style={{ position: 'absolute', top: '14px', right: '18px', display: 'inline-flex', width: '20px', height: '20px', color: '#9A9AB5', cursor: 'pointer' }}
        >
          <SettingsIcon size={20} />
        </span>
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: '0 28px 24px', display: 'flex', flexDirection: 'column' }}>
        {/* Avatar + name row */}
        <div style={{ display: 'flex', alignItems: 'flex-end', gap: '18px', marginTop: '-40px' }}>
          <span style={{
            width: '96px',
            height: '96px',
            borderRadius: '28px',
            background: '#241C3C',
            border: '3px solid #15111E',
            boxShadow: '0 0 0 1px #7C3AED',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontFamily: "'Space Grotesk', sans-serif",
            fontWeight: '700',
            fontSize: '34px',
            color: '#A78BFA',
            flexShrink: 0
          }}>
            {(user?.name || 'TP').slice(0, 2).toUpperCase()}
          </span>
          <div style={{ flex: 1, paddingBottom: '6px' }}>
            <div style={{ fontFamily: "'Space Grotesk', sans-serif", fontWeight: '700', fontSize: '24px', color: '#F0F0F8' }}>
              {user?.name || 'TemnýPozorovatel'}
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '6px' }}>
              <span style={{ fontFamily: 'Inter', fontWeight: '600', fontSize: '11px', color: '#A78BFA', background: '#241C3C', border: '0.5px solid #7C3AED', borderRadius: '20px', padding: '3px 11px' }}>
                {user?.rarity || 'Doer'}
              </span>
              <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: '11px', color: '#60A5FA' }}>
                {user?.xp || 240} XP
              </span>
            </div>
          </div>
          <button 
            onClick={() => openModal('nickname')}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '7px',
              height: '40px',
              padding: '0 16px',
              background: 'transparent',
              color: '#A78BFA',
              fontFamily: 'Inter',
              fontWeight: '600',
              fontSize: '13px',
              border: '1px solid #382C5C',
              borderRadius: '14px',
              cursor: 'pointer'
            }}
          >
            <span style={{ display: 'inline-flex', width: '15px', height: '15px' }}><Pencil size={15} /></span>
            Upravit profil
          </button>
        </div>

        {/* User pledge quote */}
        <div style={{ borderLeft: '2px solid #7C3AED', paddingLeft: '14px', marginTop: '20px' }}>
          <span style={{ fontFamily: 'Inter', fontStyle: 'italic', fontSize: '14px', color: '#9A9AB5', lineHeight: '1.5' }}>
            „{user?.pledge || 'Jsem člověk, co přestal čekat a začal jednat.'}“
          </span>
        </div>

        {/* Stats row */}
        <div style={{ display: 'flex', gap: '14px', marginTop: '22px', flexShrink: 0 }}>
          <div style={{ flex: 1, background: '#15111E', border: '0.5px solid #2A2142', borderRadius: '16px', padding: '16px', textAlign: 'center' }}>
            <div style={{ fontFamily: "'Space Grotesk', sans-serif", fontWeight: '700', fontSize: '26px', color: '#F5B73F' }}>{user?.keys_count || 7}</div>
            <div style={{ fontFamily: 'Inter', fontSize: '11px', color: '#6B6B8A', marginTop: '3px' }}>klíčů</div>
          </div>
          <div style={{ flex: 1, background: '#15111E', border: '0.5px solid #2A2142', borderRadius: '16px', padding: '16px', textAlign: 'center' }}>
            <div style={{ fontFamily: "'Space Grotesk', sans-serif", fontWeight: '700', fontSize: '26px', color: '#F5B73F' }}>{user?.streak || 5}</div>
            <div style={{ fontFamily: 'Inter', fontSize: '11px', color: '#6B6B8A', marginTop: '3px' }}>dní v řadě</div>
          </div>
          <div style={{ flex: 1, background: '#15111E', border: '0.5px solid #2A2142', borderRadius: '16px', padding: '16px', textAlign: 'center' }}>
            <div style={{ fontFamily: "'Space Grotesk', sans-serif", fontWeight: '700', fontSize: '26px', color: '#22C55E' }}>12</div>
            <div style={{ fontFamily: 'Inter', fontSize: '11px', color: '#6B6B8A', marginTop: '3px' }}>výzev</div>
          </div>
          <div style={{ flex: 1, background: '#15111E', border: '0.5px solid #2A2142', borderRadius: '16px', padding: '16px', textAlign: 'center' }}>
            <div style={{ fontFamily: "'Space Grotesk', sans-serif", fontWeight: '700', fontSize: '26px', color: '#60A5FA' }}>#7</div>
            <div style={{ fontFamily: 'Inter', fontSize: '11px', color: '#6B6B8A', marginTop: '3px' }}>v žebříčku</div>
          </div>
        </div>

        {/* Badges Grid (16 slots, first ones colored by rarity/glow, remainder locked) */}
        <div style={{ marginTop: '22px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
            <span style={{ fontFamily: 'Inter', fontWeight: '600', fontSize: '11px', letterSpacing: '.12em', textTransform: 'uppercase', color: '#6B6B8A' }}>
              Odznaky · {user?.badges_count || 4} / 16
            </span>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(8, 1fr)', gap: '12px' }}>
            {[...Array(16)].map((_, i) => {
              const unlocked = i < (user?.badges_count || 4);
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
                      borderRadius: '14px',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      cursor: 'pointer',
                      boxShadow: `0 0 10px ${styleDef.shadow}`
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
                      borderRadius: '14px',
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
