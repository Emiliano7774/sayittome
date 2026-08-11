type StoryIndexSample = {
  phase: "query" | "hydrate";
  ms: number;
  totalMs?: number;
  at: number;
};

const samples: StoryIndexSample[] = [];

function percentile(values: number[], p: number) {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1));
  return sorted[idx];
}

export function recordStoryIndexTiming(input: {
  phase: "query" | "hydrate";
  ms: number;
  totalMs?: number;
}) {
  samples.push({ ...input, at: Date.now() });
  if (samples.length > 40) samples.shift();
  if (typeof window === "undefined") return;
  const query = samples.filter((row) => row.phase === "query").map((row) => row.ms);
  const hydrate = samples.filter((row) => row.phase === "hydrate").map((row) => row.ms);
  const total = samples
    .map((row) => row.totalMs)
    .filter((ms): ms is number => typeof ms === "number");
  (window as Window & { __sayittomeStoryIndexTiming?: unknown }).__sayittomeStoryIndexTiming = {
    last: samples[samples.length - 1],
    query: { p50: percentile(query, 50), p95: percentile(query, 95), n: query.length },
    hydrate: { p50: percentile(hydrate, 50), p95: percentile(hydrate, 95), n: hydrate.length },
    total: { p50: percentile(total, 50), p95: percentile(total, 95), n: total.length },
  };
}
