import { VenetianMask } from 'lucide-react';
import { getAvatarLevel } from '../../lib/avatarLevels';
import { findFrame } from '../../lib/frames';

// One avatar for every surface: optional photo (spec-14), equipped frame (spec-12 §2.4),
// level styling (spec-21 §6) and the grey NPC look for players who skipped onboarding.
// auraColor / maskTitle: equipped identity (Game Bible · Identity "AURA", "MASK"). Interim
// visual until the Art Bible assets exist: aura = soft outer glow, mask = small marker.
export default function PlayerAvatar({ name, avatarUrl, level = 1, frameKey = null, npc = false, size = 64, onClick, auraColor = null, maskTitle = null }) {
  const lvl = getAvatarLevel(npc ? 0 : level);
  const frame = findFrame(frameKey);
  const border = frame ? frame.border : lvl.border;
  const glow = frame ? frame.glow : lvl.glow;
  const width = frame ? frame.width : lvl.borderWidth;
  const initials = (name || 'H').slice(0, 2).toUpperCase();

  const avatar = (
    <span
      onClick={onClick}
      title={npc ? 'NPC — onboarding nedokončen' : lvl.name}
      style={{
        width: `${size}px`, height: `${size}px`, borderRadius: '50%', flexShrink: 0,
        background: avatarUrl ? `center / cover no-repeat url(${avatarUrl})` : '#241C3C',
        border: `${width}px solid ${border}`,
        boxShadow: [
          glow && !npc ? `0 0 ${glow}px ${border}66` : null,
          auraColor && !npc ? `0 0 0 ${Math.max(2, Math.round(size / 16))}px ${auraColor}55, 0 0 ${Math.round(size / 2.5)}px ${auraColor}88` : null,
        ].filter(Boolean).join(', ') || 'none',
        filter: npc ? 'grayscale(1)' : 'none', opacity: npc ? 0.6 : 1,
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
        fontFamily: "'Space Grotesk', sans-serif", fontWeight: 700, fontSize: `${Math.round(size * 0.32)}px`,
        color: lvl.color, cursor: onClick ? 'pointer' : 'default'
      }}
    >
      {!avatarUrl && initials}
    </span>
  );

  if (!maskTitle || npc) return avatar;
  const badge = Math.max(14, Math.round(size * 0.36));
  return (
    <span style={{ position: 'relative', display: 'inline-flex', flexShrink: 0 }} title={`Maska: ${maskTitle}`}>
      {avatar}
      <span aria-label={`Maska: ${maskTitle}`} style={{
        position: 'absolute', right: -2, bottom: -2, width: `${badge}px`, height: `${badge}px`, borderRadius: '50%',
        background: '#15111E', border: '1px solid #A78BFA', color: '#A78BFA',
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center'
      }}>
        <VenetianMask size={Math.round(badge * 0.62)} />
      </span>
    </span>
  );
}
