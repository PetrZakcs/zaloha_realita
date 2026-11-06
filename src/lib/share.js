// Small shared helper so every share touchpoint (feed proof cards, season reflection share
// card, paywall referral CTA, …) builds links and invokes the share sheet the same way,
// instead of each screen reinventing its own navigator.share/clipboard fallback.

// Contextual share links (Game Bible · Viral "DEEP LINK ARCHITECTURE"): besides the sharer's
// invite code a link can carry the quest (q) and the share type (t), so the landing can say
// "X tě vyzval k Questu …" and the new player lands on that quest after onboarding.
// See src/lib/attribution.js for the receiving side.
export function buildReferralLink(referralCode, { questId, shareType } = {}) {
  const base = window.location.origin;
  if (!referralCode) return base;
  const params = new URLSearchParams({ ref: referralCode });
  if (questId) params.set('q', questId);
  if (shareType) params.set('t', shareType);
  return `${base}/?${params.toString()}`;
}

// Returns { method: 'native' | 'clipboard', shared: boolean }. Never throws — a cancelled
// share sheet or a clipboard permission error must not break the caller's UI.
export async function shareContent({ title, text, url }) {
  if (navigator.share) {
    try {
      await navigator.share({ title, text, url });
      return { method: 'native', shared: true };
    } catch (e) {
      // AbortError from the user dismissing the share sheet is expected, not a failure.
      return { method: 'native', shared: false };
    }
  }
  try {
    await navigator.clipboard.writeText(url ? `${text}\n${url}` : text);
    return { method: 'clipboard', shared: true };
  } catch (e) {
    console.warn('Clipboard share fallback failed.', e);
    return { method: 'clipboard', shared: false };
  }
}
