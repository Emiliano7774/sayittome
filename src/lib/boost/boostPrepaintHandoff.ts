/**
 * Pre-paint Boost handoff marker for SoftNavigate remounts.
 * Written synchronously before route mutation so an inline head bootstrap
 * (and CSS) can hide BoostAccessGate loading before React effects rehydrate suppress.
 * Direct cold /boost never writes this marker.
 */

export const BOOST_PREPAINT_HANDOFF_SESSION_KEY =
  "sayittome:boost-prepaint-handoff";
export const BOOST_PREPAINT_TTL_MS = 3000;

export type BoostPrepaintHandoffMarker = {
  destination: "/boost";
  from: string;
  txId: string | null;
  startedAt: number;
  expiresAt: number;
  expectedFlag?: boolean | null;
};

const INTERNAL_BOOST_HANDOFF_SOURCES = new Set([
  "/shuffle",
  "/chats",
  "/stories",
  "/settings",
]);

/** Normalize a tab path (strip query/hash). */
export function normalizeBoostHandoffSourcePath(source: string): string {
  return String(source).split("?")[0].split("#")[0].trim() || "/";
}

/**
 * True only when `source` is an explicit internal tab path that may hand off
 * into Boost. Rejects null/undefined/empty/falsey and never invents "/shuffle".
 */
export function isRealInternalBoostHandoffSource(
  source: string | null | undefined,
): source is string {
  if (source == null) return false;
  if (typeof source !== "string") return false;
  const path = normalizeBoostHandoffSourcePath(source);
  if (!path || path === "/boost") return false;
  return INTERNAL_BOOST_HANDOFF_SOURCES.has(path);
}

/**
 * Resolve the only `from` allowed for Boost prepaint/suppress arms.
 * Returns null when source is absent — callers must NOT fall back to "/shuffle".
 */
export function resolveBoostInternalHandoffFrom(
  source: string | null | undefined,
): string | null {
  if (!isRealInternalBoostHandoffSource(source)) return null;
  return normalizeBoostHandoffSourcePath(source);
}

function readMarkerRaw(): BoostPrepaintHandoffMarker | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.sessionStorage.getItem(BOOST_PREPAINT_HANDOFF_SESSION_KEY);
    if (!raw) return null;
    const m = JSON.parse(raw) as BoostPrepaintHandoffMarker;
    if (!m || m.destination !== "/boost") return null;
    if (typeof m.expiresAt !== "number" || Date.now() > m.expiresAt) {
      window.sessionStorage.removeItem(BOOST_PREPAINT_HANDOFF_SESSION_KEY);
      return null;
    }
    return m;
  } catch {
    return null;
  }
}

/** Install DOM datasets that CSS uses before React can paint BoostAccessGate loading. */
export function installBoostPrepaintSuppressDom(detail?: {
  via?: string;
  fromMarker?: boolean;
}) {
  if (typeof document === "undefined") return;
  const html = document.documentElement;
  html.dataset.prepaintBoostHandoffSuppress = "1";
  html.dataset.boostHandoffSuppress = "1";
  html.dataset.boostPostCommitSettle = "1";
  html.dataset.tabPostAuthSettle = "1";
  try {
    window.sessionStorage.setItem("sayittome:nav-capture-session", "1");
  } catch {
    /* ignore */
  }
  if (typeof window !== "undefined" && detail?.via) {
    try {
      (
        window as Window & {
          __sayittomePrepaintDiag?: Array<Record<string, unknown>>;
        }
      ).__sayittomePrepaintDiag = (
        (
          window as Window & {
            __sayittomePrepaintDiag?: Array<Record<string, unknown>>;
          }
        ).__sayittomePrepaintDiag || []
      ).concat([
        {
          t: Date.now(),
          event: "TAB_HANDOFF_BOOST_PREPAINT_SUPPRESS_INSTALLED",
          via: detail.via,
          fromMarker: detail.fromMarker === true,
        },
      ]);
    } catch {
      /* ignore */
    }
  }
}

export function clearBoostPrepaintSuppressDom() {
  if (typeof document === "undefined") return;
  delete document.documentElement.dataset.prepaintBoostHandoffSuppress;
}

export function isBoostPrepaintHandoffMarkerActive() {
  return readMarkerRaw() !== null;
}

export function isBoostPrepaintSuppressDomActive() {
  if (typeof document === "undefined") return false;
  return document.documentElement.dataset.prepaintBoostHandoffSuppress === "1";
}

/**
 * Write session marker + install DOM suppress BEFORE SoftNavigate / route mutation.
 * Must be sync on pointerdown / exit begin — never wait for React effects.
 */
export function writeBoostPrepaintHandoffMarker(opts: {
  from: string;
  txId?: string | null;
  ttlMs?: number;
  expectedFlag?: boolean | null;
}) {
  if (typeof window === "undefined") return null;
  const from = normalizeBoostHandoffSourcePath(String(opts.from || ""));
  // Direct cold /boost: never create marker (no real internal source).
  if (from === "/boost" || !isRealInternalBoostHandoffSource(from)) {
    try {
      (
        window as Window & {
          __sayittomePrepaintDiag?: Array<Record<string, unknown>>;
        }
      ).__sayittomePrepaintDiag = (
        (
          window as Window & {
            __sayittomePrepaintDiag?: Array<Record<string, unknown>>;
          }
        ).__sayittomePrepaintDiag || []
      ).concat([
        {
          t: Date.now(),
          event: "TAB_HANDOFF_BOOST_MARKER_WRITE_SKIPPED_NO_REAL_SOURCE",
          from: from || null,
        },
        {
          t: Date.now(),
          event: "TAB_HANDOFF_BOOST_SOURCE_FALLBACK_BLOCKED",
          from: from || null,
        },
      ]);
    } catch {
      /* ignore */
    }
    return null;
  }
  const startedAt = Date.now();
  const ttl = Math.min(
    BOOST_PREPAINT_TTL_MS,
    Math.max(250, opts.ttlMs ?? BOOST_PREPAINT_TTL_MS),
  );
  const marker: BoostPrepaintHandoffMarker = {
    destination: "/boost",
    from,
    txId: opts.txId ?? null,
    startedAt,
    expiresAt: startedAt + ttl,
    expectedFlag: opts.expectedFlag ?? null,
  };
  try {
    window.sessionStorage.setItem(
      BOOST_PREPAINT_HANDOFF_SESSION_KEY,
      JSON.stringify(marker),
    );
    const untilKey = "sayittome:boost-sequence-handoff-suppress-until";
    const existingUntil = Number(window.sessionStorage.getItem(untilKey) || 0);
    const seedUntil = Math.max(existingUntil, marker.expiresAt);
    window.sessionStorage.setItem(untilKey, String(seedUntil));
    if (marker.txId) {
      window.sessionStorage.setItem(
        "sayittome:boost-sequence-handoff-suppress-tx",
        marker.txId,
      );
    }
    window.sessionStorage.setItem("sayittome:nav-capture-session", "1");
  } catch {
    /* ignore */
  }
  installBoostPrepaintSuppressDom({ via: "write-marker", fromMarker: true });
  try {
    (
      window as Window & {
        __sayittomePrepaintDiag?: Array<Record<string, unknown>>;
      }
    ).__sayittomePrepaintDiag = (
      (
        window as Window & {
          __sayittomePrepaintDiag?: Array<Record<string, unknown>>;
        }
      ).__sayittomePrepaintDiag || []
    ).concat([
      {
        t: Date.now(),
        event: "TAB_HANDOFF_BOOST_PREPAINT_MARKER_WRITTEN",
        from: marker.from,
        txId: marker.txId,
        expiresAt: marker.expiresAt,
      },
      {
        t: Date.now(),
        event: "TAB_HANDOFF_BOOST_SUPPRESS_ARMED_BEFORE_REVEAL",
        from: marker.from,
        txId: marker.txId,
      },
    ]);
  } catch {
    /* ignore */
  }
  return marker;
}

/** Re-apply DOM from session marker (module init / React takeover). */
export function rehydrateBoostPrepaintFromSession() {
  const marker = readMarkerRaw();
  if (!marker) return false;
  installBoostPrepaintSuppressDom({ via: "rehydrate-session", fromMarker: true });
  return true;
}

/**
 * Clear prepaint marker + dataset only after React suppress owns the window
 * (or force). Direct cold never sets marker so this is a no-op there.
 * Destination-scoped: never touches Chats prepaint / suppress keys.
 */
export function clearBoostPrepaintHandoffMarker(opts?: {
  force?: boolean;
  reason?: string;
}) {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.removeItem(BOOST_PREPAINT_HANDOFF_SESSION_KEY);
  } catch {
    /* ignore */
  }
  clearBoostPrepaintSuppressDom();
  try {
    (
      window as Window & {
        __sayittomePrepaintDiag?: Array<Record<string, unknown>>;
      }
    ).__sayittomePrepaintDiag = (
      (
        window as Window & {
          __sayittomePrepaintDiag?: Array<Record<string, unknown>>;
        }
      ).__sayittomePrepaintDiag || []
    ).concat([
      {
        t: Date.now(),
        event: "TAB_HANDOFF_BOOST_PREPAINT_SUPPRESS_CLEARED",
        reason: opts?.reason ?? "clear",
        force: opts?.force === true,
      },
    ]);
  } catch {
    /* ignore */
  }
}

/** True when prepaint marker or DOM suppress is active for internal Boost handoff. */
export function isBoostPrepaintHandoffActive() {
  return (
    isBoostPrepaintHandoffMarkerActive() || isBoostPrepaintSuppressDomActive()
  );
}
