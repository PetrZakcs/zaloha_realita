import { useUserStore } from '../../store/userStore';
import { Crown, TrendingUp } from 'lucide-react';

export default function MobileLeaderboard() {
  const { user, leaderboard } = useUserStore();

  return (
    <div style={{
      flex: 1,
      overflowY: 'auto',
      background: '#15111E',
      backgroundImage: 'radial-gradient(circle at 50% 0%, rgba(245, 183, 63, 0.14), transparent 42%)',
      padding: '0 20px 24px',
      display: 'flex',
      flexDirection: 'column',
      gap: '14px',
      fontFamily: 'Inter, sans-serif'
    }}>
      {/* Top Header */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '8px 0 12px',
        flexShrink: 0
      }}>
        <span style={{ fontFamily: "'Space Grotesk', sans-serif", fontWeight: '700', fontSize: '20px', color: '#F0F0F8' }}>
          Žebříček
        </span>
        <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: '11px', color: '#A78BFA' }}>
          Season 0
        </span>
      </div>

      {/* Leaderboard Tabs */}
      <div style={{ display: 'flex', gap: '8px', paddingBottom: '4px', flexShrink: 0 }}>
        <span style={{ fontFamily: 'Inter', fontWeight: '600', fontSize: '12px', color: '#fff', background: '#7C3AED', borderRadius: '20px', padding: '6px 14px', cursor: 'pointer' }}>
          Týden
        </span>
        <span style={{ fontFamily: 'Inter', fontWeight: '500', fontSize: '12px', color: '#6B6B8A', border: '0.5px solid #382C5C', borderRadius: '20px', padding: '6px 14px', cursor: 'pointer' }}>
          Sezóna
        </span>
        <span style={{ fontFamily: 'Inter', fontWeight: '500', fontSize: '12px', color: '#6B6B8A', border: '0.5px solid #382C5C', borderRadius: '20px', padding: '6px 14px', cursor: 'pointer' }}>
          V okolí
        </span>
      </div>

      {/* Podium Block */}
      <div style={{
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'flex-end',
        gap: '12px',
        padding: '8px 0 20px',
        flexShrink: 0
      }}>
        {/* Slot 2 (Vlk_42) */}
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '7px' }}>
          <span style={{
            width: '58px',
            height: '58px',
            borderRadius: '50%',
            background: '#1f2a3d',
            border: '2.5px solid #A78BFA',
            boxShadow: '0 0 14px rgba(167,139,250,.35)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontWeight: 'bold',
            color: '#A78BFA'
          }}>V42</span>
          <span style={{ fontFamily: 'Inter', fontWeight: '600', fontSize: '12px', color: '#F0F0F8' }}>Vlk_42</span>
          <div style={{
            width: '70px',
            height: '56px',
            background: 'linear-gradient(180deg, #241a3d, #241C3C)',
            border: '0.5px solid #382C5C',
            borderRadius: '10px 10px 0 0',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center'
          }}>
            <span style={{ fontFamily: "'Space Grotesk', sans-serif", fontWeight: '700', fontSize: '22px', color: '#A78BFA' }}>2</span>
          </div>
        </div>

        {/* Slot 1 (Kometa) */}
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '7px' }}>
          <span style={{ display: 'inline-flex', width: '22px', height: '22px', color: '#F5B73F', filter: 'drop-shadow(0 0 8px rgba(245,183,63,.7))' }}>
            <Crown size={22} fill="#F5B73F" />
          </span>
          <span style={{
            width: '70px',
            height: '70px',
            borderRadius: '50%',
            background: '#241a3d',
            border: '3px solid #F5B73F',
            boxShadow: '0 0 24px rgba(245,183,63,.55)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontWeight: 'bold',
            color: '#F5B73F',
            fontSize: '18px'
          }}>KO</span>
          <span style={{ fontFamily: 'Inter', fontWeight: '700', fontSize: '13px', color: '#F0F0F8' }}>Kometa</span>
          <div style={{
            width: '78px',
            height: '80px',
            background: 'linear-gradient(180deg, #3a2a1a, #241C3C)',
            border: '1px solid #F5B73F',
            boxShadow: '0 0 8px rgba(245,183,63,.3)',
            borderRadius: '10px 10px 0 0',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center'
          }}>
            <span style={{ fontFamily: "'Space Grotesk', sans-serif", fontWeight: '700', fontSize: '28px', color: '#F5B73F' }}>1</span>
          </div>
        </div>

        {/* Slot 3 (Echo) */}
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '7px' }}>
          <span style={{
            width: '58px',
            height: '58px',
            borderRadius: '50%',
            background: '#1a2e24',
            border: '2.5px solid #22C55E',
            boxShadow: '0 0 14px rgba(34,197,94,.35)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontWeight: 'bold',
            color: '#22C55E'
          }}>EC</span>
          <span style={{ fontFamily: 'Inter', fontWeight: '600', fontSize: '12px', color: '#F0F0F8' }}>Echo</span>
          <div style={{
            width: '70px',
            height: '44px',
            background: 'linear-gradient(180deg, #1a2e24, #241C3C)',
            border: '0.5px solid #382C5C',
            borderRadius: '10px 10px 0 0',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center'
          }}>
            <span style={{ fontFamily: "'Space Grotesk', sans-serif", fontWeight: '700', fontSize: '22px', color: '#22C55E' }}>3</span>
          </div>
        </div>
      </div>

      {/* List ranks */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
        {leaderboard.slice(4).map((player, index) => {
          const rank = index + 5; // Starts at index 4 -> rank 5
          const isSelf = player.name === user?.name;

          return (
            <div 
              key={player.id} 
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '12px',
                background: isSelf ? '#241a3d' : '#241C3C',
                border: isSelf ? '1px solid #7C3AED' : 'none',
                borderRadius: '14px',
                padding: '10px 14px',
                boxShadow: isSelf ? '0 0 18px rgba(124,58,237,.3)' : 'none'
              }}
            >
              <span style={{
                fontFamily: "'JetBrains Mono', monospace",
                fontSize: '13px',
                color: isSelf ? '#A78BFA' : '#6B6B8A',
                width: '20px'
              }}>
                {rank}
              </span>
              <span style={{
                width: '30px',
                height: '30px',
                borderRadius: '50%',
                background: isSelf ? '#241C3C' : '#1f2a3d',
                border: `1.5px solid ${isSelf ? '#A78BFA' : '#7C3AED'}`,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '11px',
                fontWeight: 'bold',
                color: isSelf ? '#A78BFA' : '#7C3AED'
              }}>
                {player.name.slice(0, 2).toUpperCase()}
              </span>
              <span style={{
                flex: 1,
                fontFamily: 'Inter',
                fontWeight: isSelf ? '700' : '500',
                fontSize: '13px',
                color: '#F0F0F8'
              }}>
                {player.name} {isSelf && <span style={{ fontFamily: 'Inter', fontWeight: '500', fontSize: '10px', color: '#A78BFA' }}>· ty</span>}
              </span>
              <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: '12px', color: isSelf ? '#fff' : '#60A5FA' }}>
                {isSelf ? user?.xp : player.xp} XP
              </span>
            </div>
          );
        })}

        {/* Near-miss Motivator Banner */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px', padding: '2px 0 4px' }}>
          <span style={{ display: 'inline-flex', width: '12px', height: '12px', color: '#4AA8FF' }}><TrendingUp size={12} /></span>
          <span style={{ fontFamily: 'Inter', fontSize: '11px', color: '#6B6B8A' }}>
            Ještě <span style={{ color: '#4AA8FF', fontWeight: '600' }}>+14 XP</span> a budeš 6.
          </span>
        </div>
      </div>
    </div>
  );
}
