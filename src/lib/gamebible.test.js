import { levelFromXp, xpForLevel, levelProgress } from './levels';
import { parseTouch, captureTouch, captureExplicitCode, getTouches, getPendingInvite, clearAttribution, ATTRIBUTION_WINDOW_DAYS } from './attribution';
import { buildReferralLink } from './share';
import { targetSize } from './compressImage';
import { applyReaction } from '../store/slices/feedSlice';
import { pickActiveLoop } from '../store/slices/gameplaySlice';

// Same expectations as the SQL flow test against public.lifetime_level().
test('levelFromXp follows the orientational Progression curve', () => {
  const cases = [[0, 1], [99, 1], [100, 2], [229, 2], [230, 3], [415, 4], [600, 5], [1999, 9], [2000, 10], [99999, 99], [100000, 100], [101600, 101]];
  cases.forEach(([xp, level]) => expect(levelFromXp(xp)).toBe(level));
  expect(levelFromXp(-5)).toBe(1);
});

test('xpForLevel is the exact threshold of levelFromXp', () => {
  expect(xpForLevel(1)).toBe(0);
  for (let level = 2; level <= 120; level++) {
    const xp = xpForLevel(level);
    expect(levelFromXp(xp)).toBe(level);
    expect(levelFromXp(xp - 1)).toBe(level - 1);
  }
});

test('levelProgress reports progress inside the current level', () => {
  expect(levelProgress(150)).toEqual({ level: 2, current: 50, needed: 130, percent: 38 });
});

describe('attribution', () => {
  beforeEach(() => localStorage.clear());

  test('parseTouch keeps only known params and upper-cases the code', () => {
    const touch = parseTouch('?ref=abc123&q=c-n1&t=invite&x=evil', '/', new Date('2026-10-13T10:00:00Z'));
    expect(touch).toEqual({ ref: 'ABC123', quest: 'c-n1', share_type: 'invite', landing: '/', at: '2026-10-13T10:00:00.000Z' });
    expect(parseTouch('?q=c-n1')).toBeNull();
  });

  test('last personal referral wins the code, first touch is kept for analytics', () => {
    captureTouch('?ref=FIRST&t=proof', '/');
    captureTouch('?ref=SECOND&q=c2&t=invite', '/');
    const { first, last } = getTouches();
    expect(first.ref).toBe('FIRST');
    expect(last.ref).toBe('SECOND');
    expect(localStorage.getItem('pendingReferralCode')).toBe('SECOND');
    expect(getPendingInvite()).toEqual({ code: 'SECOND', questId: 'c2', shareType: 'invite' });
    clearAttribution();
    expect(getTouches()).toEqual({ first: null, last: null });
  });

  test('an explicitly entered code has priority over later links', () => {
    captureTouch('?ref=LINK1', '/');
    expect(captureExplicitCode(' ab-cd 12 ').ref).toBe('ABCD12');
    captureTouch('?ref=LINK2', '/');
    expect(localStorage.getItem('pendingReferralCode')).toBe('ABCD12');
    expect(captureExplicitCode('ab')).toBeNull();
  });

  test('an expired first touch is replaced', () => {
    const old = new Date(Date.now() - (ATTRIBUTION_WINDOW_DAYS + 1) * 86400000).toISOString();
    localStorage.setItem('refFirstTouch', JSON.stringify({ ref: 'OLD', at: old }));
    localStorage.setItem('pendingReferralCode', 'OLD');
    captureTouch('?ref=NEW', '/');
    expect(getTouches().first.ref).toBe('NEW');
    expect(localStorage.getItem('pendingReferralCode')).toBe('NEW');
  });
});

test('buildReferralLink carries quest and share type', () => {
  expect(buildReferralLink('ABC', { questId: 'c-n1', shareType: 'invite' })).toBe(`${window.location.origin}/?ref=ABC&q=c-n1&t=invite`);
  expect(buildReferralLink('ABC')).toBe(`${window.location.origin}/?ref=ABC`);
  expect(buildReferralLink(null)).toBe(window.location.origin);
});

test('applyReaction allows one reaction per player and switches it', () => {
  const post = { id: 'p', reactions_fire: 2, reactions_plant: 0, reactions_eye: 1, my_reaction: null };
  const fired = applyReaction(post, 'fire');
  expect(fired).toMatchObject({ reactions_fire: 3, my_reaction: 'fire' });
  expect(applyReaction(fired, 'fire')).toBe(fired);
  expect(applyReaction(fired, 'plant')).toMatchObject({ reactions_fire: 2, reactions_plant: 1, reactions_lightning: 1, my_reaction: 'plant' });
  expect(applyReaction(post, 'bogus')).toBe(post);
});

test('pickActiveLoop prefers unfinished mandatory loops', () => {
  const loops = [
    { id: 'a', is_mandatory: true, done: true },
    { id: 'opt', is_mandatory: false, done: false },
    { id: 'b', is_mandatory: true, done: false },
  ];
  expect(pickActiveLoop(loops).id).toBe('b');
  expect(pickActiveLoop(loops.map(l => (l.id === 'b' ? { ...l, done: true } : l))).id).toBe('opt');
  expect(pickActiveLoop(loops.map(l => ({ ...l, done: true }))).id).toBe('b');
  expect(pickActiveLoop([])).toBeNull();
});

test('targetSize downscales only above the limit, keeping the ratio', () => {
  expect(targetSize(4000, 3000)).toEqual({ width: 1600, height: 1200 });
  expect(targetSize(800, 600)).toEqual({ width: 800, height: 600 });
  expect(targetSize(1000, 3000, 512)).toEqual({ width: 171, height: 512 });
});

describe('metadata stripping', () => {
  const { stripJpegMetadata, stripPngMetadata, scrubMoovLocation } = require('./stripMetadata');

  test('JPEG loses APP1 (EXIF/GPS) but keeps the other segments and image data', () => {
    const jpeg = new Uint8Array([
      0xff, 0xd8,
      0xff, 0xe1, 0x00, 0x08, 0x45, 0x78, 0x69, 0x66, 0x00, 0x00, // APP1 "Exif"
      0xff, 0xdb, 0x00, 0x04, 0x01, 0x02,                         // DQT
      0xff, 0xda, 0x00, 0x04, 0x03, 0x04, 0x05, 0x06,             // SOS + data
      0xff, 0xd9,
    ]);
    const out = new Uint8Array(stripJpegMetadata(jpeg.buffer));
    expect(Array.from(out)).toEqual([0xff, 0xd8, 0xff, 0xdb, 0x00, 0x04, 0x01, 0x02, 0xff, 0xda, 0x00, 0x04, 0x03, 0x04, 0x05, 0x06, 0xff, 0xd9]);
  });

  test('PNG loses eXIf and text chunks', () => {
    const chunk = (type, data) => {
      const len = [0, 0, 0, data.length];
      return [...len, ...type.split('').map(c => c.charCodeAt(0)), ...data, 0, 0, 0, 0];
    };
    const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
      ...chunk('IHDR', [1, 2]), ...chunk('eXIf', [9, 9, 9]), ...chunk('tEXt', [7]), ...chunk('IEND', [])]);
    const out = new Uint8Array(stripPngMetadata(png.buffer));
    const text = String.fromCharCode(...out);
    expect(text).toContain('IHDR');
    expect(text).toContain('IEND');
    expect(text).not.toContain('eXIf');
    expect(text).not.toContain('tEXt');
  });

  test('MOV location: ©xyz becomes free and ISO 6709 digits are zeroed, size unchanged', () => {
    const iso = '+50.0755+014.4378/';
    const bytes = new Uint8Array([0, 0, 0, 30, 0xa9, 0x78, 0x79, 0x7a, ...iso.split('').map(c => c.charCodeAt(0)), 0, 0, 0, 0]);
    const { bytes: out, count } = scrubMoovLocation(bytes.buffer);
    const text = String.fromCharCode(...out);
    expect(count).toBe(1);
    expect(out.length).toBe(bytes.length);
    expect(text).toContain('free+00.0000+000.0000/');
  });
});

test('legacy analytics names map to the Bible taxonomy and keep the old name', () => {
  const { canonicalEvent } = require('./analytics');
  expect(canonicalEvent('challenge_started', { node: 2 })).toEqual({ name: 'quest_start', metadata: { node: 2, legacy_event: 'challenge_started' } });
  expect(canonicalEvent('share_completed', { a: 1 })).toEqual({ name: 'share_completed', metadata: { a: 1 } });
});

describe('MVP1 finish', () => {
  const { clampCoreText, CORE_TEXT_LIMIT } = require('../components/common/ProofCardExtras');
  const { getAvatarLevel, AVATAR_LEVELS } = require('./avatarLevels');
  const { MOBILE_ONBOARDING_STEPS, DESKTOP_ONBOARDING_STEPS } = require('../store/slices/authSlice');

  test('proof core text is limited to one short sentence', () => {
    expect(clampCoreText('Krátký důkaz')).toBe('Krátký důkaz');
    const long = clampCoreText('x'.repeat(200));
    expect(long.length).toBe(CORE_TEXT_LIMIT);
    expect(long.endsWith('…')).toBe(true);
    expect(clampCoreText(null)).toBe('');
  });

  test('avatar has one visibly different level per node, 0–7', () => {
    expect(AVATAR_LEVELS.map(l => l.level)).toEqual([0, 1, 2, 3, 4, 5, 6, 7]);
    expect(getAvatarLevel(7).name).toBe('Nositel Světla');
    expect(getAvatarLevel(99).level).toBe(7);
    expect(new Set(AVATAR_LEVELS.map(l => l.glow)).size).toBe(8);
  });

  test('onboarding follows the login-first order on both platforms', () => {
    const order = ['landing', 'login', 'entry', 'identity', 'first-reward', 'slib', 'avatar-upgrade', 'mystery-box'];
    expect(MOBILE_ONBOARDING_STEPS).toEqual([...order, 'transition']);
    expect(DESKTOP_ONBOARDING_STEPS).toEqual([...order, 'install', 'transition']);
  });
});
