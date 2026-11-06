import { useState } from 'react';
import { Share2, Check } from 'lucide-react';
import { useUserStore } from '../../store/userStore';
import { buildReferralLink } from '../../lib/share';
import { renderShareCard, shareCardImage } from '../../lib/shareCard';
import { track } from '../../lib/analytics';

// Share moment (spec-15 "po každém questu share moment · za sdílení +1 klíč navíc (hráč musí
// vědět) · není povinné · 1 klik"). Shares an image card with the player's referral link and,
// if a reward source is given, claims the one-time +1 key / +5 XP.
export default function ShareMomentButton({
  variant = 'proof',
  rewardSource = null, // { type: 'challenge' | 'onboarding' | 'season', id }
  questId = null,      // contextual link: the receiver lands on this quest (Viral "DEEP LINK")
  progressText,
  sentence,
  label = 'Sdílej svůj pokrok',
  style = {},
}) {
  const { user, claimShareReward, playerProgress } = useUserStore();
  const [state, setState] = useState('idle'); // idle | working | rewarded | shared

  const onClick = async () => {
    setState('working');
    track('share_started', { share_type: variant, quest_id: questId });
    const link = buildReferralLink(user?.referralCode, { questId, shareType: variant });
    const blob = await renderShareCard({
      variant,
      name: user?.name,
      statusTitle: user?.onboardingCompleted === false ? 'NPC' : (playerProgress?.lifetime_title || null),
      progressText,
      sentence,
      founder: !!user?.passHolder,
      avatarUrl: user?.avatarUrl || null,
      link,
    });
    const result = blob
      ? await shareCardImage({ blob, title: 'Hra Reality', text: `${user?.name || 'Hráč'} hraje Hru Reality. Zkus taky:`, url: link, source: variant })
      : { shared: false };
    if (!result.shared) { setState('idle'); return; }
    const granted = rewardSource ? await claimShareReward(rewardSource.type, rewardSource.id) : false;
    setState(granted ? 'rewarded' : 'shared');
  };

  const done = state === 'rewarded' || state === 'shared';
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={state === 'working' || done}
      style={{
        width: '100%', height: '44px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px',
        background: done ? 'rgba(34,197,94,.12)' : 'transparent', color: done ? '#22C55E' : '#A78BFA',
        border: `1.5px solid ${done ? '#22C55E' : '#7C3AED'}`, borderRadius: '14px',
        fontFamily: 'Inter', fontWeight: 700, fontSize: '14px', cursor: done ? 'default' : 'pointer', ...style
      }}
    >
      {state === 'working' && 'Připravuji kartu…'}
      {state === 'idle' && <><Share2 size={16} /> {label}{rewardSource ? ' · +1 klíč' : ''}</>}
      {state === 'rewarded' && <><Check size={16} /> Sdíleno · +1 klíč a +5 XP</>}
      {state === 'shared' && <><Check size={16} /> Sdíleno</>}
    </button>
  );
}
