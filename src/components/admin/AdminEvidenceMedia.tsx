"use client";

import { useEffect, useRef, useState } from "react";

import AdminEvidenceImage from "@/components/admin/AdminEvidenceImage";
import { isVideoMediaUrl } from "@/lib/media/mediaUrl";
import { useT } from "@/contexts/LocaleContext";

export type AdminEvidenceMediaType = "image" | "photo" | "video";

type Props = {
  url: string;
  mediaType?: AdminEvidenceMediaType | string;
  className?: string;
  maxHeightClass?: string;
};

function resolveRenderKind(url: string, mediaType?: string): "video" | "image" {
  const explicit = String(mediaType || "").trim().toLowerCase();
  if (explicit === "video") return "video";
  if (explicit === "image" || explicit === "photo") return "image";
  return isVideoMediaUrl(url) ? "video" : "image";
}

function clock(value: number) {
  const safe = Number.isFinite(value) && value > 0 ? value : 0;
  const total = Math.floor(safe);
  const minutes = Math.floor(total / 60);
  const seconds = String(total % 60).padStart(2, "0");
  return `${minutes}:${seconds}`;
}

export default function AdminEvidenceMedia({
  url,
  mediaType,
  className = "mt-3 block max-w-md overflow-hidden rounded-xl border border-white/10",
  maxHeightClass = "max-h-80",
}: Props) {
  const t = useT();
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [playing, setPlaying] = useState(false);
  const [duration, setDuration] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);
  const [muted, setMuted] = useState(false);

  useEffect(() => {
    setPlaying(false);
    setDuration(0);
    setCurrentTime(0);
    setMuted(false);
  }, [url]);

  if (!url) return null;
  const kind = resolveRenderKind(url, mediaType);

  if (kind === "video") {
    const togglePlayback = () => {
      const video = videoRef.current;
      if (!video) return;
      if (video.paused) void video.play();
      else video.pause();
    };

    return (
      <div className={className}>
        <video
          ref={videoRef}
          key={url}
          src={url}
          controls={false}
          playsInline
          preload="metadata"
          disablePictureInPicture
          controlsList="nodownload noplaybackrate noremoteplayback nofullscreen"
          onContextMenu={(event) => event.preventDefault()}
          onClick={togglePlayback}
          onPlay={() => setPlaying(true)}
          onPause={() => setPlaying(false)}
          onLoadedMetadata={(event) => setDuration(event.currentTarget.duration || 0)}
          onDurationChange={(event) => setDuration(event.currentTarget.duration || 0)}
          onTimeUpdate={(event) => setCurrentTime(event.currentTarget.currentTime || 0)}
          className={`w-full ${maxHeightClass} bg-black object-contain`}
        />
        <div className="flex items-center gap-2 bg-black/90 px-2 py-2 text-[11px] font-bold text-white/80">
          <button type="button" onClick={togglePlayback} className="rounded bg-white/10 px-2 py-1 hover:bg-white/15">
            {playing ? "Pausa" : "Reproducir"}
          </button>
          <input
            type="range"
            aria-label="Posición del video"
            min={0}
            max={Math.max(duration, 0.01)}
            step={0.1}
            value={Math.min(currentTime, Math.max(duration, 0))}
            onChange={(event) => {
              const video = videoRef.current;
              if (!video) return;
              video.currentTime = Number(event.currentTarget.value) || 0;
            }}
            className="min-w-0 flex-1"
          />
          <span className="tabular-nums text-white/55">{clock(currentTime)} / {clock(duration)}</span>
          <button
            type="button"
            onClick={() => {
              const video = videoRef.current;
              if (!video) return;
              video.muted = !video.muted;
              setMuted(video.muted);
            }}
            className="rounded bg-white/10 px-2 py-1 hover:bg-white/15"
          >
            {muted ? "Audio" : "Silenciar"}
          </button>
        </div>
      </div>
    );
  }

  return (
    <AdminEvidenceImage
      key={url}
      url={url}
      alt={t("admin_appeal_photo")}
      className={className}
      maxHeightClass={maxHeightClass}
    />
  );
}
