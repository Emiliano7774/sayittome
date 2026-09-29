const ANON_MATCH_ALIAS_KEY = "sayittome_anon_match_server_alias";
/** Auth uid the stored alias is bound to — a foreign alias is rejected server-side. */
const ANON_MATCH_ALIAS_OWNER_KEY = "sayittome_anon_match_server_alias_uid";

/** Last server-issued anon-match alias stored for this browser session. */
export function getStoredAnonMatchAlias(): string {
  if (typeof window === "undefined") return "";
  return String(sessionStorage.getItem(ANON_MATCH_ALIAS_KEY) || "").trim();
}

export function getStoredAnonMatchAliasOwner(): string {
  if (typeof window === "undefined") return "";
  return String(sessionStorage.getItem(ANON_MATCH_ALIAS_OWNER_KEY) || "").trim();
}

export function storeAnonMatchAlias(anonId: string, ownerUid?: string) {
  if (typeof window === "undefined") return;
  const id = String(anonId || "").trim();
  if (!id) return;
  sessionStorage.setItem(ANON_MATCH_ALIAS_KEY, id);
  const owner = String(ownerUid || "").trim();
  if (owner) sessionStorage.setItem(ANON_MATCH_ALIAS_OWNER_KEY, owner);
}

export function clearAnonMatchServerAlias() {
  if (typeof window === "undefined") return;
  sessionStorage.removeItem(ANON_MATCH_ALIAS_KEY);
  sessionStorage.removeItem(ANON_MATCH_ALIAS_OWNER_KEY);
}

/**
 * Drop an alias minted for a different auth uid. Reusing it makes the server
 * reject presence and match requests with foreign_alias.
 */
export function dropAnonMatchAliasIfForeign(uid: string) {
  if (typeof window === "undefined") return;
  const current = String(uid || "").trim();
  if (!current) return;
  if (!getStoredAnonMatchAlias()) return;
  const owner = getStoredAnonMatchAliasOwner();
  if (owner && owner === current) return;
  clearAnonMatchServerAlias();
}
