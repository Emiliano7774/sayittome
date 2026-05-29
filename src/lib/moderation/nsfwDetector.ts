"use client";

export type NsfwScanResult = {
  sensitive: boolean;
  score: number;
  uncertain: boolean;
  scannedAt: number;
};

type NsfwModel = {
  classify: (
    img: HTMLImageElement | HTMLCanvasElement | HTMLVideoElement,
  ) => Promise<Array<{ className: string; probability: number }>>;
};

/** Solo desnudez/porno claro. No "Sexy" (playa, ropa, caras, etc.). */
const PORN_BLUR_THRESHOLD = 0.85;
const HENTAI_BLUR_THRESHOLD = 0.85;
const UNCERTAIN_EXPLICIT_MIN = 0.4;

const scanCache = new Map<string, NsfwScanResult>();
const inflight = new Map<string, Promise<NsfwScanResult>>();

let modelPromise: Promise<NsfwModel | null> | null = null;

function isClient() {
  return typeof window !== "undefined";
}

async function loadModel(): Promise<NsfwModel | null> {
  if (!isClient()) return null;
  if (!modelPromise) {
    modelPromise = (async () => {
      try {
        const [nsfwjs, tf] = await Promise.all([
          import("nsfwjs"),
          import("@tensorflow/tfjs"),
        ]);
        await tf.ready();
        return (await nsfwjs.load()) as NsfwModel;
      } catch (error) {
        console.error("nsfw model load failed", error);
        return null;
      }
    })();
  }
  return modelPromise;
}

function evaluatePredictions(
  predictions: Array<{ className: string; probability: number }>,
): NsfwScanResult {
  const byClass = Object.fromEntries(
    predictions.map((item) => [item.className, item.probability]),
  ) as Record<string, number>;

  const porn = byClass.Porn ?? 0;
  const hentai = byClass.Hentai ?? 0;
  const explicit = Math.max(porn, hentai);
  const score = explicit;

  const sensitive = porn >= PORN_BLUR_THRESHOLD || hentai >= HENTAI_BLUR_THRESHOLD;
  const uncertain = !sensitive && explicit >= UNCERTAIN_EXPLICIT_MIN;

  return {
    sensitive,
    score,
    uncertain,
    scannedAt: Date.now(),
  };
}

function loadImageElement(src: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("image_load_failed"));
    img.src = src;
  });
}

async function captureVideoFrame(videoSrc: string) {
  const video = document.createElement("video");
  video.crossOrigin = "anonymous";
  video.muted = true;
  video.playsInline = true;
  video.src = videoSrc;

  await new Promise<void>((resolve, reject) => {
    video.onloadeddata = () => resolve();
    video.onerror = () => reject(new Error("video_load_failed"));
  });

  video.currentTime = Math.min(0.5, video.duration || 0.5);
  await new Promise<void>((resolve) => {
    video.onseeked = () => resolve();
    window.setTimeout(resolve, 400);
  });

  const canvas = document.createElement("canvas");
  canvas.width = Math.min(video.videoWidth || 640, 640);
  canvas.height = Math.min(video.videoHeight || 640, 640);
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("canvas_unavailable");
  ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
  return canvas;
}

async function classifyElement(
  element: HTMLImageElement | HTMLCanvasElement | HTMLVideoElement,
): Promise<NsfwScanResult> {
  const model = await loadModel();
  if (!model) {
    return {
      sensitive: false,
      score: 0,
      uncertain: false,
      scannedAt: Date.now(),
    };
  }

  const predictions = await model.classify(element);
  return evaluatePredictions(predictions);
}

export function getCachedNsfwScan(mediaKey: string): NsfwScanResult | null {
  return scanCache.get(mediaKey) ?? null;
}

export function cacheNsfwScan(mediaKey: string, result: NsfwScanResult) {
  scanCache.set(mediaKey, result);
}

export async function scanImageBlob(blob: Blob): Promise<NsfwScanResult> {
  if (!isClient()) {
    return { sensitive: false, score: 0, uncertain: false, scannedAt: Date.now() };
  }

  const objectUrl = URL.createObjectURL(blob);
  try {
    const img = await loadImageElement(objectUrl);
    return classifyElement(img);
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

export async function scanMediaUrl(
  mediaKey: string,
  mediaType: "image" | "video" = "image",
): Promise<NsfwScanResult> {
  if (!mediaKey) {
    return { sensitive: false, score: 0, uncertain: false, scannedAt: Date.now() };
  }

  const cached = scanCache.get(mediaKey);
  if (cached) return cached;

  const pending = inflight.get(mediaKey);
  if (pending) return pending;

  const task = (async () => {
    try {
      const element =
        mediaType === "video"
          ? await captureVideoFrame(mediaKey)
          : await loadImageElement(mediaKey);
      const result = await classifyElement(element);
      scanCache.set(mediaKey, result);
      return result;
    } catch (error) {
      console.warn("nsfw scan failed", mediaKey, error);
      const fallback: NsfwScanResult = {
        sensitive: false,
        score: 0,
        uncertain: false,
        scannedAt: Date.now(),
      };
      scanCache.set(mediaKey, fallback);
      return fallback;
    } finally {
      inflight.delete(mediaKey);
    }
  })();

  inflight.set(mediaKey, task);
  return task;
}
