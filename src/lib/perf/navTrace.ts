/**
 * Dev-only navigation tracing. Tree-shaken from production via isNavTraceEnabled().
 * Marks: pointerdown → click → nav-start → dest-layout → useful-paint → fully-ready
 */

export type NavTracePhase =
  | "pointerdown"
  | "click"
  | "nav-start"
  | "dest-layout"
  | "useful-paint"
  | "fully-ready";

export type NavTraceLongTask = {
  startMs: number;
  durationMs: number;
  name: string;
};

export type NavTraceSample = {
  pathId: string;
  cold: boolean;
  runIndex: number;
  expectedScenario?: string;
  phases: Partial<Record<NavTracePhase, number>>;
  detailPhases?: Partial<Record<string, number>>;
  paintTimings?: Partial<Record<string, number>>;
  phaseDeltas: Partial<Record<string, number>>;
  commitsBeforeUsefulPaint: number;
  longTasks: NavTraceLongTask[];
  domMainVisibleMs?: number;
  usefulPaintLagMs?: number;
  mainThreadBusyMs?: number;
  aborted?: string;
};

export type NavTraceStats = {
  pathId: string;
  cold: boolean;
  count: number;
  min: number;
  median: number;
  p95: number;
  max: number;
  commitsMedian: number;
  pointerdownToUsefulPaint: NavTraceStats | null;
  clickToUsefulPaint: NavTraceStats | null;
};

const PREFIX = "sayittome-nav";

let enabled =
  (typeof process !== "undefined" &&
    (process.env.NODE_ENV === "development" ||
      process.env.NEXT_PUBLIC_NAV_TRACE === "1")) ||
  false;

export function isNavTraceEnabled() {
  if (typeof window !== "undefined") {
    if (window.location.search.includes("navtrace=1")) return true;
    if (window.localStorage.getItem("sayittome:nav-trace") === "1") return true;
  }
  return enabled;
}

let activePathId = "";
let activeCold = false;
let activeRunIndex = 0;
let activeStart = 0;
let activeStartAbsolute = 0;
let activeExpectedScenario = "";
let activePhases: Partial<Record<NavTracePhase, number>> = {};
let activeDetailPhases: Partial<Record<string, number>> = {};
let activePaintTimings: Partial<Record<string, number>> = {};
let commitsBeforePaint = 0;
let paintSeen = false;
let longTaskObserver: PerformanceObserver | null = null;
let activeLongTasks: NavTraceLongTask[] = [];
const samples: NavTraceSample[] = [];

function now() {
  return performance.now();
}

function markPerf(name: string) {
  try {
    performance.mark(`${PREFIX}:${name}`);
  } catch {
    // ignore duplicate marks
  }
}

function measurePerf(name: string, start: string, end: string) {
  try {
    performance.measure(`${PREFIX}:${name}`, `${PREFIX}:${start}`, `${PREFIX}:${end}`);
  } catch {
    // ignore
  }
}

export function setNavTraceEnabled(value: boolean) {
  enabled = value;
}

function ensureLongTaskObserver() {
  if (!isNavTraceEnabled() || typeof PerformanceObserver === "undefined" || longTaskObserver) return;

  try {
    longTaskObserver = new PerformanceObserver((list) => {
      if (!activePathId) return;
      for (const entry of list.getEntries()) {
        activeLongTasks.push({
          startMs: entry.startTime,
          durationMs: entry.duration,
          name: entry.name || "long-task",
        });
      }
    });
    longTaskObserver.observe({ type: "long-task", buffered: true });
  } catch {
    longTaskObserver = null;
  }
}

function resetActiveLongTasks() {
  activeLongTasks = [];
}

function buildDeltas(phases: Partial<Record<NavTracePhase, number>>) {
  const origin = phases.pointerdown ?? phases.click ?? phases["nav-start"] ?? 0;
  const deltas: Partial<Record<string, number>> = {};
  for (const [phase, ts] of Object.entries(phases) as Array<[NavTracePhase, number]>) {
    deltas[`origin→${phase}`] = Math.round(ts - origin);
  }
  if (phases.pointerdown && phases["useful-paint"]) {
    deltas["pointerdown→useful-paint"] = Math.round(phases["useful-paint"] - phases.pointerdown);
  }
  if (phases.click && phases["useful-paint"]) {
    deltas["click→useful-paint"] = Math.round(phases["useful-paint"] - phases.click);
  }
  return deltas;
}

export function navTraceBegin(
  pathId: string,
  cold: boolean,
  runIndex: number,
  expectedScenario?: string,
) {
  if (!isNavTraceEnabled()) return;
  ensureLongTaskObserver();
  activePathId = pathId;
  activeCold = cold;
  activeRunIndex = runIndex;
  activeExpectedScenario = expectedScenario || "";
  activeStart = now();
  activeStartAbsolute = activeStart;
  activePhases = {};
  activeDetailPhases = {};
  activePaintTimings = {};
  commitsBeforePaint = 0;
  paintSeen = false;
  resetActiveLongTasks();
  try {
    performance.clearMarks(`${PREFIX}:`);
    performance.clearMeasures(`${PREFIX}:`);
  } catch {
    // ignore
  }
}

export function navTraceMark(phase: NavTracePhase, pathId?: string) {
  if (!isNavTraceEnabled() || !activePathId) return;
  if (pathId && pathId !== activePathId) return;
  if (activePhases[phase] != null) return;

  const ts = now();
  activePhases[phase] = ts - activeStart;
  markPerf(`${activePathId}:${phase}`);

  if (phase === "pointerdown") {
    markPerf(`${activePathId}:origin`);
  }
}

/** Arbitrary sub-phase marks (profile pipeline, chats, settings, DOM, etc.). */
export function navTraceMarkDetail(key: string, pathId?: string) {
  if (!isNavTraceEnabled() || !activePathId) return;
  if (pathId && pathId !== activePathId) return;
  if (activeDetailPhases[key] != null) return;

  activeDetailPhases[key] = Math.round(now() - activeStart);
  markPerf(`${activePathId}:detail:${key}`);
}

/** Record shell / stale / fresh paint timestamps (dev bench). */
export function navTraceMarkPaint(
  kind: "shell-paint" | "stale-useful-paint" | "fresh-network-paint",
  pathId?: string,
) {
  if (!isNavTraceEnabled() || !activePathId) return;
  if (pathId && pathId !== activePathId) return;
  if (activePaintTimings[kind] != null) return;

  const ts = Math.round(now() - activeStart);
  activePaintTimings[kind] = ts;
  navTraceMarkDetail(`paint-${kind}`, pathId);

  if (kind === "stale-useful-paint" && activePhases["useful-paint"] == null) {
    paintSeen = true;
    activePhases["useful-paint"] = ts;
    markPerf(`${activePathId}:useful-paint`);
  }
}

function computeMainThreadBusy(endMs: number) {
  const startAbs = activeStartAbsolute;
  const endAbs = activeStartAbsolute + endMs;
  let busy = 0;

  const addOverlap = (entryStart: number, entryDuration: number) => {
    if (entryDuration <= 0) return;
    const entryEnd = entryStart + entryDuration;
    if (entryEnd <= startAbs || entryStart >= endAbs) return;
    const overlapStart = Math.max(entryStart, startAbs);
    const overlapEnd = Math.min(entryEnd, endAbs);
    busy += overlapEnd - overlapStart;
  };

  try {
    for (const entry of performance.getEntriesByType("longtask")) {
      addOverlap(entry.startTime, entry.duration);
    }
  } catch {
    // ignore
  }

  try {
    for (const entry of performance.getEntriesByType("event")) {
      addOverlap(entry.startTime, entry.duration);
    }
  } catch {
    // ignore
  }

  try {
    for (const entry of performance.getEntriesByType("measure")) {
      if (!entry.name.startsWith(PREFIX)) continue;
      addOverlap(entry.startTime, entry.duration);
    }
  } catch {
    // ignore
  }

  return Math.round(busy);
}

function buildSample(reason: string): NavTraceSample {
  const domMainVisibleMs = activeDetailPhases["dom-main-visible"];
  const usefulPaintMs =
    activePhases["useful-paint"] ??
    activePaintTimings["stale-useful-paint"] ??
    activePaintTimings["shell-paint"];
  const usefulPaintLagMs =
    typeof domMainVisibleMs === "number" && typeof usefulPaintMs === "number"
      ? Math.round(usefulPaintMs - domMainVisibleMs)
      : undefined;

  const endMs = typeof usefulPaintMs === "number" ? usefulPaintMs : now() - activeStart;

  return {
    pathId: activePathId,
    cold: activeCold,
    runIndex: activeRunIndex,
    expectedScenario: activeExpectedScenario || undefined,
    phases: { ...activePhases },
    detailPhases: { ...activeDetailPhases },
    paintTimings: { ...activePaintTimings },
    phaseDeltas: buildDeltas(activePhases),
    commitsBeforeUsefulPaint: commitsBeforePaint,
    longTasks: [...activeLongTasks],
    domMainVisibleMs,
    usefulPaintLagMs,
    mainThreadBusyMs: computeMainThreadBusy(endMs),
    ...(reason !== "useful-paint" && reason !== "fully-ready" ? { aborted: reason } : {}),
  };
}

export function navTraceCommit(pathId?: string) {
  if (!isNavTraceEnabled() || !activePathId) return;
  if (pathId && pathId !== activePathId) return;
  if (!paintSeen) commitsBeforePaint += 1;
}

export function navTraceFinish(pathId?: string, reason = "useful-paint") {
  if (!isNavTraceEnabled() || !activePathId) return;
  if (pathId && pathId !== activePathId) return;

  if (reason === "useful-paint") {
    paintSeen = true;
    if (activePhases["useful-paint"] == null) {
      navTraceMark("useful-paint", pathId);
    }
  } else {
    navTraceMark("fully-ready", pathId);
  }

  const sample = buildSample(reason);

  if (activePhases.pointerdown != null && activePhases["useful-paint"] != null) {
    measurePerf(
      `${activePathId}:pointerdown→useful-paint`,
      `${activePathId}:pointerdown`,
      `${activePathId}:useful-paint`,
    );
  }

  samples.push(sample);
  activePathId = "";
  resetActiveLongTasks();
}

export function navTraceAbort(reason: string) {
  if (!isNavTraceEnabled() || !activePathId) return;
  samples.push(buildSample(reason));
  activePathId = "";
  resetActiveLongTasks();
}

function percentile(values: number[], p: number) {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const idx = Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1);
  return sorted[idx];
}

function statsFor(values: number[]): Omit<NavTraceStats, "pathId" | "cold" | "pointerdownToUsefulPaint" | "clickToUsefulPaint"> & {
  count: number;
  min: number;
  median: number;
  p95: number;
  max: number;
} {
  if (!values.length) {
    return { count: 0, min: 0, median: 0, p95: 0, max: 0, commitsMedian: 0 };
  }
  return {
    count: values.length,
    min: Math.min(...values),
    median: percentile(values, 50),
    p95: percentile(values, 95),
    max: Math.max(...values),
    commitsMedian: 0,
  };
}

export function navTraceSummarize(pathId?: string) {
  const filtered = pathId ? samples.filter((s) => s.pathId === pathId && !s.aborted) : samples.filter((s) => !s.aborted);

  const byKey = new Map<string, NavTraceSample[]>();
  for (const sample of filtered) {
    const key = `${sample.pathId}|${sample.cold ? "cold" : "warm"}`;
    const list = byKey.get(key) || [];
    list.push(sample);
    byKey.set(key, list);
  }

  const rows: NavTraceStats[] = [];
  for (const [key, list] of byKey.entries()) {
    const [pid, temp] = key.split("|");
    const useful = list
      .map((s) => s.phaseDeltas["pointerdown→useful-paint"] ?? s.phaseDeltas["click→useful-paint"])
      .filter((v): v is number => typeof v === "number");
    const clickUseful = list
      .map((s) => s.phaseDeltas["click→useful-paint"])
      .filter((v): v is number => typeof v === "number");
    const commits = list.map((s) => s.commitsBeforeUsefulPaint);
    const base = statsFor(useful);
    rows.push({
      pathId: pid,
      cold: temp === "cold",
      ...base,
      commitsMedian: percentile(commits, 50),
      pointerdownToUsefulPaint: useful.length ? { pathId: pid, cold: temp === "cold", ...statsFor(useful), commitsMedian: 0, pointerdownToUsefulPaint: null, clickToUsefulPaint: null } : null,
      clickToUsefulPaint: clickUseful.length ? { pathId: pid, cold: temp === "cold", ...statsFor(clickUseful), commitsMedian: 0, pointerdownToUsefulPaint: null, clickToUsefulPaint: null } : null,
    });
  }

  return rows;
}

export function navTraceExport() {
  return {
    samples: [...samples],
    summary: navTraceSummarize(),
  };
}

export function navTraceClear() {
  samples.length = 0;
}

export function navTraceLongTaskSummary(pathId?: string) {
  const filtered = pathId
    ? samples.filter((s) => s.pathId === pathId && !s.aborted)
    : samples.filter((s) => !s.aborted);

  const tasks = filtered.flatMap((s) => s.longTasks.filter((t) => t.durationMs >= 50));
  const total = tasks.reduce((sum, t) => sum + t.durationMs, 0);
  return {
    count: tasks.length,
    totalMs: Math.round(total),
    maxMs: tasks.length ? Math.max(...tasks.map((t) => t.durationMs)) : 0,
  };
}

declare global {
  interface Window {
    __sayittomeNavTrace?: {
      begin: typeof navTraceBegin;
      mark: typeof navTraceMark;
      commit: typeof navTraceCommit;
      finish: typeof navTraceFinish;
      abort: typeof navTraceAbort;
      export: typeof navTraceExport;
      summarize: typeof navTraceSummarize;
      clear: typeof navTraceClear;
      setEnabled: typeof setNavTraceEnabled;
    };
  }
}

export function attachNavTraceWindow() {
  if (typeof window === "undefined") return;
  window.__sayittomeNavTrace = {
    begin: navTraceBegin,
    mark: navTraceMark,
    commit: navTraceCommit,
    finish: navTraceFinish,
    abort: navTraceAbort,
    export: navTraceExport,
    summarize: navTraceSummarize,
    clear: navTraceClear,
    setEnabled: setNavTraceEnabled,
  };
}
