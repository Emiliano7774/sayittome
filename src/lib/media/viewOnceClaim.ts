"use client";

import { httpsCallable } from "firebase/functions";

import { ensureStorageAuth } from "@/lib/auth/ensureStorageAuth";
import { functions } from "@/lib/firebase";
import { normalizeViewOnceLimit } from "@/lib/media/viewOncePolicy";

export const CLAIM_VIEW_ONCE_MEDIA = "claimViewOnceMedia";
export const COMMIT_VIEW_ONCE_SECRET = "commitViewOnceSecret";

export type ClaimViewOnceMediaInput = {
  chatId: string;
  messageId: string;
};

export type CommitViewOnceSecretInput = {
  chatId: string;
  messageId: string;
  mediaUrl: string;
};

export type CommitViewOnceSecretResult = {
  ok: boolean;
  sealed: boolean;
  limit: number;
};

export type ClaimViewOnceMediaResult = {
  ok: boolean;
  mediaUrl?: string;
  remaining: number;
  openedCount: number;
  limit: number;
  exhausted: boolean;
  reason?: string;
};

export async function claimViewOnceMedia(
  input: ClaimViewOnceMediaInput,
  deps?: {
    ensureAuth?: typeof ensureStorageAuth;
    callClaim?: (payload: ClaimViewOnceMediaInput) => Promise<ClaimViewOnceMediaResult>;
  },
): Promise<ClaimViewOnceMediaResult> {
  const chatId = String(input.chatId || "").trim();
  const messageId = String(input.messageId || "").trim();
  if (!chatId || !messageId) {
    throw new Error("invalid-argument");
  }

  await (deps?.ensureAuth || ensureStorageAuth)({ allowAnonymous: true });

  if (deps?.callClaim) {
    return deps.callClaim({ chatId, messageId });
  }

  const callable = httpsCallable<ClaimViewOnceMediaInput, ClaimViewOnceMediaResult>(
    functions,
    CLAIM_VIEW_ONCE_MEDIA,
  );
  const result = await callable({ chatId, messageId });
  return {
    ok: Boolean(result.data?.ok),
    mediaUrl: result.data?.mediaUrl ? String(result.data.mediaUrl) : undefined,
    remaining: Math.max(0, Number(result.data?.remaining) || 0),
    openedCount: Math.max(0, Number(result.data?.openedCount) || 0),
    limit: normalizeViewOnceLimit(result.data?.limit),
    exhausted: Boolean(result.data?.exhausted),
    reason: result.data?.reason ? String(result.data.reason) : undefined,
  };
}

/** Author-only: move bomb media into Admin-only secrets after public write without URL. */
export async function commitViewOnceSecret(
  input: CommitViewOnceSecretInput,
  deps?: {
    ensureAuth?: typeof ensureStorageAuth;
    callCommit?: (payload: CommitViewOnceSecretInput) => Promise<CommitViewOnceSecretResult>;
  },
): Promise<CommitViewOnceSecretResult> {
  const chatId = String(input.chatId || "").trim();
  const messageId = String(input.messageId || "").trim();
  const mediaUrl = String(input.mediaUrl || "").trim();
  if (!chatId || !messageId || !mediaUrl) {
    throw new Error("invalid-argument");
  }

  await (deps?.ensureAuth || ensureStorageAuth)({ allowAnonymous: true });

  if (deps?.callCommit) {
    return deps.callCommit({ chatId, messageId, mediaUrl });
  }

  const callable = httpsCallable<CommitViewOnceSecretInput, CommitViewOnceSecretResult>(
    functions,
    COMMIT_VIEW_ONCE_SECRET,
  );
  const result = await callable({ chatId, messageId, mediaUrl });
  return {
    ok: Boolean(result.data?.ok),
    sealed: Boolean(result.data?.sealed),
    limit: normalizeViewOnceLimit(result.data?.limit),
  };
}
