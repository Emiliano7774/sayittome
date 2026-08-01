import {
  getDownloadURL,
  getStorage,
  ref,
  uploadBytesResumable,
} from "firebase/storage";

import {
  storageUploadMetadata,
  type StorageCacheOptions,
} from "@/lib/media/storageCacheControl";

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

export async function uploadChatMessageMedia(
  chatId: string,
  clientId: string,
  file: Blob,
  kind: "image" | "video" | "audio",
  onProgress?: (pct: number) => void,
  options?: { viewOnce?: boolean },
) {
  const ext = kind === "audio" ? "webm" : kind === "video" ? "mp4" : "jpg";
  const contentType =
    file.type ||
    (kind === "audio"
      ? "audio/webm"
      : kind === "video"
        ? "video/mp4"
        : "image/jpeg");

  const path = `chats/${chatId}/${clientId}_${ext}`;
  return uploadMedia(path, file, onProgress, contentType, {
    viewOnce: options?.viewOnce === true,
    category: options?.viewOnce ? "view_once" : "chat",
  });
}
