"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Heart, Send, Trash2, UserRound, X, Flag } from "lucide-react";
import { onAuthStateChanged } from "firebase/auth";
import {
  doc,
  increment,
  serverTimestamp,
  setDoc,
  updateDoc,
} from "firebase/firestore";

import SensitiveBlurOverlay from "@/components/moderation/SensitiveBlurOverlay";
import AdminStoryBlurButton from "@/components/stories/AdminStoryBlurButton";
import { auth, db } from "@/lib/firebase";
import { storyRequiresBlur } from "@/lib/moderation/blur";
import { getLikerId } from "@/lib/likes/profileLike";
import { deleteStoryById } from "@/lib/stories/deleteStory";
import { canManageStory, resolveStoryViewerId, resolveStoryViewerIdReady } from "@/lib/stories/anonStories";
import { getStoryOwnerKey, isInvalidPublicStoryUsername } from "@/lib/stories/storyAuthor";
import {
  shouldPersistVideoDuration,
  videoDurationMsFromMetadata,
} from "@/lib/stories/storyMediaSlots";
import {
  ackStoryView,
  enqueueStoryViewAckRetry,
  isolateStoryViewAckQueue,
  scheduleStoryViewAckFlush,
} from "@/lib/stories/ackStoryView";
import { isAnonymousStory, storyDisplayName } from "@/lib/stories/storyDisplay";
import {
  isOwnerGroupSnapshotComplete,
  isStoryUnseenForViewer,
} from "@/lib/stories/storyViewedCache";
import {
  getCachedStoryGroups,
  getPreviousStoryGroup,
  markStoryViewedLocally,
} from "@/lib/stories/storiesIndexStore";
import {
  firstUnseenStoryIndex,
  NEXT_MEDIA_READY_TIMEOUT_MS,
  isStoryViewerUsefulPaint,
  resolveNextPlayTarget,
  shouldMarkStoryViewed,
  shouldReleaseMediaGate,
  shouldReplayStoryPlayback,
  shouldStartStoryProgress,
} from "@/lib/stories/storiesQueryGuard";
import { preloadNextPlayTarget, preloadStoryMedia } from "@/lib/stories/preload";
import { resolveProfileChat } from "@/lib/chat/resolveProfileChat";
import { resolveStoryViewerExitDestination } from "@/lib/navigation/storyReturnNav";
import { sendStoryReplyMessage } from "@/lib/stories/sendStoryReply";
import StoryMediaBuffers from "@/components/stories/StoryMediaBuffers";
import StoryMediaSourceBadge from "@/components/stories/StoryMediaSourceBadge";
import ContentReportDialog from "@/components/moderation/ContentReportDialog";
import type { StoryItem, StoryUserGroup } from "@/lib/stories/types";
import { useT } from "@/contexts/LocaleContext";
import { useNavUsefulPaint } from "@/hooks/useNavUsefulPaint";
import { isNavTraceEnabled } from "@/lib/perf/navTrace";
import {
  storyPipelineBegin,
  storyPipelineMark,
  storyPipelineNoteMediaUrl,
} from "@/lib/perf/storyPipelineTrace";

type Props = {
  stories: StoryItem[];
  ownerUsername?: string;
  ownerUid?: string;
  initialStoryId?: string;
};

const DEFAULT_IMAGE_MS = 5500;
const SWIPE_REPLY_PX = 56;
const SWIPE_DISMISS_PX = 48;
const TAP_MAX_MS = 380;

function groupIsUnseenForViewer(group: StoryUserGroup, viewerId: string) {
  if (!viewerId) return false;
  const storyIds = group.stories.map((story) => story.id);
  if (group.ownerUid && isOwnerGroupSnapshotComplete(viewerId, group.ownerUid, storyIds)) {
    return false;
  }
  return group.stories.some((story) => isStoryUnseenForViewer(story, viewerId));
}

function initialStoryIndex(
  stories: StoryItem[],
  initialStoryId: string | undefined,
  viewerId: string,
) {
  if (initialStoryId) {
    const nextIndex = stories.findIndex((story) => story.id === initialStoryId);
    return nextIndex >= 0 ? nextIndex : 0;
  }
  const firstUnseen = firstUnseenStoryIndex(stories, viewerId, isStoryUnseenForViewer);
  return firstUnseen >= 0 ? firstUnseen : 0;
}

export default function StoryViewer({
  stories,
  ownerUsername,
  ownerUid,
  initialStoryId,
}: Props) {
  const router = useRouter();
  const t = useT();
  const [index, setIndex] = useState(0);
  const [localStories, setLocalStories] = useState(stories);
  const [activeOwnerUid, setActiveOwnerUid] = useState(ownerUid || "");
  const [activeOwnerUsername, setActiveOwnerUsername] = useState(ownerUsername || "");
  const [paused, setPaused] = useState(false);
  const [blurLocked, setBlurLocked] = useState(false);
  const [appliedBlurId, setAppliedBlurId] = useState("");
  const [likeBusy, setLikeBusy] = useState(false);
  const [viewerUid, setViewerUid] = useState("");
  const [ownerKey, setOwnerKey] = useState("");
  const [replayLocked, setReplayLocked] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [replyOpen, setReplyOpen] = useState(false);
  const [replyText, setReplyText] = useState("");
  const [replyDragY, setReplyDragY] = useState(0);
  const [replyDragging, setReplyDragging] = useState(false);
  const [replySentToast, setReplySentToast] = useState(false);
  const [reportOpen, setReportOpen] = useState(false);
  const durationWrittenIdRef = useRef("");
  const viewedRef = useRef<Set<string>>(new Set());
  const [frontReady, setFrontReady] = useState(false);
  const [frontError, setFrontError] = useState(false);
  const [appliedFrontId, setAppliedFrontId] = useState("");
  const [nextMediaReady, setNextMediaReady] = useState(false);
  const pendingAdvanceRef = useRef(false);
  const pointerRef = useRef({ x: 0, y: 0, t: 0, swiped: false });
  const replyPointerRef = useRef({ y: 0, dragging: false });
  const replySentTimerRef = useRef<number | null>(null);
  const incomingStoryKey = [
    ownerUid || "",
    ownerUsername || "",
    initialStoryId || "",
    stories.map((story) => story.id).join(","),
    viewerUid,
  ].join("|");
  const [appliedStoryKey, setAppliedStoryKey] = useState(incomingStoryKey);
  if (appliedStoryKey !== incomingStoryKey) {
    setAppliedStoryKey(incomingStoryKey);
    setLocalStories(stories);
    if (ownerUid) setActiveOwnerUid(ownerUid);
    if (ownerUsername) setActiveOwnerUsername(ownerUsername);
    setReplayLocked(
      Boolean(viewerUid) &&
        shouldReplayStoryPlayback({
          stories,
          viewerId: viewerUid,
          initialStoryId,
          isUnseen: isStoryUnseenForViewer,
        }),
    );
    setIndex(viewerUid ? initialStoryIndex(stories, initialStoryId, viewerUid) : 0);
    setFrontReady(false);
    setFrontError(false);
  }

  useEffect(() => {
    document.body.classList.add("sayittome-story-viewer-open");
    return () => {
      document.body.classList.remove("sayittome-story-viewer-open");
    };
  }, []);

  const exitStoryViewer = useCallback(() => {
    const dest = resolveStoryViewerExitDestination();
    const currentPath = window.location.pathname.split("?")[0].split("#")[0];

    if (dest === currentPath || dest === currentPath.replace(/\/$/, "")) {
      router.back();
      return;
    }

    router.replace(dest);
  }, [router]);

  useEffect(() => {
    const onBack = () => exitStoryViewer();
    window.addEventListener("sayittome:close-story", onBack);
    return () => window.removeEventListener("sayittome:close-story", onBack);
  }, [exitStoryViewer]);

  const current = localStories[index];
  if ((current?.id || "") !== appliedFrontId) {
    setAppliedFrontId(current?.id || "");
    setFrontReady(false);
    setFrontError(false);
  }
  const viewerReady = Boolean(viewerUid);
  const resolvedOwnerUid = activeOwnerUid || ownerUid || current?.ownerUid || "";
  const nextTarget = useMemo(
    () =>
      resolveNextPlayTarget({
        viewerId: viewerUid,
        currentOwnerUid: resolvedOwnerUid,
        currentIndex: index,
        currentStories: localStories,
        groups: getCachedStoryGroups(viewerUid),
        replay: replayLocked,
        isUnseen: isStoryUnseenForViewer,
        groupIsUnseen: groupIsUnseenForViewer,
      }),
    [index, localStories, replayLocked, resolvedOwnerUid, viewerUid],
  );
  const nextStory = useMemo(() => {
    if (nextTarget.kind === "same-group") {
      return localStories[nextTarget.storyIndex] ?? null;
    }
    if (nextTarget.kind === "next-group") {
      return nextTarget.group?.stories[nextTarget.storyIndex] ?? null;
    }
    return null;
  }, [localStories, nextTarget]);

  useNavUsefulPaint(isStoryViewerUsefulPaint({ current, frontReady, errored: frontError }));
  const resolvedOwnerUsername =
    activeOwnerUsername || ownerUsername || current?.ownerUsername || "";

  useEffect(() => {
    if (!isNavTraceEnabled() || !current) return;
    storyPipelineBegin({
      storyId: current.id,
      ownerUid: resolvedOwnerUid,
      ownerUsername: resolvedOwnerUsername,
      mediaUrl: current.mediaUrl,
      mediaType: current.mediaType === "video" ? "video" : current.mediaUrl ? "image" : "text",
    });
    storyPipelineMark("viewer-state-ready", {
      storyId: current.id,
      ownerUid: resolvedOwnerUid,
      ownerUsername: resolvedOwnerUsername,
      mediaUrl: current.mediaUrl,
      mediaType: current.mediaType === "video" ? "video" : current.mediaUrl ? "image" : "text",
    });
    if (current.mediaUrl) {
      storyPipelineNoteMediaUrl(
        current.mediaUrl,
        current.mediaType === "video" ? "video" : "image",
        current.id,
      );
    }
  }, [current, resolvedOwnerUid, resolvedOwnerUsername]);
  const anonymousStory = current ? isAnonymousStory(current) : false;
  const displayName = current
    ? storyDisplayName(current, t)
    : storyDisplayName(
        { ownerUsername: resolvedOwnerUsername, ownerUid: resolvedOwnerUid },
        t,
      );
  const profileUsername = String(
    current?.ownerUsername || resolvedOwnerUsername || "",
  ).trim();
  const profilePhoto = String(current?.ownerPhoto || "").trim();
  const canOpenProfile =
    !anonymousStory &&
    Boolean(profileUsername) &&
    !isInvalidPublicStoryUsername(profileUsername);
  const canReply = canOpenProfile;
  const needsBlur = current ? storyRequiresBlur(current) : false;
  const playbackReady = shouldStartStoryProgress({
    viewerReady,
    hasMediaUrl: Boolean(current?.mediaUrl),
    mediaType: current?.mediaType,
    frontReady,
    errored: frontError,
    durationMs: current?.durationMs,
  });
  const viewedReady = shouldMarkStoryViewed({
    viewerReady,
    hasMediaUrl: Boolean(current?.mediaUrl),
    mediaType: current?.mediaType,
    frontReady,
    errored: frontError,
    durationMs: current?.durationMs,
  });
  const isPaused = paused || replyOpen || (needsBlur && blurLocked) || !playbackReady;
  const canDelete = current ? canManageStory(current, ownerKey || getStoryOwnerKey()) : false;
  const likerId = getLikerId();
  const storyLiked = Boolean(likerId && current?.likedBy?.[likerId]);
  const storyLikeCount = Number(current?.likeCount || 0);
  const topChromeHidden = paused && !blurLocked;
  const bottomChromeHidden = topChromeHidden || replyOpen;
  const durationMs =
    current?.mediaType === "video" && current.durationMs
      ? current.durationMs
      : DEFAULT_IMAGE_MS;

  function handleAdminStoryBlurChange(blurred: boolean) {
    if (!current) return;

    setLocalStories((prev) =>
      prev.map((story) =>
        story.id === current.id
          ? {
              ...story,
              adminForceBlur: blurred,
              moderationRequiresBlur: blurred,
            }
          : story,
      ),
    );
    setBlurLocked(blurred);
  }

  const closeReply = useCallback(() => {
    setReplyOpen(false);
    setReplyText("");
    setReplyDragY(0);
    setReplyDragging(false);
    replyPointerRef.current.dragging = false;
  }, []);

  useEffect(() => {
    let cancelled = false;
    let ready = false;
    void resolveStoryViewerIdReady().then((viewerId) => {
      if (cancelled) return;
      ready = true;
      setViewerUid(viewerId);
      isolateStoryViewAckQueue(viewerId);
      void scheduleStoryViewAckFlush(viewerId);
      setOwnerKey(getStoryOwnerKey());
    });
    const unsub = onAuthStateChanged(auth, (user) => {
      if (!ready) return;
      const next = resolveStoryViewerId(user);
      setViewerUid((prev) => {
        if (prev && next && prev !== next) {
          viewedRef.current = new Set();
          isolateStoryViewAckQueue(next);
          void scheduleStoryViewAckFlush(next);
        }
        return next;
      });
      setOwnerKey(getStoryOwnerKey());
    });
    return () => {
      cancelled = true;
      unsub();
    };
  }, []);

  useEffect(() => {
    if (!profileUsername || !canReply) return;
    void resolveProfileChat(profileUsername).catch(() => {});
  }, [profileUsername, canReply]);

  useEffect(() => {
    preloadNextPlayTarget(nextTarget, localStories, { videoPreload: "metadata" });
    if (nextTarget.kind === "same-group") {
      const upcoming = localStories[nextTarget.storyIndex + 1];
      if (upcoming) preloadStoryMedia(upcoming, { videoPreload: "metadata" });
    }
  }, [localStories, nextTarget]);

  useEffect(() => {
    if (!replyOpen) return;

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") closeReply();
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [replyOpen, closeReply]);

  useEffect(() => {
    return () => {
      if (replySentTimerRef.current) {
        window.clearTimeout(replySentTimerRef.current);
      }
    };
  }, []);

  const markViewed = useCallback(async (story: StoryItem) => {
    if (!viewerUid) return;
    const viewerId = viewerUid;
    const seenKey = `${viewerId}:${story.id}`;
    if (viewedRef.current.has(seenKey)) return;

    viewedRef.current.add(seenKey);

    const queued = enqueueStoryViewAckRetry(story.id, viewerId);
    if (!queued.ok) {
      viewedRef.current.delete(seenKey);
      return;
    }

    if (story.ownerUid) {
      markStoryViewedLocally(story.ownerUid, story.id, viewerId);
    }

    void ackStoryView(story.id, viewerId)
      .then((result) => {
        if (!result.wrote) return;
        setLocalStories((prev) =>
          prev.map((row) =>
            row.id === story.id
              ? viewerId.startsWith("anon_")
                ? { ...row, viewedByAnon: { ...(row.viewedByAnon || {}), [viewerId]: true } }
                : { ...row, viewedBy: { ...(row.viewedBy || {}), [viewerId]: true } }
              : row,
          ),
        );
      })
      .catch((e) => {
        void scheduleStoryViewAckFlush(viewerId);
        console.error(e);
      });
  }, [viewerUid]);

  const goNext = useCallback(() => {
    if (!viewerUid) return;
    setReplyOpen(false);
    setReplyText("");

    if (nextTarget.kind === "same-group") {
      const nextItem = localStories[nextTarget.storyIndex];
      setBlurLocked(storyRequiresBlur(nextItem || current));
      setIndex(nextTarget.storyIndex);
      return;
    }

    if (nextTarget.kind === "next-group" && nextTarget.group?.stories.length) {
      const nextGroup = nextTarget.group;
      const nextIndex = Math.max(0, nextTarget.storyIndex);
      setReplayLocked(false);
      preloadNextPlayTarget(
        { kind: "same-group", group: null, storyIndex: nextIndex },
        nextGroup.stories,
        { videoPreload: "metadata" },
      );
      setLocalStories(nextGroup.stories);
      setActiveOwnerUid(nextGroup.ownerUid);
      setActiveOwnerUsername(nextGroup.ownerUsername);
      setIndex(nextIndex);
      setBlurLocked(storyRequiresBlur(nextGroup.stories[nextIndex]));
      const nextPath = `/stories/${encodeURIComponent(nextGroup.ownerUid)}`;
      window.history.replaceState(window.history.state, "", nextPath);
      return;
    }

    exitStoryViewer();
  }, [current, exitStoryViewer, localStories, nextTarget, viewerUid]);

  const tryAdvance = useCallback(() => {
    if (!viewerUid) return;
    if (
      !shouldReleaseMediaGate({
        hasUrl: Boolean(nextStory?.mediaUrl),
        ready: nextMediaReady,
        errored: frontError,
      })
    ) {
      pendingAdvanceRef.current = true;
      return;
    }
    pendingAdvanceRef.current = false;
    goNext();
  }, [frontError, goNext, nextMediaReady, nextStory?.mediaUrl, viewerUid]);

  useEffect(() => {
    if (!nextMediaReady || !pendingAdvanceRef.current) return;
    pendingAdvanceRef.current = false;
    goNext();
  }, [goNext, nextMediaReady]);

  useEffect(() => {
    if (!nextStory?.mediaUrl || nextMediaReady) return undefined;
    const timer = window.setTimeout(() => {
      setNextMediaReady(true);
    }, NEXT_MEDIA_READY_TIMEOUT_MS);
    return () => window.clearTimeout(timer);
  }, [nextMediaReady, nextStory?.id, nextStory?.mediaUrl]);

  const goPrev = useCallback(() => {
    if (index <= 0) {
      const previousGroup = getPreviousStoryGroup(resolvedOwnerUid);
      if (previousGroup?.stories.length) {
        const lastIndex = previousGroup.stories.length - 1;
        setLocalStories(previousGroup.stories);
        setActiveOwnerUid(previousGroup.ownerUid);
        setActiveOwnerUsername(previousGroup.ownerUsername);
        setIndex(lastIndex);
        setBlurLocked(storyRequiresBlur(previousGroup.stories[lastIndex]));
        const previousPath = `/stories/${encodeURIComponent(previousGroup.ownerUid)}`;
        window.history.replaceState(window.history.state, "", previousPath);
        return;
      }
    }

    const prevIndex = Math.max(0, index - 1);
    setBlurLocked(storyRequiresBlur(localStories[prevIndex]));
    setReplyOpen(false);
    setReplyText("");
    setIndex(prevIndex);
  }, [index, localStories, resolvedOwnerUid]);

  useEffect(() => {
    if (!current || !viewedReady || isPaused) return;
    markViewed(current);
  }, [current, isPaused, markViewed, viewedReady]);

  const currentBlurId = current?.id || "";
  const currentNeedsBlur = current ? storyRequiresBlur(current) : false;
  if (currentBlurId !== appliedBlurId) {
    setAppliedBlurId(currentBlurId);
    setBlurLocked(currentNeedsBlur);
  }

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
      tryAdvance();
    }
  }

  async function handleLike() {
    if (!current || likeBusy) return;

    if (!likerId || likerId === resolvedOwnerUid) return;

    setLikeBusy(true);

    const nextLiked = !storyLiked;

    try {
      if (nextLiked) {
        await updateDoc(doc(db, "historias", current.id), {
          likeCount: increment(1),
          [`likedBy.${likerId}`]: true,
          storyLikeAt: serverTimestamp(),
        });
      } else {
        await updateDoc(doc(db, "historias", current.id), {
          likeCount: increment(-1),
          [`likedBy.${likerId}`]: false,
        });
      }

      setLocalStories((prev) =>
        prev.map((story) =>
          story.id === current.id
            ? {
                ...story,
                likeCount: Math.max(0, Number(story.likeCount || 0) + (nextLiked ? 1 : -1)),
                likedBy: { ...(story.likedBy || {}), [likerId]: nextLiked },
              }
            : story,
        ),
      );
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

    try {
      await deleteStoryById(current.id);

      const nextStories = localStories.filter((story) => story.id !== current.id);
      if (nextStories.length === 0) {
        exitStoryViewer();
        return;
      }

      setLocalStories(nextStories);
      setIndex((value) => Math.min(value, nextStories.length - 1));
    } catch (error) {
      console.error(error);
      window.alert(t("stories_delete_fail"));
    } finally {
      setDeleting(false);
    }
  }

  function handleReplyPointerDown(event: React.PointerEvent<HTMLDivElement>) {
    if ((event.target as HTMLElement).closest("input,button")) return;

    replyPointerRef.current = { y: event.clientY, dragging: true };
    setReplyDragging(true);
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function handleReplyPointerMove(event: React.PointerEvent<HTMLDivElement>) {
    if (!replyPointerRef.current.dragging) return;

    setReplyDragY(Math.max(0, event.clientY - replyPointerRef.current.y));
  }

  function handleReplyPointerUp(event: React.PointerEvent<HTMLDivElement>) {
    if (!replyPointerRef.current.dragging) return;

    const deltaY = Math.max(0, event.clientY - replyPointerRef.current.y);
    replyPointerRef.current.dragging = false;
    setReplyDragging(false);

    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }

    if (deltaY >= SWIPE_DISMISS_PX) {
      closeReply();
      return;
    }

    setReplyDragY(0);
  }

  function handleSendReply() {
    if (!current || !canReply || !replyText.trim()) return;

    const text = replyText.trim();
    const story = current;
    const username = profileUsername;

    closeReply();
    setReplySentToast(true);

    if (replySentTimerRef.current) {
      window.clearTimeout(replySentTimerRef.current);
    }
    replySentTimerRef.current = window.setTimeout(() => {
      setReplySentToast(false);
      replySentTimerRef.current = null;
    }, 1800);

    void sendStoryReplyMessage(story, username, text).catch((error) => {
      console.error(error);
      setReplySentToast(false);
      window.alert(t("chat_save_fail"));
    });
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
            {i < index ? (
              <div className="h-full w-full bg-white" />
            ) : i === index ? (
              <div
                key={`${story.id}-${index}`}
                className="sayittome-story-progress h-full bg-white"
                style={{
                  animationDuration: `${durationMs}ms`,
                  animationPlayState: isPaused ? "paused" : "running",
                }}
                onAnimationEnd={(event) => {
                  if (event.currentTarget !== event.target || isPaused) return;
                  tryAdvance();
                }}
              />
            ) : null}
          </div>
        ))}
      </div>

      <button
        type="button"
        onClick={() => exitStoryViewer()}
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

      {!canDelete && !anonymousStory ? (
        <button
          type="button"
          onClick={() => setReportOpen(true)}
          className={[
            "absolute right-20 top-6 z-50 flex h-11 w-11 items-center justify-center rounded-full bg-black/50 text-amber-200 transition-opacity duration-150",
            topChromeHidden ? "pointer-events-none opacity-0" : "opacity-100",
          ].join(" ")}
          data-story-chrome
          aria-label={t("report_title")}
        >
          <Flag size={20} />
        </button>
      ) : null}

      {current ? (
        <AdminStoryBlurButton
          storyId={current.id}
          blurred={needsBlur}
          chromeHidden={topChromeHidden}
          onBlurChange={handleAdminStoryBlurChange}
        />
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
        {current.mediaUrl ? (
          <StoryMediaBuffers
            current={current}
            nextStory={nextStory}
            needsBlur={needsBlur}
            blurLocked={blurLocked}
            onNextReadyChange={setNextMediaReady}
            onFrontReady={() => {
              setFrontReady(true);
              setFrontError(false);
            }}
            onFrontError={() => {
              setFrontError(true);
              setFrontReady(false);
            }}
            onFrontVideoMetadata={(event) => {
              if (!current) return;
              const durationMs = videoDurationMsFromMetadata(Number(event.durationSec || 0));
              if (
                !shouldPersistVideoDuration({
                  storyId: current.id,
                  durationMs,
                  writtenForId: durationWrittenIdRef.current,
                })
              ) {
                return;
              }
              durationWrittenIdRef.current = current.id;
              setLocalStories((prev) =>
                prev.map((story) =>
                  story.id === current.id ? { ...story, durationMs } : story,
                ),
              );
              setDoc(
                doc(db, "historias", current.id),
                { durationMs },
                { merge: true },
              ).catch(() => {});
            }}
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

      {needsBlur && blurLocked ? (
        <>
          <button
            type="button"
            className="absolute bottom-0 left-0 top-0 z-[35] w-1/3 touch-none"
            onClick={(event) => {
              event.stopPropagation();
              goPrev();
            }}
            aria-label={t("stories_prev")}
          />
          <button
            type="button"
            className="absolute bottom-0 right-0 top-0 z-[35] w-1/3 touch-none"
            onClick={(event) => {
              event.stopPropagation();
              tryAdvance();
            }}
            aria-label={t("stories_next")}
          />
        </>
      ) : null}

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

        <div className="flex items-end gap-2">
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
            <span className="block h-14 w-14 shrink-0" aria-hidden />
          )}

          <div className="flex min-h-[2.75rem] min-w-0 flex-1 items-end justify-center px-2 pb-1">
            {current.mediaUrl && current.mediaSource ? (
              <StoryMediaSourceBadge
                source={current.mediaSource}
                mediaType={current.mediaType}
              />
            ) : null}
          </div>

          <div className="mb-1 flex shrink-0 items-center justify-end gap-4">
            {!anonymousStory ? (
              <button
                type="button"
                onClick={handleLike}
                disabled={likeBusy || likerId === resolvedOwnerUid}
                className={[
                  "flex items-center gap-2 rounded-full px-5 py-2.5 text-sm font-black transition",
                  storyLiked
                    ? "bg-pink-500 text-white shadow-[0_0_30px_rgba(236,72,153,.35)]"
                    : "bg-white/10 text-white",
                  likeBusy ? "opacity-60" : "",
                ].join(" ")}
              >
                <Heart size={18} fill={storyLiked ? "currentColor" : "none"} />
                {storyLiked ? t("stories_liked") : t("settings_likes")} · {storyLikeCount}
              </button>
            ) : null}
            <span className="text-sm font-bold text-white/50">
              {current.viewCount || 0} {t("stories_views")}
            </span>
          </div>
        </div>
      </div>

      {replySentToast ? (
        <div className="pointer-events-none absolute inset-x-0 bottom-[max(6.5rem,env(safe-area-inset-bottom))] z-[70] flex justify-center">
          <span className="rounded-full bg-white/15 px-4 py-2 text-sm font-semibold text-white backdrop-blur-md">
            {t("story_reply_sent")}
          </span>
        </div>
      ) : null}

      {replyOpen && canReply ? (
        <>
          <button
            type="button"
            className="absolute inset-0 z-[55] bg-black/25"
            onClick={closeReply}
            aria-label={t("common_cancel")}
          />
          <div
            className="absolute inset-x-0 bottom-0 z-[60] touch-none border-t border-white/10 bg-black/90 px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-2 backdrop-blur-md transition-transform duration-150 ease-out"
            data-story-chrome
            style={{
              transform: `translateY(${replyDragY}px)`,
              transition: replyDragging ? "none" : undefined,
            }}
            onPointerDown={handleReplyPointerDown}
            onPointerMove={handleReplyPointerMove}
            onPointerUp={handleReplyPointerUp}
            onPointerCancel={handleReplyPointerUp}
          >
            <div className="mx-auto mb-2 h-1 w-10 rounded-full bg-white/30" aria-hidden />

            <p className="mb-3 text-center text-xs font-semibold text-white/40">
              {t("story_reply_dismiss_hint")}
            </p>

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
                onPointerDown={(event) => event.stopPropagation()}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault();
                    handleSendReply();
                  }
                }}
              />
              <button
                type="button"
                onClick={handleSendReply}
                disabled={!replyText.trim()}
                className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-violet-600 text-white disabled:opacity-40"
                aria-label={t("story_reply_send")}
              >
                <Send size={18} />
              </button>
            </div>
          </div>
        </>
      ) : null}

      <ContentReportDialog
        open={reportOpen}
        onClose={() => setReportOpen(false)}
        kind="historia"
        targetUid={resolvedOwnerUid}
        targetUsername={profileUsername}
        storyId={current.id}
      />
    </main>
  );
}
