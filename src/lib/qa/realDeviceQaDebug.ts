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
const QA_DEBUG_SESSION_KEY = "sayittome_qa_debug_session";
const QA_EVENTS_KEY = "sayittome_qa_debug_events";
const QA_EVENTS_CHANGED = "sayittome-qa-debug-events-changed";
const QA_EVENT_LIMIT = 20;
const QA_AUTH_STATE_KEY = "sayittome_qa_debug_auth";
const QA_SHUFFLE_STATE_KEY = "sayittome_qa_debug_shuffle";

export type QaCriticalEvent = {
  t: number;
  channel: "nav" | "chat" | "auth" | "shuffle" | "runtime";
  name: string;
  detail?: Record<string, unknown>;
};

function readQaState(key: string) {
  if (typeof window === "undefined") return {};
  try {
    const value = JSON.parse(window.sessionStorage.getItem(key) || "{}");
    return value && typeof value === "object" ? value as Record<string, unknown> : {};
  } catch {
    return {};
  }
}

function updateQaState(key: string, patch: Record<string, unknown>) {
  if (typeof window === "undefined" || !isRealDeviceQaDebugEnabled()) return;
  try {
    window.sessionStorage.setItem(
      key,
      JSON.stringify({ ...readQaState(key), ...patch, updatedAt: Date.now() }),
    );
  } catch {
    /* diagnostics must never affect product behavior */
  }
}

export function setQaAuthDiagnosticState(patch: Record<string, unknown>) {
  updateQaState(QA_AUTH_STATE_KEY, patch);
}

export function setQaShuffleDiagnosticState(patch: Record<string, unknown>) {
  updateQaState(QA_SHUFFLE_STATE_KEY, patch);
}

export function readQaAuthDiagnosticState() {
  return readQaState(QA_AUTH_STATE_KEY);
}

export function readQaShuffleDiagnosticState() {
  return readQaState(QA_SHUFFLE_STATE_KEY);
}

function queryExplicitlyEnablesQaDebug() {
  const params = new URLSearchParams(window.location.search);
  return (
    params.get("qaDebug") === "1" ||
    window.location.hash.toLowerCase().includes("qadebug")
  );
}

export function isRealDeviceQaDebugEnabled() {
  if (typeof window === "undefined") return false;
  try {
    if (queryExplicitlyEnablesQaDebug()) {
      window.sessionStorage.setItem(QA_DEBUG_SESSION_KEY, "1");
      return true;
    }
    if (window.sessionStorage.getItem(QA_DEBUG_SESSION_KEY) === "1") return true;
    if (window.localStorage.getItem("sayittome_qa_debug") === "1") return true;
  } catch {
    /* ignore */
  }
  return false;
}

export function readQaCriticalEvents(): QaCriticalEvent[] {
  if (typeof window === "undefined") return [];
  try {
    const parsed = JSON.parse(window.sessionStorage.getItem(QA_EVENTS_KEY) || "[]");
    return Array.isArray(parsed) ? parsed.slice(-QA_EVENT_LIMIT) : [];
  } catch {
    return [];
  }
}

export function recordQaCriticalEvent(
  channel: QaCriticalEvent["channel"],
  name: string,
  detail?: Record<string, unknown>,
) {
  if (typeof window === "undefined" || !isRealDeviceQaDebugEnabled()) return;
  const event: QaCriticalEvent = { t: Date.now(), channel, name, detail };
  try {
    const next = [...readQaCriticalEvents(), event].slice(-QA_EVENT_LIMIT);
    window.sessionStorage.setItem(QA_EVENTS_KEY, JSON.stringify(next));
    window.dispatchEvent(new Event(QA_EVENTS_CHANGED));
    console.info(`[qaDebug:${channel}] ${name}`, detail || {});
  } catch {
    /* diagnostics must never affect product behavior */
  }
}

export function subscribeQaCriticalEvents(listener: () => void) {
  if (typeof window === "undefined") return () => undefined;
  window.addEventListener(QA_EVENTS_CHANGED, listener);
  return () => window.removeEventListener(QA_EVENTS_CHANGED, listener);
}

export function installRealDeviceQaDebugCapture() {
  if (typeof window === "undefined" || captureInstalled) return;
  captureInstalled = true;
  recordQaCriticalEvent("runtime", "QA_DEBUG_CAPTURE_INSTALLED", {
    pathname: window.location.pathname,
  });

  document.addEventListener("click", (event) => {
    const target = event.target;
    if (!(target instanceof Element)) return;
    const loginLink = target.closest('a[href^="/login"]');
    if (!loginLink) return;
    const previous = readQaAuthDiagnosticState();
    const authClickCount = Number(previous.authClickCount || 0) + 1;
    setQaAuthDiagnosticState({
      authClickCount,
      authLastAction: "root-login-link-click",
      currentHost: window.location.host,
      popupAttempted: false,
      redirectAttempted: false,
    });
    recordQaCriticalEvent("auth", "AUTH_LOGIN_LINK_CLICK", {
      authClickCount,
      href: loginLink.getAttribute("href"),
    });
  }, true);

  window.addEventListener("error", (event) => {
    fatalBuffer.push({
      t: Date.now(),
      type: "error",
      message: String(event.message || event.error || "error"),
    });
    if (fatalBuffer.length > FATAL_BUFFER_MAX) fatalBuffer.shift();
    recordQaCriticalEvent("runtime", "RUNTIME_ERROR", {
      message: String(event.message || event.error || "error"),
    });
  });

  window.addEventListener("unhandledrejection", (event) => {
    fatalBuffer.push({
      t: Date.now(),
      type: "unhandledrejection",
      message: String(event.reason || "rejection"),
    });
    if (fatalBuffer.length > FATAL_BUFFER_MAX) fatalBuffer.shift();
    recordQaCriticalEvent("runtime", "RUNTIME_ERROR", {
      message: String(event.reason || "rejection"),
      kind: "unhandledrejection",
    });
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

function countVisibleShuffleHumanContent(root: ParentNode | null) {
  if (!root) return 0;
  const candidates = root.querySelectorAll(
    [
      "[data-shuffle-list] > *",
      "[data-shuffle-search='1']",
      "[data-shuffle-emergency-shell='1']",
      "[data-shuffle-error-shell='1']",
      "button",
      "a",
      "input",
      "[role='button']",
    ].join(","),
  );
  let count = 0;
  candidates.forEach((node) => {
    if (!isPresentable(node)) return;
    const text =
      node instanceof HTMLInputElement
        ? node.placeholder || node.value
        : (node.textContent || "").trim();
    if (text.length > 0 || node.hasAttribute("data-shuffle-list")) count += 1;
  });
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
  const visibleHumanContent = countVisibleShuffleHumanContent(shuffleHost);
  const path = window.location.pathname.split("?")[0].split("#")[0];
  const bothHidden = !shuffleVisible && (shellHidden || profileVisible === 0);
  const html = document.documentElement;
  const shuffleRevealActive =
    path === "/shuffle" ||
    html.hasAttribute("data-sayittome-shuffle-reveal-pending") ||
    html.hasAttribute("data-sayittome-shuffle-reveal-from") ||
    html.getAttribute("data-sayittome-route-kind") === "shuffle";
  return {
    blackScreen:
      shuffleRevealActive &&
      (bothHidden || !shuffleVisible || visibleHumanContent === 0),
    shuffleVisible,
    profileVisible,
    shellHidden,
    meaningfulTextCount: meaningful,
    visibleHumanContentCount: visibleHumanContent,
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
    visibleShuffleHumanContentCount: black.visibleHumanContentCount,
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
    criticalEvents: readQaCriticalEvents(),
    swCacheBuild: swVersion,
    auth: readQaAuthDiagnosticState(),
    shuffle: readQaShuffleDiagnosticState(),
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
  try {
    const textarea = document.createElement("textarea");
    textarea.value = text;
    textarea.setAttribute("readonly", "");
    textarea.style.cssText =
      "position:fixed;left:-9999px;top:0;opacity:0;pointer-events:none";
    document.body.appendChild(textarea);
    textarea.select();
    const copied = document.execCommand("copy");
    textarea.remove();
    if (copied) return { ok: true, payload };
  } catch {
    /* fall through */
  }
  return { ok: false, payload, text };
}
