/**
 * Real-device QA diagnostics — opt-in only via ?qaDebug=1 or #qaDebug.
 * No network upload, no Firestore writes, no extra listeners.
 */

import { BUILD_SHA } from "@/lib/perf/buildMarker";
import { getChatAnonSenderId } from "@/lib/chat/anonSender";
import {
  isShuffleSurfacePresented,
  isShuffleRevealDeferred,
  getShuffleExitMainTabTarget,
  isShuffleExitToMainTabPending,
} from "@/lib/navigation/shuffleHandoffState";
import { isShuffleKeepAliveActive } from "@/lib/navigation/shuffleKeepAlive";

const FATAL_BUFFER_MAX = 40;
const fatalBuffer: Array<{ t: number; type: string; message: string }> = [];
let captureInstalled = false;

export function isRealDeviceQaDebugEnabled() {
  if (typeof window === "undefined") return false;
  try {
    const params = new URLSearchParams(window.location.search);
    if (params.get("qaDebug") === "1") return true;
    if (window.location.hash.toLowerCase().includes("qadebug")) return true;
    if (window.localStorage.getItem("sayittome_qa_debug") === "1") return true;
  } catch {
    /* ignore */
  }
  return false;
}

export function installRealDeviceQaDebugCapture() {
  if (typeof window === "undefined" || captureInstalled) return;
  captureInstalled = true;

  window.addEventListener("error", (event) => {
    fatalBuffer.push({
      t: Date.now(),
      type: "error",
      message: String(event.message || event.error || "error"),
    });
    if (fatalBuffer.length > FATAL_BUFFER_MAX) fatalBuffer.shift();
  });

  window.addEventListener("unhandledrejection", (event) => {
    fatalBuffer.push({
      t: Date.now(),
      type: "unhandledrejection",
      message: String(event.reason || "rejection"),
    });
    if (fatalBuffer.length > FATAL_BUFFER_MAX) fatalBuffer.shift();
  });
}

function cssSummary(el: Element | null) {
  if (!el || !(el instanceof HTMLElement)) return null;
  const style = window.getComputedStyle(el);
  return {
    display: style.display,
    opacity: style.opacity,
    visibility: style.visibility,
    transform: style.transform,
    zIndex: style.zIndex,
    pointerEvents: style.pointerEvents,
    inert: el.hasAttribute("inert"),
    hiddenAttr: el.hasAttribute("hidden"),
    className: el.className,
  };
}

function isPresentable(el: Element | null) {
  if (!el || !(el instanceof HTMLElement)) return false;
  if (el.hasAttribute("hidden") || el.hasAttribute("inert")) return false;
  const style = window.getComputedStyle(el);
  if (style.display === "none" || style.visibility === "hidden") return false;
  if (Number(style.opacity || "1") < 0.05) return false;
  const rect = el.getBoundingClientRect();
  return rect.width > 8 && rect.height > 8;
}

function countMeaningfulText(root: ParentNode | null) {
  if (!root) return 0;
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  let count = 0;
  let node = walker.nextNode();
  while (node) {
    const text = String(node.textContent || "").replace(/\s+/g, " ").trim();
    if (text.length >= 2) count += 1;
    node = walker.nextNode();
  }
  return count;
}

function blackScreenHeuristic() {
  const shuffleHost = document.getElementById("sayittome-shuffle-keepalive-host");
  const shell = document.querySelector(".sayittome-route-shell");
  const shuffleVisible = isPresentable(shuffleHost);
  const profileNodes = document.querySelectorAll(
    "[data-profile-root], [data-profile-page], .sayittome-profile-shell, main[data-profile]",
  );
  let profileVisible = 0;
  profileNodes.forEach((node) => {
    if (isPresentable(node)) profileVisible += 1;
  });
  const shellHidden =
    shell instanceof HTMLElement &&
    (shell.hasAttribute("hidden") ||
      window.getComputedStyle(shell).visibility === "hidden" ||
      Number(window.getComputedStyle(shell).opacity || "1") < 0.05);
  const meaningful = countMeaningfulText(
    shuffleVisible ? shuffleHost : document.body,
  );
  const path = window.location.pathname.split("?")[0].split("#")[0];
  const bothHidden = !shuffleVisible && (shellHidden || profileVisible === 0);
  return {
    blackScreen:
      bothHidden ||
      (path === "/shuffle" && !shuffleVisible) ||
      (path === "/shuffle" && meaningful === 0),
    shuffleVisible,
    profileVisible,
    shellHidden,
    meaningfulTextCount: meaningful,
  };
}

export type RealDeviceQaDiagnostics = Record<string, unknown>;

export function collectRealDeviceQaDiagnostics(
  chatExtras?: Record<string, unknown>,
): RealDeviceQaDiagnostics {
  if (typeof window === "undefined" || typeof document === "undefined") {
    return { error: "no-window" };
  }

  const html = document.documentElement;
  const path = window.location.pathname.split("?")[0].split("#")[0];
  const shuffleHost = document.getElementById("sayittome-shuffle-keepalive-host");
  const shell = document.querySelector(".sayittome-route-shell");
  const black = blackScreenHeuristic();
  const navSelected =
    document
      .querySelector("[data-nav-tab].text-\\[\\#7b5cff\\], [data-nav-tab] .text-\\[\\#7b5cff\\]")
      ?.closest("[data-nav-tab]")
      ?.getAttribute("data-nav-tab") ||
    document.querySelector('[data-nav-tab="shuffle"]')?.getAttribute("data-nav-tab") ||
    null;

  const swVersion =
    "serviceWorker" in navigator
      ? { controlled: Boolean(navigator.serviceWorker.controller) }
      : { controlled: false };

  return {
    t: Date.now(),
    buildSha: BUILD_SHA,
    pathname: path,
    href: window.location.href,
    selectedNav: navSelected,
    activeRouteKind: html.getAttribute("data-sayittome-route-kind"),
    activePanel: shuffleHost
      ? shuffleHost.classList.contains("sayittome-shuffle-keepalive-visible")
        ? "shuffle"
        : shuffleHost.classList.contains("sayittome-shuffle-keepalive-frozen")
          ? "shuffle-frozen"
          : "shuffle-mounted"
      : shell && !(shell as HTMLElement).hasAttribute("hidden")
        ? "route-shell"
        : null,
    activeSurface: document.body.classList.contains("sayittome-shuffle-surface-active")
      ? "shuffle"
      : "other",
    shuffleHostMounted: Boolean(shuffleHost),
    shuffleVisibleSelectorCount: black.shuffleVisible ? 1 : 0,
    profileVisibleSelectorCount: black.profileVisible,
    blackScreenHeuristic: black.blackScreen,
    meaningfulVisibleTextCount: black.meaningfulTextCount,
    rootBodyDimensions: {
      html: {
        w: html.clientWidth,
        h: html.clientHeight,
      },
      body: {
        w: document.body.clientWidth,
        h: document.body.clientHeight,
      },
      shuffleHost: shuffleHost
        ? {
            w: shuffleHost.clientWidth,
            h: shuffleHost.clientHeight,
          }
        : null,
    },
    lastNavEvent: html.getAttribute("data-sayittome-shuffle-reveal-from"),
    handoffOwner: {
      surfacePresented: isShuffleSurfacePresented(),
      revealDeferred: isShuffleRevealDeferred(),
      exitPending: isShuffleExitToMainTabPending(),
      exitTarget: getShuffleExitMainTabTarget(),
      revealPending: html.hasAttribute("data-sayittome-shuffle-reveal-pending"),
      keepAliveActive: isShuffleKeepAliveActive(),
    },
    keepaliveOwners: {
      shuffle: Boolean(shuffleHost),
      stories: Boolean(document.getElementById("sayittome-main-tab-keepalive-stories")),
      chats: Boolean(document.getElementById("sayittome-main-tab-keepalive-chats")),
    },
    css: {
      shuffleHost: cssSummary(shuffleHost),
      routeShell: cssSummary(shell),
    },
    consoleFatalCaptured: fatalBuffer.slice(-20),
    swCacheBuild: swVersion,
    chat: {
      anonSessionId: getChatAnonSenderId(),
      ...(chatExtras || {}),
    },
  };
}

export async function copyRealDeviceQaDiagnostics(
  chatExtras?: Record<string, unknown>,
) {
  const payload = collectRealDeviceQaDiagnostics(chatExtras);
  const text = JSON.stringify(payload, null, 2);
  try {
    console.info("[qaDebug]", payload);
  } catch {
    /* ignore */
  }
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return { ok: true, payload };
    }
  } catch {
    /* fall through */
  }
  return { ok: false, payload, text };
}
