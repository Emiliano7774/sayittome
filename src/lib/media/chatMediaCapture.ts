"use client";

import { Capacitor } from "@capacitor/core";

export type ChatMediaCaptureResult = {
  file: File;
  type: "image" | "video";
  source: "camera" | "gallery";
};

type PermissionKind = "camera" | "gallery" | "microphone";

function isNativeShell() {
  return Capacitor.isNativePlatform();
}

async function loadCameraPlugin() {
  const { Camera } = await import("@capacitor/camera");
  return Camera;
}

export async function ensureChatMediaPermission(kind: PermissionKind) {
  if (!isNativeShell()) return true;

  try {
    const Camera = await loadCameraPlugin();
    const permissions =
      kind === "microphone"
        ? (["camera"] as const)
        : kind === "camera"
          ? (["camera"] as const)
          : (["photos"] as const);

    const current = await Camera.checkPermissions();
    const alreadyGranted =
      kind === "gallery"
        ? current.photos === "granted"
        : current.camera === "granted";

    if (alreadyGranted) return true;

    const requested = await Camera.requestPermissions({ permissions: [...permissions] });

    if (kind === "gallery") {
      return requested.photos === "granted";
    }

    return requested.camera === "granted";
  } catch {
    return false;
  }
}

async function uriToFile(uri: string, fileName: string, mimeType: string) {
  const response = await fetch(uri);
  const blob = await response.blob();
  return new File([blob], fileName, { type: mimeType || blob.type || "application/octet-stream" });
}

function mimeFromFormat(format?: string) {
  const normalized = String(format || "").toLowerCase();
  if (normalized === "png") return "image/png";
  if (normalized === "webp") return "image/webp";
  if (normalized === "gif") return "image/gif";
  return "image/jpeg";
}

export async function captureChatPhotoFromCamera(): Promise<ChatMediaCaptureResult | null> {
  if (!isNativeShell()) return null;

  const allowed = await ensureChatMediaPermission("camera");
  if (!allowed) return null;

  try {
    const { Camera, CameraResultType, CameraSource } = await import("@capacitor/camera");
    const photo = await Camera.getPhoto({
      source: CameraSource.Camera,
      resultType: CameraResultType.Uri,
      quality: 90,
      saveToGallery: false,
      correctOrientation: true,
    });

    const uri = photo.webPath || photo.path || "";
    if (!uri) return null;

    const mimeType = mimeFromFormat(photo.format);
    const file = await uriToFile(uri, `chat-camera.${photo.format || "jpg"}`, mimeType);

    return {
      file,
      type: "image",
      source: "camera",
    };
  } catch {
    return null;
  }
}

export async function pickChatPhotoFromGallery(): Promise<ChatMediaCaptureResult | null> {
  if (!isNativeShell()) return null;

  const allowed = await ensureChatMediaPermission("gallery");
  if (!allowed) return null;

  try {
    const { Camera, CameraResultType, CameraSource } = await import("@capacitor/camera");
    const photo = await Camera.getPhoto({
      source: CameraSource.Photos,
      resultType: CameraResultType.Uri,
      quality: 95,
      correctOrientation: true,
    });

    const uri = photo.webPath || photo.path || "";
    if (!uri) return null;

    const mimeType = mimeFromFormat(photo.format);
    const file = await uriToFile(uri, `chat-gallery.${photo.format || "jpg"}`, mimeType);

    return {
      file,
      type: "image",
      source: "gallery",
    };
  } catch {
    return null;
  }
}

export async function ensureChatMicrophonePermission() {
  if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia) {
    return false;
  }

  if (!isNativeShell()) {
    return true;
  }

  // Native WebView prompts for RECORD_AUDIO via getUserMedia itself.
  // Do not gate audio-only capture on the Capacitor Camera plugin.
  return true;
}

export async function ensureChatCameraStreamPermission(includeAudio: boolean) {
  if (!isNativeShell()) return true;

  const cameraOk = await ensureChatMediaPermission("camera");
  if (!cameraOk) return false;

  if (!includeAudio) return true;

  return ensureChatMicrophonePermission();
}

export async function openNativeGalleryFilePicker(input: HTMLInputElement | null) {
  if (!input) return false;

  const allowed = await ensureChatMediaPermission("gallery");
  if (!allowed) return false;

  input.click();
  return true;
}
