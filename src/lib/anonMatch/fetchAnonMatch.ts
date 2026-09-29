import type { User } from "firebase/auth";

import { ensureStorageAuth } from "@/lib/auth/ensureStorageAuth";
import { auth } from "@/lib/firebase";
import {
  resolveAnonMatchCallerSnapshot,
  type AnonMatchCallerSnapshot,
} from "@/lib/anonMatch/anonMatchConsumer";
import { auditLegacyAnonMatchStoredAlias } from "@/lib/anonMatch/anonMatchLegacyTransition";
import {
  clearAnonMatchServerAlias,
  dropAnonMatchAliasIfForeign,
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

let ensureAnonAliasPromise: Promise<string> | null = null;

/**
 * Fetch server-issued anon-match alias bound to the authenticated anonymous user.
 * Idempotent unless rotate=true.
 */
export async function ensureServerAnonMatchAlias(
  options: EnsureServerAnonMatchAliasOptions = {},
): Promise<string> {
  const issue = async () => {
    const user = await ensureStorageAuth({ allowAnonymous: true });
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
    // A bind that raced an auth switch belongs to the old uid — never store it.
    if (auth.currentUser && auth.currentUser.uid !== user.uid) {
      return ensureServerAnonMatchAlias({ rotate: false });
    }
    storeAnonMatchAlias(anonId, user.uid);
    return anonId;
  };

  if (options.rotate === true) {
    return issue();
  }

  // Cold boot can mount several consumers at once. Share the first server bind
  // so they all observe the same alias without a burst of duplicate POSTs.
  if (!ensureAnonAliasPromise) {
    ensureAnonAliasPromise = issue().finally(() => {
      ensureAnonAliasPromise = null;
    });
  }

  return ensureAnonAliasPromise;
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
    dropAnonMatchAliasIfForeign(user.uid);
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
