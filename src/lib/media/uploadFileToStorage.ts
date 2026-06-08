import {
  getDownloadURL,
  ref,
  uploadBytesResumable,
  type UploadTaskSnapshot,
} from "firebase/storage";

import {
  ensureRegisteredStorageAuth,
  ensureStorageAuth,
} from "@/lib/auth/ensureStorageAuth";
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
  /** Profile uploads must use the signed-in account, not anonymous fallback. */
  requireRegisteredUser?: boolean;
  /** Allow anonymous Firebase auth when no session exists (stories for visitors). */
  allowAnonymousAuth?: boolean;
};

export function formatStorageUploadError(error: unknown): string {
  const code = String((error as { code?: string })?.code || "");
  const message = String((error as { message?: string })?.message || "");

  if (code === "storage/unauthorized" || message.includes("unauthorized")) {
    return "storage_unauthorized";
  }
  if (code === "auth/operation-not-allowed") {
    return "anon_auth_disabled";
  }
  if (code === "storage/canceled") {
    return "upload_canceled";
  }
  if (message === "auth_required") {
    return "auth_required";
  }
  if (message === "unsupported_media_type") {
    return "unsupported_media_type";
  }

  return "upload_failed";
}

export function profileUploadErrorKey(error: unknown) {
  const code = formatStorageUploadError(error);

  switch (code) {
    case "auth_required":
      return "edit_upload_auth_required" as const;
    case "storage_unauthorized":
      return "edit_upload_unauthorized" as const;
    case "unsupported_media_type":
      return "edit_upload_unsupported" as const;
    default:
      return "edit_upload_fail" as const;
  }
}

export async function uploadFileToStorage({
  path,
  file,
  kind,
  onProgress,
  requireRegisteredUser = false,
  allowAnonymousAuth = false,
}: UploadOptions): Promise<string> {
  if (requireRegisteredUser) {
    await ensureRegisteredStorageAuth();
  } else {
    await ensureStorageAuth({ allowAnonymous: allowAnonymousAuth });
  }

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
