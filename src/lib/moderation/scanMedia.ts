"use client";

import { scanImageBlob, type NsfwScanResult } from "@/lib/moderation/nsfwDetector";

export type MediaScanPayload = {
  requiresBlur: boolean;
  score: number;
  uncertain: boolean;
  scannedAt: number;
};

export function toMediaScanPayload(result: NsfwScanResult): MediaScanPayload {
  return {
    requiresBlur: result.sensitive,
    score: result.score,
    uncertain: result.uncertain,
    scannedAt: result.scannedAt,
  };
}

export async function scanUploadFile(file: File): Promise<MediaScanPayload> {
  const isImage = file.type.startsWith("image/");
  const isVideo = file.type.startsWith("video/");

  if (!isImage && !isVideo) {
    return {
      requiresBlur: false,
      score: 0,
      uncertain: false,
      scannedAt: Date.now(),
    };
  }

  if (isVideo) {
    const frameBlob = await extractVideoFrameBlob(file);
    if (!frameBlob) {
      return {
        requiresBlur: false,
        score: 0,
        uncertain: false,
        scannedAt: Date.now(),
      };
    }
    return toMediaScanPayload(await scanImageBlob(frameBlob));
  }

  return toMediaScanPayload(await scanImageBlob(file));
}

async function extractVideoFrameBlob(file: File): Promise<Blob | null> {
  if (typeof document === "undefined") return null;

  const objectUrl = URL.createObjectURL(file);
  const video = document.createElement("video");
  video.muted = true;
  video.playsInline = true;
  video.src = objectUrl;

  try {
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
    if (!ctx) return null;
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

    return await new Promise<Blob | null>((resolve) => {
      canvas.toBlob((blob) => resolve(blob), "image/jpeg", 0.82);
    });
  } catch {
    return null;
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

export function firestoreScanFields(payload: MediaScanPayload) {
  return {
    autoModerationRequiresBlur: payload.requiresBlur,
    moderationRequiresBlur: payload.requiresBlur,
    moderationScore: payload.score,
    moderationUncertain: payload.uncertain,
    moderationScannedAt: new Date(payload.scannedAt).toISOString(),
    moderationModel: "nsfwjs",
  };
}
