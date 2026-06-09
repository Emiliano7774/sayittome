import { doc, getDoc, updateDoc } from "firebase/firestore";

import { FEATURE_ANNOUNCEMENT_KEY } from "@/lib/boost/constants";
import { db } from "@/lib/firebase";

const PREFIX = "sayittome_feature_seen_";
const FIRESTORE_FIELD = "featureAnnouncementsSeen";

function storageKey(uid: string, featureKey: string) {
  return `${PREFIX}${featureKey}:${uid}`;
}

function legacyStorageKey(featureKey: string) {
  return `${PREFIX}${featureKey}`;
}

function readLocalSeen(uid: string, featureKey: string) {
  if (typeof window === "undefined") return true;

  try {
    if (localStorage.getItem(storageKey(uid, featureKey)) === "1") {
      return true;
    }

    // One-time migration from device-wide key to per-profile key.
    if (localStorage.getItem(legacyStorageKey(featureKey)) === "1") {
      localStorage.setItem(storageKey(uid, featureKey), "1");
      localStorage.removeItem(legacyStorageKey(featureKey));
      return true;
    }

    return false;
  } catch {
    return true;
  }
}

function writeLocalSeen(uid: string, featureKey: string) {
  if (typeof window === "undefined") return;

  try {
    localStorage.setItem(storageKey(uid, featureKey), "1");
    localStorage.removeItem(legacyStorageKey(featureKey));
  } catch {
    // ignore
  }
}

export function hasSeenFeatureAnnouncement(
  uid: string,
  featureKey = FEATURE_ANNOUNCEMENT_KEY,
) {
  if (!uid) return true;
  return readLocalSeen(uid, featureKey);
}

export async function hasSeenFeatureAnnouncementForUser(
  uid: string,
  featureKey = FEATURE_ANNOUNCEMENT_KEY,
) {
  if (!uid) return true;
  if (readLocalSeen(uid, featureKey)) return true;

  try {
    const snap = await getDoc(doc(db, "usuarios", uid));
    const data = snap.data() as
      | { featureAnnouncementsSeen?: Record<string, boolean> }
      | undefined;
    const seenOnServer = data?.featureAnnouncementsSeen?.[featureKey] === true;

    if (seenOnServer) {
      writeLocalSeen(uid, featureKey);
    }

    return seenOnServer;
  } catch {
    return false;
  }
}

export function markFeatureAnnouncementSeen(
  uid: string,
  featureKey = FEATURE_ANNOUNCEMENT_KEY,
) {
  if (!uid) return;
  writeLocalSeen(uid, featureKey);
}

export async function persistFeatureAnnouncementSeen(
  uid: string,
  featureKey = FEATURE_ANNOUNCEMENT_KEY,
) {
  if (!uid) return;

  writeLocalSeen(uid, featureKey);

  try {
    await updateDoc(doc(db, "usuarios", uid), {
      [`${FIRESTORE_FIELD}.${featureKey}`]: true,
    });
  } catch {
    // Local cache still prevents repeat on this device.
  }
}
