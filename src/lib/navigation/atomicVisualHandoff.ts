/**
 * Atomic visual handoff primitive:
 * KEEP SOURCE PRESENTED → PREP DESTINATION OFF-SCREEN → VERIFY GEOMETRY → ATOMIC SWAP
 */

export type HandoffPhase = "idle" | "preparing" | "ready" | "presented";

let phase: HandoffPhase = "idle";
let handoffVersion = 0;
const listeners = new Set<() => void>();

function notify() {
  handoffVersion += 1;
  listeners.forEach((listener) => listener());
}

export function subscribeAtomicVisualHandoff(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function getAtomicVisualHandoffVersion() {
  return handoffVersion;
}

export function getAtomicVisualHandoffPhase() {
  return phase;
}

export function beginAtomicVisualHandoff() {
  if (phase === "preparing") return;
  phase = "preparing";
  notify();
}

export function markAtomicVisualHandoffReady() {
  if (phase !== "preparing") return;
  phase = "ready";
  notify();
}

export function commitAtomicVisualHandoff() {
  phase = "presented";
  notify();
}

export function resetAtomicVisualHandoff() {
  if (phase === "idle") return;
  phase = "idle";
  notify();
}

export function isAtomicVisualHandoffPreparing() {
  return phase === "preparing" || phase === "ready";
}

export function isAtomicVisualHandoffReady() {
  return phase === "ready";
}
