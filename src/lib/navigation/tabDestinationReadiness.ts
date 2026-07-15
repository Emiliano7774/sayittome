/**
 * TAB_SHELL_NO_LOADING_TRANSITION_CONTRACT — destination visual readiness registry.
 * Covers Shuffle + Chats/Stories/Boost/Settings for bidirectional tab transitions.
 */
import type { MainTabHref } from "@/lib/navigation/mainTabs";
import { getShuffleDestinationVisualReadiness } from "@/lib/navigation/shuffleDestinationReadiness";
import { isMainTabToShuffleMicroSlideEnabled } from "@/lib/perf/instantaneityFlags";
import { armBoostSequenceHandoffSuppress } from "@/lib/boost/boostHandoffSuppress";
import {
  armChatsSequenceHandoffSuppress,
  isChatsSequenceHandoffSuppressActive,
  wasChatsHandoffSuppressRehydratedFromSession,
} from "@/lib/chats/chatsHandoffSuppress";
import { clearShuffleExitToMainTab } from "@/lib/navigation/shuffleHandoffState";
import {
  canClearDestinationGuardForPreviousHop,
  completeHandoffGuardToken,
  createHandoffGuardToken,
  getActiveHandoffGuardTxId,
  markHandoffGuardReady,
  markHandoffGuardRevealStarted,
  markHandoffGuardRouteCommitted,
  registerHandoffGuardTrace,
  type HandoffGuardDestination,
} from "@/lib/navigation/tabHandoffDestinationGuard";

export type TabDestinationVisualReadiness = {
  tabId: MainTabHref;
  ready: boolean;
  hasLoadingShell: boolean;
  hasVisibleLoadingText: boolean;
  hasContentRoot: boolean;
  contentCount: number;
  geometryValid: boolean;
  stableFramesReady: boolean;
  warmState: "ready" | "warming" | "empty" | "unknown" | "static";
  reason: string;
};

const LOADING_TEXT_RE = /Cargando(?:\.\.\.)?|Loading(?:\.\.\.)?/i;
const STABLE_FRAMES_REQUIRED = 2;
/** Auth destinations need post-route-commit stability beyond pre-commit ready. */
const POST_AUTH_STABLE_FRAMES = 3;
const POST_AUTH_MIN_FRAMES_AFTER_HANDOFF = 3;
/**
 * Fresh-anon exact sequences remount Boost after prior hops (incl. Boost→Shuffle
 * earlier in the same 8-dir). Match Chats pre-reveal sample strength.
 */
const BOOST_POST_AUTH_STABLE_FRAMES = 4;
const BOOST_POST_AUTH_MIN_FRAMES_AFTER_HANDOFF = 4;
/**
 * Fresh-anon exact sequences remount Chats after prior hops / context rebind;
 * require a slightly longer pre-reveal sample than generic post-auth tabs.
 */
const CHATS_POST_AUTH_STABLE_FRAMES = 4;
const CHATS_POST_AUTH_MIN_FRAMES_AFTER_HANDOFF = 4;
/** Keep CSS settle after reveal so auth rebounds cannot flash "Cargando...". */
const POST_REVEAL_SETTLE_HOLD_FRAMES = 5;
/**
 * Main-tab → Shuffle (esp. logged-in Boost→Shuffle): source Boost can stay
 * non-frozen and flash BoostAccessGate loading after a short 5-frame settle.
 * Match Boost/Chats post-reveal timing so orphan loading blocks release.
 */
const SHUFFLE_POST_REVEAL_SETTLE_HOLD_FRAMES = 12;
const SHUFFLE_POST_REVEAL_MIN_HOLD_MS = 160;
const SHUFFLE_POST_REVEAL_MAX_HOLD_MS = 400;
/** Prod Boost auth rebind can land after ~100ms; hold longer than Chats/Shuffle. */
const BOOST_POST_REVEAL_SETTLE_HOLD_FRAMES = 12;
const BOOST_POST_REVEAL_MIN_HOLD_MS = 160;
/** Hard cap so settle CSS cannot pin the destination forever. */
const BOOST_POST_REVEAL_MAX_HOLD_MS = 400;
/**
 * Prod fresh-anon Shuffle→Chats sequence rebound: Chats remount loading text can
 * land ~80–160ms after a short 5-frame settle clear. Match Boost hold timing.
 */
const CHATS_POST_REVEAL_SETTLE_HOLD_FRAMES = 12;
const CHATS_POST_REVEAL_MIN_HOLD_MS = 160;
const CHATS_POST_REVEAL_MAX_HOLD_MS = 400;

type PostAuthTab = "/boost" | "/chats" | "/shuffle";

const stableStreakByTab = new Map<MainTabHref, number>();
const lastReadySignatureByTab = new Map<MainTabHref, string>();

type PostAuthTracker = {
  active: boolean;
  frames: number;
  stableStreak: number;
  sawReady: boolean;
  loadingReboundSeen: boolean;
  postRevealHoldFrames: number;
  postRevealClearPending: boolean;
  postRevealHoldStartedAt: number;
  /** Wall-clock epoch for max hold; not reset on rebound. */
  postRevealGuardEpochAt: number;
};

const postAuthByTab: Record<PostAuthTab, PostAuthTracker> = {
  "/boost": {
    active: false,
    frames: 0,
    stableStreak: 0,
    sawReady: false,
    loadingReboundSeen: false,
    postRevealHoldFrames: 0,
    postRevealClearPending: false,
    postRevealHoldStartedAt: 0,
    postRevealGuardEpochAt: 0,
  },
  "/chats": {
    active: false,
    frames: 0,
    stableStreak: 0,
    sawReady: false,
    loadingReboundSeen: false,
    postRevealHoldFrames: 0,
    postRevealClearPending: false,
    postRevealHoldStartedAt: 0,
    postRevealGuardEpochAt: 0,
  },
  "/shuffle": {
    active: false,
    frames: 0,
    stableStreak: 0,
    sawReady: false,
    loadingReboundSeen: false,
    postRevealHoldFrames: 0,
    postRevealClearPending: false,
    postRevealHoldStartedAt: 0,
    postRevealGuardEpochAt: 0,
  },
};

function isPostAuthTab(tab: MainTabHref | string): tab is PostAuthTab {
  return tab === "/boost" || tab === "/chats" || tab === "/shuffle";
}

function settleDatasetKey(tab: PostAuthTab): string {
  if (tab === "/boost") return "boostPostCommitSettle";
  if (tab === "/chats") return "chatsPostAuthSettle";
  return "shufflePostAuthSettle";
}

function syncTabPostAuthSettleDataset() {
  if (typeof document === "undefined") return;
  const html = document.documentElement;
  let any = false;
  for (const tab of Object.keys(postAuthByTab) as PostAuthTab[]) {
    const key = settleDatasetKey(tab);
    if (postAuthByTab[tab].active) {
      html.dataset[key] = "1";
      any = true;
    } else {
      delete html.dataset[key];
    }
  }
  // Chats protection must outlive exitHandoff / postAuth.active clear: keep
  // settle + suppress datasets while the tx-scoped suppress window is live so
  // fresh-anon sequence remounts cannot flash [data-nav-loading-copy].
  if (isChatsSequenceHandoffSuppressActive()) {
    html.dataset.chatsPostAuthSettle = "1";
    html.dataset.chatsHandoffSuppress = "1";
    any = true;
  } else {
    delete html.dataset.chatsHandoffSuppress;
  }
  if (any) html.dataset.tabPostAuthSettle = "1";
  else delete html.dataset.tabPostAuthSettle;
}

/** Arm Chats suppress and keep settle CSS datasets in sync. */
function armChatsHandoffSuppressAndSettle(ms: number, txId: string | null | undefined) {
  const flagTrue = isMainTabToShuffleMicroSlideEnabled();
  armChatsSequenceHandoffSuppress(ms, { txId });
  syncTabPostAuthSettleDataset();
  if (flagTrue) {
    traceTabShellNoLoading("TAB_HANDOFF_SHUFFLE_CHATS_ARMED_WITH_CANONICAL_FLAG", {
      ms,
      txId,
      canonicalFlag: true,
      rehydrated: wasChatsHandoffSuppressRehydratedFromSession(),
    });
    traceTabShellNoLoading("TAB_HANDOFF_CHATS_LOADING_BLOCKED_WITH_FLAG_TRUE", {
      ms,
      txId,
    });
  } else {
    traceTabShellNoLoading("TAB_HANDOFF_FLAG_FALSE_ON_INTERNAL_HOP", {
      ms,
      txId,
      canonicalFlag: false,
    });
  }
  if (wasChatsHandoffSuppressRehydratedFromSession()) {
    traceTabShellNoLoading("TAB_HANDOFF_CHATS_SUPPRESS_REHYDRATED_AFTER_REMOUNT", {
      txId,
      ms,
    });
  }
}

function chatsHostHasLayoutLoading(host: HTMLElement | null) {
  if (!host) return false;
  if (detectVisibleLoadingText(host, { ignoreHandoffHide: true })) return true;
  if (countVisibleLoadingShells(host, { ignoreHandoffHide: true }) > 0) return true;
  return [...host.querySelectorAll("[data-nav-loading-copy]")].some((el) =>
    isElementLayoutPresent(el),
  );
}

/**
 * After exit/settle class clear, keep watching for a late Chats inbox remount
 * while suppress is still armed (fresh-anon sequence carry-over).
 */
function scheduleChatsPostClassClearGuard(txId: string | null) {
  const startedAt = Date.now();
  const maxMs = 420;
  const tick = () => {
    if (!isChatsSequenceHandoffSuppressActive({ txId })) return;
    if (Date.now() - startedAt > maxMs) {
      syncTabPostAuthSettleDataset();
      return;
    }
    const host =
      typeof document !== "undefined"
        ? (document.getElementById("sayittome-main-tab-keepalive-chats") as HTMLElement | null)
        : null;
    const layoutLoading = chatsHostHasLayoutLoading(host);
    const visualLoading =
      detectVisibleLoadingText(host) ||
      countVisibleLoadingShells(host) > 0 ||
      detectOrphanMainLoadingText();
    if (layoutLoading || visualLoading) {
      armChatsHandoffSuppressAndSettle(400, txId);
      traceTabShellNoLoading("TAB_HANDOFF_CHATS_FRESH_SEQUENCE_LOADING_DETECTED", {
        txId,
        layoutLoading,
        visualLoading,
      });
      traceTabShellNoLoading("TAB_HANDOFF_CHATS_FRESH_SEQUENCE_BLOCKED_RELEASE", {
        txId,
      });
      traceTabShellNoLoading("TAB_HANDOFF_CHATS_POST_CLASS_CLEAR_GUARD_HELD", {
        txId,
      });
      traceTabShellNoLoading("TAB_HANDOFF_CHATS_SUPPRESS_HELD_AFTER_EXIT_CLEAR", {
        txId,
      });
      traceTabShellNoLoading("TAB_HANDOFF_CANONICAL_IDLE_BLOCKED_FRESH_CHATS_LOADING", {
        txId,
      });
      requestAnimationFrame(tick);
      return;
    }
    traceTabShellNoLoading("TAB_HANDOFF_CHATS_LOADING_ABSENT_STABLE_AFTER_CLASS_CLEAR", {
      txId,
      heldMs: Date.now() - startedAt,
    });
    syncTabPostAuthSettleDataset();
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}

function normalizeTab(tab: MainTabHref | string): MainTabHref | null {
  const path = String(tab || "").split("?")[0].split("#")[0];
  const href = (path.startsWith("/") ? path : `/${path}`) as MainTabHref;
  if (
    href === "/shuffle" ||
    href === "/chats" ||
    href === "/stories" ||
    href === "/boost" ||
    href === "/settings"
  ) {
    return href;
  }
  return null;
}

function isHandoffSuppressingDestinationVisibility() {
  if (typeof document === "undefined") return false;
  const html = document.documentElement;
  return (
    html.classList.contains("sayittome-shuffle-exit-handoff-pending") ||
    html.classList.contains("sayittome-main-tab-handoff-pending") ||
    html.getAttribute("data-main-tab-shuffle-slide") === "preparing" ||
    html.getAttribute("data-main-tab-shuffle-slide") === "armed" ||
    html.getAttribute("data-main-tab-shuffle-slide") === "running"
  );
}

function isElementLayoutPresent(el: Element) {
  const rect = el.getBoundingClientRect();
  const style = getComputedStyle(el);
  // Ignore visibility/opacity: handoff CSS may hide destination while it warms.
  return style.display !== "none" && rect.width >= 24 && rect.height >= 24;
}

function isElementVisuallyPresent(el: Element) {
  const rect = el.getBoundingClientRect();
  const style = getComputedStyle(el);
  return (
    rect.width >= 24 &&
    rect.height >= 24 &&
    style.visibility !== "hidden" &&
    style.display !== "none" &&
    parseFloat(style.opacity || "1") >= 0.04
  );
}

function countVisibleLoadingShells(
  root: ParentNode | null | undefined,
  opts?: { ignoreHandoffHide?: boolean },
) {
  if (!root) return 0;
  const present = opts?.ignoreHandoffHide
    ? isElementLayoutPresent
    : isElementVisuallyPresent;
  let count = 0;
  for (const shell of root.querySelectorAll("[data-loading-shell]")) {
    if (present(shell)) count += 1;
  }
  return count;
}

function detectVisibleLoadingText(
  root: ParentNode | null | undefined,
  opts?: { ignoreHandoffHide?: boolean },
) {
  if (!root || typeof document === "undefined") return false;
  const present = opts?.ignoreHandoffHide
    ? isElementLayoutPresent
    : isElementVisuallyPresent;
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  let node = walker.nextNode();
  while (node) {
    const text = node.textContent?.trim() || "";
    if (LOADING_TEXT_RE.test(text)) {
      const parent = node.parentElement;
      if (parent && present(parent)) return true;
    }
    node = walker.nextNode();
  }
  return false;
}

function primarySelector(href: Exclude<MainTabHref, "/shuffle">) {
  if (href === "/settings") return "[data-nav-settings-primary]";
  return "[data-nav-primary-content]";
}

function hostIdFor(href: Exclude<MainTabHref, "/shuffle">) {
  return `sayittome-main-tab-keepalive-${href.slice(1)}`;
}

function evaluateNonShuffleReadiness(
  href: Exclude<MainTabHref, "/shuffle">,
): Omit<TabDestinationVisualReadiness, "stableFramesReady"> {
  if (typeof document === "undefined") {
    return {
      tabId: href,
      ready: false,
      hasLoadingShell: false,
      hasVisibleLoadingText: false,
      hasContentRoot: false,
      contentCount: 0,
      geometryValid: false,
      warmState: "unknown",
      reason: "ssr",
    };
  }

  const host = document.getElementById(hostIdFor(href));
  if (!host) {
    return {
      tabId: href,
      ready: false,
      hasLoadingShell: false,
      hasVisibleLoadingText: false,
      hasContentRoot: false,
      contentCount: 0,
      geometryValid: false,
      warmState: "unknown",
      reason: "host-missing",
    };
  }

  // During freeze, destination hosts may be CSS-hidden; still judge real readiness
  // (layout + underlying loading) so we can release once warm.
  const ignoreHandoffHide = isHandoffSuppressingDestinationVisibility();
  const present = ignoreHandoffHide
    ? isElementLayoutPresent
    : isElementVisuallyPresent;
  const hasLoadingShell =
    countVisibleLoadingShells(host, { ignoreHandoffHide }) > 0;
  const hasVisibleLoadingText =
    detectVisibleLoadingText(host, { ignoreHandoffHide }) ||
    [...host.querySelectorAll("[data-nav-loading-copy]")].some((el) =>
      present(el),
    );
  const primary = host.querySelector(primarySelector(href));
  const hasContentRoot = Boolean(primary);
  const geometryValid = primary ? present(primary) : false;
  const contentCount = primary
    ? primary.querySelectorAll(
        "li, [data-chat-row], [data-story-item], [data-boost-card], section, article, form",
      ).length || (geometryValid ? 1 : 0)
    : 0;

  const warmState: TabDestinationVisualReadiness["warmState"] =
    href === "/settings" || href === "/boost"
      ? geometryValid && !hasLoadingShell && !hasVisibleLoadingText
        ? "static"
        : "warming"
      : geometryValid && !hasLoadingShell && !hasVisibleLoadingText
        ? "ready"
        : "warming";

  const ready =
    hasContentRoot &&
    geometryValid &&
    !hasLoadingShell &&
    !hasVisibleLoadingText &&
    (href === "/settings" || href === "/boost" || contentCount >= 0);

  let reason = ready ? "ready" : "not-ready";
  if (!host) reason = "host-missing";
  else if (hasLoadingShell) reason = "loading-shell";
  else if (hasVisibleLoadingText) reason = "loading-text";
  else if (!hasContentRoot) reason = "no-content-root";
  else if (!geometryValid) reason = "geometry";

  return {
    tabId: href,
    ready,
    hasLoadingShell,
    hasVisibleLoadingText,
    hasContentRoot,
    contentCount,
    geometryValid,
    warmState,
    reason,
  };
}

function updateStableFrames(
  tab: MainTabHref,
  snapshot: Omit<TabDestinationVisualReadiness, "stableFramesReady">,
): boolean {
  const signature = [
    snapshot.ready ? "1" : "0",
    snapshot.hasLoadingShell ? "1" : "0",
    snapshot.hasVisibleLoadingText ? "1" : "0",
    snapshot.hasContentRoot ? "1" : "0",
    String(snapshot.contentCount),
    snapshot.reason,
  ].join("|");

  if (!snapshot.ready) {
    stableStreakByTab.set(tab, 0);
    lastReadySignatureByTab.set(tab, signature);
    return false;
  }

  const prev = lastReadySignatureByTab.get(tab);
  if (prev === signature) {
    const next = (stableStreakByTab.get(tab) ?? 0) + 1;
    stableStreakByTab.set(tab, next);
  } else {
    lastReadySignatureByTab.set(tab, signature);
    stableStreakByTab.set(tab, 1);
  }
  return (stableStreakByTab.get(tab) ?? 0) >= STABLE_FRAMES_REQUIRED;
}

export function resetTabDestinationReadinessStability(tab?: MainTabHref) {
  if (tab) {
    stableStreakByTab.delete(tab);
    lastReadySignatureByTab.delete(tab);
    if (isPostAuthTab(tab)) {
      postAuthByTab[tab].stableStreak = 0;
      postAuthByTab[tab].sawReady = false;
    }
    return;
  }
  stableStreakByTab.clear();
  lastReadySignatureByTab.clear();
  for (const t of Object.keys(postAuthByTab) as PostAuthTab[]) {
    postAuthByTab[t].stableStreak = 0;
    postAuthByTab[t].sawReady = false;
  }
}

function resetPostAuthTracker(tab: PostAuthTab) {
  const t = postAuthByTab[tab];
  t.active = false;
  t.frames = 0;
  t.stableStreak = 0;
  t.sawReady = false;
  t.loadingReboundSeen = false;
  t.postRevealHoldFrames = 0;
  t.postRevealClearPending = false;
  t.postRevealHoldStartedAt = 0;
  t.postRevealGuardEpochAt = 0;
}

/** Start post-auth / post-commit stability window for logged-in tab handoffs. */
export function beginTabPostAuthStabilityTracking(
  tab: PostAuthTab,
  detail?: unknown,
) {
  const t = postAuthByTab[tab];
  // Preserve an in-flight post-reveal guard (sequence rebind must not cancel it).
  // Boost AND Chats — ping-pong root was Boost-only keepPostReveal.
  const keepPostReveal =
    (tab === "/boost" || tab === "/chats") &&
    t.active &&
    t.postRevealClearPending;
  t.active = true;
  t.frames = 0;
  t.stableStreak = 0;
  t.sawReady = false;
  t.loadingReboundSeen = false;
  if (!keepPostReveal) {
    t.postRevealHoldFrames = 0;
    t.postRevealClearPending = false;
  }
  resetTabDestinationReadinessStability(tab);

  const source =
    detail && typeof detail === "object" && "source" in detail
      ? ((detail as { source?: MainTabHref | string }).source ?? null)
      : null;
  const existingTx = getActiveHandoffGuardTxId(tab as HandoffGuardDestination);
  if (!existingTx || !keepPostReveal) {
    createHandoffGuardToken(source, tab as HandoffGuardDestination);
  }
  markHandoffGuardRouteCommitted(tab as HandoffGuardDestination);
  syncTabPostAuthSettleDataset();

  const txId = getActiveHandoffGuardTxId(tab as HandoffGuardDestination);

  if (tab === "/boost") {
    armBoostSequenceHandoffSuppress(520, { txId });
    traceTabShellNoLoading("TAB_HANDOFF_BOOST_POST_COMMIT_STABILITY_WAIT", detail);
    traceTabShellNoLoading("TAB_HANDOFF_BOOST_AUTH_POST_COMMIT_STABILITY_READY", {
      phase: "begin",
      txId,
      ...(typeof detail === "object" && detail ? detail : { detail }),
    });
    traceTabShellNoLoading("TAB_HANDOFF_SEQUENCE_BOOST_REENTRY_STABLE", {
      phase: "begin",
      keepPostReveal,
      txId,
      ...((detail && typeof detail === "object" ? detail : { detail }) as object),
    });
    if (keepPostReveal) {
      traceTabShellNoLoading("TAB_HANDOFF_BOOST_GUARD_NOT_CLEARED_BY_PREVIOUS_HOP", {
        via: "begin-preserve-post-reveal",
        txId,
      });
    }
  } else if (tab === "/chats") {
    armChatsHandoffSuppressAndSettle(520, txId);
    traceTabShellNoLoading("TAB_HANDOFF_CHATS_POST_COMMIT_STABILITY_READY", {
      phase: "begin",
      txId,
      ...(typeof detail === "object" && detail ? detail : { detail }),
    });
    traceTabShellNoLoading("TAB_HANDOFF_CHATS_AUTH_READY", {
      phase: "begin-wait",
      txId,
      ...(typeof detail === "object" && detail ? detail : { detail }),
    });
    if (keepPostReveal) {
      traceTabShellNoLoading("TAB_HANDOFF_CHATS_GUARD_NOT_CLEARED_BY_PREVIOUS_HOP", {
        via: "begin-preserve-post-reveal",
        txId,
      });
    }
  } else {
    traceTabShellNoLoading("TAB_HANDOFF_SHUFFLE_POST_COMMIT_STABILITY_WAIT", detail);
    traceTabShellNoLoading("TAB_HANDOFF_SHUFFLE_AUTH_READY", {
      phase: "begin-wait",
      ...(typeof detail === "object" && detail ? detail : { detail }),
    });
  }
}

export function clearTabPostAuthStabilityTracking(
  tab: PostAuthTab,
  detail?: unknown,
) {
  const via =
    detail && typeof detail === "object" && "via" in detail
      ? String((detail as { via?: unknown }).via ?? "")
      : "";
  const destination =
    detail && typeof detail === "object" && "destination" in detail
      ? String((detail as { destination?: unknown }).destination ?? "")
      : "";

  if (
    via.includes("left-destination") &&
    destination &&
    !canClearDestinationGuardForPreviousHop(tab, destination)
  ) {
    return;
  }

  const txId = getActiveHandoffGuardTxId(tab as HandoffGuardDestination);
  resetPostAuthTracker(tab);
  if (txId) {
    completeHandoffGuardToken(tab as HandoffGuardDestination, txId);
  }
  syncTabPostAuthSettleDataset();
  if (detail !== undefined) {
    if (tab === "/boost") {
      traceTabShellNoLoading("TAB_HANDOFF_SEQUENCE_BOOST_REENTRY_STABLE", {
        phase: "clear",
        txId,
        ...(typeof detail === "object" && detail ? detail : { detail }),
      });
    }
  }
}

/**
 * After a successful reveal commit, keep settle CSS for a short post-reveal
 * window so auth/data rebounds cannot flash loading text.
 * Boost + Chats use longer prod-timing guards (frames + wall-clock).
 */
export function scheduleClearTabPostAuthStabilityAfterReveal(
  tab: PostAuthTab,
  detail?: unknown,
) {
  const t = postAuthByTab[tab];
  if (!t.active) return;
  t.postRevealClearPending = true;
  t.postRevealHoldFrames = 0;
  t.postRevealHoldStartedAt = Date.now();
  t.postRevealGuardEpochAt = t.postRevealHoldStartedAt;

  const txId = getActiveHandoffGuardTxId(tab as HandoffGuardDestination);
  markHandoffGuardRevealStarted(tab as HandoffGuardDestination, txId);

  const requiredFrames =
    tab === "/boost"
      ? BOOST_POST_REVEAL_SETTLE_HOLD_FRAMES
      : tab === "/chats"
        ? CHATS_POST_REVEAL_SETTLE_HOLD_FRAMES
        : tab === "/shuffle"
          ? SHUFFLE_POST_REVEAL_SETTLE_HOLD_FRAMES
          : POST_REVEAL_SETTLE_HOLD_FRAMES;
  const requiredMs =
    tab === "/boost"
      ? BOOST_POST_REVEAL_MIN_HOLD_MS
      : tab === "/chats"
        ? CHATS_POST_REVEAL_MIN_HOLD_MS
        : tab === "/shuffle"
          ? SHUFFLE_POST_REVEAL_MIN_HOLD_MS
          : 0;
  const maxHoldMs =
    tab === "/boost"
      ? BOOST_POST_REVEAL_MAX_HOLD_MS
      : tab === "/chats"
        ? CHATS_POST_REVEAL_MAX_HOLD_MS
        : tab === "/shuffle"
          ? SHUFFLE_POST_REVEAL_MAX_HOLD_MS
          : 0;

  if (tab === "/boost") {
    armBoostSequenceHandoffSuppress(Math.max(requiredMs + 360, 520), { txId });
    traceTabShellNoLoading("TAB_HANDOFF_BOOST_PROD_REBOUND_GUARD_START", {
      requiredFrames,
      requiredMs,
      txId,
      ...(typeof detail === "object" && detail ? detail : { detail }),
    });
    traceTabShellNoLoading("TAB_HANDOFF_BOOST_SEQUENCE_REBOUND_GUARD_START", {
      requiredFrames,
      requiredMs,
      txId,
      ...(typeof detail === "object" && detail ? detail : { detail }),
    });
    traceTabShellNoLoading("TAB_HANDOFF_BOOST_SETTLE_CSS_HELD", {
      phase: "post-reveal-guard",
      txId,
    });
    traceTabShellNoLoading("TAB_HANDOFF_BOOST_SEQUENCE_SETTLE_CSS_HELD", {
      phase: "post-reveal-guard",
      txId,
    });
  } else if (tab === "/chats") {
    armChatsHandoffSuppressAndSettle(Math.max(requiredMs + 360, 520), txId);
    traceTabShellNoLoading("TAB_HANDOFF_CHATS_PROD_SEQUENCE_REBOUND_GUARD_START", {
      requiredFrames,
      requiredMs,
      txId,
      ...(typeof detail === "object" && detail ? detail : { detail }),
    });
    traceTabShellNoLoading("TAB_HANDOFF_CHATS_SETTLE_CSS_HELD", {
      phase: "post-reveal-guard",
      txId,
    });
    traceTabShellNoLoading("TAB_HANDOFF_CHATS_SUPPRESS_HELD_AFTER_EXIT_CLEAR", {
      phase: "post-reveal-arm",
      txId,
    });
  } else if (tab === "/shuffle") {
    traceTabShellNoLoading("TAB_HANDOFF_SHUFFLE_POST_COMMIT_STABILITY_WAIT", {
      phase: "post-reveal-guard",
      requiredFrames,
      requiredMs,
      txId,
      ...(typeof detail === "object" && detail ? detail : { detail }),
    });
  }

  const tick = () => {
    if (!postAuthByTab[tab].active || !postAuthByTab[tab].postRevealClearPending) {
      return;
    }
    const host =
      typeof document !== "undefined"
        ? tab === "/shuffle"
          ? document.getElementById("sayittome-shuffle-keepalive-host")
          : document.getElementById(`sayittome-main-tab-keepalive-${tab.slice(1)}`)
        : null;
    const gateState =
      tab === "/boost"
        ? readBoostAccessGateState(host as HTMLElement | null)
        : "ready";
    // Post-reveal rebound must be VISIBLE. CSS-hidden loading under settle datasets
    // is the safety net working — do not treat layout-present-only as a forever block.
    // Exception (Chats fresh-anon sequence): layout-present inbox loading after prior
    // hops still blocks release so settle/suppress outlive exitHandoff clear.
    const visualLoading =
      detectVisibleLoadingText(host) ||
      countVisibleLoadingShells(host) > 0 ||
      (tab === "/boost" &&
        gateState === "loading" &&
        Boolean(
          host &&
            [...host.querySelectorAll('[data-boost-access-state="loading"]')].some(
              (el) => isElementVisuallyPresent(el),
            ),
        )) ||
      detectOrphanMainLoadingText();
    const chatsLayoutLoading =
      tab === "/chats" ? chatsHostHasLayoutLoading(host as HTMLElement | null) : false;
    const loading = visualLoading || chatsLayoutLoading;

    const orphanVisible =
      tab === "/shuffle" ? detectOrphanMainLoadingText() : false;
    if (orphanVisible) {
      traceTabShellNoLoading("TAB_HANDOFF_ORPHAN_LOADING_DETECTED", {
        tab,
        txId,
        layer: "source-or-global-nav-loading-copy",
      });
      traceTabShellNoLoading("TAB_HANDOFF_ORPHAN_LOADING_BLOCKED_RELEASE", {
        tab,
        txId,
      });
      traceTabShellNoLoading("TAB_HANDOFF_ORPHAN_LOADING_LAYER_CLASSIFIED", {
        layer: "boost-access-gate-or-nav-loading-copy-outside-frozen-host",
      });
      traceTabShellNoLoading("TAB_HANDOFF_CANONICAL_IDLE_BLOCKED_ORPHAN_LOADING", {
        tab,
        txId,
      });
    }

    const heldMsTotal = Date.now() - postAuthByTab[tab].postRevealGuardEpochAt;
    const maxHoldExceeded = maxHoldMs > 0 && heldMsTotal >= maxHoldMs;

    if (loading && !maxHoldExceeded) {
      postAuthByTab[tab].postRevealHoldFrames = 0;
      postAuthByTab[tab].postRevealHoldStartedAt = Date.now();
      if (tab === "/boost") {
        armBoostSequenceHandoffSuppress(400, { txId });
        traceTabShellNoLoading("TAB_HANDOFF_BOOST_PROD_REBOUND_BLOCKED", {
          tab,
          gateState,
          txId,
        });
        traceTabShellNoLoading("TAB_HANDOFF_BOOST_SEQUENCE_REBOUND_BLOCKED", {
          tab,
          gateState,
          txId,
        });
        traceTabShellNoLoading("TAB_HANDOFF_BOOST_AUTH_POST_REVEAL_LOADING_REBOUND_BLOCKED", {
          tab,
          txId,
        });
        traceTabShellNoLoading("TAB_HANDOFF_BOOST_SEQUENCE_SETTLE_CSS_HELD", {
          phase: "rebound-extend",
          txId,
        });
      } else if (tab === "/chats") {
        armChatsHandoffSuppressAndSettle(400, txId);
        traceTabShellNoLoading("TAB_HANDOFF_CHATS_INBOX_LOADING_DETECTED", {
          tab,
          txId,
          chatsLayoutLoading,
          visualLoading,
        });
        traceTabShellNoLoading("TAB_HANDOFF_CHATS_INBOX_LOADING_BLOCKED_RELEASE", {
          tab,
          txId,
        });
        traceTabShellNoLoading("TAB_HANDOFF_CANONICAL_IDLE_BLOCKED_CHATS_LOADING", {
          tab,
          txId,
        });
        if (chatsLayoutLoading && !visualLoading) {
          traceTabShellNoLoading("TAB_HANDOFF_CHATS_FRESH_SEQUENCE_LOADING_DETECTED", {
            tab,
            txId,
            layer: "layout-present-under-settle",
          });
          traceTabShellNoLoading("TAB_HANDOFF_CHATS_FRESH_SEQUENCE_BLOCKED_RELEASE", {
            tab,
            txId,
          });
          traceTabShellNoLoading("TAB_HANDOFF_CANONICAL_IDLE_BLOCKED_FRESH_CHATS_LOADING", {
            tab,
            txId,
          });
        }
        traceTabShellNoLoading("TAB_HANDOFF_CHATS_PROD_SEQUENCE_REBOUND_BLOCKED", {
          tab,
          txId,
        });
        traceTabShellNoLoading("TAB_HANDOFF_CHATS_POST_REVEAL_LOADING_REBOUND_BLOCKED", {
          tab,
          txId,
        });
        traceTabShellNoLoading("TAB_HANDOFF_CHATS_SETTLE_CSS_HELD", {
          phase: "rebound-extend",
          txId,
        });
      } else {
        traceTabShellNoLoading("TAB_HANDOFF_SHUFFLE_POST_REVEAL_LOADING_REBOUND_BLOCKED", {
          tab,
        });
      }
      requestAnimationFrame(tick);
      return;
    }

    if (tab === "/boost") {
      traceTabShellNoLoading("TAB_HANDOFF_BOOST_GATE_VISUAL_STABLE", { gateState });
      traceTabShellNoLoading("TAB_HANDOFF_BOOST_MAIN_LOADING_TEXT_STABLE_ABSENT", {});
      traceTabShellNoLoading("TAB_HANDOFF_BOOST_SEQUENCE_MAIN_LOADING_TEXT_STABLE_ABSENT", {});
      traceTabShellNoLoading("TAB_HANDOFF_BOOST_SEQUENCE_GATE_LATCH_STABLE", {
        gateState,
        frames: postAuthByTab[tab].postRevealHoldFrames,
      });
    } else if (tab === "/chats" && !loading) {
      traceTabShellNoLoading("TAB_HANDOFF_CHATS_INBOX_LOADING_ABSENT_STABLE", {
        frames: postAuthByTab[tab].postRevealHoldFrames,
        txId,
      });
      traceTabShellNoLoading("TAB_HANDOFF_CHATS_MAIN_LOADING_TEXT_STABLE_ABSENT", {});
      traceTabShellNoLoading("TAB_HANDOFF_CHATS_INBOX_READY_STABLE", {
        frames: postAuthByTab[tab].postRevealHoldFrames,
      });
      traceTabShellNoLoading("TAB_HANDOFF_CHATS_LOGGED_IN_READY_AFTER_REBIND", {
        frames: postAuthByTab[tab].postRevealHoldFrames,
        txId,
      });
    } else if (tab === "/shuffle" && !loading) {
      traceTabShellNoLoading("TAB_HANDOFF_ORPHAN_LOADING_ABSENT_STABLE", {
        frames: postAuthByTab[tab].postRevealHoldFrames,
        txId,
      });
      traceTabShellNoLoading("TAB_HANDOFF_SHUFFLE_LOGGED_IN_READY_AFTER_ORPHAN_CLEAR", {
        frames: postAuthByTab[tab].postRevealHoldFrames,
        txId,
      });
    }

    postAuthByTab[tab].postRevealHoldFrames += 1;
    const heldMs = Date.now() - postAuthByTab[tab].postRevealHoldStartedAt;
    const framesOk = postAuthByTab[tab].postRevealHoldFrames >= requiredFrames;
    const msOk = heldMs >= requiredMs;
    if ((!framesOk || !msOk) && !maxHoldExceeded) {
      requestAnimationFrame(tick);
      return;
    }

    if (tab === "/boost") {
      // Keep eligibility latch through sequence remount after settle CSS clears.
      armBoostSequenceHandoffSuppress(360, { txId });
      markHandoffGuardReady(tab as HandoffGuardDestination, txId);
      traceTabShellNoLoading("TAB_HANDOFF_BOOST_PROD_REBOUND_GUARD_READY", {
        frames: postAuthByTab[tab].postRevealHoldFrames,
        heldMs: heldMsTotal,
        boostMaxExceeded: maxHoldExceeded,
        txId,
      });
      traceTabShellNoLoading("TAB_HANDOFF_BOOST_SEQUENCE_REBOUND_GUARD_READY", {
        frames: postAuthByTab[tab].postRevealHoldFrames,
        heldMs: heldMsTotal,
        maxHoldExceeded,
        txId,
      });
      traceTabShellNoLoading("TAB_HANDOFF_BOOST_SETTLE_CSS_RELEASED_AFTER_GUARD", {
        frames: postAuthByTab[tab].postRevealHoldFrames,
        heldMs: heldMsTotal,
        txId,
      });
      traceTabShellNoLoading("TAB_HANDOFF_BOOST_SEQUENCE_SETTLE_CSS_RELEASED_AFTER_GUARD", {
        frames: postAuthByTab[tab].postRevealHoldFrames,
        heldMs: heldMsTotal,
        txId,
      });
      traceTabShellNoLoading("TAB_HANDOFF_SHUFFLE_BOOST_PROD_TARGETED_READY", {
        frames: postAuthByTab[tab].postRevealHoldFrames,
        heldMs: heldMsTotal,
        txId,
      });
      traceTabShellNoLoading("TAB_HANDOFF_SHUFFLE_BOOST_SEQUENCE_READY", {
        frames: postAuthByTab[tab].postRevealHoldFrames,
        heldMs: heldMsTotal,
        txId,
      });
      clearShuffleExitToMainTab({ destination: "/boost", txId });
    } else if (tab === "/chats") {
      // Keep inbox skeleton suppressed through post-settle remount (fresh-anon +
      // logged-in). Direct cold /chats never arms this window.
      const postClearHold = maxHoldExceeded
        ? chatsLayoutLoading
          ? 560
          : 480
        : chatsLayoutLoading
          ? 520
          : 400;
      armChatsHandoffSuppressAndSettle(postClearHold, txId);
      markHandoffGuardReady(tab as HandoffGuardDestination, txId);
      traceTabShellNoLoading("TAB_HANDOFF_CHATS_PROD_SEQUENCE_REBOUND_GUARD_READY", {
        frames: postAuthByTab[tab].postRevealHoldFrames,
        heldMs: heldMsTotal,
        maxHoldExceeded,
        txId,
      });
      traceTabShellNoLoading("TAB_HANDOFF_CHATS_TOKEN_RELEASE_AFTER_INBOX_READY", {
        frames: postAuthByTab[tab].postRevealHoldFrames,
        heldMs: heldMsTotal,
        maxHoldExceeded,
        txId,
      });
      traceTabShellNoLoading("TAB_HANDOFF_CHATS_SETTLE_CSS_RELEASED_AFTER_GUARD", {
        frames: postAuthByTab[tab].postRevealHoldFrames,
        heldMs: heldMsTotal,
        txId,
        note: "postAuth cleared; settle dataset retained while suppress live",
      });
      traceTabShellNoLoading("TAB_HANDOFF_CHATS_SUPPRESS_HELD_AFTER_EXIT_CLEAR", {
        frames: postAuthByTab[tab].postRevealHoldFrames,
        heldMs: heldMsTotal,
        postClearHold,
        txId,
      });
      traceTabShellNoLoading("TAB_HANDOFF_SHUFFLE_CHATS_PROD_SEQUENCE_READY", {
        frames: postAuthByTab[tab].postRevealHoldFrames,
        heldMs: heldMsTotal,
        txId,
      });
      // Drop any leftover Shuffle exit latch once Chats guard completed cleanly.
      clearShuffleExitToMainTab({ destination: "/chats", txId });
      scheduleChatsPostClassClearGuard(txId ?? null);
    } else {
      markHandoffGuardReady(tab as HandoffGuardDestination, txId);
      clearShuffleExitToMainTab({ destination: "/shuffle", txId, force: true });
    }

    clearTabPostAuthStabilityTracking(tab, {
      via: maxHoldExceeded ? "post-reveal-max-hold" : "post-reveal-hold",
      ...(typeof detail === "object" && detail ? detail : { detail }),
    });
  };
  requestAnimationFrame(tick);
}

/** Start Boost-only post-commit stability window for internal tab handoffs. */
export function beginBoostPostCommitStabilityTracking(detail?: unknown) {
  beginTabPostAuthStabilityTracking("/boost", detail);
}

export function clearBoostPostCommitStabilityTracking(detail?: unknown) {
  clearTabPostAuthStabilityTracking("/boost", detail);
}

export function isBoostPostCommitStabilityTrackingActive() {
  return postAuthByTab["/boost"].active;
}

export function isTabPostAuthStabilityTrackingActive(tab: PostAuthTab) {
  return postAuthByTab[tab].active;
}

function detectOrphanMainLoadingText() {
  if (typeof document === "undefined") return false;
  // Body-level loading outside destination host (auth chrome / orphan keepalives).
  const roots = [
    document.body,
  ];
  for (const root of roots) {
    for (const el of root.querySelectorAll("[data-nav-loading-copy]")) {
      if (!isElementVisuallyPresent(el)) continue;
      // Ignore copies still inside a CSS-hidden handoff destination host.
      const host = el.closest("[id^='sayittome-main-tab-keepalive-'], #sayittome-shuffle-keepalive-host");
      if (host) {
        const cs = getComputedStyle(host);
        if (
          cs.visibility === "hidden" ||
          cs.display === "none" ||
          parseFloat(cs.opacity || "1") < 0.04
        ) {
          continue;
        }
      }
      return true;
    }
  }
  return false;
}

function readBoostAccessGateState(
  host: HTMLElement | null,
): "loading" | "guest" | "incomplete_profile" | "ready" | "unknown" {
  if (!host) return "unknown";
  const el = host.querySelector("[data-boost-access-state]");
  const state = el?.getAttribute("data-boost-access-state");
  if (
    state === "loading" ||
    state === "guest" ||
    state === "incomplete_profile" ||
    state === "ready"
  ) {
    return state;
  }
  // Full boost UI (canUseBoost) has no gate node — treat as ready gate.
  if (host.querySelector("[data-boost-card], [data-nav-primary-content]")) {
    return "ready";
  }
  return "unknown";
}

function evaluatePostAuthStability(
  tab: PostAuthTab,
  base: Omit<TabDestinationVisualReadiness, "stableFramesReady">,
  host: HTMLElement | null,
): { stable: boolean; reason: string } {
  const t = postAuthByTab[tab];
  if (!t.active) {
    return { stable: true, reason: `${tab}-handoff-inactive` };
  }

  t.frames += 1;
  const gateState = tab === "/boost" ? readBoostAccessGateState(host) : "ready";
  const gateLoading = gateState === "loading";
  const orphanLoading =
    tab === "/shuffle" || tab === "/chats"
      ? detectOrphanMainLoadingText()
      : false;
  const loading =
    base.hasVisibleLoadingText ||
    base.hasLoadingShell ||
    gateLoading ||
    orphanLoading;

  if (loading) {
    if (t.sawReady) {
      t.loadingReboundSeen = true;
      if (tab === "/boost") {
        traceTabShellNoLoading("TAB_HANDOFF_BOOST_POST_COMMIT_LOADING_REBOUND_BLOCKED", {
          frames: t.frames,
          gateState,
          reason: base.reason,
        });
      } else if (tab === "/chats") {
        traceTabShellNoLoading("TAB_HANDOFF_CHATS_INBOX_LOADING_BLOCKED", {
          frames: t.frames,
          reason: base.reason,
        });
        traceTabShellNoLoading("TAB_HANDOFF_CHATS_POST_REVEAL_LOADING_REBOUND_BLOCKED", {
          frames: t.frames,
          phase: "pre-commit",
        });
      } else {
        traceTabShellNoLoading("TAB_HANDOFF_SHUFFLE_AUTH_LOADING_BLOCKED", {
          frames: t.frames,
          reason: base.reason,
          orphanLoading,
        });
        traceTabShellNoLoading("TAB_HANDOFF_SHUFFLE_POST_REVEAL_LOADING_REBOUND_BLOCKED", {
          frames: t.frames,
          phase: "pre-commit",
        });
        if (orphanLoading) {
          traceTabShellNoLoading("TAB_HANDOFF_ORPHAN_LOADING_DETECTED", {
            frames: t.frames,
            phase: "pre-reveal",
          });
          traceTabShellNoLoading("TAB_HANDOFF_CANONICAL_IDLE_BLOCKED_ORPHAN_LOADING", {
            frames: t.frames,
            phase: "pre-reveal",
          });
        }
      }
    }
    if (gateLoading) {
      traceTabShellNoLoading("TAB_HANDOFF_BOOST_GATE_LOADING_TEXT_BLOCKED", {
        frames: t.frames,
      });
      traceTabShellNoLoading("TAB_HANDOFF_BOOST_AUTH_GATE_LOADING_BLOCKED", {
        frames: t.frames,
      });
    }
    t.stableStreak = 0;
    return {
      stable: false,
      reason: gateLoading
        ? "boost-gate-loading"
        : orphanLoading
          ? "orphan-loading"
          : `${tab.slice(1)}-loading`,
    };
  }

  if (!base.ready) {
    t.stableStreak = 0;
    return { stable: false, reason: base.reason || `${tab.slice(1)}-not-ready` };
  }

  const minFrames =
    tab === "/boost"
      ? BOOST_POST_AUTH_MIN_FRAMES_AFTER_HANDOFF
      : tab === "/chats"
        ? CHATS_POST_AUTH_MIN_FRAMES_AFTER_HANDOFF
        : POST_AUTH_MIN_FRAMES_AFTER_HANDOFF;
  if (t.frames < minFrames) {
    return { stable: false, reason: `${tab.slice(1)}-min-frames` };
  }

  t.sawReady = true;
  t.stableStreak += 1;

  const baseRequired =
    tab === "/boost"
      ? BOOST_POST_AUTH_STABLE_FRAMES
      : tab === "/chats"
        ? CHATS_POST_AUTH_STABLE_FRAMES
        : POST_AUTH_STABLE_FRAMES;
  const required = t.loadingReboundSeen ? baseRequired + 2 : baseRequired;

  if (t.stableStreak < required) {
    return { stable: false, reason: `${tab.slice(1)}-post-auth-stable-frames` };
  }

  if (t.loadingReboundSeen) {
    t.loadingReboundSeen = false;
  }

  if (tab === "/boost") {
    traceTabShellNoLoading("TAB_HANDOFF_BOOST_POST_COMMIT_STABILITY_READY", {
      frames: t.frames,
      stableStreak: t.stableStreak,
      gateState,
    });
    traceTabShellNoLoading("TAB_HANDOFF_BOOST_AUTH_GATE_READY", { gateState });
    traceTabShellNoLoading("TAB_HANDOFF_BOOST_AUTH_POST_COMMIT_STABILITY_READY", {
      frames: t.frames,
    });
  } else if (tab === "/chats") {
    traceTabShellNoLoading("TAB_HANDOFF_CHATS_INBOX_READY", {
      frames: t.frames,
      stableStreak: t.stableStreak,
    });
    traceTabShellNoLoading("TAB_HANDOFF_CHATS_POST_COMMIT_STABILITY_READY", {
      frames: t.frames,
    });
    traceTabShellNoLoading("TAB_HANDOFF_CHATS_AUTH_READY", { frames: t.frames });
  } else {
    traceTabShellNoLoading("TAB_HANDOFF_SHUFFLE_POST_COMMIT_STABILITY_READY", {
      frames: t.frames,
      stableStreak: t.stableStreak,
    });
    traceTabShellNoLoading("TAB_HANDOFF_SHUFFLE_AUTH_READY", { frames: t.frames });
  }
  return { stable: true, reason: `${tab.slice(1)}-post-auth-stable` };
}

function evaluateBoostPostCommitStability(
  base: Omit<TabDestinationVisualReadiness, "stableFramesReady">,
  host: HTMLElement | null,
): { stable: boolean; reason: string } {
  return evaluatePostAuthStability("/boost", base, host);
}

/** Whether the bidirectional no-loading presentation contract is active. */
export function isTabShellNoLoadingTransitionContractActive() {
  return isMainTabToShuffleMicroSlideEnabled();
}

export function getTabDestinationVisualReadiness(
  tabId: MainTabHref | string,
): TabDestinationVisualReadiness {
  const tab = normalizeTab(tabId);
  if (!tab) {
    return {
      tabId: "/chats",
      ready: false,
      hasLoadingShell: false,
      hasVisibleLoadingText: false,
      hasContentRoot: false,
      contentCount: 0,
      geometryValid: false,
      stableFramesReady: false,
      warmState: "unknown",
      reason: "unknown-tab",
    };
  }

  if (tab === "/shuffle") {
    const shuffle = getShuffleDestinationVisualReadiness();
    const base: Omit<TabDestinationVisualReadiness, "stableFramesReady"> = {
      tabId: "/shuffle",
      ready: shuffle.ready,
      hasLoadingShell: shuffle.hasLoadingShell,
      hasVisibleLoadingText: shuffle.loadingTextVisibleInDestination,
      hasContentRoot: shuffle.hasShuffleList,
      contentCount: shuffle.slotCount,
      geometryValid: shuffle.geometryValid,
      warmState: shuffle.poolWarmState,
      reason: shuffle.reason,
    };
    let stableFramesReady = updateStableFrames("/shuffle", base);
    let ready = base.ready && stableFramesReady;
    let reason = !base.ready
      ? base.reason
      : stableFramesReady
        ? "ready"
        : "stable-frames";

    if (
      isMainTabToShuffleMicroSlideEnabled() &&
      postAuthByTab["/shuffle"].active
    ) {
      const host =
        typeof document !== "undefined"
          ? document.getElementById("sayittome-shuffle-keepalive-host")
          : null;
      const post = evaluatePostAuthStability("/shuffle", base, host);
      if (!post.stable) {
        stableFramesReady = false;
        ready = false;
        reason = post.reason;
        traceTabShellNoLoading("TAB_HANDOFF_SHUFFLE_POST_COMMIT_STABILITY_WAIT", {
          reason: post.reason,
          frames: postAuthByTab["/shuffle"].frames,
        });
      } else if (base.ready && stableFramesReady) {
        ready = true;
        reason = "ready";
      }
    }

    return { ...base, stableFramesReady, ready, reason };
  }

  const base = evaluateNonShuffleReadiness(tab);
  let stableFramesReady = updateStableFrames(tab, base);
  let ready = base.ready && stableFramesReady;
  let reason = !base.ready
    ? base.reason
    : stableFramesReady
      ? "ready"
      : "stable-frames";

  if (
    isMainTabToShuffleMicroSlideEnabled() &&
    isPostAuthTab(tab) &&
    postAuthByTab[tab].active
  ) {
    const host =
      typeof document !== "undefined"
        ? (document.getElementById(
            `sayittome-main-tab-keepalive-${tab.slice(1)}`,
          ) as HTMLElement | null)
        : null;
    const post = evaluatePostAuthStability(tab, base, host);
    if (!post.stable) {
      stableFramesReady = false;
      ready = false;
      reason = post.reason;
      if (tab === "/boost") {
        traceTabShellNoLoading("TAB_HANDOFF_BOOST_REVEAL_DELAYED_UNTIL_STABLE", {
          reason: post.reason,
          frames: postAuthByTab["/boost"].frames,
        });
      } else if (tab === "/chats") {
        traceTabShellNoLoading("TAB_HANDOFF_CHATS_POST_COMMIT_STABILITY_READY", {
          phase: "wait",
          reason: post.reason,
          frames: postAuthByTab["/chats"].frames,
        });
      }
    } else if (base.ready && stableFramesReady) {
      ready = true;
      reason = "ready";
    }
  }

  return {
    ...base,
    stableFramesReady,
    ready,
    reason,
  };
}

export function isTabDestinationVisualReady(tabId: MainTabHref | string) {
  return getTabDestinationVisualReadiness(tabId).ready;
}

export type TabShellNoLoadingDiagEvent =
  | "TAB_SHELL_NO_LOADING_DESTINATION_READY_TIMEOUT"
  | "TAB_SHELL_NO_LOADING_SOURCE_FROZEN"
  | "TAB_SHELL_NO_LOADING_DESTINATION_REVEAL_BLOCKED"
  | "TAB_SHELL_NO_LOADING_DIRECT_COLD_ALLOWED"
  | "TAB_SHELL_NO_LOADING_READY"
  | "TAB_SHELL_NO_LOADING_CANCELLED"
  | "TAB_HANDOFF_ROUTE_COMMIT_REQUESTED"
  | "TAB_HANDOFF_ROUTE_COMMIT_APPLIED"
  | "TAB_HANDOFF_ROUTE_COMMIT_CONFIRMED"
  | "TAB_HANDOFF_ROUTE_MISMATCH_BLOCKED"
  | "TAB_HANDOFF_ROUTE_STATE_ALIGNED"
  | "TAB_HANDOFF_ROUTE_STATE_DESYNC"
  | "TAB_HANDOFF_DESTINATION_LOADING_BLOCKED"
  | "TAB_HANDOFF_SOURCE_FREEZE_RETAINED"
  | "TAB_HANDOFF_DESTINATION_READY_FALSE_LOADING_TEXT"
  | "TAB_HANDOFF_EXIT_WATCHDOG_BLOCKED_LOADING_RELEASE"
  | "TAB_HANDOFF_DESTINATION_EMPTY_STATE_READY"
  | "TAB_HANDOFF_CHATS_READY"
  | "TAB_HANDOFF_CHATS_AUTH_READY"
  | "TAB_HANDOFF_CHATS_INBOX_READY"
  | "TAB_HANDOFF_CHATS_INBOX_LOADING_BLOCKED"
  | "TAB_HANDOFF_CHATS_INBOX_LOADING_DETECTED"
  | "TAB_HANDOFF_CHATS_INBOX_LOADING_BLOCKED_RELEASE"
  | "TAB_HANDOFF_CHATS_INBOX_LOADING_ABSENT_STABLE"
  | "TAB_HANDOFF_CHATS_LOGGED_IN_READY_AFTER_REBIND"
  | "TAB_HANDOFF_CANONICAL_IDLE_BLOCKED_CHATS_LOADING"
  | "TAB_HANDOFF_CHATS_FRESH_SEQUENCE_LOADING_DETECTED"
  | "TAB_HANDOFF_CHATS_FRESH_SEQUENCE_BLOCKED_RELEASE"
  | "TAB_HANDOFF_CHATS_POST_CLASS_CLEAR_GUARD_HELD"
  | "TAB_HANDOFF_CHATS_SUPPRESS_HELD_AFTER_EXIT_CLEAR"
  | "TAB_HANDOFF_CHATS_LOADING_ABSENT_STABLE_AFTER_CLASS_CLEAR"
  | "TAB_HANDOFF_CANONICAL_IDLE_BLOCKED_FRESH_CHATS_LOADING"
  | "TAB_HANDOFF_SHUFFLE_CHATS_ARMED_WITH_CANONICAL_FLAG"
  | "TAB_HANDOFF_CHATS_LOADING_BLOCKED_WITH_FLAG_TRUE"
  | "TAB_HANDOFF_FLAG_FALSE_ON_INTERNAL_HOP"
  | "TAB_HANDOFF_CHATS_SUPPRESS_REHYDRATED_AFTER_REMOUNT"
  | "TAB_HANDOFF_FLAG_DESYNC_DETECTED"
  | "TAB_HANDOFF_BUILD_SHA_MISMATCH"
  | "TAB_HANDOFF_STALE_FALSE_BUNDLE_DETECTED"
  | "TAB_HANDOFF_CANONICAL_FLAG_VERIFIED_PRE_INPUT"
  | "TAB_HANDOFF_PROBE_FLAG_FIELD_AUDITED"
  | "TAB_HANDOFF_CHATS_DIRECT_COLD_LOADING_ALLOWED"
  | "TAB_HANDOFF_CHATS_TOKEN_RELEASE_AFTER_INBOX_READY"
  | "TAB_HANDOFF_CHATS_POST_COMMIT_STABILITY_READY"
  | "TAB_HANDOFF_CHATS_POST_REVEAL_LOADING_REBOUND_BLOCKED"
  | "TAB_HANDOFF_CHATS_PROD_SEQUENCE_REBOUND_GUARD_START"
  | "TAB_HANDOFF_CHATS_PROD_SEQUENCE_REBOUND_GUARD_READY"
  | "TAB_HANDOFF_CHATS_PROD_SEQUENCE_REBOUND_BLOCKED"
  | "TAB_HANDOFF_CHATS_SETTLE_CSS_HELD"
  | "TAB_HANDOFF_CHATS_SETTLE_CSS_RELEASED_AFTER_GUARD"
  | "TAB_HANDOFF_CHATS_MAIN_LOADING_TEXT_STABLE_ABSENT"
  | "TAB_HANDOFF_CHATS_INBOX_READY_STABLE"
  | "TAB_HANDOFF_SHUFFLE_CHATS_PROD_SEQUENCE_READY"
  | "TAB_HANDOFF_SHUFFLE_AUTH_READY"
  | "TAB_HANDOFF_SHUFFLE_AUTH_LOADING_BLOCKED"
  | "TAB_HANDOFF_SHUFFLE_POST_COMMIT_STABILITY_WAIT"
  | "TAB_HANDOFF_SHUFFLE_POST_COMMIT_STABILITY_READY"
  | "TAB_HANDOFF_SHUFFLE_POST_REVEAL_LOADING_REBOUND_BLOCKED"
  | "TAB_HANDOFF_BOOST_READY"
  | "TAB_HANDOFF_BOOST_LOADING_BLOCKED"
  | "TAB_HANDOFF_BOOST_GATE_READY"
  | "TAB_HANDOFF_BOOST_GATE_LOADING_HIDDEN_DURING_HANDOFF"
  | "TAB_HANDOFF_BOOST_POST_COMMIT_STABILITY_WAIT"
  | "TAB_HANDOFF_BOOST_POST_COMMIT_STABILITY_READY"
  | "TAB_HANDOFF_BOOST_POST_COMMIT_LOADING_REBOUND_BLOCKED"
  | "TAB_HANDOFF_BOOST_GATE_LOADING_TEXT_BLOCKED"
  | "TAB_HANDOFF_BOOST_REVEAL_DELAYED_UNTIL_STABLE"
  | "TAB_HANDOFF_RELEASE_BLOCKED_BY_BOOST_LOADING"
  | "TAB_HANDOFF_SEQUENCE_BOOST_REENTRY_STABLE"
  | "TAB_HANDOFF_DIRECT_COLD_BOOST_LOADING_ALLOWED"
  | "TAB_HANDOFF_BOOST_AUTH_GATE_READY"
  | "TAB_HANDOFF_BOOST_AUTH_GATE_LOADING_BLOCKED"
  | "TAB_HANDOFF_BOOST_AUTH_POST_COMMIT_STABILITY_READY"
  | "TAB_HANDOFF_BOOST_AUTH_POST_REVEAL_LOADING_REBOUND_BLOCKED"
  | "TAB_HANDOFF_BOOST_PROD_REBOUND_GUARD_START"
  | "TAB_HANDOFF_BOOST_PROD_REBOUND_GUARD_READY"
  | "TAB_HANDOFF_BOOST_PROD_REBOUND_BLOCKED"
  | "TAB_HANDOFF_BOOST_SETTLE_CSS_HELD"
  | "TAB_HANDOFF_BOOST_SETTLE_CSS_RELEASED_AFTER_GUARD"
  | "TAB_HANDOFF_BOOST_GATE_VISUAL_STABLE"
  | "TAB_HANDOFF_BOOST_MAIN_LOADING_TEXT_STABLE_ABSENT"
  | "TAB_HANDOFF_SHUFFLE_BOOST_PROD_TARGETED_READY"
  | "TAB_HANDOFF_BOOST_SEQUENCE_REBOUND_GUARD_START"
  | "TAB_HANDOFF_BOOST_SEQUENCE_REBOUND_GUARD_READY"
  | "TAB_HANDOFF_BOOST_SEQUENCE_REBOUND_BLOCKED"
  | "TAB_HANDOFF_BOOST_SEQUENCE_SETTLE_CSS_HELD"
  | "TAB_HANDOFF_BOOST_SEQUENCE_SETTLE_CSS_RELEASED_AFTER_GUARD"
  | "TAB_HANDOFF_BOOST_SEQUENCE_GATE_LATCH_STABLE"
  | "TAB_HANDOFF_BOOST_SEQUENCE_MAIN_LOADING_TEXT_STABLE_ABSENT"
  | "TAB_HANDOFF_SHUFFLE_BOOST_SEQUENCE_READY"
  | "TAB_HANDOFF_BOOST_GUARD_NOT_CLEARED_BY_PREVIOUS_HOP"
  | "TAB_HANDOFF_EXIT_WATCHDOG_FORCE_PRESENT_NO_LOADING"
  | "TAB_HANDOFF_GUARD_TOKEN_CREATED"
  | "TAB_HANDOFF_GUARD_TOKEN_ROUTE_COMMITTED"
  | "TAB_HANDOFF_GUARD_TOKEN_REVEAL_STARTED"
  | "TAB_HANDOFF_GUARD_TOKEN_READY"
  | "TAB_HANDOFF_GUARD_TOKEN_RELEASE_ALLOWED"
  | "TAB_HANDOFF_GUARD_TOKEN_CLEANED"
  | "TAB_HANDOFF_GUARD_TOKEN_CLEANUP_BLOCKED_STALE"
  | "TAB_HANDOFF_GUARD_TOKEN_CLEANUP_BLOCKED_OTHER_DESTINATION"
  | "TAB_HANDOFF_SETTLE_CSS_REF_HELD"
  | "TAB_HANDOFF_SETTLE_CSS_REF_RELEASED"
  | "TAB_HANDOFF_CANONICAL_IDLE_AFTER_GUARD"
  | "TAB_HANDOFF_PREVIOUS_HOP_CLEANUP_IGNORED_FOR_ACTIVE_TOKEN"
  | "TAB_HANDOFF_CHATS_GUARD_NOT_CLEARED_BY_PREVIOUS_HOP"
  | "TAB_HANDOFF_ORPHAN_LOADING_DETECTED"
  | "TAB_HANDOFF_ORPHAN_LOADING_BLOCKED_RELEASE"
  | "TAB_HANDOFF_ORPHAN_LOADING_ABSENT_STABLE"
  | "TAB_HANDOFF_SHUFFLE_LOGGED_IN_READY_AFTER_ORPHAN_CLEAR"
  | "TAB_HANDOFF_CANONICAL_IDLE_BLOCKED_ORPHAN_LOADING"
  | "TAB_HANDOFF_ORPHAN_LOADING_DIRECT_COLD_ALLOWED"
  | "TAB_HANDOFF_ORPHAN_LOADING_LAYER_CLASSIFIED";

const diagRing: Array<{ at: number; event: TabShellNoLoadingDiagEvent; detail?: unknown }> =
  [];

export function traceTabShellNoLoading(
  event: TabShellNoLoadingDiagEvent,
  detail?: unknown,
) {
  const entry = { at: Date.now(), event, detail };
  diagRing.push(entry);
  if (diagRing.length > 80) diagRing.shift();
  if (typeof window !== "undefined") {
    const w = window as unknown as {
      __sayittomeTabShellNoLoadingDiag?: { events: typeof diagRing };
    };
    w.__sayittomeTabShellNoLoadingDiag = { events: [...diagRing] };
  }
}

registerHandoffGuardTrace((event, detail) => {
  traceTabShellNoLoading(event as TabShellNoLoadingDiagEvent, detail);
});

export function exportTabShellNoLoadingDiag() {
  return { events: [...diagRing] };
}

if (typeof window !== "undefined") {
  const w = window as unknown as Record<string, unknown>;
  w.__sayittomeGetTabDestinationVisualReadiness = getTabDestinationVisualReadiness;
  w.__sayittomeTabShellNoLoadingDiagExport = exportTabShellNoLoadingDiag;
}
