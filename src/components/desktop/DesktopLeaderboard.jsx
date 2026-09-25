import LeaderboardBoard from '../common/LeaderboardBoard';

export default function DesktopLeaderboard() {
  return (
    <div style={{
      flex: 1,
      overflow: 'hidden',
      display: 'flex',
      flexDirection: 'column',
      height: '100%',
      fontFamily: 'Inter, sans-serif'
    }}>
      {/* Sub Header */}
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
        <div style={{ flex: 1 }}></div>
        <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: '12px', color: '#A78BFA' }}>
          Season 0
        </span>
      </div>

      {/* Leaderboard content */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '24px 28px' }}>
        <div style={{ maxWidth: '640px', margin: '0 auto' }}>
          <LeaderboardBoard />
        </div>
      </div>
    </div>
  );
}
