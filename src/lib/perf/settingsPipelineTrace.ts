/**
 * Dev-only Settings tab pipeline tracing.
 */

import { isNavTraceEnabled, navTraceMarkDetail } from "@/lib/perf/navTrace";

export type SettingsPipelinePhase =
  | "tab-pin"
  | "tab-active"
  | "settings-panel-visible"
  | "settings-mount"
  | "auth-known"
  | "auth-unknown"
  | "memory-profile-hit"
  | "memory-profile-miss"
  | "session-read-start"
  | "session-parsed"
  | "session-hit"
  | "session-miss"
  | "anon-gate-true"
  | "anon-gate-false"
  | "loading-false"
  | "settings-primary-dom"
  | "useful-paint";

type SettingsPipelineMeta = {
  sessionBytes?: number;
  sessionParseMs?: number;
  authUid?: string;
};

let active = false;
let origin = 0;
const phases: Partial<Record<SettingsPipelinePhase, number>> = {};
let meta: SettingsPipelineMeta = {};

function now() {
  return performance.now();
}

function sync(key: string) {
  navTraceMarkDetail(`settings-${key}`);
}

export function settingsPipelineBegin() {
  if (!isNavTraceEnabled() || typeof window === "undefined") return;
  active = true;
  origin = now();
  for (const k of Object.keys(phases)) delete phases[k as SettingsPipelinePhase];
  meta = {};
}

export function settingsPipelineMark(
  phase: SettingsPipelinePhase,
  patch?: Partial<SettingsPipelineMeta>,
) {
  if (!isNavTraceEnabled() || !active) return;
  if (phases[phase] != null) return;
  phases[phase] = Math.round(now() - origin);
  if (patch) meta = { ...meta, ...patch };
  sync(phase);
}

export function settingsPipelineSnapshot() {
  return { phases: { ...phases }, meta: { ...meta } };
}

export function attachSettingsPipelineWindow() {
  if (typeof window === "undefined" || !isNavTraceEnabled()) return;
  window.__sayittomeSettingsPipeline = {
    snapshot: settingsPipelineSnapshot,
    clearSessionProfile: () => {
      sessionStorage.removeItem("sayittome:settings-self-profile:v1");
    },
  };
}

declare global {
  interface Window {
    __sayittomeSettingsPipeline?: {
      snapshot: typeof settingsPipelineSnapshot;
      clearSessionProfile: () => void;
    };
  }
}
