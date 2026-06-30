"use client";

import type { MediaScanPayload } from "@/lib/moderation/scanMedia";

/** Runtime NSFW scan only — do not persist auto-blur penalties to Firestore. */
export async function persistProfileMediaScan(
  _uid: string,
  _mediaUrl: string,
  _payload: MediaScanPayload,
) {
  return;
}
