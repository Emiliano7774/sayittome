"use client";

import { useEffect, useRef, useState } from "react";
import AppImage from "@/components/media/AppImage";

type Props = {
  src?: string;
  poster?: string;
};

/** Only fetch the small silent loop when its story card is near the viewport. */
export default function StoryBoomerangPreview({ src, poster }: Props) {
  const rootRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const [near, setNear] = useState(false);
  const [failed, setFailed] = useState(false);
  const [motionAllowed, setMotionAllowed] = useState(true);

  useEffect(() => {
    setFailed(false);
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
    if (!root || !src || !motionAllowed || !("IntersectionObserver" in window)) return;
    const observer = new IntersectionObserver((entries) => {
      setNear(Boolean(entries[0]?.isIntersecting));
    }, { rootMargin: "80px", threshold: 0.01 });
    observer.observe(root);
    return () => observer.disconnect();
  }, [src, motionAllowed]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    if (near && motionAllowed && !failed) {
      void video.play().catch(() => { /* user agent may defer until visible */ });
    } else {
      video.pause();
    }
  }, [near, motionAllowed, failed, src]);

  return (
    <div ref={rootRef} className="relative h-full w-full bg-gradient-to-br from-zinc-800 via-zinc-950 to-black" data-story-boomerang={src ? "1" : "0"}>
      {poster ? <AppImage src={poster} alt="" fill className="object-cover" /> : null}
      {src && near && motionAllowed && !failed ? (
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
          onError={() => setFailed(true)}
          className="absolute inset-0 h-full w-full object-cover"
        />
      ) : null}
    </div>
  );
}
