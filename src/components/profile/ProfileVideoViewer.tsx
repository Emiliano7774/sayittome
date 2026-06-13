"use client";

import { useEffect, useRef } from "react";
import { X } from "lucide-react";

import StoryMediaSourceBadge from "@/components/stories/StoryMediaSourceBadge";
import { useOverlayBackClose } from "@/hooks/useOverlayBackClose";
import type { ProfileMediaSource } from "@/lib/profile/mediaSource";

type Props = {
  url: string;
  open: boolean;
  source?: ProfileMediaSource;
  onClose: () => void;
};

export default function ProfileVideoViewer({ url, open, source, onClose }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);

  useOverlayBackClose(
    open,
    onClose,
    "sayittome-profile-video-open",
    "sayittome:close-profile-video",
  );

  useEffect(() => {
    if (!open) return;

    const video = videoRef.current;
    if (!video) return;

    video.currentTime = 0;
    void video.play().catch(() => {});
  }, [open, url]);

  if (!open || !url) return null;

  return (
    <div
      className="fixed inset-0 z-[999999] flex items-center justify-center bg-black/95 p-5"
      onClick={onClose}
    >
      <button
        type="button"
        onClick={onClose}
        className="absolute right-6 top-6 z-[10] flex h-14 w-14 items-center justify-center rounded-full bg-white/10"
        aria-label="Cerrar"
      >
        <X size={30} />
      </button>

      {source ? (
        <div className="absolute bottom-8 left-1/2 z-[10] -translate-x-1/2">
          <StoryMediaSourceBadge source={source} mediaType="video" />
        </div>
      ) : null}

      <video
        ref={videoRef}
        src={url}
        className="max-h-[88vh] max-w-[92vw] rounded-3xl object-contain"
        controls
        playsInline
        autoPlay
        onClick={(event) => event.stopPropagation()}
      />
    </div>
  );
}
