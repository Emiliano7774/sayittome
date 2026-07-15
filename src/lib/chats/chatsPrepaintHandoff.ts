/**
 * Pre-paint Chats handoff marker for SoftNavigate remounts.
 * Written synchronously before route mutation so an inline head bootstrap
 * (and CSS) can hide Chats skeleton before React effects rehydrate suppress.
 * Direct cold /chats never writes this marker.
 */

export const CHATS_PREPAINT_HANDOFF_SESSION_KEY = "sayittome:chats-prepaint-handoff";
export const CHATS_PREPAINT_TTL_MS = 3000;

export type ChatsPrepaintHandoffMarker = {
  destination: "/chats";
  from: string;
  txId: string | null;
  startedAt: number;
  expiresAt: number;
  expectedFlag?: boolean | null;
};

function readMarkerRaw(): ChatsPrepaintHandoffMarker | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.sessionStorage.getItem(CHATS_PREPAINT_HANDOFF_SESSION_KEY);
    if (!raw) return null;
    const m = JSON.parse(raw) as ChatsPrepaintHandoffMarker;
    if (!m || m.destination !== "/chats") return null;
    if (typeof m.expiresAt !== "number" || Date.now() > m.expiresAt) {
      window.sessionStorage.removeItem(CHATS_PREPAINT_HANDOFF_SESSION_KEY);
      return null;
    }
    return m;
  } catch {
    return null;
  }
}

/** Install DOM datasets that CSS uses before React can paint Chats skeleton. */
export function installChatsPrepaintSuppressDom(detail?: {
  via?: string;
  fromMarker?: boolean;
}) {
  if (typeof document === "undefined") return;
  const html = document.documentElement;
  html.dataset.prepaintChatsHandoffSuppress = "1";
  html.dataset.chatsHandoffSuppress = "1";
  html.dataset.chatsPostAuthSettle = "1";
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
          event: "TAB_HANDOFF_CHATS_PREPAINT_SUPPRESS_INSTALLED",
          via: detail.via,
          fromMarker: detail.fromMarker === true,
        },
      ]);
    } catch {
      /* ignore */
    }
  }
}

export function clearChatsPrepaintSuppressDom() {
  if (typeof document === "undefined") return;
  delete document.documentElement.dataset.prepaintChatsHandoffSuppress;
}

export function isChatsPrepaintHandoffMarkerActive() {
  return readMarkerRaw() !== null;
}

export function isChatsPrepaintSuppressDomActive() {
  if (typeof document === "undefined") return false;
  return document.documentElement.dataset.prepaintChatsHandoffSuppress === "1";
}

/**
 * Write session marker + install DOM suppress BEFORE SoftNavigate / route mutation.
 * Must be sync on pointerdown / exit begin — never wait for React effects.
 */
export function writeChatsPrepaintHandoffMarker(opts: {
  from: string;
  txId?: string | null;
  ttlMs?: number;
  expectedFlag?: boolean | null;
}) {
  if (typeof window === "undefined") return null;
  const from = String(opts.from || "").split("?")[0].split("#")[0] || "/";
  // Direct cold /chats: never create marker.
  if (from === "/chats") return null;
  const startedAt = Date.now();
  const ttl = Math.min(
    CHATS_PREPAINT_TTL_MS,
    Math.max(250, opts.ttlMs ?? CHATS_PREPAINT_TTL_MS),
  );
  const marker: ChatsPrepaintHandoffMarker = {
    destination: "/chats",
    from,
    txId: opts.txId ?? null,
    startedAt,
    expiresAt: startedAt + ttl,
    expectedFlag: opts.expectedFlag ?? null,
  };
  try {
    window.sessionStorage.setItem(
      CHATS_PREPAINT_HANDOFF_SESSION_KEY,
      JSON.stringify(marker),
    );
    // Also seed suppress-until so remount hydrate / inline bootstrap have a floor.
    const untilKey = "sayittome:chats-sequence-handoff-suppress-until";
    const existingUntil = Number(window.sessionStorage.getItem(untilKey) || 0);
    const seedUntil = Math.max(existingUntil, marker.expiresAt);
    window.sessionStorage.setItem(untilKey, String(seedUntil));
    if (marker.txId) {
      window.sessionStorage.setItem(
        "sayittome:chats-sequence-handoff-suppress-tx",
        marker.txId,
      );
    }
    window.sessionStorage.setItem("sayittome:nav-capture-session", "1");
  } catch {
    /* ignore */
  }
  installChatsPrepaintSuppressDom({ via: "write-marker", fromMarker: true });
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
        event: "TAB_HANDOFF_CHATS_PREPAINT_MARKER_WRITTEN",
        from: marker.from,
        txId: marker.txId,
        expiresAt: marker.expiresAt,
      },
    ]);
  } catch {
    /* ignore */
  }
  return marker;
}

/** Re-apply DOM from session marker (module init / React takeover). */
export function rehydrateChatsPrepaintFromSession() {
  const marker = readMarkerRaw();
  if (!marker) return false;
  installChatsPrepaintSuppressDom({ via: "rehydrate-session", fromMarker: true });
  return true;
}

/**
 * Clear prepaint marker + dataset only after React suppress owns the window
 * (or force). Direct cold never sets marker so this is a no-op there.
 */
export function clearChatsPrepaintHandoffMarker(opts?: {
  force?: boolean;
  reason?: string;
}) {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.removeItem(CHATS_PREPAINT_HANDOFF_SESSION_KEY);
  } catch {
    /* ignore */
  }
  clearChatsPrepaintSuppressDom();
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
        event: "TAB_HANDOFF_CHATS_PREPAINT_SUPPRESS_CLEARED",
        reason: opts?.reason ?? "clear",
        force: opts?.force === true,
      },
    ]);
  } catch {
    /* ignore */
  }
}

/** True when prepaint marker or DOM suppress is active for internal Chats handoff. */
export function isChatsPrepaintHandoffActive() {
  return (
    isChatsPrepaintHandoffMarkerActive() || isChatsPrepaintSuppressDomActive()
  );
}
