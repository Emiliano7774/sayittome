"use client";

import { httpsCallable } from "firebase/functions";

import { ensureStorageAuth } from "@/lib/auth/ensureStorageAuth";
import { functions } from "@/lib/firebase";
import { normalizeViewOnceLimit } from "@/lib/media/viewOncePolicy";

export const CLAIM_VIEW_ONCE_MEDIA = "claimViewOnceMedia";

export type ClaimViewOnceMediaInput = {
  chatId: string;
  messageId: string;
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
