// Detects the real image type from its bytes and removes metadata (EXIF, GPS, XMP, comments, text chunks).
export type ImageKind = 'image/jpeg' | 'image/png' | 'image/webp';

export function sniffImage(b: Uint8Array): ImageKind | null {
  if (b.length > 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return 'image/jpeg';
  if (b.length > 8 && [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a].every((v, i) => b[i] === v)) return 'image/png';
  if (b.length > 12 && String.fromCharCode(...b.slice(0, 4)) === 'RIFF' && String.fromCharCode(...b.slice(8, 12)) === 'WEBP') return 'image/webp';
  return null;
}

function concat(parts: Uint8Array[]): Uint8Array {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let o = 0;
  for (const p of parts) { out.set(p, o); o += p.length; }
  return out;
}

function stripJpeg(b: Uint8Array): Uint8Array {
  const parts: Uint8Array[] = [b.slice(0, 2)];
  let i = 2;
  while (i + 4 <= b.length) {
    if (b[i] !== 0xff) throw new Error('Corrupt JPEG');
    const marker = b[i + 1];
    if (marker === 0xda) { parts.push(b.slice(i)); return concat(parts); } // start of scan: rest is image data
    const len = (b[i + 2] << 8) | b[i + 3];
    const seg = b.slice(i, i + 2 + len);
    // Drop APP1–APP15 (EXIF, XMP, GPS, ICC) and COM; keep APP0 (JFIF) and all image segments.
    const drop = (marker >= 0xe1 && marker <= 0xef) || marker === 0xfe;
    if (!drop) parts.push(seg);
    i += 2 + len;
  }
  throw new Error('Corrupt JPEG');
}

const PNG_KEEP = new Set(['IHDR', 'PLTE', 'IDAT', 'IEND', 'tRNS', 'gAMA', 'cHRM', 'sRGB']);
function stripPng(b: Uint8Array): Uint8Array {
  const parts: Uint8Array[] = [b.slice(0, 8)];
  let i = 8;
  while (i + 8 <= b.length) {
    const len = ((b[i] << 24) | (b[i + 1] << 16) | (b[i + 2] << 8) | b[i + 3]) >>> 0;
    const type = String.fromCharCode(...b.slice(i + 4, i + 8));
    const end = i + 12 + len;
    if (end > b.length) throw new Error('Corrupt PNG');
    if (PNG_KEEP.has(type)) parts.push(b.slice(i, end));
    i = end;
    if (type === 'IEND') break;
  }
  return concat(parts);
}

function stripWebp(b: Uint8Array): Uint8Array {
  const parts: Uint8Array[] = [];
  let i = 12;
  while (i + 8 <= b.length) {
    const type = String.fromCharCode(...b.slice(i, i + 4));
    const len = (b[i + 4] | (b[i + 5] << 8) | (b[i + 6] << 16) | (b[i + 7] << 24)) >>> 0;
    const end = i + 8 + len + (len & 1);
    if (i + 8 + len > b.length) throw new Error('Corrupt WebP');
    if (!['EXIF', 'XMP ', 'ICCP'].includes(type)) {
      const chunk = b.slice(i, Math.min(end, b.length));
      if (type === 'VP8X') chunk[8] &= ~(0x20 | 0x08 | 0x04); // clear ICC, EXIF, XMP flags
      parts.push(chunk);
    }
    i = end;
  }
  const body = concat(parts);
  const size = body.length + 4;
  const header = new Uint8Array([0x52, 0x49, 0x46, 0x46, size & 255, (size >> 8) & 255, (size >> 16) & 255, (size >>> 24) & 255, 0x57, 0x45, 0x42, 0x50]);
  return concat([header, body]);
}

export function stripImageMetadata(b: Uint8Array, kind: ImageKind): Uint8Array {
  if (kind === 'image/jpeg') return stripJpeg(b);
  if (kind === 'image/png') return stripPng(b);
  return stripWebp(b);
}
