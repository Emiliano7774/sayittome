const ANON_MATCH_ALIAS_KEY = "sayittome_anon_match_server_alias";

/** Last server-issued anon-match alias stored for this browser session. */
export function getStoredAnonMatchAlias(): string {
  if (typeof window === "undefined") return "";
  return String(sessionStorage.getItem(ANON_MATCH_ALIAS_KEY) || "").trim();
}

export function storeAnonMatchAlias(anonId: string) {
  if (typeof window === "undefined") return;
  const id = String(anonId || "").trim();
  if (!id) return;
  sessionStorage.setItem(ANON_MATCH_ALIAS_KEY, id);
}

export function clearAnonMatchServerAlias() {
  if (typeof window === "undefined") return;
  sessionStorage.removeItem(ANON_MATCH_ALIAS_KEY);
}
