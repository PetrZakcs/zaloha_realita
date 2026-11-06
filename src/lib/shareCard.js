import { track } from './analytics';

// Share cards as images (spec-15 share moment, spec-16 share card, spec-18 MOMENT 4):
// "avatar, status, progress, krátká věta" + the sharer's referral link. Drawn on a canvas so
// it works without a server. Visual design is interim until the new Art Bible design lands —
// only this file needs restyling then.
//
// variant: Game Bible · Viral "MVP1 SHARE ASSET SET" — 'signal' | 'quest' | 'proof' | 'identity'
// | 'rank' | 'collection' | 'invite' — plus the original spec's 'season' and 'certificate'.

const W = 1080;
const H = 1350; // 4:5 — fits feeds and stories with padding

const COLORS = {
  bg1: '#15111E',
  bg2: '#241a3d',
  text: '#F0F0F8',
  muted: '#9A9AB5',
  accent: '#A78BFA',
  gold: '#F5B73F',
  green: '#22C55E',
};

function wrapText(ctx, text, maxWidth) {
  const words = (text || '').split(/\s+/).filter(Boolean);
  const lines = [];
  let line = '';
  for (const word of words) {
    const candidate = line ? `${line} ${word}` : word;
    if (ctx.measureText(candidate).width > maxWidth && line) {
      lines.push(line);
      line = word;
    } else {
      line = candidate;
    }
  }
  if (line) lines.push(line);
  return lines;
}

function loadImage(src) {
  return new Promise((resolve) => {
    if (!src) return resolve(null);
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = src;
  });
}

function drawAvatar(ctx, img, initials, x, y, r, ringColor) {
  ctx.save();
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.closePath();
  ctx.fillStyle = COLORS.bg2;
  ctx.fill();
  if (img) {
    ctx.clip();
    const s = Math.max((r * 2) / img.width, (r * 2) / img.height);
    ctx.drawImage(img, x - (img.width * s) / 2, y - (img.height * s) / 2, img.width * s, img.height * s);
  } else {
    ctx.fillStyle = ringColor;
    ctx.font = `700 ${Math.round(r * 0.7)}px "Space Grotesk", sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(initials, x, y + 4);
  }
  ctx.restore();
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.lineWidth = 10;
  ctx.strokeStyle = ringColor;
  ctx.shadowColor = ringColor;
  ctx.shadowBlur = 30;
  ctx.stroke();
  ctx.shadowBlur = 0;
}

const HEADLINES = {
  signal: 'Vstoupil(a) jsem.',
  quest: 'Něco jsem udělal(a).',
  proof: 'Tady je výsledek.',
  identity: 'Něčím jsem se stal(a).',
  rank: 'Posunul(a) jsem se.',
  collection: 'Něco jsem získal(a).',
  invite: 'Zkus to taky.',
  season: 'Dokončil(a) Hru Reality',
  certificate: 'Certifikát · Season 0',
};
export const SHARE_VARIANTS = Object.keys(HEADLINES);

// Returns a PNG Blob.
export async function renderShareCard({
  variant = 'proof',
  name,
  statusTitle,
  progressText,
  sentence,
  founder = false,
  avatarUrl = null,
  link = '',
}) {
  if (document.fonts?.ready) {
    try { await document.fonts.ready; } catch (e) { /* fonts are optional */ }
  }
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d');
  const ring = founder ? COLORS.gold : COLORS.accent;
  const isCertificate = variant === 'certificate';

  const bg = ctx.createLinearGradient(0, 0, W, H);
  bg.addColorStop(0, COLORS.bg1);
  bg.addColorStop(1, COLORS.bg2);
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, H);

  if (isCertificate) {
    ctx.strokeStyle = founder ? COLORS.gold : COLORS.accent;
    ctx.lineWidth = 6;
    ctx.strokeRect(40, 40, W - 80, H - 80);
  }

  ctx.textAlign = 'center';
  ctx.fillStyle = COLORS.accent;
  ctx.font = '600 34px "JetBrains Mono", monospace';
  ctx.fillText('iWAU · HRA REALITY', W / 2, 130);

  const img = await loadImage(avatarUrl);
  drawAvatar(ctx, img, (name || 'H').slice(0, 2).toUpperCase(), W / 2, 330, 130, ring);

  ctx.fillStyle = COLORS.text;
  ctx.font = '700 72px "Space Grotesk", sans-serif';
  ctx.fillText(name || 'Hráč', W / 2, 560);

  let y = 620;
  if (statusTitle || founder) {
    ctx.font = '600 36px Inter, sans-serif';
    ctx.fillStyle = founder ? COLORS.gold : COLORS.accent;
    ctx.fillText([statusTitle, founder ? '👑 Founder' : null].filter(Boolean).join(' · '), W / 2, y);
    y += 40;
  }

  y += 60;
  ctx.fillStyle = COLORS.green;
  ctx.font = '700 54px "Space Grotesk", sans-serif';
  ctx.fillText(HEADLINES[variant] || HEADLINES.proof, W / 2, y);

  if (progressText) {
    y += 70;
    ctx.fillStyle = COLORS.gold;
    ctx.font = '700 46px "JetBrains Mono", monospace';
    ctx.fillText(progressText, W / 2, y);
  }

  if (sentence) {
    y += 90;
    ctx.fillStyle = COLORS.text;
    ctx.font = 'italic 400 40px Inter, sans-serif';
    const lines = wrapText(ctx, `„${sentence}"`, W - 200).slice(0, 4);
    for (const line of lines) {
      ctx.fillText(line, W / 2, y);
      y += 56;
    }
  }

  ctx.fillStyle = COLORS.muted;
  ctx.font = '600 38px Inter, sans-serif';
  ctx.fillText('Zkus taky →', W / 2, H - 170);
  if (link) {
    ctx.fillStyle = COLORS.accent;
    ctx.font = '500 32px "JetBrains Mono", monospace';
    ctx.fillText(link.replace(/^https?:\/\//, ''), W / 2, H - 115);
  }

  return new Promise((resolve) => canvas.toBlob(resolve, 'image/png'));
}

// Shares the PNG via the native share sheet when files are supported; otherwise downloads it
// and copies the link. Returns { shared, method }. Never throws.
export async function shareCardImage({ blob, filename = 'hra-reality.png', title, text, url, source }) {
  track('share_clicked', { source, format: 'image' });
  try {
    const file = new File([blob], filename, { type: 'image/png' });
    if (navigator.canShare && navigator.canShare({ files: [file] })) {
      try {
        await navigator.share({ files: [file], title, text: url ? `${text}\n${url}` : text });
        track('share_completed', { source, method: 'native_image' });
        return { shared: true, method: 'native' };
      } catch (e) {
        return { shared: false, method: 'native' };
      }
    }
    const href = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = href;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(href), 1000);
    if (url && navigator.clipboard) {
      try { await navigator.clipboard.writeText(`${text}\n${url}`); } catch (e) { /* optional */ }
    }
    track('share_completed', { source, method: 'download' });
    return { shared: true, method: 'download' };
  } catch (e) {
    console.warn('shareCardImage failed.', e);
    return { shared: false, method: 'error' };
  }
}
