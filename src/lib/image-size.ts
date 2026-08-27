/**
 * Pixel dimensions from an image header, without decoding the image.
 *
 * Needed so a vision model's bounding boxes can be normalised to 0..1
 * when it answers in pixels. JPEG (SOFn frame header) and PNG (IHDR)
 * are the two formats the pipeline sees; anything else yields null.
 */

export interface ImageSize {
  readonly w: number;
  readonly h: number;
}

/** SOF markers: C0–CF except C4 (DHT), C8 (JPG) and CC (DAC). */
const isSof = (marker: number): boolean =>
  marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc;

function jpegSize(buf: Buffer): ImageSize | null {
  let i = 2;
  while (i + 9 < buf.length) {
    if (buf[i] !== 0xff) return null;
    const marker = buf[i + 1];
    if (marker === 0xff) {
      i += 1;
      continue;
    }
    // Standalone markers carry no length.
    if (marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
      i += 2;
      continue;
    }
    const len = buf.readUInt16BE(i + 2);
    if (isSof(marker)) {
      const h = buf.readUInt16BE(i + 5);
      const w = buf.readUInt16BE(i + 7);
      return w > 0 && h > 0 ? { w, h } : null;
    }
    if (marker === 0xda) return null; // scan data before any SOF
    i += 2 + len;
  }
  return null;
}

function pngSize(buf: Buffer): ImageSize | null {
  if (buf.length < 24 || buf.toString("ascii", 12, 16) !== "IHDR") return null;
  const w = buf.readUInt32BE(16);
  const h = buf.readUInt32BE(20);
  return w > 0 && h > 0 ? { w, h } : null;
}

/** Only the header is needed; decoding more than a few KB is wasted work. */
const HEADER_BYTES = 64 * 1024;

export function imageSize(base64: string): ImageSize | null {
  const buf = Buffer.from(base64.slice(0, Math.ceil((HEADER_BYTES * 4) / 3)), "base64");
  if (buf.length >= 8 && buf[0] === 0x89 && buf.toString("ascii", 1, 4) === "PNG") return pngSize(buf);
  if (buf.length >= 4 && buf[0] === 0xff && buf[1] === 0xd8) return jpegSize(buf);
  return null;
}
