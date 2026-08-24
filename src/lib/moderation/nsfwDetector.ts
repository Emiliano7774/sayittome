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
let networkLoadsForTests = 0;

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

  const sensitive = porn >= PORN_BLUR_THRESHOLD || hentai >= HENTAI_BLUR_THRESHOLD;
  const uncertain = !sensitive && explicit >= UNCERTAIN_EXPLICIT_MIN;

  return {
    sensitive,
    score: explicit,
    uncertain,
    scannedAt: Date.now(),
  };
}

function sameMediaSrc(candidate: string, target: string) {
  if (!candidate || !target) return false;
  if (candidate === target) return true;
  try {
    return (
      new URL(candidate, window.location.href).href ===
      new URL(target, window.location.href).href
    );
  } catch {
    return false;
  }
}

/** Prefer already-rendered media so NSFW scan does not open a second network GET. */
export function findLoadedMediaElement(
  src: string,
  mediaType: "image" | "video" = "image",
): HTMLImageElement | HTMLVideoElement | null {
  if (!isClient() || !src) return null;

  if (mediaType === "image") {
    const images = document.querySelectorAll("img");
    for (const img of images) {
      if (!sameMediaSrc(img.currentSrc || img.src, src)) continue;
      if (img.complete && img.naturalWidth > 0) return img;
    }
    return null;
  }

  const videos = document.querySelectorAll("video");
  for (const video of videos) {
    if (!sameMediaSrc(video.currentSrc || video.src, src)) continue;
    if (video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) return video;
  }
  return null;
}

async function waitForDomMedia(
  src: string,
  mediaType: "image" | "video",
  timeoutMs = 2500,
) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    const existing = findLoadedMediaElement(src, mediaType);
    if (existing) return existing;
    await new Promise((resolve) => window.setTimeout(resolve, 40));
  }
  return null;
}

function loadImageElement(src: string) {
  networkLoadsForTests += 1;
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("image_load_failed"));
    img.src = src;
  });
}

async function captureVideoFrameFromElement(video: HTMLVideoElement) {
  const canvas = document.createElement("canvas");
  canvas.width = Math.min(video.videoWidth || 640, 640);
  canvas.height = Math.min(video.videoHeight || 640, 640);
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("canvas_unavailable");
  ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
  return canvas;
}

async function captureVideoFrame(videoSrc: string) {
  const existing = findLoadedMediaElement(videoSrc, "video");
  if (existing instanceof HTMLVideoElement) {
    return captureVideoFrameFromElement(existing);
  }

  networkLoadsForTests += 1;
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

  return captureVideoFrameFromElement(video);
}

async function classifyElement(
  element: HTMLImageElement | HTMLCanvasElement | HTMLVideoElement,
): Promise<NsfwScanResult> {
  try {
    const model = await loadModel();
    if (!model) return scanFailureFallback();

    const predictions = await model.classify(element);
    return evaluatePredictions(predictions);
  } catch (error) {
    console.warn("nsfw classify failed", error);
    return scanFailureFallback();
  }
}

async function classifyFromElement(
  element: HTMLImageElement | HTMLVideoElement | HTMLCanvasElement,
) {
  const source =
    element instanceof HTMLVideoElement
      ? await captureVideoFrameFromElement(element)
      : element;
  return classifyElement(source);
}

function rememberResult(mediaKey: string, result: NsfwScanResult) {
  scanCache.set(mediaKey, result);
  return result;
}

function fallbackResult(): NsfwScanResult {
  return {
    sensitive: false,
    score: 0,
    uncertain: false,
    scannedAt: Date.now(),
  };
}

/** Scanner crashed/unavailable — do not block send; mark uncertain for backend. */
function scanFailureFallback(): NsfwScanResult {
  return {
    sensitive: false,
    score: 0,
    uncertain: true,
    scannedAt: Date.now(),
  };
}

export function getCachedNsfwScan(mediaKey: string): NsfwScanResult | null {
  return scanCache.get(mediaKey) ?? null;
}

export function cacheNsfwScan(mediaKey: string, result: NsfwScanResult) {
  scanCache.set(mediaKey, result);
}

export function resetNsfwScanNetworkCountersForTests() {
  networkLoadsForTests = 0;
}

export function getNsfwScanNetworkLoadCountForTests() {
  return networkLoadsForTests;
}

export async function scanImageBlob(blob: Blob): Promise<NsfwScanResult> {
  if (!isClient()) return fallbackResult();

  const objectUrl = URL.createObjectURL(blob);
  try {
    const img = await loadImageElement(objectUrl);
    return await classifyElement(img);
  } catch (error) {
    console.warn("nsfw blob scan failed", error);
    return scanFailureFallback();
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

/** Scan an already-loaded element without opening a new Storage request. */
export async function scanMediaElement(
  mediaKey: string,
  element: HTMLImageElement | HTMLVideoElement | HTMLCanvasElement,
): Promise<NsfwScanResult> {
  if (!mediaKey) return fallbackResult();
  const cached = scanCache.get(mediaKey);
  if (cached) return cached;

  const pending = inflight.get(mediaKey);
  if (pending) return pending;

  const task = (async () => {
    try {
      return rememberResult(mediaKey, await classifyFromElement(element));
    } catch (error) {
      console.warn("nsfw element scan failed", mediaKey, error);
      return rememberResult(mediaKey, scanFailureFallback());
    } finally {
      inflight.delete(mediaKey);
    }
  })();

  inflight.set(mediaKey, task);
  return task;
}

export async function scanMediaUrl(
  mediaKey: string,
  mediaType: "image" | "video" = "image",
): Promise<NsfwScanResult> {
  if (!mediaKey) return fallbackResult();

  const cached = scanCache.get(mediaKey);
  if (cached) return cached;

  const pending = inflight.get(mediaKey);
  if (pending) return pending;

  const task = (async () => {
    try {
      const domMedia = await waitForDomMedia(mediaKey, mediaType);
      if (domMedia) {
        return rememberResult(mediaKey, await classifyFromElement(domMedia));
      }

      const element =
        mediaType === "video"
          ? await captureVideoFrame(mediaKey)
          : await loadImageElement(mediaKey);
      return rememberResult(mediaKey, await classifyElement(element));
    } catch (error) {
      console.warn("nsfw scan failed", mediaKey, error);
      return rememberResult(mediaKey, scanFailureFallback());
    } finally {
      inflight.delete(mediaKey);
    }
  })();

  inflight.set(mediaKey, task);
  return task;
}
