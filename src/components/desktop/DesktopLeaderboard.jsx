import { useUserStore } from '../../store/userStore';
import { Crown } from 'lucide-react';

export default function DesktopLeaderboard() {
  const { user, leaderboard } = useUserStore();

  return (
    <div style={{
      flex: 1,
      overflow: 'hidden',
      display: 'flex',
      flexDirection: 'column',
      height: '100%',
      fontFamily: 'Inter, sans-serif'
    }}>
      {/* Sub Header / Filters */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: '16px',
        padding: '20px 28px',
        borderBottom: '1px solid #1B1430',
        flexShrink: 0
      }}>
        <div style={{ fontFamily: "'Space Grotesk', sans-serif", fontWeight: '700', fontSize: '22px', color: '#F0F0F8' }}>
          Žebříček
        </div>
        <div style={{ display: 'flex', gap: '8px', marginLeft: '8px' }}>
          <span style={{ fontFamily: 'Inter', fontWeight: '600', fontSize: '12px', color: '#fff', background: '#7C3AED', borderRadius: '20px', padding: '7px 15px', cursor: 'pointer' }}>
            Týden
          </span>
          <span style={{ fontFamily: 'Inter', fontWeight: '500', fontSize: '12px', color: '#9A9AB5', border: '0.5px solid #382C5C', borderRadius: '20px', padding: '7px 15px', cursor: 'pointer' }}>
            Sezóna
          </span>
          <span style={{ fontFamily: 'Inter', fontWeight: '500', fontSize: '12px', color: '#9A9AB5', border: '0.5px solid #382C5C', borderRadius: '20px', padding: '7px 15px', cursor: 'pointer' }}>
            V okolí
          </span>
        </div>
        <div style={{ flex: 1 }}></div>
        <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: '12px', color: '#A78BFA' }}>
          Season 0 · končí za 21 dní
        </span>
      </div>

      {/* Leaderboard content */}
      <div style={{
        flex: 1,
        overflowY: 'auto',
        padding: '24px 28px',
        display: 'flex',
        flexDirection: 'column'
      }}>
        {/* Esports podium */}
        <div style={{
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'flex-end',
          gap: '18px',
          padding: '10px 0 26px',
          flexShrink: 0
        }}>
          {/* Rank 2 (Vlk_42) */}
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px' }}>
            <span style={{
              width: '54px',
              height: '54px',
              borderRadius: '50%',
              background: '#1f2a3d',
              border: '2px solid #A78BFA',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontWeight: 'bold',
              color: '#A78BFA'
            }}>V42</span>
            <span style={{ fontFamily: 'Inter', fontWeight: '600', fontSize: '13px', color: '#F0F0F8' }}>Vlk_42</span>
            <div style={{
              width: '84px',
              height: '70px',
              background: 'linear-gradient(180deg, #241C3C, #15111E)',
              border: '0.5px solid #2A2142',
              borderRadius: '12px 12px 0 0',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center'
            }}>
              <span style={{ fontFamily: "'Space Grotesk', sans-serif", fontWeight: '700', fontSize: '24px', color: '#A78BFA' }}>2</span>
              <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: '10px', color: '#60A5FA' }}>388</span>
            </div>
          </div>

          {/* Rank 1 (Kometa) */}
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px' }}>
            <span style={{ display: 'inline-flex', width: '22px', height: '22px', color: '#F5B73F' }}><Crown size={22} fill="#F5B73F" /></span>
            <span style={{
              width: '64px',
              height: '64px',
              borderRadius: '50%',
              background: '#241C3C',
              border: '2px solid #F5B73F',
              boxShadow: '0 0 20px rgba(245,183,63,.4)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontWeight: 'bold',
              color: '#F5B73F',
              fontSize: '18px'
            }}>KO</span>
            <span style={{ fontFamily: 'Inter', fontWeight: '700', fontSize: '14px', color: '#F0F0F8' }}>Kometa</span>
            <div style={{
              width: '92px',
              height: '94px',
              background: 'linear-gradient(180deg, #2A1E10, #15111E)',
              border: '0.5px solid #F5B73F',
              borderRadius: '12px 12px 0 0',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center'
            }}>
              <span style={{ fontFamily: "'Space Grotesk', sans-serif", fontWeight: '700', fontSize: '30px', color: '#F5B73F' }}>1</span>
              <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: '11px', color: '#60A5FA' }}>412</span>
            </div>
          </div>

          {/* Rank 3 (Echo) */}
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px' }}>
            <span style={{
              width: '54px',
              height: '54px',
              borderRadius: '50%',
              background: '#1a2e24',
              border: '2px solid #22C55E',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontWeight: 'bold',
              color: '#22C55E'
            }}>EC</span>
            <span style={{ fontFamily: 'Inter', fontWeight: '600', fontSize: '13px', color: '#F0F0F8' }}>Echo</span>
            <div style={{
              width: '84px',
              height: '56px',
              background: 'linear-gradient(180deg, #1a2e24, #15111E)',
              border: '0.5px solid #2A2142',
              borderRadius: '12px 12px 0 0',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center'
            }}>
              <span style={{ fontFamily: "'Space Grotesk', sans-serif", fontWeight: '700', fontSize: '22px', color: '#22C55E' }}>3</span>
              <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: '10px', color: '#60A5FA' }}>355</span>
            </div>
          </div>
        </div>

        {/* Rows table list */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', flex: 1 }}>
          {leaderboard.slice(3).map((player, idx) => {
            const rank = idx + 4; // Starts at index 3 -> rank 4
            const isSelf = player.name === user?.name;

            return (
              <div 
                key={player.id} 
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '14px',
                  background: isSelf ? '#241C3C' : '#15111E',
                  border: isSelf ? '1px solid #7C3AED' : '0.5px solid #2A2142',
                  borderRadius: '14px',
                  padding: '11px 16px',
                  boxShadow: isSelf ? '0 0 14px rgba(124,58,237,.2)' : 'none'
                }}
              >
                <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: '13px', color: isSelf ? '#A78BFA' : '#6B6B8A', width: '22px' }}>
                  {rank}
                </span>
                <span style={{
                  width: '32px',
                  height: '32px',
                  borderRadius: '50%',
                  background: isSelf ? '#15111E' : '#241C3C',
                  border: `1.5px solid ${isSelf ? '#A78BFA' : '#7C3AED'}`,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontFamily: "'Space Grotesk', sans-serif",
                  fontWeight: '700',
                  fontSize: '12px',
                  color: '#A78BFA',
                  flexShrink: 0
                }}>
                  {player.name.slice(0, 2).toUpperCase()}
                </span>
                <span style={{ flex: 1, fontFamily: 'Inter', fontWeight: isSelf ? '700' : '500', fontSize: '14px', color: '#F0F0F8' }}>
                  {player.name} {isSelf && <span style={{ fontWeight: '500', fontSize: '11px', color: '#A78BFA' }}>· ty</span>}
                </span>
                <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: '13px', color: isSelf ? '#fff' : '#60A5FA' }}>
                  {isSelf ? user?.xp : player.xp} XP
                </span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
