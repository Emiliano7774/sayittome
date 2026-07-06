/**
 * Dev-only Chats tab pipeline tracing.
 */

import { isNavTraceEnabled, navTraceMarkDetail } from "@/lib/perf/navTrace";

export type ChatsPipelinePhase =
  | "tab-pin"
  | "tab-active"
  | "chats-panel-visible"
  | "chats-mount"
  | "inbox-memory-hit"
  | "inbox-memory-miss"
  | "snapshot-read-start"
  | "snapshot-parsed"
  | "snapshot-accepted"
  | "snapshot-rejected"
  | "auth-ready"
  | "auth-unknown"
  | "onsnapshot-registered"
  | "firestore-first-callback"
  | "inbox-state-set"
  | "inbox-sort-done"
  | "skeleton-gate-false"
  | "skeleton-gate-true"
  | "inbox-primary-dom"
  | "shell-paint"
  | "stale-useful-paint"
  | "fresh-network-paint";

type ChatsPipelineMeta = {
  skeletonReason?: string;
  snapshotBytes?: number;
  snapshotParseMs?: number;
  snapshotCount?: number;
  inboxCount?: number;
  sortMs?: number;
  authUid?: string;
  firestoreDocs?: number;
};

let active = false;
let origin = 0;
const phases: Partial<Record<ChatsPipelinePhase, number>> = {};
let meta: ChatsPipelineMeta = {};

function now() {
  return performance.now();
}

function sync(key: string) {
  navTraceMarkDetail(`chats-${key}`);
}

export function chatsPipelineBegin() {
  if (!isNavTraceEnabled() || typeof window === "undefined") return;
  active = true;
  origin = now();
  for (const k of Object.keys(phases)) delete phases[k as ChatsPipelinePhase];
  meta = {};
}

export function chatsPipelineMark(
  phase: ChatsPipelinePhase,
  patch?: Partial<ChatsPipelineMeta>,
) {
  if (!isNavTraceEnabled() || !active) return;
  if (phases[phase] != null) return;
  phases[phase] = Math.round(now() - origin);
  if (patch) meta = { ...meta, ...patch };
  sync(phase);
}

export function chatsPipelineSnapshot() {
  return {
    phases: { ...phases },
    meta: { ...meta },
  };
}

export function attachChatsPipelineWindow() {
  if (typeof window === "undefined" || !isNavTraceEnabled()) return;
  window.__sayittomeChatsPipeline = {
    snapshot: chatsPipelineSnapshot,
    clearInboxCache: () => {
      window.__sayittomeInboxCache?.clear?.();
    },
  };
}

declare global {
  interface Window {
    __sayittomeChatsPipeline?: {
      snapshot: typeof chatsPipelineSnapshot;
      clearInboxCache: () => void;
    };
    __sayittomeInboxCache?: {
      clear: () => void;
      clearMemory: () => void;
    };
  }
}
