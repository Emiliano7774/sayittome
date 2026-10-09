"use client";

import { useEffect, useState } from "react";

type Props = {
  url: string;
  mediaType?: "image" | "video";
  secure?: boolean;
  onClose: () => void;
};

export default function FullscreenMedia({
  url,
  mediaType = "image",
  secure = false,
  onClose,
}: Props) {
  const [zoom, setZoom] = useState(1);
  useEffect(() => setZoom(1), [url, mediaType]);
  const canZoom = mediaType === "image";
  const increaseZoom = () => setZoom((value) => Math.min(4, Math.round((value + 0.5) * 10) / 10));
  const decreaseZoom = () => setZoom((value) => Math.max(1, Math.round((value - 0.5) * 10) / 10));
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={secure ? "Visualización única de contenido" : "Visor de contenido"}
      data-fullscreen-media-viewer="1"
      className="fixed inset-0 z-[99999] flex items-center justify-center overflow-hidden bg-black"
      onContextMenu={(event) => event.preventDefault()}
      style={{ touchAction: secure ? "none" : "auto", userSelect: "none" }}
    >
      <button
        onClick={onClose}
        className="absolute left-5 top-5 z-10 text-6xl text-white"
        aria-label="Cerrar"
      >
        ×
      </button>
      {canZoom ? (
        <div className="absolute right-5 top-5 z-10 flex items-center gap-2" data-media-zoom-controls="1">
          <button type="button" onClick={decreaseZoom} disabled={zoom <= 1} className="rounded-full bg-white/15 px-3 py-2 text-lg font-bold text-white disabled:opacity-30" aria-label="Reducir imagen">−</button>
          <span className="min-w-14 text-center text-sm font-bold text-white">{Math.round(zoom * 100)}%</span>
          <button type="button" onClick={increaseZoom} disabled={zoom >= 4} className="rounded-full bg-white/15 px-3 py-2 text-lg font-bold text-white disabled:opacity-30" aria-label="Ampliar imagen">+</button>
        </div>
      ) : null}
      {mediaType === "video" ? (
        <video
          src={url}
          controls={!secure}
          autoPlay
          playsInline
          disablePictureInPicture={secure}
          controlsList={secure ? "nodownload noplaybackrate noremoteplayback nofullscreen" : undefined}
          preload="auto"
          onContextMenu={(event) => event.preventDefault()}
          onDoubleClick={(event) => event.preventDefault()}
          onClick={
            secure
              ? (event) => {
                  const video = event.currentTarget;
                  if (video.paused) void video.play();
                  else video.pause();
                }
              : undefined
          }
          className="max-h-screen max-w-screen object-contain"
        />
      ) : (
        <img
          src={url}
          alt=""
          draggable={false}
          onContextMenu={(event) => event.preventDefault()}
          className="max-h-screen max-w-screen object-contain transition-transform duration-150"
          style={{ transform: `scale(${zoom})` }}
          onDoubleClick={increaseZoom}
        />
      )}
    </div>
  );
}
