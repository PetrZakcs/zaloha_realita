// Game Bible · UGC "LOCATION PRIVACY": "UGC nikdy nesmí automaticky zveřejnit … location z EXIF
// bez souhlasu. Metadata musí být sanitizována." Byte-level fallbacks for when the browser
// can't re-encode the file itself (re-encoding through a canvas already drops all metadata).

// JPEG: drop APP1 (EXIF / XMP — GPS lives here) and APP13 (IPTC) segments before the scan.
export function stripJpegMetadata(buffer) {
  const src = new Uint8Array(buffer);
  if (src[0] !== 0xff || src[1] !== 0xd8) return buffer;
  const out = [src.subarray(0, 2)];
  let i = 2;
  while (i + 4 <= src.length) {
    if (src[i] !== 0xff) break;
    const marker = src[i + 1];
    if (marker === 0xda) break; // start of scan — image data follows unchanged
    const length = (src[i + 2] << 8) | src[i + 3];
    const end = i + 2 + length;
    if (end > src.length) break;
    if (marker !== 0xe1 && marker !== 0xed) out.push(src.subarray(i, end));
    i = end;
  }
  out.push(src.subarray(i));
  const total = out.reduce((n, part) => n + part.length, 0);
  const result = new Uint8Array(total);
  let offset = 0;
  out.forEach(part => { result.set(part, offset); offset += part.length; });
  return result.buffer;
}

// PNG: drop eXIf and text chunks (tEXt / zTXt / iTXt).
export function stripPngMetadata(buffer) {
  const src = new Uint8Array(buffer);
  const sig = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  if (!sig.every((b, k) => src[k] === b)) return buffer;
  const view = new DataView(buffer);
  const keep = [src.subarray(0, 8)];
  let i = 8;
  while (i + 12 <= src.length) {
    const length = view.getUint32(i);
    const type = String.fromCharCode(src[i + 4], src[i + 5], src[i + 6], src[i + 7]);
    const end = i + 12 + length;
    if (end > src.length) break;
    if (!['eXIf', 'tEXt', 'zTXt', 'iTXt'].includes(type)) keep.push(src.subarray(i, end));
    i = end;
  }
  const total = keep.reduce((n, part) => n + part.length, 0);
  const result = new Uint8Array(total);
  let offset = 0;
  keep.forEach(part => { result.set(part, offset); offset += part.length; });
  return result.buffer;
}

// MP4 / MOV: location is stored as an ISO 6709 string ("+50.0755+014.4378/") in the `©xyz`
// atom or the `com.apple.quicktime.location.ISO6709` metadata item, both inside `moov`.
// Patched in place without changing any sizes: the `©xyz` atom becomes `free`, and the digits
// of every ISO 6709 coordinate inside `moov` are zeroed. Returns the bytes and how many
// coordinates were scrubbed.
const ISO6709 = /[+-]\d{2}(?:\.\d+)?[+-]\d{3}(?:\.\d+)?(?:[+-]\d+(?:\.\d+)?)?\/?/g;

export function scrubMoovLocation(moov) {
  const bytes = new Uint8Array(moov);
  for (let i = 4; i + 4 <= bytes.length; i++) {
    if (bytes[i] === 0xa9 && bytes[i + 1] === 0x78 && bytes[i + 2] === 0x79 && bytes[i + 3] === 0x7a) {
      bytes[i] = 0x66; bytes[i + 1] = 0x72; bytes[i + 2] = 0x65; bytes[i + 3] = 0x65; // 'free'
    }
  }
  let text = '';
  for (let i = 0; i < bytes.length; i++) text += String.fromCharCode(bytes[i]);
  let count = 0;
  let match;
  ISO6709.lastIndex = 0;
  while ((match = ISO6709.exec(text)) !== null) {
    for (let k = 0; k < match[0].length; k++) {
      const code = match[0].charCodeAt(k);
      if (code >= 0x30 && code <= 0x39) bytes[match.index + k] = 0x30;
    }
    count++;
  }
  return { bytes, count };
}

// Finds the top-level `moov` box of an MP4/MOV file: [start, end) or null.
export async function findMoov(file) {
  let offset = 0;
  while (offset + 8 <= file.size) {
    const header = new DataView(await file.slice(offset, offset + 16).arrayBuffer());
    let size = header.getUint32(0);
    const type = String.fromCharCode(header.getUint8(4), header.getUint8(5), header.getUint8(6), header.getUint8(7));
    if (size === 1) size = Number(header.getBigUint64(8));
    else if (size === 0) size = file.size - offset;
    if (size < 8) return null;
    if (type === 'moov') return [offset, offset + size];
    offset += size;
  }
  return null;
}

export async function scrubVideoLocation(file) {
  if (!/^video\/(mp4|quicktime)$/i.test(file.type || '') && !/\.(mp4|mov)$/i.test(file.name || '')) return file;
  try {
    const range = await findMoov(file);
    if (!range) return file;
    const moov = await file.slice(range[0], range[1]).arrayBuffer();
    const { bytes } = scrubMoovLocation(moov);
    return new File([file.slice(0, range[0]), bytes, file.slice(range[1])], file.name, { type: file.type });
  } catch (e) {
    return file;
  }
}
