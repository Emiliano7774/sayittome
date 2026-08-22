/**
 * Productive /shuffle entry: same-gesture host + URL, no micro-slide.
 * Pure planner — BottomNav / warmShuffleTabNavigation must follow this.
 */

import { classifyAppRouteKind, isNonMainRoute } from "@/lib/navigation/routeKind";

export const INSTANT_SHUFFLE_ENTRY_ZONES = [
  "/stories",
  "/chats",
  "/boost",
  "/settings",
  "/u/ada",
  "/u/ada/chat",
  "/chat/thread-1",
  "/login",
] as const;

export type InstantShuffleEntryZone =
  | "stories"
  | "chats"
  | "boost"
  | "settings"
  | "profile"
  | "profile-chat"
  | "chat-thread"
  | "non-main"
  | "shuffle"
  | "popstate";

export type InstantShuffleCommitMode = "soft" | "history" | "none";

export type InstantShuffleEntryPlan = {
  zone: InstantShuffleEntryZone;
  beginMicroSlide: false;
  deferRouteCommit: false;
  useStageOrTransform: false;
  forceSoftNavigation: boolean;
  forceHistoryNavigation: boolean;
  commitMode: InstantShuffleCommitMode;
  presentHostSync: boolean;
  commitUrlSync: boolean;
  commitWithinRafs: 0;
  reshuffle: boolean;
  allowLoadingShell: false;
  remountHost: false;
  extraFirestoreReads: 0;
  extraFunctionsCalls: 0;
  extraStorageOps: 0;
  backgroundSingleFlightRevalidate: true;
};

export type InstantShuffleEntryInput = {
  fromPath: string;
  alreadyOnShuffle?: boolean;
  popstateRestore?: boolean;
  /** Ignored on the productive path — micro-slide never starts from entry. */
  microSlideEnabled?: boolean;
  nativeShellHardNavWouldApply?: boolean;
};

function normalizePath(pathname: string) {
  return String(pathname || "/").split("?")[0].split("#")[0] || "/";
}

export function classifyInstantShuffleEntryZone(
  fromPath: string,
  popstateRestore = false,
): InstantShuffleEntryZone {
  if (popstateRestore) return "popstate";
  const path = normalizePath(fromPath);
  if (path === "/stories") return "stories";
  if (path === "/chats") return "chats";
  if (path === "/boost") return "boost";
  if (path === "/settings" || path.startsWith("/settings/")) return "settings";
  if (path === "/shuffle") return "shuffle";
  const kind = classifyAppRouteKind(path);
  if (kind === "profile") return "profile";
  if (kind === "profile-chat") return "profile-chat";
  if (kind === "chat-thread") return "chat-thread";
  return "non-main";
}

/**
 * Instant same-document commit for →/shuffle.
 * Native shell: history.pushState (sync URL, no Next realm wipe).
 * Web: soft router.push (same as Shuffle→Chats).
 */
export function resolveInstantShuffleCommitMode(input: {
  alreadyOnShuffle?: boolean;
  popstateRestore?: boolean;
  nativeShellHardNavWouldApply?: boolean;
}): InstantShuffleCommitMode {
  if (input.alreadyOnShuffle || input.popstateRestore) return "none";
  if (input.nativeShellHardNavWouldApply) return "history";
  return "soft";
}

export function planInstantShuffleEntry(
  input: InstantShuffleEntryInput,
): InstantShuffleEntryPlan {
  const fromPath = normalizePath(input.fromPath);
  const alreadyOnShuffle = input.alreadyOnShuffle === true || fromPath === "/shuffle";
  const popstateRestore = input.popstateRestore === true;
  const zone = classifyInstantShuffleEntryZone(fromPath, popstateRestore);
  const commitMode = resolveInstantShuffleCommitMode({
    alreadyOnShuffle,
    popstateRestore,
    nativeShellHardNavWouldApply: input.nativeShellHardNavWouldApply === true,
  });

  return {
    zone,
    beginMicroSlide: false,
    deferRouteCommit: false,
    useStageOrTransform: false,
    forceSoftNavigation: commitMode === "soft",
    forceHistoryNavigation: commitMode === "history",
    commitMode,
    presentHostSync: !alreadyOnShuffle || popstateRestore,
    commitUrlSync: commitMode !== "none",
    commitWithinRafs: 0,
    reshuffle: alreadyOnShuffle && !popstateRestore,
    allowLoadingShell: false,
    remountHost: false,
    extraFirestoreReads: 0,
    extraFunctionsCalls: 0,
    extraStorageOps: 0,
    backgroundSingleFlightRevalidate: true,
  };
}

export function isInstantShuffleNonMainSource(fromPath: string) {
  return isNonMainRoute(normalizePath(fromPath));
}

/** Warm pool revalidate must stay single-flight and never add extra reads. */
export function planShuffleEntryRevalidateBudget(input: {
  poolWarm: boolean;
  warmupInFlight: boolean;
}) {
  return {
    mayStartNetworkWarmup: !input.poolWarm && !input.warmupInFlight,
    extraFirestoreReads: 0 as const,
    extraFunctionsCalls: 0 as const,
    extraStorageOps: 0 as const,
    backgroundSingleFlight: true as const,
  };
}
