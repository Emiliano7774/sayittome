import {
  isMonetagBodyBlocked,
  isVignetteSurfaceEligible,
  resolveVignetteSurface,
} from "@/lib/monetization/adSurfaces";
import { isMonetagWebEnabled } from "@/lib/monetization/monetagConfig";
import {
  MONETAG_PUSH_ZONE,
  MONETAG_VIGNETTE_SRC,
  MONETAG_VIGNETTE_ZONES,
  type MonetagVignetteZoneId,
} from "@/lib/monetization/monetagZones";

export type VignetteLifecycleTrigger =
  | "initial-surface"
  | "pathname-commit"
  | "visibility-restored"
  | "overlay-change"
  | "script-on-load";

export type MonetagExposureFormat = "vignette" | "push";

export type VignetteExposureInput = {
  pathname: string;
  trigger: VignetteLifecycleTrigger;
  documentHidden?: boolean;
  overlayBlocked?: boolean;
  nativeVignetteReady?: boolean;
  now?: number;
};

export type VignetteExposureSnapshot = {
  timestamp: number;
  pathname: string;
  surface: string;
  trigger: VignetteLifecycleTrigger;
  vignetteEligible: boolean;
  blockedReason: string | null;
  documentHidden: boolean;
  overlayBlocked: boolean;
  monetagWebEnabled: boolean;
  nativeVignetteReady: boolean;
  scriptElementExists: boolean;
  scriptLoadedKnown: boolean;
  zoneId: string;
  format: MonetagExposureFormat;
  serviceWorkerExpected: boolean;
  serviceWorkerAvailable: boolean;
};

const RING_MAX = 240;
const RING_KEY = "__vignetteExposureAuditRing";
const SESSION_ENABLED_KEY = "sayittome:vignette-exposure-audit-session";

let auditRing: VignetteExposureSnapshot[] = [];

function readRing(): VignetteExposureSnapshot[] {
  if (typeof window === "undefined") return [];
  try {
    const fromWindow = (window as unknown as Record<string, unknown>)[RING_KEY];
    if (Array.isArray(fromWindow)) return fromWindow as VignetteExposureSnapshot[];
    const raw = window.sessionStorage.getItem(RING_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as VignetteExposureSnapshot[];
      if (Array.isArray(parsed)) return parsed;
    }
  } catch {
    /* ignore */
  }
  return [];
}

function writeRing() {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.setItem(RING_KEY, JSON.stringify(auditRing));
  } catch {
    /* ignore */
  }
  (window as unknown as Record<string, unknown>)[RING_KEY] = auditRing;
}

function persistAuditSession() {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.setItem(SESSION_ENABLED_KEY, "1");
  } catch {
    /* ignore */
  }
}

function vignetteScriptElementExists(zoneId: MonetagVignetteZoneId) {
  if (typeof document === "undefined") return false;
  return Boolean(
    document.querySelector(`script[data-zone="${zoneId}"][src="${MONETAG_VIGNETTE_SRC}"]`) ||
      document.querySelector(`script#${MONETAG_VIGNETTE_ZONES.find((zone) => zone.zoneId === zoneId)?.scriptId ?? ""}`),
  );
}

function pushScriptElementExists() {
  if (typeof document === "undefined") return false;
  return Boolean(
    document.querySelector(`script[src="${MONETAG_PUSH_ZONE.src}"]`) ||
      document.getElementById(MONETAG_PUSH_ZONE.scriptId),
  );
}

function vignetteScriptLoadedKnown(zoneId: MonetagVignetteZoneId) {
  if (typeof window === "undefined") return false;
  return window.sayittomeMonetagLoaded?.loadedVignetteZones?.[zoneId] === true;
}

function pushScriptLoadedKnown() {
  if (typeof window === "undefined") return false;
  return window.sayittomeMonetagLoaded?.loadedPushZones?.[MONETAG_PUSH_ZONE.zoneId] === true;
}

function serviceWorkerApiAvailable() {
  if (typeof navigator === "undefined") return false;
  return "serviceWorker" in navigator;
}

export function isVignetteExposureAuditEnabled() {
  if (typeof window === "undefined") return false;
  if (window.location.search.includes("navcapture=1")) {
    persistAuditSession();
    return true;
  }
  try {
    return window.sessionStorage.getItem(SESSION_ENABLED_KEY) === "1";
  } catch {
    return false;
  }
}

function evaluateVignetteZoneExposure(
  zoneId: MonetagVignetteZoneId,
  input: VignetteExposureInput,
): VignetteExposureSnapshot {
  const timestamp = input.now ?? Date.now();
  const pathname = String(input.pathname || "/");
  const surface = resolveVignetteSurface(pathname);
  const documentHidden = input.documentHidden ?? (typeof document !== "undefined" && document.hidden);
  const overlayBlocked =
    input.overlayBlocked ??
    (typeof document !== "undefined" && isMonetagBodyBlocked());
  const nativeVignetteReady = input.nativeVignetteReady ?? true;
  const monetagWebEnabled = isMonetagWebEnabled();

  let blockedReason: string | null = null;
  let vignetteEligible = false;

  if (!monetagWebEnabled) {
    blockedReason = "monetag-disabled";
  } else if (!nativeVignetteReady) {
    blockedReason = "native-not-ready";
  } else if (documentHidden) {
    blockedReason = "document-hidden";
  } else if (!isVignetteSurfaceEligible(pathname)) {
    blockedReason = "surface-ineligible";
  } else if (overlayBlocked) {
    blockedReason = "overlay-blocked";
  } else {
    vignetteEligible = true;
  }

  return {
    timestamp,
    pathname,
    surface,
    trigger: input.trigger,
    vignetteEligible,
    blockedReason,
    documentHidden,
    overlayBlocked,
    monetagWebEnabled,
    nativeVignetteReady,
    scriptElementExists: vignetteScriptElementExists(zoneId),
    scriptLoadedKnown: vignetteScriptLoadedKnown(zoneId),
    zoneId,
    format: "vignette",
    serviceWorkerExpected: false,
    serviceWorkerAvailable: false,
  };
}

function evaluatePushZoneExposure(input: VignetteExposureInput): VignetteExposureSnapshot {
  const timestamp = input.now ?? Date.now();
  const pathname = String(input.pathname || "/");
  const surface = resolveVignetteSurface(pathname);
  const documentHidden = input.documentHidden ?? (typeof document !== "undefined" && document.hidden);
  const monetagWebEnabled = isMonetagWebEnabled();

  let blockedReason: string | null = null;
  let vignetteEligible = false;

  if (!monetagWebEnabled) {
    blockedReason = "monetag-disabled";
  } else if (documentHidden) {
    blockedReason = "document-hidden";
  } else {
    vignetteEligible = true;
  }

  return {
    timestamp,
    pathname,
    surface,
    trigger: input.trigger,
    vignetteEligible,
    blockedReason,
    documentHidden,
    overlayBlocked: false,
    monetagWebEnabled,
    nativeVignetteReady: true,
    scriptElementExists: pushScriptElementExists(),
    scriptLoadedKnown: pushScriptLoadedKnown(),
    zoneId: MONETAG_PUSH_ZONE.zoneId,
    format: "push",
    serviceWorkerExpected: true,
    serviceWorkerAvailable: serviceWorkerApiAvailable(),
  };
}

/**
 * Describes whether our integration allows the official Monetag scripts to be present.
 * Does NOT communicate with Monetag and does not control ad delivery frequency.
 */
export function evaluateVignetteExposure(input: VignetteExposureInput): VignetteExposureSnapshot {
  return evaluateVignetteZoneExposure(MONETAG_VIGNETTE_ZONES[0].zoneId, input);
}

export function evaluateMonetagExposureSnapshots(input: VignetteExposureInput): VignetteExposureSnapshot[] {
  const vignetteSnapshots = MONETAG_VIGNETTE_ZONES.map((zone) =>
    evaluateVignetteZoneExposure(zone.zoneId, input),
  );
  return [...vignetteSnapshots, evaluatePushZoneExposure(input)];
}

export function recordVignetteExposureAudit(snapshot: VignetteExposureSnapshot) {
  if (!isVignetteExposureAuditEnabled()) return;
  auditRing = [...readRing(), snapshot].slice(-RING_MAX);
  writeRing();

  if (process.env.NODE_ENV === "development") {
    console.info("[monetag-exposure]", snapshot);
  }
}

export function tryRecordVignetteExposure(input: VignetteExposureInput): VignetteExposureSnapshot {
  const snapshots = evaluateMonetagExposureSnapshots(input);
  for (const snapshot of snapshots) {
    recordVignetteExposureAudit(snapshot);
  }
  return snapshots[0];
}

export function tryRecordMonetagZoneExposure(
  zoneId: string,
  input: VignetteExposureInput,
): VignetteExposureSnapshot {
  const snapshot =
    zoneId === MONETAG_PUSH_ZONE.zoneId
      ? evaluatePushZoneExposure(input)
      : evaluateVignetteZoneExposure(zoneId as MonetagVignetteZoneId, input);
  recordVignetteExposureAudit(snapshot);
  return snapshot;
}

export function exportVignetteExposureAudit(): VignetteExposureSnapshot[] {
  auditRing = readRing();
  return [...auditRing];
}

export function resetVignetteExposureAudit() {
  auditRing = [];
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.removeItem(RING_KEY);
  } catch {
    /* ignore */
  }
  delete (window as unknown as Record<string, unknown>)[RING_KEY];
}

export function attachVignetteExposureAuditExports() {
  if (typeof window === "undefined") return;
  const win = window as unknown as {
    exportVignetteExposureAudit?: () => VignetteExposureSnapshot[];
    exportVignetteOpportunityAudit?: () => VignetteExposureSnapshot[];
    exportMonetagExposureAudit?: () => VignetteExposureSnapshot[];
    __resetVignetteExposureAudit?: () => void;
  };
  win.exportVignetteExposureAudit = exportVignetteExposureAudit;
  win.exportVignetteOpportunityAudit = exportVignetteExposureAudit;
  win.exportMonetagExposureAudit = exportVignetteExposureAudit;
  win.__resetVignetteExposureAudit = resetVignetteExposureAudit;
}
