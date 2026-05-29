"use client";

import { doc, getDoc, setDoc } from "firebase/firestore";

import { db } from "@/lib/firebase";
import type { MediaScanPayload } from "@/lib/moderation/scanMedia";

export async function persistProfileMediaScan(
  uid: string,
  mediaUrl: string,
  payload: MediaScanPayload,
) {
  if (!uid || !mediaUrl) return;

  const userRef = doc(db, "usuarios", uid);
  const snap = await getDoc(userRef);
  const existing = snap.exists() ? snap.data() : {};
  const flags = {
    ...(typeof existing.mediaBlurFlags === "object" && existing.mediaBlurFlags
      ? existing.mediaBlurFlags
      : {}),
  } as Record<string, boolean>;

  if (payload.requiresBlur) {
    flags[mediaUrl] = true;
  } else {
    delete flags[mediaUrl];
  }

  await setDoc(
    userRef,
    {
      mediaBlurFlags: flags,
      ...(payload.requiresBlur
        ? {
            adminBlurFotosPerfil: true,
            adminBlurAt: new Date(payload.scannedAt).toISOString(),
            adminBlurReason: "auto_nsfw",
          }
        : {}),
    },
    { merge: true },
  );
}
