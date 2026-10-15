/**
 * Build an animated WebP using only the browser's per-frame WebP encoder.
 * No server transcoding, video autoplay, or external dependencies.
 * RIFF animation layout follows RFC 9649 (VP8X / ANIM / ANMF).
 */
function put24(target: Uint8Array, offset: number, value: number) {
  target[offset] = value & 255;
  target[offset + 1] = (value >> 8) & 255;
  target[offset + 2] = (value >> 16) & 255;
}

function riffChunk(tag: string, data: Uint8Array): Uint8Array {
  const chunk = new Uint8Array(8 + data.length + (data.length & 1));
  for (let i = 0; i < 4; i++) chunk[i] = tag.charCodeAt(i);
  new DataView(chunk.buffer).setUint32(4, data.length, true);
  chunk.set(data, 8);
  return chunk;
}

/** Extract one already-encoded VP8 or VP8L image chunk from a still WebP. */
function webpImageChunk(webp: Uint8Array): Uint8Array | null {
  const tag = (at: number) => String.fromCharCode(...webp.slice(at, at + 4));
  if (webp.length < 20 || tag(0) !== "RIFF" || tag(8) !== "WEBP") return null;
  for (let at = 12; at + 8 <= webp.length;) {
    const len = new DataView(webp.buffer, webp.byteOffset + at + 4, 4).getUint32(0, true);
    const end = at + 8 + len + (len & 1);
    if (end > webp.length) return null;
    if (tag(at) === "VP8 " || tag(at) === "VP8L") return webp.slice(at, end);
    at = end;
  }
  return null;
}

export async function encodeStoryAnimatedWebP(
  frames: ImageBitmap[],
  originalWidth: number,
  originalHeight: number,
): Promise<File | null> {
  if (frames.length < 4 || typeof document === "undefined") return null;

  // ~8 FPS for 6 seconds, in forward + reverse order, capped at 500 KB.
  const samples = Math.min(frames.length, 24);
  const forwards = Array.from({length: samples}, (_, i) =>
    frames[Math.min(frames.length - 1, Math.round((i * (frames.length - 1)) / (samples - 1)))]);
  const sequence = [...forwards, ...forwards.slice(1, -1).reverse()];
  const width = Math.max(2, Math.round(originalWidth * Math.min(1, 216 / originalWidth, 288 / originalHeight)));
  const height = Math.max(2, Math.round(originalHeight * Math.min(1, 216 / originalWidth, 288 / originalHeight)));
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d", {alpha: false});
  if (!ctx) return null;

  const vp8x = new Uint8Array(10);
  vp8x[0] = 0x02; // Animated WebP bit.
  put24(vp8x, 4, width - 1);
  put24(vp8x, 7, height - 1);
  const pieces = [riffChunk("VP8X", vp8x), riffChunk("ANIM", new Uint8Array([0, 0, 0, 255, 0, 0]))];
  const frameDuration = Math.round(6000 / sequence.length);
  let total = 12 + pieces.reduce((sum, piece) => sum + piece.length, 0);
  for (const frame of sequence) {
    ctx.drawImage(frame, 0, 0, width, height);
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/webp", 0.52));
    if (!blob || blob.type !== "image/webp") return null;
    const image = webpImageChunk(new Uint8Array(await blob.arrayBuffer()));
    if (!image) return null;
    const header = new Uint8Array(16);
    put24(header, 6, width - 1);
    put24(header, 9, height - 1);
    put24(header, 12, frameDuration);
    // Full opaque frame: overwrite existing content, don't alpha-blend.
    header[15] = 0x02;
    const frameChunk = riffChunk("ANMF", new Uint8Array([...header, ...image]));
    pieces.push(frameChunk);
    total += frameChunk.length;
    if (total > 500_000) return null;
  }

  const container = new Uint8Array(total);
  container.set([82, 73, 70, 70], 0); // RIFF
  new DataView(container.buffer).setUint32(4, total - 8, true);
  container.set([87, 69, 66, 80], 8); // WEBP
  let cursor = 12;
  for (const part of pieces) {
    container.set(part, cursor);
    cursor += part.length;
  }
  return new File([container], "story-boomerang.webp", {type: "image/webp"});
}
