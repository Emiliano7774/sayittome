"use client";

import { Bomb, Camera, Image as ImageIcon, Reply, Send, Video, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import ChatAudioHoldLockMic from "@/components/chat/ChatAudioHoldLockMic";
import ChatAudioPlayer from "@/components/chat/ChatAudioPlayer";
import { useT } from "@/contexts/LocaleContext";
import { useAuth } from "@/contexts/AuthContext";
import { formatChatMediaFailAlert } from "@/lib/chat/chatMediaSendFailure";
import { replyQuoteText } from "@/lib/chat/replyQuote";
import {
  describeAnonDirectMediaSendFailure,
  sendAnonDirectMediaMessage,
} from "@/lib/anonMatch/anonDirectMediaSend";
import type { AnonDirectChatMessage } from "@/lib/anonMatch/anonDirectMessageModel";
import { getAnonDirectViewOnceCapability } from "@/lib/anonMatch/anonDirectViewOnceCapability";
import { VIEW_ONCE_DEFAULT_LIMIT } from "@/lib/media/viewOncePolicy";
import {
  CHAT_AUDIO_MIN_BYTES,
  classifyChatAudioCaptureFailure,
  pickSupportedAudioMimeType,
  reduceChatAudioEvent,
  type ChatAudioPhase,
} from "@/lib/media/chatAudioCapture";
import { preparePlayableChatAudio } from "@/lib/media/chatAudioPlayback";
import {
  CHAT_FILE_INPUT_CLASS,
  classifyChatMediaFailure,
  fileFromChatInput,
  isChatCameraPermissionStickyDenied,
  isNativeChatShell,
  openChatFileInput,
  prefersChatCaptureFileInput,
} from "@/lib/media/chatMediaCapture";
import {
  captureTrustedChatAudioStream,
  ensureChatMicrophonePermission,
  noticeFromCaptureFailure,
  noticeFromMicrophonePermission,
  openChatMicrophoneSettings,
  planChatMicrophoneStart,
  type ChatMicrophonePermissionState,
} from "@/lib/media/chatMicrophonePermission";

type Props = {
  closed: boolean;
  modern: boolean;
  chatId: string;
  senderId: string;
  senderTipo: "perfil" | "anonimo";
  text: string;
  sending: boolean;
  replyingTo: AnonDirectChatMessage | null;
  onTextChange: (value: string) => void;
  onSendText: () => void;
  onClearReply: () => void;
  onMediaSent: (message: AnonDirectChatMessage) => void;
  onNotice: (notice: string) => void;
  inputRef: React.RefObject<HTMLInputElement | null>;
};

export default function AnonDirectMediaComposer({
  closed,
  modern,
  chatId,
  senderId,
  senderTipo,
  text,
  sending,
  replyingTo,
  onTextChange,
  onSendText,
  onClearReply,
  onMediaSent,
  onNotice,
  inputRef,
}: Props) {
  const t = useT();
  const { firebaseUser } = useAuth();
  const bombCap = getAnonDirectViewOnceCapability();
  const bombsEnabled = bombCap.maySendViewOnce === true;

  const [pendingBlob, setPendingBlob] = useState<Blob | null>(null);
  const [pendingType, setPendingType] = useState<"audio" | "image" | "video" | null>(null);
  const [pendingSource, setPendingSource] = useState<"camera" | "gallery" | "audio" | undefined>();
  const [imagePreview, setImagePreview] = useState("");
  const [videoPreview, setVideoPreview] = useState("");
  const [audioPreview, setAudioPreview] = useState("");
  const [viewOnce, setViewOnce] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<number | null>(null);
  const [mediaSending, setMediaSending] = useState(false);
  const [recording, setRecording] = useState(false);
  const [micNotice, setMicNotice] = useState<"blocked" | "denied" | "failed" | null>(null);
  const [cameraMode, setCameraMode] = useState<"photo" | "video" | null>(null);
  const [cameraStream, setCameraStream] = useState<MediaStream | null>(null);
  const [liveRecording, setLiveRecording] = useState(false);

  const cameraPhotoRef = useRef<HTMLInputElement>(null);
  const cameraVideoRef = useRef<HTMLInputElement>(null);
  const galleryRef = useRef<HTMLInputElement>(null);
  const cameraVideoElementRef = useRef<HTMLVideoElement>(null);
  const liveVideoRecorderRef = useRef<MediaRecorder | null>(null);
  const liveVideoChunksRef = useRef<Blob[]>([]);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioStreamRef = useRef<MediaStream | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const audioPhaseRef = useRef<ChatAudioPhase>("idle");
  const audioRecordingSessionRef = useRef(0);
  const audioPreviewUrlRef = useRef("");
  const imagePreviewUrlRef = useRef("");
  const videoPreviewUrlRef = useRef("");

  useEffect(() => {
    return () => {
      cameraStream?.getTracks().forEach((track) => track.stop());
      revokePreviewUrls();
      resetAudioRecorder();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- unmount cleanup only
  }, []);

  function revokePreviewUrls() {
    if (audioPreviewUrlRef.current) {
      URL.revokeObjectURL(audioPreviewUrlRef.current);
      audioPreviewUrlRef.current = "";
    }
    if (imagePreviewUrlRef.current) {
      URL.revokeObjectURL(imagePreviewUrlRef.current);
      imagePreviewUrlRef.current = "";
    }
    if (videoPreviewUrlRef.current) {
      URL.revokeObjectURL(videoPreviewUrlRef.current);
      videoPreviewUrlRef.current = "";
    }
  }

  function stopAudioStream() {
    audioStreamRef.current?.getTracks().forEach((track) => track.stop());
    audioStreamRef.current = null;
  }

  function resetAudioRecorder() {
    const recorder = mediaRecorderRef.current;
    mediaRecorderRef.current = null;
    audioChunksRef.current = [];
    if (recorder && recorder.state !== "inactive") {
      try {
        recorder.stop();
      } catch {
        // ignore
      }
    }
    stopAudioStream();
  }

  function clearPreview() {
    audioRecordingSessionRef.current += 1;
    revokePreviewUrls();
    resetAudioRecorder();
    setAudioPreview("");
    setImagePreview("");
    setVideoPreview("");
    setPendingBlob(null);
    setPendingType(null);
    setPendingSource(undefined);
    setViewOnce(false);
    setUploadProgress(null);
    setRecording(false);
    setLiveRecording(false);
    audioPhaseRef.current = "idle";
  }

  function closeRealCamera() {
    cameraStream?.getTracks().forEach((track) => track.stop());
    setCameraStream(null);
    setCameraMode(null);
    setLiveRecording(false);
  }

  async function openRealCamera(mode: "photo" | "video") {
    const captureInput =
      mode === "photo" ? cameraPhotoRef.current : cameraVideoRef.current;
    if (prefersChatCaptureFileInput()) {
      const opened = openChatFileInput(captureInput);
      if (!opened) onNotice(t("chat_camera_fail"));
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "environment" },
        audio: mode === "video",
      });
      setCameraMode(mode);
      setCameraStream(stream);
      setTimeout(() => {
        if (cameraVideoElementRef.current) {
          cameraVideoElementRef.current.srcObject = stream;
          cameraVideoElementRef.current.play().catch(() => {});
        }
      }, 50);
    } catch (error) {
      const failure = classifyChatMediaFailure(error);
      if (failure === "cancelled") return;
      if (failure === "denied") {
        if (openChatFileInput(captureInput)) return;
        if (await isChatCameraPermissionStickyDenied()) {
          onNotice(t("chat_media_permission_denied"));
        }
        return;
      }
      onNotice(t("chat_camera_fail"));
    }
  }

  function captureRealPhoto() {
    const video = cameraVideoElementRef.current;
    if (!video) return;
    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth || 1280;
    canvas.height = video.videoHeight || 720;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    canvas.toBlob(
      (blob) => {
        if (!blob) return;
        const url = URL.createObjectURL(blob);
        revokePreviewUrls();
        imagePreviewUrlRef.current = url;
        setPendingBlob(blob);
        setPendingType("image");
        setPendingSource("camera");
        setViewOnce(bombsEnabled);
        setImagePreview(url);
        setVideoPreview("");
        setAudioPreview("");
        closeRealCamera();
      },
      "image/jpeg",
      0.92,
    );
  }

  function startRealVideoRecording() {
    if (!cameraStream) return;
    liveVideoChunksRef.current = [];
    const recorder = new MediaRecorder(cameraStream);
    liveVideoRecorderRef.current = recorder;
    recorder.ondataavailable = (event) => {
      if (event.data.size > 0) liveVideoChunksRef.current.push(event.data);
    };
    recorder.onstop = () => {
      const recordedMimeType =
        String(recorder.mimeType || liveVideoChunksRef.current[0]?.type || "").trim() ||
        "video/webm";
      const blob = new Blob(liveVideoChunksRef.current, { type: recordedMimeType });
      const url = URL.createObjectURL(blob);
      revokePreviewUrls();
      videoPreviewUrlRef.current = url;
      setPendingBlob(blob);
      setPendingType("video");
      setPendingSource("camera");
      setViewOnce(bombsEnabled);
      setVideoPreview(url);
      setImagePreview("");
      setAudioPreview("");
      closeRealCamera();
    };
    recorder.start();
    setLiveRecording(true);
  }

  function stopRealVideoRecording() {
    const recorder = liveVideoRecorderRef.current;
    if (recorder && recorder.state !== "inactive") recorder.stop();
    setLiveRecording(false);
  }

  function handleFile(
    file: File | null,
    source: "camera" | "gallery",
    expectedType?: "image" | "video",
  ) {
    if (!file) return;
    const picked = fileFromChatInput(file, source, expectedType);
    if (!picked) {
      onNotice(source === "camera" ? t("chat_camera_fail") : t("chat_gallery_fail"));
      return;
    }
    const url = URL.createObjectURL(picked.file);
    revokePreviewUrls();
    if (picked.type === "video") videoPreviewUrlRef.current = url;
    else imagePreviewUrlRef.current = url;
    setPendingBlob(picked.file);
    setPendingType(picked.type);
    setPendingSource(source);
    setViewOnce(bombsEnabled && source === "camera");
    setImagePreview(picked.type === "video" ? "" : url);
    setVideoPreview(picked.type === "video" ? url : "");
    setAudioPreview("");
  }

  async function startAudioRecording() {
    const decision = reduceChatAudioEvent(audioPhaseRef.current, { type: "tap" });
    audioPhaseRef.current = decision.phase;
    if (decision.stopCapture) {
      stopAudioRecording();
      return;
    }
    if (!decision.startCapture) return;

    const session = audioRecordingSessionRef.current + 1;
    audioRecordingSessionRef.current = session;
    setRecording(true);
    setMicNotice(null);

    let permissionState: ChatMicrophonePermissionState | "unavailable" | "missing" = "prompt";
    try {
      const permission = await ensureChatMicrophonePermission();
      permissionState = permission.state;
      const plan = planChatMicrophoneStart({
        native: isNativeChatShell(),
        bridgeState: permission.state === "unavailable" ? "unavailable" : permission.state,
      });
      if (session !== audioRecordingSessionRef.current) {
        setRecording(false);
        audioPhaseRef.current = "idle";
        return;
      }
      if (!permission.allowed) {
        setRecording(false);
        audioPhaseRef.current = reduceChatAudioEvent(audioPhaseRef.current, {
          type: permission.denied ? "permission-denied" : "error",
        }).phase;
        setMicNotice(plan.notice || noticeFromMicrophonePermission(permission));
        return;
      }

      const stream = await captureTrustedChatAudioStream({
        native: isNativeChatShell(),
        permissionState,
      });
      if (session !== audioRecordingSessionRef.current) {
        stream.getTracks().forEach((track) => track.stop());
        setRecording(false);
        audioPhaseRef.current = "idle";
        return;
      }

      audioPhaseRef.current = reduceChatAudioEvent(audioPhaseRef.current, {
        type: "stream-ready",
      }).phase;
      revokePreviewUrls();
      setAudioPreview("");
      setImagePreview("");
      setVideoPreview("");
      setPendingBlob(null);
      setPendingType(null);
      setPendingSource(undefined);
      setUploadProgress(null);

      audioStreamRef.current = stream;
      audioChunksRef.current = [];
      const mimeType = pickSupportedAudioMimeType();
      const recorder = mimeType
        ? new MediaRecorder(stream, { mimeType })
        : new MediaRecorder(stream);
      mediaRecorderRef.current = recorder;

      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) audioChunksRef.current.push(event.data);
      };

      recorder.onstop = () => {
        void (async () => {
          if (session !== audioRecordingSessionRef.current) {
            resetAudioRecorder();
            setRecording(false);
            audioPhaseRef.current = "idle";
            return;
          }
          const rawBlob = new Blob(audioChunksRef.current, {
            type: recorder.mimeType || mimeType || "audio/webm",
          });
          resetAudioRecorder();
          setRecording(false);
          if (rawBlob.size < CHAT_AUDIO_MIN_BYTES) {
            audioPhaseRef.current = reduceChatAudioEvent(audioPhaseRef.current, {
              type: "blob-too-small",
            }).phase;
            setMicNotice("failed");
            return;
          }
          let playable = rawBlob;
          try {
            const prepared = await preparePlayableChatAudio(rawBlob);
            playable = prepared.blob;
            if (prepared.decodeFailed) onNotice(t("chat_audio_preview_fail"));
          } catch {
            onNotice(t("chat_audio_preview_fail"));
          }
          if (session !== audioRecordingSessionRef.current) return;
          revokePreviewUrls();
          const url = URL.createObjectURL(playable);
          audioPreviewUrlRef.current = url;
          setPendingBlob(playable);
          setPendingType("audio");
          setPendingSource("audio");
          setAudioPreview(url);
          audioPhaseRef.current = reduceChatAudioEvent(audioPhaseRef.current, {
            type: "blob-ready",
          }).phase;
        })();
      };

      recorder.onerror = () => {
        if (session !== audioRecordingSessionRef.current) return;
        resetAudioRecorder();
        setRecording(false);
        audioPhaseRef.current = reduceChatAudioEvent(audioPhaseRef.current, {
          type: "error",
        }).phase;
        setMicNotice("failed");
      };

      recorder.start(250);
    } catch (error) {
      if (session !== audioRecordingSessionRef.current) return;
      resetAudioRecorder();
      setRecording(false);
      const classified = classifyChatAudioCaptureFailure(error, {
        nativeDenied: false,
        nativePlatform: isNativeChatShell(),
        granted: permissionState === "granted",
        permissionState,
      });
      audioPhaseRef.current = reduceChatAudioEvent(audioPhaseRef.current, {
        type: classified === "denied" ? "permission-denied" : "error",
      }).phase;
      setMicNotice(
        noticeFromCaptureFailure({
          classified,
          permissionState,
        }),
      );
    }
  }

  function cancelAudioRecording() {
    audioRecordingSessionRef.current += 1;
    resetAudioRecorder();
    setRecording(false);
    audioPhaseRef.current = reduceChatAudioEvent(audioPhaseRef.current, {
      type: "cancel",
    }).phase;
  }

  function stopAudioRecording() {
    const ignored = reduceChatAudioEvent(audioPhaseRef.current, { type: "pointer-up" });
    if (ignored.phase === "arming" && !ignored.stopCapture) {
      audioPhaseRef.current = "arming";
      return;
    }
    const recorder = mediaRecorderRef.current;
    if (!recorder) {
      if (audioPhaseRef.current === "arming") return;
      if (recording) {
        audioRecordingSessionRef.current += 1;
        resetAudioRecorder();
        setRecording(false);
        audioPhaseRef.current = "idle";
      }
      return;
    }
    if (recorder.state === "inactive") {
      setRecording(false);
      return;
    }
    try {
      if (typeof recorder.requestData === "function") recorder.requestData();
      recorder.stop();
    } catch {
      resetAudioRecorder();
      setRecording(false);
      audioPhaseRef.current = "idle";
    }
  }

  async function sendPendingMedia() {
    if (!pendingBlob || !pendingType || mediaSending || !chatId || !senderId) return;
    setMediaSending(true);
    const clientId = crypto.randomUUID();
    const replyText = replyQuoteText(replyingTo);
    const localUrl =
      pendingType === "audio"
        ? audioPreview
        : pendingType === "video"
          ? videoPreview
          : imagePreview;

    const sendAsBomb =
      bombsEnabled &&
      viewOnce &&
      (pendingType === "image" || pendingType === "video");

    onMediaSent({
      id: clientId,
      clientId,
      text: "",
      mine: true,
      fromId: senderId,
      type: pendingType,
      mediaUrl: sendAsBomb ? undefined : localUrl || undefined,
      source: pendingSource,
      reply: replyText || undefined,
      viewOnce: sendAsBomb,
      viewOnceLimit: sendAsBomb ? VIEW_ONCE_DEFAULT_LIMIT : undefined,
      viewOnceOpenedCount: sendAsBomb ? 0 : undefined,
      viewOnceExhausted: sendAsBomb ? false : undefined,
      status: "sending",
    });

    const blob = pendingBlob;
    const type = pendingType;
    const source = pendingSource;
    clearPreview();
    onClearReply();

    try {
      const result = await sendAnonDirectMediaMessage({
        chatId,
        senderId,
        senderAuthUid: firebaseUser?.uid || "",
        senderTipo,
        blob,
        type,
        source,
        reply: replyText || undefined,
        clientId,
        viewOnce: sendAsBomb,
        viewOnceLimit: VIEW_ONCE_DEFAULT_LIMIT,
        onProgress: setUploadProgress,
      });
      onMediaSent({
        id: result.messageId,
        clientId,
        text: "",
        mine: true,
        fromId: senderId,
        type,
        mediaUrl: result.viewOnce ? undefined : result.mediaUrl || undefined,
        source,
        reply: replyText || undefined,
        viewOnce: result.viewOnce,
        viewOnceLimit: result.viewOnce ? VIEW_ONCE_DEFAULT_LIMIT : undefined,
        viewOnceOpenedCount: result.viewOnce ? 0 : undefined,
        viewOnceExhausted: result.viewOnce ? false : undefined,
        viewOnceSealed: result.viewOnce ? true : undefined,
        autoModerationRequiresBlur: result.autoModerationRequiresBlur,
        moderationRequiresBlur: result.moderationRequiresBlur,
      });
      setUploadProgress(null);
    } catch (error) {
      const kind = describeAnonDirectMediaSendFailure(error);
      onNotice(
        kind === "anon_auth_disabled"
          ? t("chat_upload_anon_auth_disabled")
          : kind === "storage_unauthorized"
            ? t("chat_upload_unauthorized")
            : formatChatMediaFailAlert(
                kind === "upload" ? t("chat_upload_fail") : t("chat_save_fail"),
                error,
              ),
      );
      onMediaSent({
        id: clientId,
        clientId,
        text: "",
        mine: true,
        fromId: senderId,
        type,
        status: "failed",
      });
      setUploadProgress(null);
    } finally {
      setMediaSending(false);
    }
  }

  if (closed) return null;

  const hasPreview = Boolean(pendingBlob && pendingType);
  const busy = sending || mediaSending;

  return (
    <div className="border-t border-white/10 px-3 py-3">
      <p
        className="sr-only"
        data-anon-direct-bomb-status={bombCap.status}
        data-anon-direct-bomb-may-send={bombsEnabled ? "1" : "0"}
      >
        bombitas: {bombCap.status}
      </p>

      {replyingTo ? (
        <div className="mb-2 flex items-start gap-2 rounded-2xl border border-white/10 bg-white/[0.04] px-3 py-2">
          <Reply size={14} className="mt-0.5 shrink-0 text-white/45" />
          <div className="min-w-0 flex-1">
            <p className="text-[10px] font-black uppercase tracking-[0.14em] text-white/35">
              Respondiendo
            </p>
            <p className="truncate text-xs font-bold text-white/70">
              {replyQuoteText(replyingTo)}
            </p>
          </div>
          <button
            type="button"
            onClick={onClearReply}
            className="flex h-7 w-7 items-center justify-center rounded-full border border-white/10 text-white/50"
            aria-label="Cancelar respuesta"
          >
            <X size={14} />
          </button>
        </div>
      ) : null}

      {cameraMode && cameraStream ? (
        <div className="mb-3 overflow-hidden rounded-2xl border border-white/10 bg-black">
          <video
            ref={cameraVideoElementRef}
            muted={cameraMode === "photo"}
            playsInline
            className="max-h-56 w-full object-cover"
          />
          <div className="flex gap-2 p-2">
            {cameraMode === "photo" ? (
              <button
                type="button"
                onClick={captureRealPhoto}
                className="flex-1 rounded-xl bg-violet-600 py-2 text-sm font-black text-white"
              >
                Capturar
              </button>
            ) : liveRecording ? (
              <button
                type="button"
                onClick={stopRealVideoRecording}
                className="flex-1 rounded-xl bg-red-500 py-2 text-sm font-black text-white"
              >
                Detener
              </button>
            ) : (
              <button
                type="button"
                onClick={startRealVideoRecording}
                className="flex-1 rounded-xl bg-violet-600 py-2 text-sm font-black text-white"
              >
                Grabar
              </button>
            )}
            <button
              type="button"
              onClick={closeRealCamera}
              className="rounded-xl border border-white/10 px-3 py-2 text-sm font-bold text-white/70"
            >
              Cancelar
            </button>
          </div>
        </div>
      ) : null}

      {hasPreview ? (
        <div className="mb-3 rounded-2xl border border-white/10 bg-white/[0.04] p-3">
          {pendingType === "image" && imagePreview ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={imagePreview} alt="" className="max-h-48 w-full rounded-xl object-contain" />
          ) : null}
          {pendingType === "video" && videoPreview ? (
            <video src={videoPreview} controls className="max-h-48 w-full rounded-xl" />
          ) : null}
          {pendingType === "audio" && audioPreview ? (
            <ChatAudioPlayer src={audioPreview} failLabel={t("chat_audio_preview_fail")} />
          ) : null}
          {bombsEnabled && (pendingType === "image" || pendingType === "video") ? (
            <button
              type="button"
              disabled={busy}
              onClick={() => setViewOnce((v) => !v)}
              className={`mt-3 flex w-full items-center justify-center gap-2 rounded-2xl border px-3 py-2 text-xs font-black uppercase tracking-[0.14em] disabled:opacity-40 ${
                viewOnce
                  ? "border-amber-400/50 bg-amber-400/15 text-amber-200"
                  : "border-white/10 bg-white/[0.04] text-white/55"
              }`}
              data-anon-direct-bomb-toggle={viewOnce ? "on" : "off"}
            >
              <Bomb size={14} />
              {viewOnce ? "Bomba (1 vista)" : "Enviar como bomba"}
            </button>
          ) : null}
          {uploadProgress !== null ? (
            <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-white/10">
              <div
                className="h-full bg-violet-500"
                style={{ width: `${uploadProgress}%` }}
              />
            </div>
          ) : null}
          <div className="mt-3 flex gap-2">
            <button
              type="button"
              disabled={busy}
              onClick={() => void sendPendingMedia()}
              className={`flex-1 rounded-2xl py-2.5 text-sm font-black disabled:opacity-40 ${
                modern ? "bg-violet-600 text-white" : "bg-[#8C84FF] text-black"
              }`}
            >
              Enviar
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={clearPreview}
              className="rounded-2xl border border-white/10 px-4 py-2.5 text-sm font-bold text-white/70 disabled:opacity-40"
            >
              Cancelar
            </button>
          </div>
        </div>
      ) : null}

      {!hasPreview && micNotice ? (
        <div className="mb-2 rounded-2xl border border-white/10 bg-white/[0.04] px-3 py-2 text-center text-xs font-bold text-white/70">
          <p>
            {micNotice === "blocked"
              ? t("chat_mic_permission_blocked")
              : micNotice === "denied"
                ? t("chat_mic_permission_denied")
                : t("chat_mic_fail")}
          </p>
          {micNotice === "blocked" ? (
            <button
              type="button"
              className="mt-1 text-violet-300"
              onClick={() => openChatMicrophoneSettings()}
            >
              {t("chat_mic_open_settings")}
            </button>
          ) : null}
        </div>
      ) : null}

      {!hasPreview ? (
        <div className="flex items-center gap-2">
          <input
            ref={cameraPhotoRef}
            type="file"
            accept="image/*"
            capture="environment"
            className={CHAT_FILE_INPUT_CLASS}
            disabled={busy}
            onChange={(e) => {
              handleFile(e.target.files?.[0] || null, "camera", "image");
              e.target.value = "";
            }}
          />
          <input
            ref={cameraVideoRef}
            type="file"
            accept="video/*"
            capture="environment"
            className={CHAT_FILE_INPUT_CLASS}
            disabled={busy}
            onChange={(e) => {
              handleFile(e.target.files?.[0] || null, "camera", "video");
              e.target.value = "";
            }}
          />
          <input
            ref={galleryRef}
            type="file"
            accept="image/*,video/*"
            className={CHAT_FILE_INPUT_CLASS}
            disabled={busy}
            onChange={(e) => {
              handleFile(e.target.files?.[0] || null, "gallery");
              e.target.value = "";
            }}
          />

          <button
            type="button"
            disabled={busy}
            onClick={() => void openRealCamera("photo")}
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl border border-white/10 bg-white/[0.06] text-white/80 disabled:opacity-40"
            title="Foto cámara"
          >
            <Camera size={18} />
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => void openRealCamera("video")}
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl border border-white/10 bg-white/[0.06] text-white/80 disabled:opacity-40"
            title="Video cámara"
          >
            <Video size={18} />
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => {
              if (!openChatFileInput(galleryRef.current)) onNotice(t("chat_gallery_fail"));
            }}
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl border border-white/10 bg-white/[0.06] text-white/80 disabled:opacity-40"
            title="Galería"
          >
            <ImageIcon size={18} />
          </button>

          <input
            ref={inputRef}
            value={text}
            onChange={(e) => onTextChange(e.target.value)}
            onKeyDown={(e) => {
              if (e.key !== "Enter" || e.shiftKey) return;
              e.preventDefault();
              if (!busy && text.trim()) onSendText();
            }}
            placeholder={t("anon_match_chat_placeholder")}
            disabled={busy}
            className="min-w-0 flex-1 rounded-2xl bg-white/5 px-4 py-3 text-sm font-bold outline-none placeholder:text-white/30 disabled:opacity-50"
          />

          <ChatAudioHoldLockMic
            recording={recording}
            disabled={busy}
            onStart={() => {
              if (!busy) void startAudioRecording();
            }}
            onStop={stopAudioRecording}
            onCancel={cancelAudioRecording}
          />

          <button
            type="button"
            disabled={busy || !text.trim()}
            onClick={onSendText}
            className={`flex h-11 w-11 items-center justify-center rounded-2xl disabled:opacity-40 ${
              modern ? "bg-violet-600 text-white" : "bg-[#8C84FF] text-black"
            }`}
          >
            <Send size={18} />
          </button>
        </div>
      ) : null}
    </div>
  );
}
