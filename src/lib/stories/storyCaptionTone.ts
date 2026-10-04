export type StoryCaptionTone = "light" | "dark";

export const STORY_CAPTION_LUMA_THRESHOLD = 0.62;

export function captionToneFromLuma(luma: number): StoryCaptionTone {
  return Number(luma) >= STORY_CAPTION_LUMA_THRESHOLD ? "dark" : "light";
}

export function storyCaptionToneClass(tone: StoryCaptionTone) {
  return tone === "dark"
    ? "text-black [text-shadow:0_0_18px_rgba(255,255,255,0.42),0_1px_2px_rgba(255,255,255,0.85)]"
    : "text-white [text-shadow:0_0_22px_rgba(255,255,255,0.42),0_0_2px_rgba(255,255,255,0.95),0_2px_12px_rgba(0,0,0,0.9)]";
}

export function averageRgbaLuma(data: ArrayLike<number>) {
  let total = 0;
  let count = 0;
  for (let i = 0; i + 3 < data.length; i += 4) {
    const alpha = Number(data[i + 3] || 0) / 255;
    if (alpha < 0.08) continue;
    const r = Number(data[i] || 0) / 255;
    const g = Number(data[i + 1] || 0) / 255;
    const b = Number(data[i + 2] || 0) / 255;
    total += (0.2126 * r + 0.7152 * g + 0.0722 * b) * alpha;
    count += 1;
  }
  return count > 0 ? total / count : 0;
}

export function sampleBottomBandLuma(
  source: CanvasImageSource,
  width: number,
  height: number,
) {
  const w = Math.max(1, Math.floor(Number(width) || 0));
  const h = Math.max(1, Math.floor(Number(height) || 0));
  if (typeof document === "undefined") return 0;
  const canvas = document.createElement("canvas");
  canvas.width = 48;
  canvas.height = 16;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) return 0;
  const bandTop = Math.floor(h * 0.78);
  const bandH = Math.max(1, h - bandTop);
  ctx.drawImage(source, 0, bandTop, w, bandH, 0, 0, canvas.width, canvas.height);
  return averageRgbaLuma(ctx.getImageData(0, 0, canvas.width, canvas.height).data);
}

export async function sampleStoryCaptionToneFromUrl(url: string): Promise<StoryCaptionTone | null> {
  const src = String(url || "").trim();
  if (!src || typeof Image === "undefined") return null;
  return new Promise((resolve) => {
    const image = new Image();
    image.crossOrigin = "anonymous";
    image.onload = () => {
      try {
        resolve(captionToneFromLuma(sampleBottomBandLuma(image, image.naturalWidth, image.naturalHeight)));
      } catch {
        resolve(null);
      }
    };
    image.onerror = () => resolve(null);
    image.src = src;
  });
}

export function sampleStoryMediaCaptionTone(
  media: HTMLImageElement | HTMLVideoElement | null,
): StoryCaptionTone | null {
  if (!media) return null;
  try {
    if (media instanceof HTMLVideoElement) {
      if (media.videoWidth < 2 || media.videoHeight < 2) return null;
      return captionToneFromLuma(
        sampleBottomBandLuma(media, media.videoWidth, media.videoHeight),
      );
    }
    if (media.naturalWidth < 2 || media.naturalHeight < 2) return null;
    return captionToneFromLuma(
      sampleBottomBandLuma(media, media.naturalWidth, media.naturalHeight),
    );
  } catch {
    return null;
  }
}
