"use client";

import { useEffect, useRef, useState, type ChangeEvent } from "react";

import { useT } from "@/contexts/LocaleContext";
import {
  captureChatPhotoFromCamera,
  CHAT_FILE_INPUT_CLASS,
  classifyChatMediaFailure,
  fileFromChatInput,
  isNativeChatShell,
  openChatFileInput,
  prefersChatCaptureFileInput,
} from "@/lib/media/chatMediaCapture";

type Props = {
  open: boolean;
  onClose: () => void;
  onCapture: (file: File, kind: "image" | "video") => void;
};

export default function StoryLiveCamera({ open, onClose, onCapture }: Props) {
  const t = useT();
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const photoInputRef = useRef<HTMLInputElement>(null);
  const videoInputRef = useRef<HTMLInputElement>(null);
  const onCloseRef = useRef(onClose);
  const tRef = useRef(t);

  const [mode, setMode] = useState<"photo" | "video">("photo");
  const [recording, setRecording] = useState(false);
  const [busy, setBusy] = useState(false);

  const preferFileInput = prefersChatCaptureFileInput();

  onCloseRef.current = onClose;
  tRef.current = t;

  useEffect(() => {
    if (!open) return;
    document.body.classList.add("sayittome-story-camera-open");
    return () => {
      document.body.classList.remove("sayittome-story-camera-open");
    };
  }, [open]);

  useEffect(() => {
    if (!open || preferFileInput) return;

    let cancelled = false;

    void (async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: "environment" },
          audio: mode === "video",
        });

        if (cancelled) {
          stream.getTracks().forEach((track) => track.stop());
          return;
        }

        streamRef.current = stream;

        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play().catch(() => undefined);
        }
      } catch (error) {
        if (cancelled) return;
        if (classifyChatMediaFailure(error) === "cancelled") {
          onCloseRef.current();
          return;
        }
        window.alert(tRef.current("story_new_camera_fail"));
        onCloseRef.current();
      }
    })();

    return () => {
      cancelled = true;
      streamRef.current?.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
      recorderRef.current = null;
      chunksRef.current = [];
      setRecording(false);
    };
  }, [mode, open, preferFileInput]);

  if (!open) return null;

  function stopStream() {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
  }

  function deliverCapture(file: File, kind: "image" | "video") {
    const result = fileFromChatInput(file, "camera", kind);
    if (!result) return;
    stopStream();
    onCapture(result.file, result.type);
  }

  function handleCaptureInput(
    event: ChangeEvent<HTMLInputElement>,
    kind: "image" | "video",
  ) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    deliverCapture(file, kind);
  }

  async function captureNativeOrInputPhoto() {
    if (busy) return;
    if (isNativeChatShell()) {
      setBusy(true);
      try {
        const result = await captureChatPhotoFromCamera();
        if (result?.file) {
          deliverCapture(result.file, "image");
          return;
        }
      } catch (error) {
        if (classifyChatMediaFailure(error) === "cancelled") {
          onClose();
          return;
        }
      } finally {
        setBusy(false);
      }
    }

    if (!openChatFileInput(photoInputRef.current)) {
      window.alert(t("story_new_camera_fail"));
      onClose();
    }
  }

  function captureInputVideo() {
    if (busy) return;
    if (!openChatFileInput(videoInputRef.current)) {
      window.alert(t("story_new_camera_fail"));
      onClose();
    }
  }

  async function capturePhoto() {
    const video = videoRef.current;
    if (!video || busy) return;

    setBusy(true);

    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth || 1280;
    canvas.height = video.videoHeight || 720;

    const ctx = canvas.getContext("2d");
    if (!ctx) {
      setBusy(false);
      return;
    }

    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

    canvas.toBlob(
      (blob) => {
        setBusy(false);
        if (!blob) return;

        const file = new File([blob], `story-camera-${Date.now()}.jpg`, {
          type: "image/jpeg",
        });

        deliverCapture(file, "image");
      },
      "image/jpeg",
      0.92,
    );
  }

  function startVideo() {
    const stream = streamRef.current;
    if (!stream || recording) return;

    chunksRef.current = [];
    const recorder = new MediaRecorder(stream);
    recorderRef.current = recorder;

    recorder.ondataavailable = (event) => {
      if (event.data.size > 0) chunksRef.current.push(event.data);
    };

    recorder.onstop = () => {
      const blob = new Blob(chunksRef.current, { type: "video/webm" });
      const file = new File([blob], `story-camera-${Date.now()}.webm`, {
        type: blob.type || "video/webm",
      });

      deliverCapture(file, "video");
      setRecording(false);
      setBusy(false);
    };

    recorder.start();
    setRecording(true);
  }

  function stopVideo() {
    const recorder = recorderRef.current;
    if (!recorder || recorder.state === "inactive") return;
    setBusy(true);
    recorder.stop();
  }

  function handleClose() {
    if (recording) return;
    stopStream();
    onClose();
  }

  return (
    <div
      className="fixed inset-0 z-[10050] flex flex-col items-center justify-center bg-black/95 px-4 py-8"
      data-story-camera-path={preferFileInput ? "capture-input" : "live"}
    >
      <input
        ref={photoInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        className={CHAT_FILE_INPUT_CLASS}
        data-story-camera-photo-input=""
        onChange={(event) => handleCaptureInput(event, "image")}
      />
      <input
        ref={videoInputRef}
        type="file"
        accept="video/*"
        capture="environment"
        className={CHAT_FILE_INPUT_CLASS}
        data-story-camera-video-input=""
        onChange={(event) => handleCaptureInput(event, "video")}
      />

      {preferFileInput ? (
        <div className="flex max-w-sm flex-col items-center text-center">
          <p className="text-lg font-black text-white">{t("story_new_source_camera")}</p>
          <p className="mt-2 text-sm text-zinc-400">{t("story_new_source_camera_hint")}</p>
        </div>
      ) : (
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted
          className="max-h-[68vh] w-full max-w-2xl rounded-[2rem] bg-black object-cover"
        />
      )}

      <div className="mt-5 flex items-center gap-2">
        <button
          type="button"
          onClick={() => setMode("photo")}
          disabled={recording}
          className={[
            "rounded-full px-4 py-2 text-xs font-black",
            mode === "photo" ? "bg-white text-black" : "bg-white/10 text-white/70",
          ].join(" ")}
        >
          {t("story_new_camera_photo")}
        </button>
        <button
          type="button"
          onClick={() => setMode("video")}
          disabled={recording}
          className={[
            "rounded-full px-4 py-2 text-xs font-black",
            mode === "video" ? "bg-white text-black" : "bg-white/10 text-white/70",
          ].join(" ")}
        >
          {t("story_new_camera_video")}
        </button>
      </div>

      <div className="mt-5 flex items-center gap-3">
        {preferFileInput ? (
          <button
            type="button"
            onClick={() => {
              if (mode === "photo") {
                void captureNativeOrInputPhoto();
                return;
              }
              captureInputVideo();
            }}
            disabled={busy}
            className="rounded-full bg-fuchsia-500 px-6 py-3 text-sm font-black text-white disabled:opacity-50"
          >
            {mode === "photo"
              ? t("story_new_camera_capture")
              : t("story_new_camera_record")}
          </button>
        ) : mode === "photo" ? (
          <button
            type="button"
            onClick={() => void capturePhoto()}
            disabled={busy}
            className="rounded-full bg-fuchsia-500 px-6 py-3 text-sm font-black text-white disabled:opacity-50"
          >
            {t("story_new_camera_capture")}
          </button>
        ) : recording ? (
          <button
            type="button"
            onClick={stopVideo}
            disabled={busy}
            className="rounded-full bg-red-500 px-6 py-3 text-sm font-black text-white disabled:opacity-50"
          >
            {t("story_new_camera_stop")}
          </button>
        ) : (
          <button
            type="button"
            onClick={startVideo}
            className="rounded-full bg-fuchsia-500 px-6 py-3 text-sm font-black text-white"
          >
            {t("story_new_camera_record")}
          </button>
        )}

        <button
          type="button"
          onClick={handleClose}
          disabled={recording || busy}
          className="rounded-full border border-white/15 px-5 py-3 text-sm font-black text-white/70 disabled:opacity-50"
        >
          {t("story_new_camera_cancel")}
        </button>
      </div>
    </div>
  );
}
