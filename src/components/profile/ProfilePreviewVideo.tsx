"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import {
  findKeepAliveHost,
  isKeepAliveHostFrozen,
} from "@/lib/navigation/keepAliveHostActivity";

const DEFAULT_PREVIEW_SECONDS = 3;

type Props = {
  src: string;
  className?: string;
  videoClassName?: string;
  previewSeconds?: number;
  /** Only hero videos load immediately; gallery clips load near the viewport. */
  priority?: boolean;
};

export default function ProfilePreviewVideo({
  src,
  className = "",
  videoClassName = "h-full w-full object-cover",
  previewSeconds = DEFAULT_PREVIEW_SECONDS,
  priority = false,
}: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const [near, setNear] = useState(priority);
  const [activated, setActivated] = useState(priority);
  const [hostActive, setHostActive] = useState(true);

  useEffect(() => {
    const root = rootRef.current;
    const host = findKeepAliveHost(root);
    if (!host) {
      setHostActive(true);
      return;
    }
    const sync = () => setHostActive(!isKeepAliveHostFrozen(host));
    sync();
    const observer = new MutationObserver(sync);
    observer.observe(host, { attributes: true, attributeFilter: ["class"] });
    return () => observer.disconnect();
  }, [src]);

  useEffect(() => {
    if (priority) {
      setNear(true);
      setActivated(true);
      return;
    }
    const root = rootRef.current;
    if (!root || typeof IntersectionObserver === "undefined") {
      setNear(true);
      setActivated(true);
      return;
    }
    const observer = new IntersectionObserver(([entry]) => {
      const visible = Boolean(entry?.isIntersecting);
      setNear(visible);
      if (visible) setActivated(true);
    }, { rootMargin: "160px", threshold: 0.01 });
    observer.observe(root);
    return () => observer.disconnect();
  }, [src, priority]);

  const canPlay =
    near && hostActive && typeof document !== "undefined" && document.visibilityState === "visible";

  const loopPreview = useCallback(() => {
    const video = videoRef.current;
    if (!video || !near || !hostActive || document.visibilityState !== "visible") {
      return;
    }

    if (video.currentTime >= previewSeconds) {
      video.currentTime = 0;
      void video.play().catch(() => {});
    }
  }, [previewSeconds, near, hostActive]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    if (!canPlay) {
      video.pause();
      return;
    }
    void video.play().catch(() => {});
  }, [src, near, activated, hostActive, canPlay]);

  useEffect(() => {
    const onVisibility = () => {
      const video = videoRef.current;
      if (!video) return;
      if (!near || !hostActive || document.visibilityState !== "visible") {
        video.pause();
      } else {
        void video.play().catch(() => {});
      }
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, [near, hostActive]);

  return (
    <div ref={rootRef} className={className}>
      <video
        key={src}
        ref={videoRef}
        src={activated ? src : undefined}
        className={videoClassName}
        muted
        playsInline
        autoPlay={canPlay}
        preload={near && hostActive ? "metadata" : "none"}
        onLoadedData={() => {
          if (
            near &&
            hostActive &&
            document.visibilityState === "visible"
          ) {
            void videoRef.current?.play().catch(() => {});
          }
        }}
        onTimeUpdate={loopPreview}
      />
    </div>
  );
}
