import { isNavTraceEnabled } from "@/lib/perf/navTrace";

let blankSince: number | null = null;
let lastGapMs = 0;

export function storyBlankFrameBegin() {
  if (!isNavTraceEnabled()) return;
  if (blankSince == null) blankSince = performance.now();
}

export function storyBlankFrameEnd() {
  if (!isNavTraceEnabled() || blankSince == null) return;
  lastGapMs = Math.max(lastGapMs, Math.round(performance.now() - blankSince));
  blankSince = null;
}

export function storyBlankFrameReset() {
  blankSince = null;
  lastGapMs = 0;
}

export function exportStoryBlankFrameGapMs() {
  const active = blankSince != null ? Math.round(performance.now() - blankSince) : 0;
  return Math.max(lastGapMs, active);
}

if (typeof window !== "undefined" && isNavTraceEnabled()) {
  window.__sayittomeStoryBlankFrame = {
    exportGapMs: exportStoryBlankFrameGapMs,
    reset: storyBlankFrameReset,
  };
}

declare global {
  interface Window {
    __sayittomeStoryBlankFrame?: {
      exportGapMs: typeof exportStoryBlankFrameGapMs;
      reset: typeof storyBlankFrameReset;
    };
  }
}
