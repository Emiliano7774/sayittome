/**
 * Guarded realtime-delivery timing (listener → React setState → paint).
 * No message content, IDs, or other PII — counts and durations only.
 *
 * Enable: localStorage `sayittome:realtime-perf` = `1`
 *      or URL `?realtimeperf=1`
 *      or NEXT_PUBLIC_REALTIME_PERF=1 in development.
 */

export type RealtimeDeliveryKind =
  | "legacy"
  | "profile-anon"
  | "anon-direct"
  | "local-write"
  | "mock";

export type RealtimeDeliverySample = {
  kind: RealtimeDeliveryKind;
  /** performance.now() at onSnapshot (or mock emit) entry */
  listenerAt: number;
  /** ms from listener entry → after setState scheduled */
  setStateMs?: number;
  /** ms from listener entry → double-rAF (approx committed+paint) */
  paintMs?: number;
  /** ms from local write start → ack/callback (when instrumented) */
  writeAckMs?: number;
  docCount?: number;
  burstIndex?: number;
};

const PREFIX = "sayittome-rt";
const STORAGE_KEY = "sayittome:realtime-perf";
const MAX_SAMPLES = 80;

let samples: RealtimeDeliverySample[] = [];
let forceEnabled = false;

export function isRealtimePerfEnabled(): boolean {
  if (forceEnabled) return true;
  if (
    typeof process !== "undefined" &&
    process.env.NEXT_PUBLIC_REALTIME_PERF === "1" &&
    process.env.NODE_ENV === "development"
  ) {
    return true;
  }
  if (typeof window === "undefined") return false;
  try {
    if (window.location.search.includes("realtimeperf=1")) return true;
    if (window.localStorage.getItem(STORAGE_KEY) === "1") return true;
  } catch {
    // ignore
  }
  return false;
}

/** Test/harness only. */
export function setRealtimePerfEnabledForTests(on: boolean) {
  forceEnabled = on;
}

export function clearRealtimePerfSamples() {
  samples = [];
}

export function getRealtimePerfSamples(): RealtimeDeliverySample[] {
  return samples.slice();
}

function pushSample(sample: RealtimeDeliverySample) {
  samples.push(sample);
  if (samples.length > MAX_SAMPLES) samples = samples.slice(-MAX_SAMPLES);
  if (typeof window !== "undefined") {
    window.__sayittomeRealtimePerf = {
      samples: getRealtimePerfSamples,
      clear: clearRealtimePerfSamples,
      summary: summarizeRealtimePerf,
    };
  }
}

function mark(name: string) {
  try {
    performance.mark(`${PREFIX}:${name}`);
  } catch {
    // ignore
  }
}

/**
 * Call at the start of an onSnapshot (or mock) callback.
 * Returns opaque handle; pass to afterSetState / schedulePaint.
 */
export function realtimePerfListenerBegin(
  kind: RealtimeDeliveryKind,
  meta?: { docCount?: number; burstIndex?: number },
): { kind: RealtimeDeliveryKind; t0: number; docCount?: number; burstIndex?: number } | null {
  if (!isRealtimePerfEnabled()) return null;
  const t0 = performance.now();
  mark(`${kind}:listener`);
  return {
    kind,
    t0,
    docCount: meta?.docCount,
    burstIndex: meta?.burstIndex,
  };
}

export function realtimePerfAfterSetState(
  handle: ReturnType<typeof realtimePerfListenerBegin>,
): void {
  if (!handle) return;
  const setStateMs = Math.round(performance.now() - handle.t0);
  mark(`${handle.kind}:setState`);
  const sample: RealtimeDeliverySample = {
    kind: handle.kind,
    listenerAt: handle.t0,
    setStateMs,
    docCount: handle.docCount,
    burstIndex: handle.burstIndex,
  };
  pushSample(sample);
  // Stash for paint completion to patch last matching sample.
  (handle as { _sample?: RealtimeDeliverySample })._sample = sample;
}

/** Double-rAF ≈ after layout+paint under normal scheduling. */
export function realtimePerfSchedulePaint(
  handle: ReturnType<typeof realtimePerfListenerBegin>,
): void {
  if (!handle || typeof window === "undefined") return;
  const sample = (handle as { _sample?: RealtimeDeliverySample })._sample;
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      const paintMs = Math.round(performance.now() - handle.t0);
      mark(`${handle.kind}:paint`);
      if (sample) sample.paintMs = paintMs;
      else {
        pushSample({
          kind: handle.kind,
          listenerAt: handle.t0,
          paintMs,
          docCount: handle.docCount,
          burstIndex: handle.burstIndex,
        });
      }
    });
  });
}

export function realtimePerfWriteAck(
  kind: RealtimeDeliveryKind,
  writeStartedAt: number,
): void {
  if (!isRealtimePerfEnabled()) return;
  const writeAckMs = Math.round(performance.now() - writeStartedAt);
  mark(`${kind}:writeAck`);
  pushSample({
    kind,
    listenerAt: writeStartedAt,
    writeAckMs,
  });
}

export function summarizeRealtimePerf() {
  const byKind: Record<
    string,
    { n: number; setStateP50?: number; paintP50?: number; writeAckP50?: number }
  > = {};
  for (const s of samples) {
    const bucket = byKind[s.kind] || { n: 0 };
    bucket.n += 1;
    byKind[s.kind] = bucket;
  }
  for (const kind of Object.keys(byKind)) {
    const rows = samples.filter((s) => s.kind === kind);
    const setStates = rows.map((r) => r.setStateMs).filter((n): n is number => n != null).sort((a, b) => a - b);
    const paints = rows.map((r) => r.paintMs).filter((n): n is number => n != null).sort((a, b) => a - b);
    const writes = rows.map((r) => r.writeAckMs).filter((n): n is number => n != null).sort((a, b) => a - b);
    const mid = (arr: number[]) =>
      arr.length ? arr[Math.floor(arr.length / 2)] : undefined;
    byKind[kind] = {
      n: rows.length,
      setStateP50: mid(setStates),
      paintP50: mid(paints),
      writeAckP50: mid(writes),
    };
  }
  return { count: samples.length, byKind };
}

declare global {
  interface Window {
    __sayittomeRealtimePerf?: {
      samples: typeof getRealtimePerfSamples;
      clear: typeof clearRealtimePerfSamples;
      summary: typeof summarizeRealtimePerf;
    };
  }
}
