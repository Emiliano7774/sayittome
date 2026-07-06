/**
 * Dev-only profile load pipeline tracing. Never enabled in production builds.
 */

import { isNavTraceEnabled, navTraceMarkDetail } from "@/lib/perf/navTrace";

export type ProfilePipelinePhase =
  | "username-received"
  | "cache-hit"
  | "cache-miss"
  | "lookup-started"
  | "fetch-emitted"
  | "fetch-response"
  | "fetch-error"
  | "profile-normalized"
  | "username-changed"
  | "profile-not-found"
  | "set-profile"
  | "loading-false"
  | "render-commit"
  | "useful-paint-gate";

type ProfilePipelineMeta = {
  username: string;
  method?: string;
  status?: number;
  error?: string;
  found?: boolean;
  authReady?: boolean;
  loading?: boolean;
  hasProfile?: boolean;
};

let activeUsername = "";
let activeOrigin = 0;
let phases: Partial<Record<ProfilePipelinePhase, number>> = {};
let meta: ProfilePipelineMeta = { username: "" };
let diagnosticTimer: ReturnType<typeof setTimeout> | null = null;
let lastSnapshot: ProfilePipelineSnapshot | null = null;

const DIAGNOSTIC_TIMEOUT_MS = 10_000;

export type ProfilePipelineSnapshot = {
  username: string;
  phases: Partial<Record<ProfilePipelinePhase, number>>;
  meta: ProfilePipelineMeta;
  lastPhase: string;
  stalledMs: number;
  timedOut: boolean;
};

function now() {
  return performance.now();
}

function syncNavDetail(phase: ProfilePipelinePhase) {
  navTraceMarkDetail(`profile-${phase}`);
}

export function profilePipelineBegin(username: string) {
  if (!isNavTraceEnabled() || typeof window === "undefined") return;

  activeUsername = username.trim().toLowerCase();
  activeOrigin = now();
  phases = {};
  meta = { username: activeUsername };

  if (diagnosticTimer) clearTimeout(diagnosticTimer);
  diagnosticTimer = setTimeout(() => {
    const snap = profilePipelineSnapshot(true);
    lastSnapshot = snap;
    console.error("[sayittome:profile-pipeline-timeout]", snap);
  }, DIAGNOSTIC_TIMEOUT_MS);

  profilePipelineMark("username-received");
}

export function profilePipelineMark(
  phase: ProfilePipelinePhase,
  patch?: Partial<ProfilePipelineMeta>,
) {
  if (!isNavTraceEnabled() || !activeUsername) return;
  if (phases[phase] != null) return;

  phases[phase] = Math.round(now() - activeOrigin);
  meta = { ...meta, ...patch };
  syncNavDetail(phase);

  if (phase === "useful-paint-gate" || phase === "loading-false") {
    if (diagnosticTimer) {
      clearTimeout(diagnosticTimer);
      diagnosticTimer = null;
    }
  }
}

export function profilePipelineSnapshot(timedOut = false): ProfilePipelineSnapshot {
  const ordered = Object.entries(phases).sort((a, b) => (a[1] ?? 0) - (b[1] ?? 0));
  const lastPhase = ordered.at(-1)?.[0] ?? "none";
  const lastTs = ordered.at(-1)?.[1] ?? 0;

  return {
    username: activeUsername,
    phases: { ...phases },
    meta: { ...meta },
    lastPhase,
    stalledMs: Math.round(now() - activeOrigin - lastTs),
    timedOut,
  };
}

export function profilePipelineExportLast() {
  return lastSnapshot;
}

export function profilePipelineClearLast() {
  lastSnapshot = null;
}

export function attachProfilePipelineWindow() {
  if (typeof window === "undefined" || !isNavTraceEnabled()) return;

  window.__sayittomeProfilePipeline = {
    snapshot: profilePipelineSnapshot,
    exportLast: profilePipelineExportLast,
    clearLast: profilePipelineClearLast,
  };
}

declare global {
  interface Window {
    __sayittomeProfilePipeline?: {
      snapshot: typeof profilePipelineSnapshot;
      exportLast: typeof profilePipelineExportLast;
      clearLast: typeof profilePipelineClearLast;
    };
  }
}
