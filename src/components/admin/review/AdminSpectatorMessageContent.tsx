"use client";

import { useCallback, useEffect, useState } from "react";

import AdminEvidenceMedia from "@/components/admin/AdminEvidenceMedia";
import ChatAudioPlayer from "@/components/chat/ChatAudioPlayer";
import { fetchAdminJson } from "@/lib/admin/fetchAdminJson";
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

function adminMediaScopeKey(chatId: string, msg: SpectatorMessage) {
  const collection = String(msg.collectionName || "mensajes").trim() || "mensajes";
  return `${chatId}/${collection}/${msg.id}`;
}

export default function AdminSpectatorMessageContent({ chatId, msg, compact = false }: Props) {
  const type = String(msg.type || "text").trim() || "text";
  const inlineUrl = String(msg.mediaUrl || "").trim();
  const needsAdminFetch = Boolean(msg.viewOnce) || (isMediaType(type) && !inlineUrl);
  const mediaScopeKey = adminMediaScopeKey(chatId, msg);

  const [mediaUrl, setMediaUrl] = useState(inlineUrl);
  const [resolvedType, setResolvedType] = useState(type);
  const [loading, setLoading] = useState(needsAdminFetch);
  const [error, setError] = useState("");
  const [fetchGeneration, setFetchGeneration] = useState(0);

  const retryLoad = useCallback(() => {
    setFetchGeneration((value) => value + 1);
  }, []);

  useEffect(() => {
    setMediaUrl(inlineUrl);
    setResolvedType(type);
    setError("");
    if (!needsAdminFetch) {
      setLoading(false);
      return;
    }
    setLoading(true);

    let cancelled = false;

    void (async () => {
      try {
        const collection = msg.collectionName || "mensajes";
        const res = await fetchAdminJson<{
          ok?: boolean;
          mediaUrl?: string;
          type?: string;
          error?: string;
        }>(
          `/api/admin/message-media?chatId=${encodeURIComponent(chatId)}&messageId=${encodeURIComponent(msg.id)}&collection=${encodeURIComponent(collection)}`,
        );
        if (cancelled) return;
        if (!res.ok || !res.mediaUrl) {
          setError(res.error || "media_unavailable");
          setMediaUrl("");
          return;
        }
        setMediaUrl(String(res.mediaUrl));
        setResolvedType(String(res.type || type));
      } catch {
        if (!cancelled) setError("media_unavailable");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [chatId, fetchGeneration, inlineUrl, msg.collectionName, msg.id, needsAdminFetch, type]);

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
        <ChatAudioPlayer
          key={mediaScopeKey}
          src={mediaUrl}
          failLabel="No se pudo reproducir"
          className="max-w-xs"
        />
      ) : mediaUrl && isVideo ? (
        <AdminEvidenceMedia
          key={mediaScopeKey}
          url={mediaUrl}
          mediaType="video"
          maxHeightClass="max-h-56"
        />
      ) : mediaUrl && isImage ? (
        <AdminEvidenceMedia
          key={mediaScopeKey}
          url={mediaUrl}
          mediaType="image"
          maxHeightClass="max-h-56"
        />
      ) : null}
    </div>
  );
}
