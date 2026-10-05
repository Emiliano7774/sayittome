import { arrayUnion, doc, serverTimestamp, setDoc } from "firebase/firestore";

import { db } from "@/lib/firebase";

type UploadedMedia = { url: string; type: "image" | "video" };

/** Keep uploaded photos and videos on the profile even if a later reload races the editor. */
export async function persistUploadedProfileMedia(uid: string, items: UploadedMedia[]) {
  const fotos = items.filter((item) => item.type === "image" && item.url).map((item) => item.url);
  const videos = items.filter((item) => item.type === "video" && item.url).map((item) => item.url);
  const patch: Record<string, unknown> = { updatedAt: serverTimestamp() };
  if (fotos.length > 0) patch.fotos = arrayUnion(...fotos);
  if (videos.length > 0) patch.videos = arrayUnion(...videos);
  if (!patch.fotos && !patch.videos) return;
  await setDoc(doc(db, "usuarios", uid), patch, { merge: true });
}
