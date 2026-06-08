"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Heart, Trash2, UserRound, X } from "lucide-react";
import { onAuthStateChanged } from "firebase/auth";
import {
  doc,
  increment,
  onSnapshot,
  serverTimestamp,
  setDoc,
  updateDoc,
} from "firebase/firestore";

import SensitiveBlurOverlay from "@/components/moderation/SensitiveBlurOverlay";
import { auth, db } from "@/lib/firebase";
import { storyRequiresBlur } from "@/lib/moderation/blur";
import {
  buildProfileLikeId,
  getLikerId,
  toggleProfileLike,
} from "@/lib/likes/profileLike";
import { deleteStoryById } from "@/lib/stories/deleteStory";
import { canManageStory, resolveStoryViewerId } from "@/lib/stories/anonStories";
import { isInvalidPublicStoryUsername } from "@/lib/stories/storyAuthor";
import { isAnonymousStory, storyDisplayName } from "@/lib/stories/storyDisplay";
import type { StoryItem } from "@/lib/stories/types";
import { useT } from "@/contexts/LocaleContext";

type Props = {
  stories: StoryItem[];
  ownerUsername?: string;
  ownerUid?: string;
};

const DEFAULT_IMAGE_MS = 5500;

export default function StoryViewer({ stories, ownerUsername, ownerUid }: Props) {
  const router = useRouter();
  const t = useT();
  const [index, setIndex] = useState(0);
  const [localStories, setLocalStories] = useState(stories);
  const [paused, setPaused] = useState(false);
  const [blurLocked, setBlurLocked] = useState(false);
  const [progress, setProgress] = useState(0);
  const [liked, setLiked] = useState(false);
  const [profileLikes, setProfileLikes] = useState(0);
  const [likeBusy, setLikeBusy] = useState(false);
  const [viewerUid, setViewerUid] = useState("");
  const [deleting, setDeleting] = useState(false);
  const timerRef = useRef<number | null>(null);
  const startedRef = useRef(false);
  const viewedRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    setLocalStories(stories);
    setIndex(0);
  }, [stories]);

  const current = localStories[index];
  const resolvedOwnerUid = ownerUid || current?.ownerUid || "";
  const anonymousStory = current ? isAnonymousStory(current) : false;
  const displayName = current
    ? storyDisplayName(current, t)
    : storyDisplayName({ ownerUsername, ownerUid: resolvedOwnerUid }, t);
  const profileUsername = String(current?.ownerUsername || ownerUsername || "").trim();
  const profilePhoto = String(current?.ownerPhoto || "").trim();
  const canOpenProfile =
    !anonymousStory &&
    Boolean(profileUsername) &&
    !isInvalidPublicStoryUsername(profileUsername);
  const needsBlur = current ? storyRequiresBlur(current) : false;
  const isPaused = paused || (needsBlur && blurLocked);
  const canDelete = current ? canManageStory(current, viewerUid) : false;

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (user) => {
      setViewerUid(resolveStoryViewerId(user));
    });
    return () => unsub();
  }, []);

  useEffect(() => {
    if (!resolvedOwnerUid || anonymousStory) return;

    const likerId = getLikerId();
    const unsubLike = onSnapshot(
      doc(db, "perfil_likes", buildProfileLikeId(likerId, resolvedOwnerUid)),
      (snap) => setLiked(snap.exists()),
      () => setLiked(false),
    );

    const unsubProfile = onSnapshot(doc(db, "usuarios", resolvedOwnerUid), (snap) => {
      if (!snap.exists()) return;
      const data = snap.data();
      setProfileLikes(
        Number(data.likesPerfilCount ?? data.likesCount ?? data.likes ?? 0),
      );
    });

    return () => {
      unsubLike();
      unsubProfile();
    };
  }, [resolvedOwnerUid, anonymousStory]);

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
    const likerId = getLikerId();
    const payload: Record<string, unknown> = {
      viewCount: increment(1),
    };

    if (uid) {
      payload[`viewedBy.${uid}`] = true;
    } else if (likerId) {
      payload[`viewedByAnon.${likerId}`] = true;
    }

    try {
      await updateDoc(doc(db, "historias", story.id), payload);
    } catch (e) {
      console.error(e);
    }
  }, []);

  const goNext = useCallback(() => {
    setProgress(0);
    setBlurLocked(storyRequiresBlur(localStories[Math.min(index + 1, localStories.length - 1)] || current));

    if (index >= localStories.length - 1) {
      router.back();
      return;
    }

    setIndex((i) => i + 1);
  }, [current, index, localStories, router]);

  const goPrev = useCallback(() => {
    setProgress(0);
    const prevIndex = Math.max(0, index - 1);
    setBlurLocked(storyRequiresBlur(localStories[prevIndex]));
    setIndex(prevIndex);
  }, [index, localStories]);

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

  async function handleLike() {
    if (!current || !resolvedOwnerUid || likeBusy) return;

    const likerId = getLikerId();
    if (!likerId || likerId === resolvedOwnerUid) return;

    setLikeBusy(true);

    try {
      const nextLiked = await toggleProfileLike(resolvedOwnerUid);
      setLiked(nextLiked);

      if (nextLiked) {
        await updateDoc(doc(db, "historias", current.id), {
          likeCount: increment(1),
          [`likedBy.${likerId}`]: true,
          storyLikeAt: serverTimestamp(),
        });
      } else if (liked) {
        await updateDoc(doc(db, "historias", current.id), {
          likeCount: increment(-1),
          [`likedBy.${likerId}`]: false,
        });
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLikeBusy(false);
    }
  }

  async function handleDeleteStory() {
    if (!current || !canDelete || deleting) return;

    const confirmed = window.confirm(t("stories_delete_confirm"));
    if (!confirmed) return;

    setDeleting(true);
    clearTimer();

    try {
      await deleteStoryById(current.id);

      const nextStories = localStories.filter((story) => story.id !== current.id);
      if (nextStories.length === 0) {
        router.push("/stories");
        return;
      }

      setLocalStories(nextStories);
      setIndex((value) => Math.min(value, nextStories.length - 1));
      setProgress(0);
    } catch (error) {
      console.error(error);
      window.alert(t("stories_delete_fail"));
    } finally {
      setDeleting(false);
    }
  }

  function openProfile() {
    if (!canOpenProfile) return;
    router.push(`/u/${encodeURIComponent(profileUsername)}`);
  }

  if (!current) {
    return null;
  }

  return (
    <main className="fixed inset-0 z-[99999] bg-black text-white">
      <div className="absolute left-0 right-0 top-0 z-40 flex gap-1 px-3 pb-2 pt-4">
        {localStories.map((story, i) => (
          <div
            key={story.id}
            className="h-1 flex-1 overflow-hidden rounded-full bg-white/25"
          >
            <div
              className="h-full bg-white transition-[width] duration-75 ease-linear"
              style={{
                width:
                  i < index ? "100%" : i === index ? `${progress * 100}%` : "0%",
              }}
            />
          </div>
        ))}
      </div>

      <button
        type="button"
        onClick={() => router.back()}
        className="absolute right-4 top-6 z-50 flex h-11 w-11 items-center justify-center rounded-full bg-black/50"
        aria-label={t("common_cancel")}
      >
        <X size={26} />
      </button>

      {canDelete ? (
        <button
          type="button"
          onClick={handleDeleteStory}
          disabled={deleting}
          className="absolute right-20 top-6 z-50 flex h-11 w-11 items-center justify-center rounded-full bg-black/50 text-red-300 disabled:opacity-50"
          aria-label={t("stories_delete")}
        >
          <Trash2 size={22} />
        </button>
      ) : null}

      <div className="absolute left-4 top-14 z-50 max-w-[70%]">
        <p className="truncate text-lg font-black">
          {anonymousStory ? displayName : `@${displayName}`}
        </p>
        {anonymousStory ? (
          <p className="text-xs font-bold text-white/55">{t("stories_anonymous_caption")}</p>
        ) : null}
      </div>

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
              "max-h-full max-w-full object-contain animate-[fadeIn_.28s_ease-out]",
              needsBlur && blurLocked ? "blur-2xl scale-105" : "",
            ].join(" ")}
            autoPlay
            playsInline
            muted={false}
            onLoadedMetadata={(e) => {
              const el = e.currentTarget;
              if (!startedRef.current && el.duration) {
                startedRef.current = true;
                setDoc(
                  doc(db, "historias", current.id),
                  { durationMs: Math.round(el.duration * 1000) },
                  { merge: true },
                ).catch(() => {});
              }
            }}
          />
        ) : current.mediaUrl ? (
          <img
            key={current.id}
            src={current.mediaUrl}
            alt=""
            className={[
              "max-h-full max-w-full object-contain animate-[fadeIn_.28s_ease-out]",
              needsBlur && blurLocked ? "blur-2xl scale-105" : "",
            ].join(" ")}
          />
        ) : (
          <p className="px-8 text-center text-3xl font-bold">{current.texto}</p>
        )}

        {needsBlur && blurLocked ? (
          <SensitiveBlurOverlay
            mediaKey={current.mediaUrl}
            onReveal={() => setBlurLocked(false)}
          />
        ) : null}
      </div>

      <div className="absolute bottom-0 left-0 right-0 z-50 px-4 pb-[max(2rem,env(safe-area-inset-bottom))] pt-4">
        <div className="flex items-end justify-between gap-4">
          {canOpenProfile ? (
            <button
              type="button"
              onClick={openProfile}
              className="shrink-0 rounded-full ring-2 ring-white/90 transition active:scale-95"
              aria-label={t("stories_view_profile", { username: profileUsername })}
            >
              {profilePhoto ? (
                <img
                  src={profilePhoto}
                  alt={profileUsername}
                  className="h-14 w-14 rounded-full object-cover"
                />
              ) : (
                <span className="flex h-14 w-14 items-center justify-center rounded-full bg-zinc-800 text-white/70">
                  <UserRound size={28} strokeWidth={1.75} />
                </span>
              )}
            </button>
          ) : (
            <div />
          )}

          <div className="mb-1 flex items-center justify-end gap-4">
            {!anonymousStory ? (
              <button
                type="button"
                onClick={handleLike}
                disabled={likeBusy || getLikerId() === resolvedOwnerUid}
                className={[
                  "flex items-center gap-2 rounded-full px-5 py-2.5 text-sm font-black transition",
                  liked
                    ? "bg-pink-500 text-white shadow-[0_0_30px_rgba(236,72,153,.35)]"
                    : "bg-white/10 text-white",
                  likeBusy ? "opacity-60" : "",
                ].join(" ")}
              >
                <Heart size={18} fill={liked ? "currentColor" : "none"} />
                {liked ? t("stories_liked") : t("settings_likes")} · {profileLikes}
              </button>
            ) : null}
            <span className="text-sm font-bold text-white/50">
              {current.viewCount || 0} {t("stories_views")}
            </span>
          </div>
        </div>
      </div>
    </main>
  );
}
