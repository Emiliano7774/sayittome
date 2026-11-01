"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import AppImage from "@/components/media/AppImage";
import {
  findKeepAliveHost,
  isKeepAliveHostFrozen,
} from "@/lib/navigation/keepAliveHostActivity";

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
  const [hostActive, setHostActive] = useState(true);

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
    if (!video || !near || !hostActive || !src || failed || locked || !motionAllowed ||
        document.visibilityState !== "visible") return;
    if (!video.paused) return;
    // React mounts a <video> only after near=true. Some Android WebViews
    // ignore dynamic autoplay; explicitly play again after canplay/data.
    void video.play().catch(() => {
      setPlaying(false);
      // Do not mark as failed: returning to foreground may unlock autoplay.
    });
  }, [near, hostActive, src, failed, locked, motionAllowed]);

  useEffect(() => {
    if (!near || !hostActive || !motionAllowed || failed || locked || !src) {
      videoRef.current?.pause();
      setPlaying(false);
    } else {
      attemptPlay();
    }
  }, [near, hostActive, motionAllowed, failed, locked, src, attemptPlay]);

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

  // Animated WebP is a small native <img>, not autoplay media. The browser
  // lazily downloads it only when close to the viewport; Android's video and
  // reduced-motion autoplay gates cannot freeze the story anymore.
  const imageLoop = Boolean(src && /\.webp(?:[/?#]|$)/i.test(src));
  // Animated WebP cannot be paused once mounted. Only start its download for
  // cards near the viewport: offscreen mosaics must not drain Storage egress.
  const imageVisible = Boolean(
    imageLoop && src && near && hostActive && motionAllowed && !locked && !failed,
  );
  const visible = Boolean(
    src && near && hostActive && motionAllowed && !failed && !locked && !imageLoop,
  );

  return (
    <div
      ref={rootRef}
      className="relative h-full w-full bg-gradient-to-br from-zinc-800 via-zinc-950 to-black"
      data-story-boomerang={src ? "1" : "0"}
      data-story-boomerang-state={failed ? "error" : imageVisible ? "animated-image" : playing ? "playing" : visible ? "loading" : "still"}
    >
      {poster ? <AppImage src={poster} alt="" fill className="object-cover" /> : null}
      {imageVisible ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          key={src}
          src={src}
          alt=""
          loading="lazy"
          decoding="async"
          onError={() => setFailed(true)}
          className="absolute inset-0 z-[1] h-full w-full object-cover"
          aria-hidden="true"
          data-story-animated-image="1"
        />
      ) : null}
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
