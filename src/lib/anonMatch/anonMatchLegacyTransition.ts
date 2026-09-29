/** sessionStorage key for profile/shuffle client-minted anon ids — never adopted for anon-match. */
export const LEGACY_CLIENT_ANON_SESSION_KEY = "sayittome_anon_session";

/**
 * Client-minted anon ids cannot be cryptographically linked to the current
 * Firebase auth.uid without a prior server binding doc in anon_abuse_anon_aliases.
 * Anon-match never adopts them; history tied only to unbound client ids is not
 * actionable via anon-match close/respond APIs (fail closed on server).
 */
export const LEGACY_CLIENT_ALIAS_NO_CRYPTO_PROOF =
  "Client-minted anon ids lack server binding proof for the current auth.uid; anon-match issues a fresh server alias instead of adopting or merging threads.";

export function getLegacyClientAnonSessionId(): string {
  if (typeof window === "undefined") return "";
  return String(sessionStorage.getItem(LEGACY_CLIENT_ANON_SESSION_KEY) || "").trim();
}

export type LegacyAnonMatchAliasAudit =
  | { action: "use_stored"; legacyBlocked: false }
  | { action: "clear_and_issue"; legacyBlocked: boolean; reason: string };

/**
 * Deterministic transition for anon-match alias storage only.
 * - Never copy or bind legacy client-minted ids from sayittome_anon_session.
 * - If server-alias storage was contaminated with an unbound client id, discard it.
 * - Does not merge chat threads or migrate unbound legacy history.
 */
export function auditLegacyAnonMatchStoredAlias(input: {
  storedServerAlias: string;
  legacyClientAlias?: string;
}): LegacyAnonMatchAliasAudit {
  const stored = String(input.storedServerAlias || "").trim();
  const legacyClient = String(
    input.legacyClientAlias ??
      (typeof window !== "undefined" ? getLegacyClientAnonSessionId() : ""),
  ).trim();

  if (!stored) {
    return {
      action: "clear_and_issue",
      legacyBlocked: Boolean(legacyClient),
      reason: legacyClient
        ? "legacy_client_alias_present_no_adoption"
        : "no_stored_server_alias",
    };
  }

  if (legacyClient && stored === legacyClient) {
    return {
      action: "clear_and_issue",
      legacyBlocked: true,
      reason: "stored_alias_matches_unbound_client_mint",
    };
  }

  return { action: "use_stored", legacyBlocked: false };
}
