/**
 * Client-side downscale. Claude's vision input tops out usefully around
 * 1568px on the long edge; a 4032px phone photo is pure upload latency.
 */

const MAX_EDGE = 1568;
const QUALITY = 0.85;

export interface PreparedImage {
  /** Base64 JPEG with no data: prefix — DecodeRequest.imageBase64. */
  base64: string;
  /** Full data URL, reused as the on-screen preview so we hold one copy. */
  dataUrl: string;
  width: number;
  height: number;
}

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("That file could not be read as an image."));
    img.decoding = "async";
    img.src = url;
  });
}

export async function prepareImage(file: File): Promise<PreparedImage> {
  const objectUrl = URL.createObjectURL(file);
  try {
    const img = await loadImage(objectUrl);
    const longEdge = Math.max(img.naturalWidth, img.naturalHeight);
    const scale = longEdge > MAX_EDGE ? MAX_EDGE / longEdge : 1;
    const width = Math.max(1, Math.round(img.naturalWidth * scale));
    const height = Math.max(1, Math.round(img.naturalHeight * scale));

    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("This browser could not process the photo.");
    ctx.imageSmoothingQuality = "high";
    // Flatten onto white: JPEG has no alpha and paper is never transparent.
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, width, height);
    ctx.drawImage(img, 0, 0, width, height);

    const dataUrl = canvas.toDataURL("image/jpeg", QUALITY);
    const comma = dataUrl.indexOf(",");
    if (comma < 0) throw new Error("This browser could not process the photo.");
    return { base64: dataUrl.slice(comma + 1), dataUrl, width, height };
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}
