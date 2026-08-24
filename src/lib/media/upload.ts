import {
  deleteObject,
  getDownloadURL,
  getStorage,
  ref,
  uploadBytesResumable,
} from "firebase/storage";

import { ensureStorageAuth } from "@/lib/auth/ensureStorageAuth";
import { chatAudioExtension } from "@/lib/media/chatAudioPlayback";
import { formatStorageUploadError } from "@/lib/media/uploadFileToStorage";
import {
  storageUploadMetadata,
  type StorageCacheOptions,
} from "@/lib/media/storageCacheControl";

export type ChatMediaUploadDeps = {
  ensureStorageAuth?: typeof ensureStorageAuth;
  uploadMedia?: typeof uploadMedia;
};

export type ChatMediaUploadResult = {
  url: string;
  path: string;
};

export async function uploadMedia(
  path: string,
  file: Blob,
  onProgress?: (pct: number) => void,
  contentType?: string,
  cache?: StorageCacheOptions,
) {
  const storage = getStorage();
  const storageRef = ref(storage, path);

  const task = uploadBytesResumable(
    storageRef,
    file,
    contentType ? storageUploadMetadata(contentType, path, cache) : undefined,
  );

  await new Promise<void>((resolve, reject) => {
    task.on(
      "state_changed",
      (snapshot) => {
        const pct = Math.round(
          (snapshot.bytesTransferred / snapshot.totalBytes) * 100,
        );
        onProgress?.(pct);
      },
      reject,
      () => resolve(),
    );
  });

  return getDownloadURL(storageRef);
}

export function chatMessageMediaPath(
  chatId: string,
  clientId: string,
  kind: "image" | "video" | "audio",
  mime?: string,
) {
  const ext =
    kind === "audio"
      ? chatAudioExtension(mime || "audio/webm")
      : kind === "video"
        ? "mp4"
        : "jpg";
  return `chats/${chatId}/${clientId}_${ext}`;
}

export function isChatMediaStorageUnauthorized(error: unknown) {
  return formatStorageUploadError(error) === "storage_unauthorized";
}

export async function uploadChatMessageMedia(
  chatId: string,
  clientId: string,
  file: Blob,
  kind: "image" | "video" | "audio",
  onProgress?: (pct: number) => void,
  options?: { viewOnce?: boolean },
  deps?: ChatMediaUploadDeps,
): Promise<ChatMediaUploadResult> {
  await (deps?.ensureStorageAuth ?? ensureStorageAuth)({ allowAnonymous: true });

  const contentType =
    file.type ||
    (kind === "audio"
      ? "audio/webm"
      : kind === "video"
        ? "video/mp4"
        : "image/jpeg");

  const path = chatMessageMediaPath(chatId, clientId, kind, contentType);
  const upload = deps?.uploadMedia ?? uploadMedia;
  const url = await upload(path, file, onProgress, contentType, {
    viewOnce: options?.viewOnce === true,
    category: options?.viewOnce ? "view_once" : "chat",
  });
  return { url, path };
}

/** Idempotent Storage cleanup after Firestore/callable failure (no orphan file). */
export async function deleteChatMessageMediaAtPath(path: string) {
  const clean = String(path || "").trim();
  if (!clean) return;
  try {
    await deleteObject(ref(getStorage(), clean));
  } catch (error) {
    const code = String((error as { code?: string })?.code || "");
    if (code === "storage/object-not-found") return;
    throw error;
  }
}
