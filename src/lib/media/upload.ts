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
