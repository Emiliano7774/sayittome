"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import AppImage from "@/components/media/AppImage";

type Props = {
  src?: string;
  poster?: string;
  /** Never play media classified as sensitive before explicit consent. */
  locked?: boolean;
};

/**
 * Lazy, muted video-story preview. AppImage stays visible until the loop is
 * decoded, then the video overlays it; a paused or unsupported codec degrades
 * gracefully to the still cover, never the heavy original movie.
 */
export default function StoryBoomerangPreview({ src, poster, locked = false }: Props) {
  const rootRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const [near, setNear] = useState(false);
  const [failed, setFailed] = useState(false);
  const [motionAllowed, setMotionAllowed] = useState(true);
  const [playing, setPlaying] = useState(false);

  useEffect(() => {
    setFailed(false);
    setPlaying(false);
  }, [src]);

  useEffect(() => {
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setMotionAllowed(!media.matches);
    update();
    media.addEventListener?.("change", update);
    return () => media.removeEventListener?.("change", update);
  }, []);

  useEffect(() => {
    const root = rootRef.current;
    if (!root || !src || locked || !motionAllowed) {
      setNear(false);
      return;
    }
    if (typeof IntersectionObserver === "undefined") {
      // Older Android WebViews still need moving previews on visible cards.
      setNear(root.getBoundingClientRect().top < window.innerHeight + 80);
      return;
    }
    const observer = new IntersectionObserver((entries) => {
      setNear(Boolean(entries[0]?.isIntersecting));
    }, { rootMargin: "80px", threshold: 0.01 });
    observer.observe(root);
    return () => observer.disconnect();
  }, [src, locked, motionAllowed]);

  const attemptPlay = useCallback(() => {
    const video = videoRef.current;
    if (!video || !near || !src || failed || locked || !motionAllowed ||
        document.visibilityState !== "visible") return;
    if (!video.paused) return;
    // React mounts a <video> only after near=true. Some Android WebViews
    // ignore dynamic autoplay; explicitly play again after canplay/data.
    void video.play().catch(() => {
      setPlaying(false);
      // Do not mark as failed: returning to foreground may unlock autoplay.
    });
  }, [near, src, failed, locked, motionAllowed]);

  useEffect(() => {
    if (!near || !motionAllowed || failed || locked || !src) {
      videoRef.current?.pause();
      setPlaying(false);
    } else {
      attemptPlay();
    }
  }, [near, motionAllowed, failed, locked, src, attemptPlay]);

  useEffect(() => {
    const onVisibility = () => {
      if (document.visibilityState !== "visible") {
        videoRef.current?.pause();
        setPlaying(false);
      } else {
        attemptPlay();
      }
    };
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("pageshow", onVisibility);
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("pageshow", onVisibility);
    };
  }, [attemptPlay]);

  const visible = Boolean(src && near && motionAllowed && !failed && !locked);

  return (
    <div
      ref={rootRef}
      className="relative h-full w-full bg-gradient-to-br from-zinc-800 via-zinc-950 to-black"
      data-story-boomerang={src ? "1" : "0"}
      data-story-boomerang-state={failed ? "error" : playing ? "playing" : visible ? "loading" : "still"}
    >
      {poster ? <AppImage src={poster} alt="" fill className="object-cover" /> : null}
      {visible ? (
        <video
          key={src}
          ref={videoRef}
          src={src}
          poster={poster || undefined}
          muted
          loop
          playsInline
          autoPlay
          preload="auto"
          controls={false}
          aria-hidden="true"
          onCanPlay={attemptPlay}
          onLoadedData={attemptPlay}
          onPlaying={() => setPlaying(true)}
          onPause={() => setPlaying(false)}
          onError={() => { setFailed(true); setPlaying(false); }}
          className="absolute inset-0 z-[1] h-full w-full object-cover"
        />
      ) : null}
    </div>
  );
}
