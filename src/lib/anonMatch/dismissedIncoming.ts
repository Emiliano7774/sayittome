const DISMISSED_REQUESTS_KEY = "sayittome:anon-match:dismissed-requests";
const REJECTED_SOLICITANTES_KEY = "sayittome:anon-match:rejected-solicitantes";

function readIds(key: string): Set<string> {
  if (typeof window === "undefined") return new Set();

  try {
    const raw = window.sessionStorage.getItem(key);
    if (!raw) return new Set();
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return new Set();
    return new Set(parsed.filter((value) => typeof value === "string" && value));
  } catch {
    return new Set();
  }
}

function writeIds(key: string, ids: Set<string>) {
  if (typeof window === "undefined") return;

  try {
    window.sessionStorage.setItem(key, JSON.stringify([...ids]));
  } catch {
    // Ignore storage quota or privacy mode errors.
  }
}

export function loadDismissedRequestIds() {
  return readIds(DISMISSED_REQUESTS_KEY);
}

export function rememberDismissedRequestId(solicitudId: string) {
  const ids = loadDismissedRequestIds();
  ids.add(solicitudId);
  writeIds(DISMISSED_REQUESTS_KEY, ids);
}

export function isDismissedRequestId(solicitudId: string) {
  return loadDismissedRequestIds().has(solicitudId);
}

export function forgetDismissedRequestId(solicitudId: string) {
  const ids = loadDismissedRequestIds();
  if (!ids.delete(solicitudId)) return;
  writeIds(DISMISSED_REQUESTS_KEY, ids);
}

export function loadRejectedSolicitanteKeys() {
  return readIds(REJECTED_SOLICITANTES_KEY);
}

export function rememberRejectedSolicitanteKey(key: string) {
  const trimmed = key.trim();
  if (!trimmed) return;

  const keys = loadRejectedSolicitanteKeys();
  keys.add(trimmed);
  writeIds(REJECTED_SOLICITANTES_KEY, keys);
}

export function isRejectedSolicitanteKey(key: string) {
  const trimmed = key.trim();
  if (!trimmed) return false;
  return loadRejectedSolicitanteKeys().has(trimmed);
}

export function resolveSolicitanteKey(input: {
  solicitanteUid?: string;
  solicitanteAnonId?: string;
}) {
  return String(input.solicitanteUid || input.solicitanteAnonId || "").trim();
}
