"use client";

import { useCallback, useEffect, useState } from "react";

import AdminEvidenceMedia from "@/components/admin/AdminEvidenceMedia";
import ChatAudioPlayer from "@/components/chat/ChatAudioPlayer";
import {
  adminMediaScopeKey,
  resolveAdminMediaDisplay,
  shouldApplyAdminMediaFetchResult,
  type AsyncMediaSnapshot,
} from "@/lib/admin/adminSpectatorMediaDisplay";
import { fetchAdminMediaBlob } from "@/lib/admin/fetchAdminJson";
import { chatBubbleTextClass } from "@/lib/chat/chatBubbleStyles";
import { messageDisplayText, type SpectatorMessage } from "@/lib/moderation/spectator";

type Props = {
  chatId: string;
  msg: SpectatorMessage;
  compact?: boolean;
};

function isMediaType(type: string) {
  return (
    type === "image" ||
    type === "photo" ||
    type === "video" ||
    type === "audio" ||
    type === "voice"
  );
}

function AdminSpectatorMessageContentBody({ chatId, msg, compact = false }: Props) {
  const type = String(msg.type || "text").trim() || "text";
  const inlineUrl = String(msg.mediaUrl || "").trim();
  const needsAdminFetch = Boolean(msg.viewOnce) || isMediaType(type);
  const requestKey = adminMediaScopeKey(chatId, msg);
  const [retryNonce, setRetryNonce] = useState(0);
  const fetchKey = `${requestKey}:${retryNonce}`;

  const [asyncMedia, setAsyncMedia] = useState<AsyncMediaSnapshot>(() =>
    needsAdminFetch
      ? {
          fetchKey,
          mediaUrl: "",
          resolvedType: type,
          status: "loading",
          error: "",
        }
      : {
          fetchKey: "",
          mediaUrl: inlineUrl,
          resolvedType: type,
          status: "ready",
          error: "",
        },
  );

  const retryLoad = useCallback(() => {
    setRetryNonce((value) => value + 1);
  }, []);

  useEffect(() => {
    if (!needsAdminFetch) return;

    let cancelled = false;
    let objectUrl = "";
    const capturedKey = fetchKey;
    const collection = msg.collectionName || "mensajes";

    void (async () => {
      try {
        const res = await fetchAdminMediaBlob(
          `/api/admin/message-media?chatId=${encodeURIComponent(chatId)}&messageId=${encodeURIComponent(msg.id)}&collection=${encodeURIComponent(collection)}&raw=1`,
        );
        if (cancelled) return;
        if (!shouldApplyAdminMediaFetchResult(capturedKey, capturedKey)) return;

        if (!res.ok || !res.blob) {
          setAsyncMedia({
            fetchKey: capturedKey,
            mediaUrl: "",
            resolvedType: type,
            status: "error",
            error: res.error || "media_unavailable",
          });
          return;
        }

        objectUrl = URL.createObjectURL(res.blob);
        setAsyncMedia({
          fetchKey: capturedKey,
          mediaUrl: objectUrl,
          resolvedType: String(res.mediaType || type),
          status: "ready",
          error: "",
        });
      } catch {
        if (cancelled) return;
        setAsyncMedia({
          fetchKey: capturedKey,
          mediaUrl: "",
          resolvedType: type,
          status: "error",
          error: "media_unavailable",
        });
      }
    })();

    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [chatId, fetchKey, msg.collectionName, msg.id, needsAdminFetch, type]);

  const { mediaUrl, resolvedType, loading, error } = resolveAdminMediaDisplay({
    needsAdminFetch,
    inlineUrl,
    inlineType: type,
    fetchKey,
    asyncMedia,
  });

  const text = messageDisplayText(msg);
  const showText =
    Boolean(String(msg.text || msg.texto || msg.reply || "").trim()) || !isMediaType(resolvedType);

  const isAudio = resolvedType === "audio" || resolvedType === "voice";
  const isVideo = resolvedType === "video";
  const isImage = resolvedType === "image" || resolvedType === "photo";

  return (
    <div className={compact ? "space-y-1.5" : "space-y-2"}>
      {showText ? <p className={chatBubbleTextClass(true)}>{text}</p> : null}

      {msg.viewOnce ? (
        <p className="text-[10px] font-bold uppercase tracking-wide text-amber-200/80">
          bomba · lectura admin (no consume vistas)
        </p>
      ) : null}

      {loading ? (
        <p className="text-[11px] font-bold text-white/35">Cargando media…</p>
      ) : error ? (
        <div className="space-y-1">
          <p className="text-[11px] font-bold text-red-300/80">{error}</p>
          <button
            type="button"
            onClick={retryLoad}
            className="text-[11px] font-bold text-violet-300 underline"
          >
            Reintentar
          </button>
        </div>
      ) : mediaUrl && isAudio ? (
        <ChatAudioPlayer src={mediaUrl} failLabel="No se pudo reproducir" className="max-w-xs" />
      ) : mediaUrl && isVideo ? (
        <AdminEvidenceMedia url={mediaUrl} mediaType="video" maxHeightClass="max-h-56" />
      ) : mediaUrl && isImage ? (
        <AdminEvidenceMedia url={mediaUrl} mediaType="image" maxHeightClass="max-h-56" />
      ) : null}
    </div>
  );
}

export default function AdminSpectatorMessageContent(props: Props) {
  const scopeKey = adminMediaScopeKey(props.chatId, props.msg);
  return <AdminSpectatorMessageContentBody key={scopeKey} {...props} />;
}
