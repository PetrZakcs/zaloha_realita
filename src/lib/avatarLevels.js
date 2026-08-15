// MVP1 spec-10 §6 "AVATAR PROGRESSION" — 6 named levels (0–5) that must be "vidět okamžitě".
// profiles.avatar_level (mapped client-side as user.badges_count) already ranges exactly
// 0–5 — complete_challenge() caps it at 5 — so the number this maps from already existed;
// only the visual/name mapping itself was missing. No custom art assets exist yet, so this
// expresses progression through color + glow intensity + border weight instead, on the same
// initials-in-a-circle avatar every screen already renders.
export const AVATAR_LEVELS = [
  { level: 0, name: 'NPC', color: '#6B6B8A', border: '#3A3A55', glow: 0, borderWidth: 1 },
  { level: 1, name: 'Pozorovatel', color: '#9A9AB5', border: '#7C3AED', glow: 8, borderWidth: 1.5 },
  { level: 2, name: 'Hráč', color: '#A78BFA', border: '#7C3AED', glow: 14, borderWidth: 2 },
  { level: 3, name: 'Strážce', color: '#A78BFA', border: '#7C3AED', glow: 22, borderWidth: 2.5 },
  { level: 4, name: 'Architekt', color: '#F5B73F', border: '#F5B73F', glow: 28, borderWidth: 3 },
  { level: 5, name: 'Probuzený Hráč', color: '#F5B73F', border: '#F5B73F', glow: 38, borderWidth: 3 }
];

export function getAvatarLevel(level) {
  const idx = Math.max(0, Math.min(AVATAR_LEVELS.length - 1, level ?? 0));
  return AVATAR_LEVELS[idx];
}
