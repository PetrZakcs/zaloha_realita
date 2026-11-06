// Referral attribution (Game Bible · Viral "DEEP LINK ARCHITECTURE", Referral "FIRST TOUCH ×
// LAST TOUCH"). A link may carry: ref (player invite code), q (quest id), t (share type),
// a (asset), c (campaign). First and last touch are kept on the device until signup and then
// written once via record_referral_attribution().
//
// Window: the Bible recommends 14–30 days for invites; the exact value is an open client
// decision — 30 until then.
export const ATTRIBUTION_WINDOW_DAYS = 30;

const FIRST_KEY = 'refFirstTouch';
const LAST_KEY = 'refLastTouch';
const CODE_KEY = 'pendingReferralCode';
const EXPLICIT_KEY = 'pendingReferralExplicit';

function read(key) {
  try { return JSON.parse(localStorage.getItem(key) || 'null'); } catch (e) { return null; }
}

function isFresh(touch, now = Date.now()) {
  if (!touch?.at) return false;
  return now - new Date(touch.at).getTime() <= ATTRIBUTION_WINDOW_DAYS * 86400000;
}

export function parseTouch(search, pathname = '/', now = new Date()) {
  const params = new URLSearchParams(search || '');
  const ref = params.get('ref');
  if (!ref) return null;
  const clean = (v) => (v ? String(v).slice(0, 100) : undefined);
  const touch = {
    ref: ref.toUpperCase().slice(0, 40),
    quest: clean(params.get('q')),
    share_type: clean(params.get('t')),
    asset: clean(params.get('a')),
    campaign: clean(params.get('c')),
    landing: clean(pathname),
    at: now.toISOString(),
  };
  Object.keys(touch).forEach(k => touch[k] === undefined && delete touch[k]);
  return touch;
}

function storeTouch(touch) {
  try {
    const first = read(FIRST_KEY);
    if (!isFresh(first)) localStorage.setItem(FIRST_KEY, JSON.stringify(touch));
    localStorage.setItem(LAST_KEY, JSON.stringify(touch));
    // Referral "REFERRAL COLLISION": the last eligible personal referral before registration
    // wins the acquisition; first touch stays for analytics. An explicitly entered code has
    // priority ("ATTRIBUTION PRIORITY") — a later link doesn't override it.
    if (localStorage.getItem(EXPLICIT_KEY) !== 'true' || touch.share_type === 'code') {
      localStorage.setItem(CODE_KEY, touch.ref);
    }
    if (touch.share_type === 'code') localStorage.setItem(EXPLICIT_KEY, 'true');
  } catch (e) { /* storage unavailable — attribution is best effort */ }
}

// Called on every page load with the current URL.
export function captureTouch(search, pathname) {
  const touch = parseTouch(search, pathname);
  if (!touch) return null;
  storeTouch(touch);
  return touch;
}

// Referral "OFFLINE ATTRIBUTION": a code typed in by the player before signing up.
export function captureExplicitCode(code, now = new Date()) {
  const ref = String(code || '').trim().toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 40);
  if (ref.length < 4) return null;
  const touch = { ref, share_type: 'code', landing: 'code_entry', at: now.toISOString() };
  storeTouch(touch);
  return touch;
}

export function getTouches() {
  const first = read(FIRST_KEY);
  const last = read(LAST_KEY);
  return { first: isFresh(first) ? first : null, last: isFresh(last) ? last : null };
}

// The invite the landing should talk about ("X tě vyzval k Questu …") and the quest to hand
// the new player to after onboarding (Viral "NEW PLAYER HANDOFF").
export function getPendingInvite() {
  const { first, last } = getTouches();
  const touch = last || first;
  return touch ? { code: touch.ref, questId: touch.quest || null, shareType: touch.share_type || null } : null;
}

export function clearAttribution() {
  try {
    localStorage.removeItem(FIRST_KEY);
    localStorage.removeItem(LAST_KEY);
    localStorage.removeItem(EXPLICIT_KEY);
  } catch (e) { /* ignore */ }
}
