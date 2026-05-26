"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { X } from "lucide-react";
import {
  doc,
  increment,
  serverTimestamp,
  setDoc,
  updateDoc,
} from "firebase/firestore";

import SensitiveBlurOverlay from "@/components/moderation/SensitiveBlurOverlay";
import { auth, db } from "@/lib/firebase";
import { storyRequiresBlur } from "@/lib/moderation/blur";
import type { StoryItem } from "@/lib/stories/types";

type Props = {
  stories: StoryItem[];
  ownerUsername?: string;
};

const DEFAULT_IMAGE_MS = 5500;

export default function StoryViewer({ stories, ownerUsername }: Props) {
  const router = useRouter();
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const [blurLocked, setBlurLocked] = useState(false);
  const [progress, setProgress] = useState(0);
  const timerRef = useRef<number | null>(null);
  const startedRef = useRef(false);
  const viewedRef = useRef<Set<string>>(new Set());

  const current = stories[index];
  const needsBlur = current ? storyRequiresBlur(current) : false;
  const isPaused = paused || (needsBlur && blurLocked);

  const clearTimer = useCallback(() => {
    if (timerRef.current) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const markViewed = useCallback(async (story: StoryItem) => {
    if (viewedRef.current.has(story.id)) return;
    viewedRef.current.add(story.id);

    const uid = auth.currentUser?.uid;
    const payload: Record<string, unknown> = {
      viewCount: increment(1),
    };

    if (uid) {
      payload[`viewedBy.${uid}`] = true;
    }

    try {
      await updateDoc(doc(db, "historias", story.id), payload);
    } catch (e) {
      console.error(e);
    }
  }, []);

  const goNext = useCallback(() => {
    setProgress(0);
    setBlurLocked(storyRequiresBlur(stories[Math.min(index + 1, stories.length - 1)] || current));

    if (index >= stories.length - 1) {
      router.back();
      return;
    }

    setIndex((i) => i + 1);
  }, [index, router, stories.length]);

  const goPrev = useCallback(() => {
    setProgress(0);
    const prevIndex = Math.max(0, index - 1);
    setBlurLocked(storyRequiresBlur(stories[prevIndex]));
    setIndex(prevIndex);
  }, []);

  useEffect(() => {
    if (!current || isPaused) {
      clearTimer();
      return;
    }

    markViewed(current);

    const durationMs =
      current.mediaType === "video" && current.durationMs
        ? current.durationMs
        : DEFAULT_IMAGE_MS;

    const started = performance.now();

    const tick = () => {
      const elapsed = performance.now() - started;
      setProgress(Math.min(1, elapsed / durationMs));

      if (elapsed >= durationMs) {
        goNext();
        return;
      }

      timerRef.current = window.setTimeout(tick, 50);
    };

    timerRef.current = window.setTimeout(tick, 50);

    return clearTimer;
  }, [clearTimer, current, goNext, isPaused, markViewed]);

  useEffect(() => {
    if (current) setBlurLocked(storyRequiresBlur(current));
  }, [current?.id]);

  const toggleLike = async () => {
    if (!current) return;

    const uid = auth.currentUser?.uid;
    if (!uid) return;

    const liked = !!current.likedBy?.[uid];

    try {
      await updateDoc(doc(db, "historias", current.id), {
        likeCount: increment(liked ? -1 : 1),
        [`likedBy.${uid}`]: !liked,
      });
    } catch (e) {
      console.error(e);
    }
  };

  if (!current) {
    return null;
  }

  return (
    <main className="fixed inset-0 z-[99999] bg-black text-white">
      <div className="absolute left-0 right-0 top-0 z-40 flex gap-1 px-3 pb-2 pt-4">
        {stories.map((story, i) => (
          <div
            key={story.id}
            className="h-1 flex-1 overflow-hidden rounded-full bg-white/25"
          >
            <div
              className="h-full bg-white transition-[width] duration-75 ease-linear"
              style={{
                width:
                  i < index
                    ? "100%"
                    : i === index
                      ? `${progress * 100}%`
                      : "0%",
              }}
            />
          </div>
        ))}
      </div>

      <button
        type="button"
        onClick={() => router.back()}
        className="absolute right-4 top-6 z-50 flex h-11 w-11 items-center justify-center rounded-full bg-black/50"
        aria-label="Cerrar"
      >
        <X size={26} />
      </button>

      <p className="absolute left-4 top-6 z-50 text-lg font-black">
        {ownerUsername || current.ownerUsername || "Historia"}
      </p>

      <button
        type="button"
        aria-label="Anterior"
        className="absolute left-0 top-0 z-30 h-full w-1/3"
        onClick={goPrev}
        onMouseDown={() => setPaused(true)}
        onMouseUp={() => setPaused(false)}
        onTouchStart={() => setPaused(true)}
        onTouchEnd={() => setPaused(false)}
      />

      <button
        type="button"
        aria-label="Siguiente"
        className="absolute right-0 top-0 z-30 h-full w-1/3"
        onClick={goNext}
        onMouseDown={() => setPaused(true)}
        onMouseUp={() => setPaused(false)}
        onTouchStart={() => setPaused(true)}
        onTouchEnd={() => setPaused(false)}
      />

      <div className="relative flex h-full items-center justify-center pt-10">
        {current.mediaType === "video" && current.mediaUrl ? (
          <video
            key={current.id}
            src={current.mediaUrl}
            className={[
              "max-h-full max-w-full object-contain",
              needsBlur && blurLocked ? "blur-2xl scale-105" : "",
            ].join(" ")}
            autoPlay
            playsInline
            muted={false}
            onLoadedMetadata={(e) => {
              const el = e.currentTarget;
              if (!startedRef.current && el.duration) {
                startedRef.current = true;
                setDoc(doc(db, "historias", current.id), {
                  durationMs: Math.round(el.duration * 1000),
                }, { merge: true }).catch(() => {});
              }
            }}
          />
        ) : current.mediaUrl ? (
          <img
            key={current.id}
            src={current.mediaUrl}
            alt=""
            className={[
              "max-h-full max-w-full object-contain",
              needsBlur && blurLocked ? "blur-2xl scale-105" : "",
            ].join(" ")}
          />
        ) : (
          <p className="px-8 text-center text-3xl font-bold">{current.texto}</p>
        )}

        {needsBlur && blurLocked ? (
          <SensitiveBlurOverlay onReveal={() => setBlurLocked(false)} />
        ) : null}
      </div>

      <div className="absolute bottom-8 left-0 right-0 z-50 flex items-center justify-center gap-6 px-6">
        <button
          type="button"
          onClick={toggleLike}
          className="rounded-full bg-white/10 px-6 py-3 text-sm font-black"
        >
          Me gusta · {current.likeCount || 0}
        </button>
        <span className="text-sm font-bold text-white/50">
          {current.viewCount || 0} vistas
        </span>
      </div>
    </main>
  );
}
