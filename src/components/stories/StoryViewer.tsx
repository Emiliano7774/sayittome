"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Heart, Send, Trash2, UserRound, X } from "lucide-react";
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
import { markStoryViewedLocally } from "@/lib/stories/storiesIndexStore";
import { sendStoryReplyMessage } from "@/lib/stories/sendStoryReply";
import type { StoryItem } from "@/lib/stories/types";
import { useT } from "@/contexts/LocaleContext";

type Props = {
  stories: StoryItem[];
  ownerUsername?: string;
  ownerUid?: string;
};

const DEFAULT_IMAGE_MS = 5500;
const SWIPE_REPLY_PX = 56;
const TAP_MAX_MS = 380;

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
  const [replyOpen, setReplyOpen] = useState(false);
  const [replyText, setReplyText] = useState("");
  const [replySending, setReplySending] = useState(false);
  const timerRef = useRef<number | null>(null);
  const startedRef = useRef(false);
  const viewedRef = useRef<Set<string>>(new Set());
  const pointerRef = useRef({ x: 0, y: 0, t: 0, swiped: false });

  useEffect(() => {
    setLocalStories(stories);
    setIndex(0);
  }, [stories]);

  useEffect(() => {
    document.body.classList.add("sayittome-story-viewer-open");
    return () => {
      document.body.classList.remove("sayittome-story-viewer-open");
    };
  }, []);

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
  const canReply = canOpenProfile;
  const needsBlur = current ? storyRequiresBlur(current) : false;
  const isPaused = paused || replyOpen || (needsBlur && blurLocked);
  const canDelete = current ? canManageStory(current, viewerUid) : false;
  const topChromeHidden = paused && !blurLocked;
  const bottomChromeHidden = topChromeHidden || replyOpen;

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

    const viewerId = resolveStoryViewerId(auth.currentUser);
    const payload: Record<string, unknown> = {
      viewCount: increment(1),
    };

    if (viewerId.startsWith("anon_")) {
      payload[`viewedByAnon.${viewerId}`] = true;
    } else if (viewerId) {
      payload[`viewedBy.${viewerId}`] = true;
    }

    if (viewerId && story.ownerUid) {
      markStoryViewedLocally(story.ownerUid, story.id, viewerId);
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
    setReplyOpen(false);
    setReplyText("");

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
    setReplyOpen(false);
    setReplyText("");
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

  function handlePointerDown(event: React.PointerEvent<HTMLDivElement>) {
    if ((event.target as HTMLElement).closest("[data-story-chrome]")) return;

    pointerRef.current = {
      x: event.clientX,
      y: event.clientY,
      t: Date.now(),
      swiped: false,
    };
    setPaused(true);
  }

  function handlePointerMove(event: React.PointerEvent<HTMLDivElement>) {
    if (!canReply || replyOpen || pointerRef.current.swiped) return;

    const deltaY = pointerRef.current.y - event.clientY;
    if (deltaY >= SWIPE_REPLY_PX) {
      pointerRef.current.swiped = true;
      setReplyOpen(true);
    }
  }

  function handlePointerUp(event: React.PointerEvent<HTMLDivElement>) {
    setPaused(false);

    if (pointerRef.current.swiped || replyOpen) return;

    const elapsed = Date.now() - pointerRef.current.t;
    const deltaX = event.clientX - pointerRef.current.x;
    const deltaY = Math.abs(event.clientY - pointerRef.current.y);

    if (elapsed > TAP_MAX_MS || Math.abs(deltaX) > 48 || deltaY > 32) return;

    const third = window.innerWidth / 3;
    if (event.clientX < third) {
      goPrev();
    } else if (event.clientX > third * 2) {
      goNext();
    }
  }

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

  async function handleSendReply() {
    if (!current || !canReply || !replyText.trim() || replySending) return;

    setReplySending(true);

    try {
      const chatId = await sendStoryReplyMessage(current, profileUsername, replyText.trim());
      router.push(
        `/chat/${encodeURIComponent(chatId)}?u=${encodeURIComponent(profileUsername)}`,
      );
    } catch (error) {
      console.error(error);
      window.alert(t("chat_save_fail"));
    } finally {
      setReplySending(false);
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
      <div
        className={[
          "absolute left-0 right-0 top-0 z-40 flex gap-1 px-3 pb-2 pt-4 transition-opacity duration-150",
          topChromeHidden ? "pointer-events-none opacity-0" : "opacity-100",
        ].join(" ")}
        data-story-chrome
      >
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
        className={[
          "absolute right-4 top-6 z-50 flex h-11 w-11 items-center justify-center rounded-full bg-black/50 transition-opacity duration-150",
          topChromeHidden ? "pointer-events-none opacity-0" : "opacity-100",
        ].join(" ")}
        data-story-chrome
        aria-label={t("common_cancel")}
      >
        <X size={26} />
      </button>

      {canDelete ? (
        <button
          type="button"
          onClick={handleDeleteStory}
          disabled={deleting}
          className={[
            "absolute right-20 top-6 z-50 flex h-11 w-11 items-center justify-center rounded-full bg-black/50 text-red-300 transition-opacity duration-150 disabled:opacity-50",
            topChromeHidden ? "pointer-events-none opacity-0" : "opacity-100",
          ].join(" ")}
          data-story-chrome
          aria-label={t("stories_delete")}
        >
          <Trash2 size={22} />
        </button>
      ) : null}

      <div
        className={[
          "absolute left-4 top-14 z-50 max-w-[70%] transition-opacity duration-150",
          topChromeHidden ? "pointer-events-none opacity-0" : "opacity-100",
        ].join(" ")}
        data-story-chrome
      >
        <p className="truncate text-lg font-black">
          {anonymousStory ? displayName : `@${displayName}`}
        </p>
        {anonymousStory ? (
          <p className="text-xs font-bold text-white/55">{t("stories_anonymous_caption")}</p>
        ) : null}
      </div>

      <div
        className={[
          "absolute inset-0 z-20 touch-none",
          replyOpen ? "pointer-events-none" : "",
        ].join(" ")}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={() => setPaused(false)}
        aria-hidden
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

      <div
        className={[
          "absolute bottom-0 left-0 right-0 z-50 px-4 pb-[max(2rem,env(safe-area-inset-bottom))] pt-4 transition-opacity duration-150",
          bottomChromeHidden ? "pointer-events-none opacity-0" : "opacity-100",
        ].join(" ")}
        data-story-chrome
      >
        {canReply && !replyOpen ? (
          <p className="mb-3 text-center text-xs font-semibold text-white/45">
            {t("story_reply_hint")}
          </p>
        ) : null}

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

      {replyOpen && canReply ? (
        <div
          className="absolute inset-x-0 bottom-0 z-[60] border-t border-white/10 bg-black/90 px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-3 backdrop-blur-md"
          data-story-chrome
        >
          <div className="mb-3 flex items-center gap-3">
            {current.mediaUrl ? (
              <img
                src={current.mediaUrl}
                alt=""
                className="h-12 w-12 rounded-lg object-cover"
              />
            ) : null}
            <p className="truncate text-sm font-semibold text-white/70">@{profileUsername}</p>
          </div>

          <div className="flex items-center gap-2">
            <input
              value={replyText}
              onChange={(event) => setReplyText(event.target.value)}
              placeholder={t("story_reply_placeholder")}
              className="min-w-0 flex-1 rounded-full border border-white/10 bg-white/5 px-4 py-3 text-sm outline-none placeholder:text-white/35"
              autoFocus
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  void handleSendReply();
                }
              }}
            />
            <button
              type="button"
              onClick={() => void handleSendReply()}
              disabled={replySending || !replyText.trim()}
              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-violet-600 text-white disabled:opacity-40"
              aria-label={t("story_reply_send")}
            >
              <Send size={18} />
            </button>
          </div>
        </div>
      ) : null}
    </main>
  );
}
