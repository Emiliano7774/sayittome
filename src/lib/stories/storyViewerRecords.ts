"use client";

import {
  collection,
  doc,
  getDoc,
  getDocs,
  serverTimestamp,
  setDoc,
} from "firebase/firestore";

import { db } from "@/lib/firebase";
import { getCountryByCode } from "@/lib/geo/countries";
import { fetchProfileStoryIdentity } from "@/lib/stories/storyAuthor";
import {
  collectStoryViewerIds,
  formatStoryViewerLocation,
  isAnonymousStoryViewerId,
  mergeStoryViewerRows,
  type StoryViewerRow,
} from "@/lib/stories/storyViewers";
import type { StoryItem } from "@/lib/stories/types";

let cachedViewerCountry = "";

export async function readViewerGeoHint() {
  if (cachedViewerCountry) {
    return { pais: cachedViewerCountry, provincia: "" };
  }
  try {
    const res = await fetch("/api/locale/detect", { cache: "no-store" });
    const json = (await res.json()) as { countryCode?: string | null };
    cachedViewerCountry = String(json.countryCode || "").trim().toUpperCase();
  } catch {
    cachedViewerCountry = "";
  }
  return { pais: cachedViewerCountry, provincia: "" };
}

export async function upsertStoryViewerRecord(input: {
  storyId: string;
  viewerId: string;
  ownerUid?: string;
  liked?: boolean;
  username?: string;
  photo?: string;
  pais?: string;
  provincia?: string;
}) {
  const storyId = String(input.storyId || "").trim();
  const viewerId = String(input.viewerId || "").trim();
  const ownerUid = String(input.ownerUid || "").trim();
  if (!storyId || !viewerId || (ownerUid && viewerId === ownerUid)) return;

  const anonymous = isAnonymousStoryViewerId(viewerId);
  const payload: Record<string, unknown> = {
    viewerId,
    kind: anonymous ? "anon" : "profile",
    updatedAt: serverTimestamp(),
  };
  if (input.liked === true) {
    payload.liked = true;
    payload.likedAt = serverTimestamp();
  } else if (input.liked === false) {
    payload.liked = false;
  } else {
    payload.viewedAt = serverTimestamp();
  }
  if (input.username) payload.username = input.username;
  if (input.photo) payload.photo = input.photo;
  if (anonymous) {
    if (input.pais) payload.pais = input.pais;
    if (input.provincia) payload.provincia = input.provincia;
  }

  await setDoc(doc(db, "historias", storyId, "vistas", viewerId), payload, { merge: true });
}

function tsToMs(value: unknown) {
  if (!value) return 0;
  if (typeof (value as { toMillis?: () => number }).toMillis === "function") {
    return (value as { toMillis: () => number }).toMillis();
  }
  const date = new Date(String(value));
  return Number.isNaN(date.getTime()) ? 0 : date.getTime();
}

export async function loadStoryViewers(story: StoryItem): Promise<StoryViewerRow[]> {
  const ids = collectStoryViewerIds({
    viewedBy: story.viewedBy,
    viewedByAnon: story.viewedByAnon,
    likedBy: story.likedBy,
    ownerUid: story.ownerUid,
  });

  const fromVistas = new Map<string, Partial<StoryViewerRow> & { id: string }>();
  try {
    const snap = await getDocs(collection(db, "historias", story.id, "vistas"));
    for (const docSnap of snap.docs) {
      const data = docSnap.data() || {};
      const id = String(data.viewerId || docSnap.id).trim();
      if (!id || id === story.ownerUid) continue;
      const pais = String(data.pais || "").trim();
      const provincia = String(data.provincia || "").trim();
      fromVistas.set(id, {
        id,
        kind:
          data.kind === "anon" ||
          isAnonymousStoryViewerId(id) ||
          isAnonymousStoryViewerId(String(data.username || ""))
            ? "anon"
            : "profile",
        username: isAnonymousStoryViewerId(String(data.username || ""))
          ? ""
          : String(data.username || "").trim(),
        photo: String(data.photo || "").trim(),
        pais,
        provincia,
        locationLabel: formatStoryViewerLocation({
          pais,
          provincia,
          countryName: getCountryByCode(pais)?.name || "",
        }),
        liked: data.liked === true || story.likedBy?.[id] === true,
        viewedAtMs: tsToMs(data.viewedAt),
        likedAtMs: tsToMs(data.likedAt),
      });
    }
  } catch {
    // Fall back to the maps on the story doc.
  }

  const missing = ids.filter((id) => !fromVistas.has(id));
  const hydrated = await Promise.all(
    missing.map(async (id) => {
      const liked = story.likedBy?.[id] === true;
      if (isAnonymousStoryViewerId(id) || !story.viewedBy?.[id]) {
        return {
          id,
          kind: "anon" as const,
          liked,
          username: "",
          photo: "",
          pais: "",
          provincia: "",
          locationLabel: "",
          viewedAtMs: 0,
          likedAtMs: 0,
        };
      }
      const profile = await fetchProfileStoryIdentity(id).catch(() => ({ username: "", photo: "" }));
      if (!profile.username) {
        const snap = await getDoc(doc(db, "usuarios", id)).catch(() => null);
        const data = snap?.data() || {};
        const username = String(data.username || data.usernameLower || "").trim();
        const anonymous = !username || isAnonymousStoryViewerId(username);
        return {
          id,
          kind: anonymous ? ("anon" as const) : ("profile" as const),
          liked,
          username: anonymous ? "" : username,
          photo: anonymous ? "" : String(data.fotoPrincipal || data.photoURL || "").trim(),
          pais: "",
          provincia: "",
          locationLabel: "",
          viewedAtMs: 0,
          likedAtMs: 0,
        };
      }
      if (isAnonymousStoryViewerId(profile.username)) {
        return {
          id,
          kind: "anon" as const,
          liked,
          username: "",
          photo: "",
          pais: "",
          provincia: "",
          locationLabel: "",
          viewedAtMs: 0,
          likedAtMs: 0,
        };
      }
      return {
        id,
        kind: "profile" as const,
        liked,
        username: profile.username,
        photo: profile.photo,
        pais: "",
        provincia: "",
        locationLabel: "",
        viewedAtMs: 0,
        likedAtMs: 0,
      };
    }),
  );

  return mergeStoryViewerRows([...fromVistas.values(), ...hydrated]);
}
