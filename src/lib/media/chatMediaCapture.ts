"use client";

import { Capacitor } from "@capacitor/core";

export type ChatMediaCaptureResult = {
  file: File;
  type: "image" | "video";
  source: "camera" | "gallery";
};

export type ChatMediaCaptureFailure = "cancelled" | "denied" | "failed";

type PermissionKind = "camera" | "gallery" | "microphone";

export function isNativeChatShell() {
  return Capacitor.isNativePlatform();
}

export function isChatMediaUserCancelled(error: unknown) {
  const message = String(
    error instanceof Error
      ? error.message
      : (error as { message?: string } | null)?.message || error || "",
  ).toLowerCase();
  return (
    message.includes("cancel") ||
    message.includes("no image picked") ||
    message.includes("no photos picked")
  );
}

export function isChatMediaPermissionDenied(error: unknown) {
  const name =
    error instanceof DOMException
      ? error.name
      : String((error as { name?: string } | null)?.name || "");
  const message = String(
    error instanceof Error
      ? error.message
      : (error as { message?: string } | null)?.message || error || "",
  ).toLowerCase();
  return (
    name === "NotAllowedError" ||
    name === "PermissionDeniedError" ||
    message.includes("notallowed") ||
    (message.includes("permission") &&
      (message.includes("denied") || message.includes("dismiss")))
  );
}

export function classifyChatMediaFailure(error: unknown): ChatMediaCaptureFailure {
  if (isChatMediaUserCancelled(error)) return "cancelled";
  if (isChatMediaPermissionDenied(error)) return "denied";
  return "failed";
}

function isNativeShell() {
  return isNativeChatShell();
}

async function loadCameraPlugin() {
  const { Camera } = await import("@capacitor/camera");
  return Camera;
}

/**
 * Runtime CAMERA / RECORD_AUDIO only. Gallery on modern Android uses the
 * system picker (GET_CONTENT / Photo Picker) and must not request
 * READ_MEDIA_* / photos permission first — that steals the user gesture
 * and is unnecessary after Android 13.
 */
export async function ensureChatMediaPermission(kind: PermissionKind) {
  if (!isNativeShell()) return true;
  if (kind === "gallery") return true;
  if (kind === "microphone") return true;

  try {
    const Camera = await loadCameraPlugin();
    const current = await Camera.checkPermissions();
    if (current.camera === "granted") return true;
    const requested = await Camera.requestPermissions({
      permissions: ["camera"],
    });
    return requested.camera === "granted";
  } catch {
    // WebView getUserMedia / capture intents still prompt themselves.
    return true;
  }
}

async function uriToFile(uri: string, fileName: string, mimeType: string) {
  const response = await fetch(uri);
  const blob = await response.blob();
  return new File([blob], fileName, {
    type: mimeType || blob.type || "application/octet-stream",
  });
}

function mimeFromFormat(format?: string) {
  const normalized = String(format || "").toLowerCase();
  if (normalized === "png") return "image/png";
  if (normalized === "webp") return "image/webp";
  if (normalized === "gif") return "image/gif";
  return "image/jpeg";
}

function fileKind(file: File): "image" | "video" {
  if (file.type.startsWith("video/")) return "video";
  return "image";
}

/** Capacitor Camera photos only. Video always uses the file input capture path. */
export async function captureChatPhotoFromCamera(): Promise<ChatMediaCaptureResult | null> {
  if (!isNativeShell()) return null;

  try {
    const { Camera, CameraResultType, CameraSource } = await import(
      "@capacitor/camera"
    );
    const photo = await Camera.getPhoto({
      source: CameraSource.Camera,
      resultType: CameraResultType.Uri,
      quality: 90,
      saveToGallery: false,
      correctOrientation: true,
    });

    const uri = photo.webPath || photo.path || "";
    if (!uri) {
      throw Object.assign(new Error("chat_media_empty_uri"), {
        code: "chat_media_failed",
      });
    }

    const mimeType = mimeFromFormat(photo.format);
    const file = await uriToFile(
      uri,
      `chat-camera.${photo.format || "jpg"}`,
      mimeType,
    );

    return {
      file,
      type: "image",
      source: "camera",
    };
  } catch (error) {
    if (classifyChatMediaFailure(error) === "cancelled") {
      throw Object.assign(new Error("chat_media_cancelled"), {
        code: "chat_media_cancelled",
      });
    }
    throw Object.assign(
      error instanceof Error ? error : new Error("chat_media_failed"),
      { code: "chat_media_failed" },
    );
  }
}

export async function pickChatPhotoFromGallery(): Promise<ChatMediaCaptureResult | null> {
  // Native gallery must use the hidden file input so video is included and
  // the click stays in the user-gesture stack. The Camera plugin is photos-only.
  return null;
}

export async function ensureChatMicrophonePermission() {
  const { ensureChatMicrophonePermission: requestNative } = await import(
    "@/lib/media/chatMicrophonePermission"
  );
  const result = await requestNative();
  return result.allowed;
}

export async function ensureChatCameraStreamPermission(includeAudio: boolean) {
  if (!isNativeShell()) return true;
  void includeAudio;
  // Capture intents / getUserMedia request CAMERA (+ RECORD_AUDIO) themselves.
  return true;
}

export function resetChatFileInput(input: HTMLInputElement | null) {
  if (!input) return;
  input.value = "";
}

/**
 * Must run in the same turn as the user click. Awaiting permissions first
 * drops the Android WebView user gesture and onShowFileChooser never fires.
 */
export function openNativeGalleryFilePicker(input: HTMLInputElement | null) {
  if (!input) return false;
  resetChatFileInput(input);
  input.click();
  return true;
}

export function openChatFileInput(input: HTMLInputElement | null) {
  return openNativeGalleryFilePicker(input);
}

/** Android WebView ignores programmatic click on `display:none` file inputs. */
export const CHAT_FILE_INPUT_CLASS =
  "pointer-events-none absolute h-px w-px overflow-hidden opacity-0";

export function fileFromChatInput(
  file: File | null | undefined,
  source: "camera" | "gallery",
): ChatMediaCaptureResult | null {
  if (!file) return null;
  return {
    file,
    type: fileKind(file),
    source,
  };
}
