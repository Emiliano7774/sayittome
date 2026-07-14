import { MAIN_TAB_HREFS, type MainTabHref } from "@/lib/navigation/mainTabs";
import {
  beginBoostPostCommitStabilityTracking,
  clearBoostPostCommitStabilityTracking,
  getTabDestinationVisualReadiness,
  isBoostPostCommitStabilityTrackingActive,
  isTabDestinationVisualReady,
  isTabShellNoLoadingTransitionContractActive,
  resetTabDestinationReadinessStability,
  traceTabShellNoLoading,
} from "@/lib/navigation/tabDestinationReadiness";
import { isShuffleExitToMainTabPending } from "@/lib/navigation/shuffleHandoffState";

function normalizePath(pathname: string) {
  const path = String(pathname || "/").split("?")[0].split("#")[0];
  if (path.length > 1 && path.endsWith("/")) return path.slice(0, -1);
  return path || "/";
}

function isMainTabHref(path: string): path is MainTabHref {
  return (MAIN_TAB_HREFS as readonly string[]).includes(path);
}

let presentedTab: MainTabHref | null = null;
let handoffTarget: MainTabHref | null = null;
let handoffVersion = 0;
const listeners = new Set<() => void>();

function notify() {
  handoffVersion += 1;
  listeners.forEach((listener) => listener());
}

export function subscribeAtomicMainTabHandoff(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function getAtomicMainTabHandoffVersion() {
  return handoffVersion;
}

export function isAtomicMainTabHandoffActive() {
  return handoffTarget !== null;
}

export function getPresentedMainTab(pathname: string) {
  if (presentedTab) return presentedTab;
  const path = normalizePath(pathname);
  return isMainTabHref(path) ? path : path;
}

export function getMainTabHandoffTarget() {
  return handoffTarget;
}

export function seedPresentedMainTab(href: MainTabHref) {
  if (!presentedTab) {
    presentedTab = href;
    notify();
  }
}

/** Route changed — retain current presentation until destination primary is ready. */
export function onMainTabRouteChange(pathname: string) {
  const path = normalizePath(pathname);
  if (!isMainTabHref(path)) return;

  const next = path as MainTabHref;
  if (!presentedTab) {
    presentedTab = next;
    handoffTarget = null;
    notify();
    return;
  }

  if (presentedTab === next) {
    // Returning to the already-presented tab during a shuffle exit (or before
    // destination is visually ready) must keep the freeze; otherwise loading
    // chrome can flash once exit/main handoff classes clear.
    if (
      isTabShellNoLoadingTransitionContractActive() &&
      (isShuffleExitToMainTabPending() || !isTabDestinationVisualReady(next))
    ) {
      handoffTarget = next;
      resetTabDestinationReadinessStability(next);
      if (next === "/boost") {
        beginBoostPostCommitStabilityTracking({
          source: presentedTab,
          destination: next,
          via: "same-tab-retain",
        });
      }
      markMainTabHandoffPendingDom(true);
      traceTabShellNoLoading("TAB_HANDOFF_SOURCE_FREEZE_RETAINED", {
        source: presentedTab,
        destination: next,
        reason: isShuffleExitToMainTabPending()
          ? "shuffle-exit-pending"
          : "destination-not-ready",
      });
      notify();
      return;
    }
    handoffTarget = null;
    markMainTabHandoffPendingDom(false);
    traceTabShellNoLoading("TAB_HANDOFF_ROUTE_STATE_ALIGNED", {
      tab: next,
      note: "same-tab-already-presented",
    });
    return;
  }

  handoffTarget = next;
  resetTabDestinationReadinessStability(next);
  if (next === "/boost" && isTabShellNoLoadingTransitionContractActive()) {
    beginBoostPostCommitStabilityTracking({
      source: presentedTab,
      destination: next,
      via: "onMainTabRouteChange",
    });
  } else if (isBoostPostCommitStabilityTrackingActive()) {
    clearBoostPostCommitStabilityTracking({
      via: "onMainTabRouteChange-left-boost",
      destination: next,
    });
  }
  if (isTabShellNoLoadingTransitionContractActive()) {
    traceTabShellNoLoading("TAB_SHELL_NO_LOADING_SOURCE_FROZEN", {
      source: presentedTab,
      destination: next,
    });
    traceTabShellNoLoading("TAB_HANDOFF_ROUTE_COMMIT_REQUESTED", {
      source: presentedTab,
      destination: next,
    });
  }
  markMainTabHandoffPendingDom(true);
  notify();
}

function mainTabPrimarySelector(href: MainTabHref) {
  if (href === "/settings") return "[data-nav-settings-primary]";
  return "[data-nav-primary-content]";
}

function isPresentablePrimary(host: HTMLElement, primary: Element) {
  if (host.querySelector("[data-loading-shell]")) return false;

  const text = primary.textContent?.slice(0, 240) ?? "";
  if (/Cargando(?:\.\.\.)?|Loading(?:\.\.\.)?/i.test(text)) return false;

  const rect = primary.getBoundingClientRect();
  const style = getComputedStyle(primary);
  return (
    rect.width >= 24 &&
    rect.height >= 24 &&
    style.visibility !== "hidden" &&
    style.display !== "none" &&
    style.opacity !== "0"
  );
}

export function isMainTabPrimaryReady(href: MainTabHref) {
  if (typeof document === "undefined") return false;

  if (isTabShellNoLoadingTransitionContractActive()) {
    const visual = getTabDestinationVisualReadiness(href);
    return (
      visual.ready &&
      !visual.hasLoadingShell &&
      !visual.hasVisibleLoadingText &&
      visual.geometryValid &&
      visual.stableFramesReady
    );
  }

  const host = document.getElementById(`sayittome-main-tab-keepalive-${href.slice(1)}`);
  if (!host) return false;

  const primary = host.querySelector(mainTabPrimarySelector(href));
  if (!primary) return false;

  return isPresentablePrimary(host, primary);
}

/** Commit destination only when route and primary content are coherent. */
export function commitPresentedMainTabIfReady(pathname: string) {
  const path = normalizePath(pathname);
  if (!handoffTarget || handoffTarget !== path) return false;

  if (isTabShellNoLoadingTransitionContractActive()) {
    const visual = getTabDestinationVisualReadiness(handoffTarget);
    if (
      !visual.ready ||
      visual.hasLoadingShell ||
      visual.hasVisibleLoadingText ||
      !visual.geometryValid ||
      !visual.stableFramesReady
    ) {
      traceTabShellNoLoading("TAB_SHELL_NO_LOADING_DESTINATION_REVEAL_BLOCKED", {
        destination: handoffTarget,
        reason: visual.reason,
      });
      if (visual.hasVisibleLoadingText || visual.hasLoadingShell) {
        traceTabShellNoLoading("TAB_HANDOFF_DESTINATION_LOADING_BLOCKED", {
          destination: handoffTarget,
          reason: visual.reason,
        });
        if (visual.hasVisibleLoadingText) {
          traceTabShellNoLoading("TAB_HANDOFF_DESTINATION_READY_FALSE_LOADING_TEXT", {
            destination: handoffTarget,
          });
        }
        if (handoffTarget === "/boost") {
          traceTabShellNoLoading("TAB_HANDOFF_BOOST_LOADING_BLOCKED", {
            reason: visual.reason,
          });
          traceTabShellNoLoading("TAB_HANDOFF_RELEASE_BLOCKED_BY_BOOST_LOADING", {
            reason: visual.reason,
          });
        }
      }
      return false;
    }
  } else if (!isMainTabPrimaryReady(handoffTarget)) {
    return false;
  }

  const committedBoost = handoffTarget === "/boost";
  presentedTab = handoffTarget;
  handoffTarget = null;
  if (committedBoost) {
    clearBoostPostCommitStabilityTracking({ via: "commitPresentedMainTabIfReady" });
  }
  if (isTabShellNoLoadingTransitionContractActive()) {
    traceTabShellNoLoading("TAB_SHELL_NO_LOADING_READY", { destination: path });
    if (path === "/chats") {
      traceTabShellNoLoading("TAB_HANDOFF_CHATS_READY", { destination: path });
    }
    if (path === "/boost") {
      traceTabShellNoLoading("TAB_HANDOFF_BOOST_READY", { destination: path });
      traceTabShellNoLoading("TAB_HANDOFF_BOOST_GATE_READY", { destination: path });
    }
    traceTabShellNoLoading("TAB_HANDOFF_ROUTE_STATE_ALIGNED", {
      destination: path,
      presentedTab: path,
    });
  }
  markMainTabHandoffPendingDom(false);
  notify();
  return true;
}

export function resetPresentedMainTab(href?: MainTabHref) {
  presentedTab = href ?? null;
  handoffTarget = null;
  markMainTabHandoffPendingDom(false);
  notify();
}

function markMainTabHandoffPendingDom(active: boolean) {
  if (typeof document === "undefined") return;
  document.documentElement.classList.toggle("sayittome-main-tab-handoff-pending", active);
  if (active && presentedTab) {
    document.documentElement.dataset.sayittomeMainTabHandoffSource =
      presentedTab.slice(1);
  } else {
    delete document.documentElement.dataset.sayittomeMainTabHandoffSource;
  }
}

export function exportMainTabHandoffState(pathname: string) {
  return {
    pathname: normalizePath(pathname),
    presentedTab,
    handoffTarget,
    handoffPending: handoffTarget !== null,
  };
}
