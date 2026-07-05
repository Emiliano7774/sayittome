import {
  getDownloadURL,
  getStorage,
  ref,
  uploadBytesResumable,
} from "firebase/storage";

export async function uploadMedia(
  path: string,
  file: Blob,
  onProgress?: (
    pct: number,
  ) => void,
  contentType?: string,
) {
  const storage =
    getStorage();

  const storageRef = ref(
    storage,
    path,
  );

  const task =
    uploadBytesResumable(
      storageRef,
      file,
      contentType ? { contentType } : undefined,
    );

  await new Promise<void>(
    (resolve, reject) => {
      task.on(
        "state_changed",

        (snapshot) => {
          const pct =
            Math.round(
              (
                snapshot.bytesTransferred /
                snapshot.totalBytes
              ) * 100,
            );

          onProgress?.(pct);
        },

        reject,

        () => resolve(),
      );
    },
  );

  return getDownloadURL(
    storageRef,
  );
}

export async function uploadChatMessageMedia(
  chatId: string,
  clientId: string,
  file: Blob,
  kind: "image" | "video" | "audio",
  onProgress?: (pct: number) => void,
) {
  const ext =
    kind === "audio" ? "webm" : kind === "video" ? "mp4" : "jpg";
  const contentType =
    file.type ||
    (kind === "audio"
      ? "audio/webm"
      : kind === "video"
        ? "video/mp4"
        : "image/jpeg");

  return uploadMedia(
    `chats/${chatId}/${clientId}_${ext}`,
    file,
    onProgress,
    contentType,
  );
}
