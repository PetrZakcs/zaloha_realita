import { track } from '../../lib/analytics';
import { DISCORD_INVITE_URL } from '../../lib/links';

// spec-12 §3 and §4.1: the community lives on Discord, with a direct way there from the app.
export default function CommunityBanner() {
  return (
    <a
      href={DISCORD_INVITE_URL}
      target="_blank"
      rel="noopener noreferrer"
      onClick={() => track('discord_community_clicked', { source: 'community' })}
      style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '44px', margin: '0 0 12px', padding: '8px 14px', background: 'rgba(88,101,242,.16)', border: '1px solid #5865F2', borderRadius: '12px', color: '#C7CCFF', fontFamily: 'Inter', fontWeight: 600, fontSize: '13px', textDecoration: 'none', flexShrink: 0 }}
    >
      Vstoupit do komunity na Discordu →
    </a>
  );
}
