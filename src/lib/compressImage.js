import { stripJpegMetadata, stripPngMetadata } from './stripMetadata';

// Game Bible · Progression "PROOF": "Proofy musejí být postaveny technicky tak, aby byl cloud
// co nejlevnější." + UGC "LOCATION PRIVACY": metadata (EXIF / GPS) must be removed.
// Every photo is re-encoded through a canvas (max side 1600 px, JPEG) — that alone drops all
// metadata. If the browser can't decode the file, JPEG/PNG metadata is cut out byte-wise; a
// format we can neither decode nor clean (e.g. HEIC on most desktops) is refused.
export const MAX_SIDE = 1600;
export const QUALITY = 0.82;

export class UnsupportedImageError extends Error {}

export function targetSize(width, height, maxSide = MAX_SIDE) {
  const longest = Math.max(width, height);
  if (longest <= maxSide) return { width, height };
  const scale = maxSide / longest;
  return { width: Math.round(width * scale), height: Math.round(height * scale) };
}

async function reencode(file, maxSide, quality) {
  const bitmap = await createImageBitmap(file);
  const { width, height } = targetSize(bitmap.width, bitmap.height, maxSide);
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  canvas.getContext('2d').drawImage(bitmap, 0, 0, width, height);
  bitmap.close?.();
  const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/jpeg', quality));
  if (!blob) throw new Error('encode failed');
  const name = (file.name || 'proof').replace(/\.[^.]+$/, '') + '.jpg';
  return new File([blob], name, { type: 'image/jpeg' });
}

export async function compressImage(file, { maxSide = MAX_SIDE, quality = QUALITY } = {}) {
  if (!file || !/^image\//i.test(file.type || '')) return file;
  try {
    return await reencode(file, maxSide, quality);
  } catch (e) {
    const type = (file.type || '').toLowerCase();
    if (type === 'image/jpeg') {
      return new File([stripJpegMetadata(await file.arrayBuffer())], file.name, { type: file.type });
    }
    if (type === 'image/png') {
      return new File([stripPngMetadata(await file.arrayBuffer())], file.name, { type: file.type });
    }
    throw new UnsupportedImageError(type || 'unknown');
  }
}
