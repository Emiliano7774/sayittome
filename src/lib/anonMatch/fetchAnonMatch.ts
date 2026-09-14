import type { User } from "firebase/auth";

import { ensureStorageAuth } from "@/lib/auth/ensureStorageAuth";
import {
  resolveAnonMatchCallerSnapshot,
  type AnonMatchCallerSnapshot,
} from "@/lib/anonMatch/anonMatchConsumer";
import { auditLegacyAnonMatchStoredAlias } from "@/lib/anonMatch/anonMatchLegacyTransition";
import {
  clearAnonMatchServerAlias,
  getStoredAnonMatchAlias,
  storeAnonMatchAlias,
} from "@/lib/anonMatch/anonMatchSession";

async function buildAnonMatchAuthHeaders(
  extra?: HeadersInit,
): Promise<Record<string, string>> {
  const user = await ensureStorageAuth({ allowAnonymous: true });
  const idToken = await user.getIdToken();
  const headers: Record<string, string> = {
    Authorization: `Bearer ${idToken}`,
  };

  if (extra) {
    if (extra instanceof Headers) {
      extra.forEach((value, key) => {
        headers[key] = value;
      });
    } else if (Array.isArray(extra)) {
      for (const [key, value] of extra) {
        headers[key] = value;
      }
    } else {
      Object.assign(headers, extra);
    }
  }

  return headers;
}

async function fetchAnonMatchAuthenticated(
  path: string,
  init: RequestInit = {},
): Promise<Response> {
  const headers = await buildAnonMatchAuthHeaders(init.headers);
  if (!headers["Content-Type"] && !headers["content-type"] && init.body) {
    headers["Content-Type"] = "application/json";
  }
  return fetch(path, { ...init, headers });
}

export type EnsureServerAnonMatchAliasOptions = {
  rotate?: boolean;
};

/**
 * Fetch server-issued anon-match alias bound to the authenticated anonymous user.
 * Idempotent unless rotate=true.
 */
export async function ensureServerAnonMatchAlias(
  options: EnsureServerAnonMatchAliasOptions = {},
): Promise<string> {
  const res = await fetchAnonMatchAuthenticated("/api/anon-match/bind-alias", {
    method: "POST",
    body: JSON.stringify({ rotate: options.rotate === true }),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok || !json?.ok) {
    const message = String(json?.error || "bind_alias_failed");
    throw Object.assign(new Error(message), { status: res.status });
  }
  const anonId = String(json.anonId || "").trim();
  if (!anonId) {
    throw Object.assign(new Error("missing_server_alias"), { status: 500 });
  }
  storeAnonMatchAlias(anonId);
  return anonId;
}

/** Live caller snapshot after auth is ready — use in action handlers, not render closures. */
export async function resolveLiveAnonMatchCaller(): Promise<
  AnonMatchCallerSnapshot & { user: User }
> {
  const user = await ensureStorageAuth({ allowAnonymous: true });
  return { ...resolveAnonMatchCallerSnapshot(user), user };
}

/** Server-issued anon-match alias for anonymous callers; empty for profile callers. */
export async function resolveAnonMatchSessionId(
  options: EnsureServerAnonMatchAliasOptions = {},
): Promise<string> {
  const user = await ensureStorageAuth({ allowAnonymous: true });
  if (!user.isAnonymous) return "";
  if (options.rotate === true) {
    clearAnonMatchServerAlias();
  } else {
    const stored = getStoredAnonMatchAlias();
    const audit = auditLegacyAnonMatchStoredAlias({ storedServerAlias: stored });
    if (audit.action === "use_stored" && stored) return stored;
    if (audit.action === "clear_and_issue" && stored) {
      clearAnonMatchServerAlias();
    }
  }
  return ensureServerAnonMatchAlias(options);
}

/** Authenticated anon-match API fetch — ensures server alias for anonymous users. */
export async function fetchAnonMatch(path: string, init: RequestInit = {}): Promise<Response> {
  const user = await ensureStorageAuth({ allowAnonymous: true });
  if (user.isAnonymous) {
    await resolveAnonMatchSessionId();
  }
  return fetchAnonMatchAuthenticated(path, init);
}
