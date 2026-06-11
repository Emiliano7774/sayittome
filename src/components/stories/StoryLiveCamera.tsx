"use client";

import { useEffect, useRef, useState } from "react";

import { useT } from "@/contexts/LocaleContext";

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

  const [mode, setMode] = useState<"photo" | "video">("photo");
  const [recording, setRecording] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;

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
      } catch {
        window.alert(t("story_new_camera_fail"));
        onClose();
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
  }, [mode, onClose, open, t]);

  if (!open) return null;

  function stopStream() {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
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

        stopStream();
        onCapture(file, "image");
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

      stopStream();
      onCapture(file, "video");
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
    <div className="fixed inset-0 z-[120] flex flex-col items-center justify-center bg-black/95 px-4 py-8">
      <video
        ref={videoRef}
        autoPlay
        playsInline
        muted
        className="max-h-[68vh] w-full max-w-2xl rounded-[2rem] bg-black object-cover"
      />

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
        {mode === "photo" ? (
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
