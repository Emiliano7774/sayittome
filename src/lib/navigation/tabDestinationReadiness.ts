/**
 * TAB_SHELL_NO_LOADING_TRANSITION_CONTRACT — destination visual readiness registry.
 * Covers Shuffle + Chats/Stories/Boost/Settings for bidirectional tab transitions.
 */
import type { MainTabHref } from "@/lib/navigation/mainTabs";
import { getShuffleDestinationVisualReadiness } from "@/lib/navigation/shuffleDestinationReadiness";
import { isMainTabToShuffleMicroSlideEnabled } from "@/lib/perf/instantaneityFlags";

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
/** Boost sequential re-entry needs post-route-commit stability beyond pre-commit ready. */
const BOOST_POST_COMMIT_STABLE_FRAMES = 3;
const BOOST_MIN_FRAMES_AFTER_HANDOFF = 3;

const stableStreakByTab = new Map<MainTabHref, number>();
const lastReadySignatureByTab = new Map<MainTabHref, string>();

let boostHandoffActive = false;
let boostHandoffFrames = 0;
let boostPostCommitStableStreak = 0;
let boostSawReadyDuringHandoff = false;
let boostLoadingReboundSeen = false;

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
    if (tab === "/boost") {
      boostPostCommitStableStreak = 0;
      boostSawReadyDuringHandoff = false;
    }
    return;
  }
  stableStreakByTab.clear();
  lastReadySignatureByTab.clear();
  boostPostCommitStableStreak = 0;
  boostSawReadyDuringHandoff = false;
}

/** Start Boost-only post-commit stability window for internal tab handoffs. */
export function beginBoostPostCommitStabilityTracking(detail?: unknown) {
  boostHandoffActive = true;
  boostHandoffFrames = 0;
  boostPostCommitStableStreak = 0;
  boostSawReadyDuringHandoff = false;
  boostLoadingReboundSeen = false;
  resetTabDestinationReadinessStability("/boost");
  if (typeof document !== "undefined") {
    document.documentElement.dataset.boostPostCommitSettle = "1";
  }
  traceTabShellNoLoading("TAB_HANDOFF_BOOST_POST_COMMIT_STABILITY_WAIT", detail);
  traceTabShellNoLoading("TAB_HANDOFF_SEQUENCE_BOOST_REENTRY_STABLE", {
    phase: "begin",
    ...((detail && typeof detail === "object" ? detail : { detail }) as object),
  });
}

export function clearBoostPostCommitStabilityTracking(detail?: unknown) {
  boostHandoffActive = false;
  boostHandoffFrames = 0;
  boostPostCommitStableStreak = 0;
  boostSawReadyDuringHandoff = false;
  boostLoadingReboundSeen = false;
  if (typeof document !== "undefined") {
    delete document.documentElement.dataset.boostPostCommitSettle;
  }
  if (detail !== undefined) {
    traceTabShellNoLoading("TAB_HANDOFF_SEQUENCE_BOOST_REENTRY_STABLE", {
      phase: "clear",
      ...(typeof detail === "object" && detail ? detail : { detail }),
    });
  }
}

export function isBoostPostCommitStabilityTrackingActive() {
  return boostHandoffActive;
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

function evaluateBoostPostCommitStability(
  base: Omit<TabDestinationVisualReadiness, "stableFramesReady">,
  host: HTMLElement | null,
): { stable: boolean; reason: string } {
  if (!boostHandoffActive) {
    return { stable: true, reason: "boost-handoff-inactive" };
  }

  boostHandoffFrames += 1;
  const gateState = readBoostAccessGateState(host);
  const gateLoading = gateState === "loading";
  const loading =
    base.hasVisibleLoadingText || base.hasLoadingShell || gateLoading;

  if (loading) {
    if (boostSawReadyDuringHandoff) {
      boostLoadingReboundSeen = true;
      traceTabShellNoLoading("TAB_HANDOFF_BOOST_POST_COMMIT_LOADING_REBOUND_BLOCKED", {
        frames: boostHandoffFrames,
        gateState,
        reason: base.reason,
      });
    }
    if (gateLoading) {
      traceTabShellNoLoading("TAB_HANDOFF_BOOST_GATE_LOADING_TEXT_BLOCKED", {
        frames: boostHandoffFrames,
      });
    }
    boostPostCommitStableStreak = 0;
    return {
      stable: false,
      reason: gateLoading ? "boost-gate-loading" : "boost-loading",
    };
  }

  if (!base.ready) {
    boostPostCommitStableStreak = 0;
    return { stable: false, reason: base.reason || "boost-not-ready" };
  }

  if (boostHandoffFrames < BOOST_MIN_FRAMES_AFTER_HANDOFF) {
    return { stable: false, reason: "boost-min-frames" };
  }

  boostSawReadyDuringHandoff = true;
  boostPostCommitStableStreak += 1;

  const required = boostLoadingReboundSeen
    ? BOOST_POST_COMMIT_STABLE_FRAMES + 2
    : BOOST_POST_COMMIT_STABLE_FRAMES;

  if (boostPostCommitStableStreak < required) {
    return { stable: false, reason: "boost-post-commit-stable-frames" };
  }

  if (boostLoadingReboundSeen) {
    boostLoadingReboundSeen = false;
  }

  traceTabShellNoLoading("TAB_HANDOFF_BOOST_POST_COMMIT_STABILITY_READY", {
    frames: boostHandoffFrames,
    stableStreak: boostPostCommitStableStreak,
    gateState,
  });
  return { stable: true, reason: "boost-post-commit-stable" };
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
    const stableFramesReady = updateStableFrames("/shuffle", base);
    return { ...base, stableFramesReady, ready: base.ready && stableFramesReady };
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
    tab === "/boost" &&
    isMainTabToShuffleMicroSlideEnabled() &&
    boostHandoffActive
  ) {
    const host =
      typeof document !== "undefined"
        ? (document.getElementById("sayittome-main-tab-keepalive-boost") as HTMLElement | null)
        : null;
    const post = evaluateBoostPostCommitStability(base, host);
    if (!post.stable) {
      stableFramesReady = false;
      ready = false;
      reason = post.reason;
      traceTabShellNoLoading("TAB_HANDOFF_BOOST_REVEAL_DELAYED_UNTIL_STABLE", {
        reason: post.reason,
        frames: boostHandoffFrames,
      });
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
  | "TAB_HANDOFF_DIRECT_COLD_BOOST_LOADING_ALLOWED";

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

export function exportTabShellNoLoadingDiag() {
  return { events: [...diagRing] };
}

if (typeof window !== "undefined") {
  const w = window as unknown as Record<string, unknown>;
  w.__sayittomeGetTabDestinationVisualReadiness = getTabDestinationVisualReadiness;
  w.__sayittomeTabShellNoLoadingDiagExport = exportTabShellNoLoadingDiag;
}
