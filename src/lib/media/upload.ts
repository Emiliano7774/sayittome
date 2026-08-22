import {
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
) {
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
  return upload(path, file, onProgress, contentType, {
    viewOnce: options?.viewOnce === true,
    category: options?.viewOnce ? "view_once" : "chat",
  });
}
