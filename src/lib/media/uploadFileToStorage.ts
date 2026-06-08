import {
  getDownloadURL,
  ref,
  uploadBytesResumable,
  type UploadTaskSnapshot,
} from "firebase/storage";

import { ensureStorageAuth } from "@/lib/auth/ensureStorageAuth";
import {
  guessMediaFileKind,
  resolveUploadContentType,
  type MediaFileKind,
} from "@/lib/media/fileKind";
import { storage } from "@/lib/firebase";

type UploadOptions = {
  path: string;
  file: File;
  kind?: MediaFileKind;
  onProgress?: (pct: number) => void;
};

export async function uploadFileToStorage({
  path,
  file,
  kind,
  onProgress,
}: UploadOptions): Promise<string> {
  await ensureStorageAuth();

  const resolvedKind = kind || guessMediaFileKind(file);
  if (!resolvedKind) {
    throw new Error("unsupported_media_type");
  }

  const contentType = resolveUploadContentType(file, resolvedKind);
  const storageRef = ref(storage, path);

  await new Promise<void>((resolve, reject) => {
    const task = uploadBytesResumable(storageRef, file, { contentType });

    task.on(
      "state_changed",
      (snapshot: UploadTaskSnapshot) => {
        if (!snapshot.totalBytes) return;
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
