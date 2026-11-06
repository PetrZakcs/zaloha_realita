// spec-12 §2.4 "avatar (default + 3–5 odemykatelných rámečků)" + spec-20 Founder frame.
// Unlock rules mirror set_active_frame() (avatar level ≥ n; Founder needs an active Pass).
// Interim styling until the Art Bible frame assets exist.
export const FRAMES = [
  { key: 'frame-1', label: 'Rámeček I', requiredLevel: 1, border: '#9A9AB5', glow: 6, width: 2 },
  { key: 'frame-2', label: 'Rámeček II', requiredLevel: 2, border: '#4AA8FF', glow: 12, width: 2.5 },
  { key: 'frame-3', label: 'Rámeček III', requiredLevel: 3, border: '#A78BFA', glow: 18, width: 3 },
  { key: 'frame-4', label: 'Rámeček IV', requiredLevel: 4, border: '#22C55E', glow: 24, width: 3.5 },
  { key: 'frame-5', label: 'Rámeček V', requiredLevel: 5, border: '#F0F0F8', glow: 32, width: 4 },
  { key: 'frame-founder', label: 'Founder', requiresPass: true, border: '#F5B73F', glow: 30, width: 4 },
];

export function findFrame(key) {
  return FRAMES.find(f => f.key === key) || null;
}

export function isFrameUnlocked(frame, { level = 0, passHolder = false } = {}) {
  if (frame.requiresPass) return passHolder;
  return level >= frame.requiredLevel;
}
