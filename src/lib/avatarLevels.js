// MVP1 spec-21 §6 "AVATAR PROGRESSION" — level 0 = NPC, levels 1–7 = uzel 1–7, each "vidět
// okamžitě". profiles.avatar_level (mapped client-side as user.badges_count) is capped at 7 by
// complete_challenge(). No custom art assets exist yet, so this expresses progression through
// color + glow intensity + border weight, on the same avatar every screen already renders.
export const AVATAR_LEVELS = [
  { level: 0, name: 'NPC', color: '#6B6B8A', border: '#3A3A55', glow: 0, borderWidth: 1 },
  { level: 1, name: 'Pozorovatel', color: '#9A9AB5', border: '#7C3AED', glow: 8, borderWidth: 1.5 },
  { level: 2, name: 'Hráč', color: '#A78BFA', border: '#7C3AED', glow: 14, borderWidth: 2, emblem: 'leaf' },
  { level: 3, name: 'Strážce', color: '#A78BFA', border: '#7C3AED', glow: 22, borderWidth: 2.5, emblem: 'sparkles' },
  { level: 4, name: 'Architekt', color: '#F5B73F', border: '#F5B73F', glow: 28, borderWidth: 3, emblem: 'shield' },
  { level: 5, name: 'Probuzený Hráč', color: '#F5B73F', border: '#F5B73F', glow: 38, borderWidth: 3, emblem: 'eye' },
  { level: 6, name: 'Strůjce', color: '#22C55E', border: '#22C55E', glow: 42, borderWidth: 3.5, emblem: 'sun' },
  { level: 7, name: 'Nositel Světla', color: '#FFFFFF', border: '#F5B73F', glow: 52, borderWidth: 4, emblem: 'crown' }
];

export function getAvatarLevel(level) {
  const idx = Math.max(0, Math.min(AVATAR_LEVELS.length - 1, level ?? 0));
  return AVATAR_LEVELS[idx];
}
