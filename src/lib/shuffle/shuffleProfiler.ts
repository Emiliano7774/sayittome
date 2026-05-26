type Counters = {
  shuffleClicks: number;
  slotUpdates: number;
  slotRenders: number;
  rowRenders: number;
  imageSrcChanges: number;
  memoHits: number;
  memoMisses: number;
  parentRenders: number;
  polishRuns: number;
  rafFlushes: number;
};

const counters: Counters = {
  shuffleClicks: 0,
  slotUpdates: 0,
  slotRenders: 0,
  rowRenders: 0,
  imageSrcChanges: 0,
  memoHits: 0,
  memoMisses: 0,
  parentRenders: 0,
  polishRuns: 0,
  rafFlushes: 0,
};

const enabled =
  typeof process !== "undefined"
    ? process.env.NODE_ENV !== "production"
    : true;

export function shuffleProfilerEnabled() {
  return enabled && typeof performance !== "undefined";
}

export function shuffleMark(name: string) {
  if (!shuffleProfilerEnabled()) return;
  try {
    performance.mark(name);
  } catch {}
}

export function shuffleMeasure(name: string, start: string, end: string) {
  if (!shuffleProfilerEnabled()) return;
  try {
    performance.measure(name, start, end);
    const entry = performance.getEntriesByName(name).pop();
    if (entry && entry.duration > 12) {
      console.warn(`[shuffle-prof] ${name}: ${entry.duration.toFixed(2)}ms`);
    }
  } catch {}
}

export function shuffleCount(key: keyof Counters, delta = 1) {
  if (!shuffleProfilerEnabled()) return;
  counters[key] += delta;
}

export function shuffleDump(label = "shuffle-prof") {
  if (!shuffleProfilerEnabled()) return;

  const measures = performance
    .getEntriesByType("measure")
    .filter((m) => m.name.startsWith("shuffle-"))
    .slice(-20)
    .map((m) => `${m.name}:${m.duration.toFixed(2)}ms`);

  console.table(counters);
  if (measures.length) console.log(`[${label}] measures`, measures);
}

let longTaskObserver: PerformanceObserver | null = null;

export function attachShuffleProfilerWindow() {
  if (!shuffleProfilerEnabled() || typeof window === "undefined") return;

  (window as unknown as { __shuffleProf?: typeof counters }).__shuffleProf = counters;
  (window as unknown as { shuffleDump?: () => void }).shuffleDump = () =>
    shuffleDump("manual");

  if (longTaskObserver || !("PerformanceObserver" in window)) return;

  try {
    longTaskObserver = new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        if (entry.duration < 50) continue;
        console.warn(
          `[shuffle-prof] long-task ${entry.duration.toFixed(0)}ms`,
          entry.name,
        );
      }
    });
    longTaskObserver.observe({ entryTypes: ["longtask"] });
  } catch {
    longTaskObserver = null;
  }
}
