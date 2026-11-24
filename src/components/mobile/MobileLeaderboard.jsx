import CommunityBanner from '../common/CommunityBanner';
import LeaderboardBoard from '../common/LeaderboardBoard';

export default function MobileLeaderboard() {
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
        padding: '8px 0 4px',
        flexShrink: 0
      }}>
        <span style={{ fontFamily: "'Space Grotesk', sans-serif", fontWeight: '700', fontSize: '20px', color: '#F0F0F8' }}>
          Komunita
        </span>
        <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: '11px', color: '#A78BFA' }}>
          Season 0
        </span>
      </div>

      <div style={{ padding: '0 16px' }}><CommunityBanner /></div>
      <LeaderboardBoard compact />
    </div>
  );
}
