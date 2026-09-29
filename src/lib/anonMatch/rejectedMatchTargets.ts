const REJECTED_MATCH_TARGETS_KEY = "sayittome:anon-match:rejected-targets";

function readIds(): Set<string> {
  if (typeof window === "undefined") return new Set();
  try {
    const raw = window.sessionStorage.getItem(REJECTED_MATCH_TARGETS_KEY);
    if (!raw) return new Set();
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return new Set();
    return new Set(parsed.filter((value) => typeof value === "string" && value.trim()));
  } catch {
    return new Set();
  }
}

function writeIds(ids: Set<string>) {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.setItem(REJECTED_MATCH_TARGETS_KEY, JSON.stringify([...ids]));
  } catch {
    // Ignore storage quota / privacy mode.
  }
}

/** Target key for a match destinatario — anon_* alias or registered uid. */
export function resolveRejectedMatchTargetKey(input: {
  destinatarioTipo?: string;
  destinatarioUid?: string;
  anonId?: string;
}) {
  const tipo = String(input.destinatarioTipo || "").trim();
  if (tipo === "perfil") return String(input.destinatarioUid || "").trim();
  return String(input.anonId || "").trim();
}

export function loadRejectedMatchTargets() {
  return readIds();
}

/**
 * After a reject, the searcher must not re-target that person until they
 * successfully open a chat and close it (classic matchmaking semantics).
 */
export function rememberRejectedMatchTarget(key: string) {
  const trimmed = String(key || "").trim();
  if (!trimmed) return;
  const ids = readIds();
  ids.add(trimmed);
  writeIds(ids);
}

export function clearRejectedMatchTargets() {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.removeItem(REJECTED_MATCH_TARGETS_KEY);
  } catch {
    // ignore
  }
}

export function splitRejectedMatchTargets(ids: Iterable<string> = loadRejectedMatchTargets()) {
  const excludeAnonIds: string[] = [];
  const excludeUids: string[] = [];
  for (const raw of ids) {
    const id = String(raw || "").trim();
    if (!id) continue;
    if (id.startsWith("anon_")) excludeAnonIds.push(id);
    else excludeUids.push(id);
  }
  return { excludeAnonIds, excludeUids };
}
