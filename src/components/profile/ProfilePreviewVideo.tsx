"use client";

import { useCallback, useEffect, useRef } from "react";

const DEFAULT_PREVIEW_SECONDS = 3;

type Props = {
  src: string;
  className?: string;
  videoClassName?: string;
  previewSeconds?: number;
};

export default function ProfilePreviewVideo({
  src,
  className = "",
  videoClassName = "h-full w-full object-cover",
  previewSeconds = DEFAULT_PREVIEW_SECONDS,
}: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);

  const loopPreview = useCallback(() => {
    const video = videoRef.current;
    if (!video) return;

    if (video.currentTime >= previewSeconds) {
      video.currentTime = 0;
      void video.play().catch(() => {});
    }
  }, [previewSeconds]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    video.currentTime = 0;
    void video.play().catch(() => {});
  }, [src]);

  return (
    <div className={className}>
      <video
        key={src}
        ref={videoRef}
        src={src}
        className={videoClassName}
        muted
        playsInline
        autoPlay
        preload="metadata"
        onTimeUpdate={loopPreview}
      />
    </div>
  );
}
