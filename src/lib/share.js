// Small shared helper so every share touchpoint (feed proof cards, season reflection share
// card, paywall referral CTA, …) builds links and invokes the share sheet the same way,
// instead of each screen reinventing its own navigator.share/clipboard fallback.

export function buildReferralLink(referralCode) {
  const base = window.location.origin;
  return referralCode ? `${base}/?ref=${referralCode}` : base;
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
