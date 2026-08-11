/**
 * Sanitized notification activation trace. No tokens, names, or full UIDs.
 */
import { BUILD_SHA } from "@/lib/perf/buildMarker";

const STORAGE_KEY = "sayittome:notification-incident:v1";
const MAX_STEPS = 40;

export type NotificationIncidentStep = {
  t: number;
  stage: string;
  ok: boolean;
  detail: string;
};

export type NotificationIncidentReport = {
  buildSha: string;
  host: string;
  steps: NotificationIncidentStep[];
  lastFailStage: string;
};

function readReport(): NotificationIncidentReport {
  if (typeof window === "undefined") {
    return { buildSha: BUILD_SHA, host: "", steps: [], lastFailStage: "" };
  }
  try {
    const parsed = JSON.parse(window.localStorage.getItem(STORAGE_KEY) || "null");
    if (parsed && Array.isArray(parsed.steps)) {
      return {
        buildSha: String(parsed.buildSha || BUILD_SHA),
        host: String(parsed.host || ""),
        steps: parsed.steps,
        lastFailStage: String(parsed.lastFailStage || ""),
      };
    }
  } catch {
    // ignore
  }
  return {
    buildSha: BUILD_SHA,
    host: typeof window === "undefined" ? "" : window.location.host,
    steps: [],
    lastFailStage: "",
  };
}

function writeReport(report: NotificationIncidentReport) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(report));
  } catch {
    // ignore
  }
}

export function beginNotificationIncident() {
  writeReport({
    buildSha: BUILD_SHA,
    host: typeof window === "undefined" ? "" : window.location.host,
    steps: [],
    lastFailStage: "",
  });
}

export function recordNotificationStage(stage: string, ok: boolean, detail = "") {
  const report = readReport();
  const step: NotificationIncidentStep = {
    t: Date.now(),
    stage,
    ok,
    detail: String(detail || "").slice(0, 80),
  };
  const next: NotificationIncidentReport = {
    ...report,
    buildSha: BUILD_SHA,
    host: typeof window === "undefined" ? "" : window.location.host,
    steps: [...report.steps, step].slice(-MAX_STEPS),
    lastFailStage: ok ? report.lastFailStage : stage,
  };
  writeReport(next);
  try {
    console.info("[qaDebug:notify]", step);
  } catch {
    // ignore
  }
}

export function readNotificationIncident(): NotificationIncidentReport {
  return readReport();
}

export function notificationIncidentSummary() {
  const report = readReport();
  const last = report.steps[report.steps.length - 1];
  return {
    buildSha: report.buildSha,
    lastStage: last?.stage || "",
    lastOk: last?.ok ?? null,
    lastDetail: last?.detail || "",
    lastFailStage: report.lastFailStage,
    stepCount: report.steps.length,
  };
}
