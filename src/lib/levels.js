// Lifetime Level (Game Bible · Progression "LEVEL CURVE" — orientační návrh, final numbers
// belong to the game designer). Mirror of public.lifetime_level() in
// supabase/migrations/20261013120000_game_bible_mvp1.sql — keep both in sync.
// Defaults = the documents' curve; replaced by game_config (level_curve, level_xp_after_curve)
// once loaded, so the server stays the source of truth.
const DEFAULT_ANCHORS = [
  [1, 0], [2, 100], [3, 230], [5, 600], [10, 2000], [20, 6000],
  [30, 12000], [50, 30000], [75, 60000], [100, 100000],
];
let ANCHORS = DEFAULT_ANCHORS;
let XP_PER_LEVEL_AFTER_100 = 1600;

export function configureLevels(curve, xpAfterCurve) {
  const valid = Array.isArray(curve) && curve.length >= 2
    && curve.every(p => Array.isArray(p) && p.length === 2 && p.every(Number.isFinite));
  ANCHORS = valid ? curve : DEFAULT_ANCHORS;
  XP_PER_LEVEL_AFTER_100 = Number.isFinite(xpAfterCurve) && xpAfterCurve > 0 ? xpAfterCurve : 1600;
}

export function levelFromXp(xp) {
  const value = Math.max(0, Math.floor(Number(xp) || 0));
  const [lastLevel, lastXp] = ANCHORS[ANCHORS.length - 1];
  if (value >= lastXp) return lastLevel + Math.floor((value - lastXp) / XP_PER_LEVEL_AFTER_100);
  for (let i = 0; i < ANCHORS.length - 1; i++) {
    const [l1, x1] = ANCHORS[i];
    const [l2, x2] = ANCHORS[i + 1];
    if (value < x2) return l1 + Math.floor(((value - x1) * (l2 - l1)) / (x2 - x1));
  }
  return 1;
}

// Smallest XP at which `level` is reached.
export function xpForLevel(level) {
  const target = Math.max(1, Math.floor(level));
  const [lastLevel, lastXp] = ANCHORS[ANCHORS.length - 1];
  if (target >= lastLevel) return lastXp + (target - lastLevel) * XP_PER_LEVEL_AFTER_100;
  for (let i = 0; i < ANCHORS.length - 1; i++) {
    const [l1, x1] = ANCHORS[i];
    const [l2, x2] = ANCHORS[i + 1];
    if (target <= l2) return Math.ceil(x1 + ((target - l1) * (x2 - x1)) / (l2 - l1));
  }
  return 0;
}

// { level, current, needed, percent } — progress inside the current level.
export function levelProgress(xp) {
  const level = levelFromXp(xp);
  const start = xpForLevel(level);
  const next = xpForLevel(level + 1);
  const current = Math.max(0, (Number(xp) || 0) - start);
  const needed = next - start;
  return { level, current, needed, percent: needed > 0 ? Math.min(100, Math.round((current / needed) * 100)) : 100 };
}
