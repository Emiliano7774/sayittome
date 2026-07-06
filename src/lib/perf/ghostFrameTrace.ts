import { isNavTraceEnabled } from "@/lib/perf/navTrace";

type GhostSample = {
  at: number;
  transition: string;
  loadingShellPainted: boolean;
  blankVisual: boolean;
  detail: string;
};

let watching = false;
let watchTransition = "";
let watchSince = 0;
let rafLoopId: number | null = null;
let ghostFrameCount = 0;
let ghostFrameDurationMs = 0;
let loadingShellPainted = false;
let blankVisualGapMs = 0;
let blankSince: number | null = null;
const samples: GhostSample[] = [];

function now() {
  return Math.round(performance.now());
}

function hasLoadingShell(root: ParentNode) {
  if (root.querySelector("[data-loading-shell]")) return true;
  const text = root.textContent || "";
  return /Cargando\.\.\.|Loading\.\.\.|Caricamento\.\.\.|Laden\.\.\./i.test(text);
}

function hasPrimaryContent(root: ParentNode) {
  return Boolean(
    root.querySelector(
      "[data-nav-primary-content], [data-nav-chats-primary], [data-nav-shuffle-primary], [data-shuffle-slot], [data-shuffle-list]",
    ),
  );
}

function inspectSurface(label: string) {
  if (!watching || !isNavTraceEnabled() || typeof document === "undefined") return;

  const shuffleHost = document.getElementById("sayittome-shuffle-keepalive-host");
  const chatsHost = document.getElementById("sayittome-main-tab-keepalive-chats");
  const roots = [shuffleHost, chatsHost].filter(Boolean) as HTMLElement[];

  let loading = false;
  let blank = false;
  let detail = label;

  for (const root of roots) {
    const visible =
      root.classList.contains("sayittome-shuffle-keepalive-visible") ||
      root.classList.contains("sayittome-main-tab-keepalive-visible");

    if (!visible) continue;

    if (hasLoadingShell(root)) {
      loading = true;
      detail = `${label}:loading-shell@${root.id}`;
    }

    if (!hasPrimaryContent(root) && !hasLoadingShell(root)) {
      blank = true;
      detail = `${label}:blank@${root.id}`;
    }
  }

  if (loading) {
    loadingShellPainted = true;
    ghostFrameCount += 1;
    ghostFrameDurationMs = Math.max(ghostFrameDurationMs, now() - watchSince);
  }

  if (blank) {
    if (blankSince == null) blankSince = performance.now();
    blankVisualGapMs = Math.max(
      blankVisualGapMs,
      now() - (blankSince ?? watchSince),
    );
  } else if (blankSince != null) {
    blankSince = null;
  }

  if (loading || blank) {
    samples.push({
      at: now(),
      transition: watchTransition,
      loadingShellPainted: loading,
      blankVisual: blank,
      detail,
    });
  }
}

export function ghostFrameWatchBegin(transition: string) {
  if (!isNavTraceEnabled()) return;
  if (rafLoopId != null) {
    cancelAnimationFrame(rafLoopId);
    rafLoopId = null;
  }
  watching = true;
  watchTransition = transition;
  watchSince = performance.now();
  loadingShellPainted = false;
  blankSince = null;
  inspectSurface("begin");

  const loop = () => {
    if (!watching) return;
    inspectSurface("raf");
    rafLoopId = requestAnimationFrame(loop);
  };
  rafLoopId = requestAnimationFrame(loop);
}

export function ghostFrameWatchInspect(label: string) {
  inspectSurface(label);
}

export function ghostFrameWatchEnd() {
  if (!isNavTraceEnabled()) return;
  if (rafLoopId != null) {
    cancelAnimationFrame(rafLoopId);
    rafLoopId = null;
  }
  inspectSurface("end");
  watching = false;
  watchTransition = "";
}

export function exportGhostFrameStats() {
  return {
    ghostFrameCount,
    ghostFrameDurationMs,
    loadingShellPainted,
    blankVisualGapMs,
    samples: [...samples],
  };
}

export function resetGhostFrameStats() {
  ghostFrameCount = 0;
  ghostFrameDurationMs = 0;
  loadingShellPainted = false;
  blankVisualGapMs = 0;
  blankSince = null;
  samples.length = 0;
}

if (typeof window !== "undefined" && isNavTraceEnabled()) {
  window.__sayittomeGhostFrame = {
    begin: ghostFrameWatchBegin,
    inspect: ghostFrameWatchInspect,
    end: ghostFrameWatchEnd,
    export: exportGhostFrameStats,
    reset: resetGhostFrameStats,
  };
}

declare global {
  interface Window {
    __sayittomeGhostFrame?: {
      begin: typeof ghostFrameWatchBegin;
      inspect: typeof ghostFrameWatchInspect;
      end: typeof ghostFrameWatchEnd;
      export: typeof exportGhostFrameStats;
      reset: typeof resetGhostFrameStats;
    };
  }
}
