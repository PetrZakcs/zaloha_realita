import { Crown, KeyRound, Zap } from 'lucide-react';
import { useUserStore } from '../../store/userStore';
import { track } from '../../lib/analytics';

// spec-17 §6: core text of a proof card is one short sentence, max 90 characters.
export const CORE_TEXT_LIMIT = 90;
export function clampCoreText(text) {
  const value = (text || '').trim();
  return value.length > CORE_TEXT_LIMIT ? `${value.slice(0, CORE_TEXT_LIMIT - 1).trimEnd()}…` : value;
}

// spec-17 §6 "Reward row" + "v jakém tématu": what the proof earned and how far along it is.
// A feed card is always a public proof, so the key reward applies.
export function ProofRewardRow({ post, totalNodes }) {
  if (post.type !== 'PROOF' || post.reward_xp == null) return null;
  const chip = { display: 'inline-flex', alignItems: 'center', gap: '3px', fontFamily: 'Inter', fontWeight: 600, fontSize: '11px' };
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '10px', marginTop: '8px' }}>
      <span style={{ ...chip, color: '#4AA8FF' }}><Zap size={11} /> +{post.reward_xp} XP</span>
      {post.reward_keys > 0 && <span style={{ ...chip, color: '#F5B73F' }}><KeyRound size={11} /> +{post.reward_keys}</span>}
      {post.challenge_node_order != null && <span style={{ ...chip, color: '#22C55E' }}>{post.challenge_node_order}/{totalNodes}</span>}
      {post.theme_name && <span style={{ ...chip, color: '#6B6B8A', fontWeight: 500 }}>{post.theme_name}</span>}
    </div>
  );
}

// spec-20 §E "👑 Featured Proof" — the visible part of the Pass proof boost.
export function FeaturedProofTag({ post }) {
  if (post.type !== 'PROOF' || !post.author_pass_holder) return null;
  return (
    <div style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', fontFamily: 'Inter', fontWeight: 700, fontSize: '10px', letterSpacing: '.04em', color: '#F5B73F', marginBottom: '6px' }}>
      <Crown size={11} /> Featured Proof
    </div>
  );
}

// spec-19 §4 "Chceš, aby byl tvůj důkaz zvýrazněný?" Only under the player's own plain proofs:
// spec-17 §15 warns against too many purchase CTAs in the feed.
export function HighlightNudge({ post }) {
  const { user, openModal } = useUserStore();
  if (post.type !== 'PROOF' || post.author_pass_holder || user?.passHolder || post.user_id !== user?.id) return null;
  return (
    <button
      type="button"
      onClick={(e) => { e.stopPropagation(); track('paywall_opened', { source: 'feed_highlight_nudge' }); openModal('paywall'); }}
      style={{ display: 'block', background: 'none', border: 'none', padding: 0, marginTop: '10px', fontFamily: 'Inter', fontSize: '11px', color: '#F5B73F', cursor: 'pointer', textAlign: 'left' }}
    >
      Chceš, aby byl tvůj důkaz zvýrazněný? →
    </button>
  );
}
