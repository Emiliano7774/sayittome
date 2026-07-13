/**
 * Shared diagnostic frame counter — incremented by the hop-nine transform probe RAF loop only.
 * Read by motor diag emitters; does not affect motor behavior.
 */

import { isMainTabShuffleTraceDiagEnabled } from "@/lib/perf/mainTabToShuffleTraceDiag";

let diagnosticFrameId = 0;

export function bumpDiagnosticFrameId(): number {
  if (!isMainTabShuffleTraceDiagEnabled()) return diagnosticFrameId;
  diagnosticFrameId += 1;
  return diagnosticFrameId;
}

export function getDiagnosticFrameId(): number {
  return diagnosticFrameId;
}

export function installDiagnosticFrameIdBridge(): void {
  if (typeof window === "undefined" || !isMainTabShuffleTraceDiagEnabled()) return;
  const w = window as Window & {
    __mainTabShuffleDiagFrame?: {
      bump: () => number;
      get: () => number;
    };
    __mainTabShuffleDiagIdentity?: {
      browserRealmInstanceId: () => string | null;
      documentInstanceId: () => string | null;
      performanceTimeOrigin: () => number | null;
    };
  };
  w.__mainTabShuffleDiagFrame = {
    bump: bumpDiagnosticFrameId,
    get: getDiagnosticFrameId,
  };
}
