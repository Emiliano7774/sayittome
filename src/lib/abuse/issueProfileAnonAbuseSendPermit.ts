/**
 * Obtain a server-issued one-shot abuse send permit (messageId-bound).
 * Content is not client-digested — messageId unreusability + Rules updates lock content.
 */
import { auth } from "@/lib/firebase";
import { abuseApiUrl } from "@/lib/abuse/abuseApiBase";

export async function issueProfileAnonAbuseSendPermit(input: {
  receptorUid: string;
  chatId: string;
  messageId: string;
}): Promise<{ permitId: string; expiresAtMs: number; ipCoverage: string }> {
  const receptorUid = String(input.receptorUid || "").trim();
  const chatId = String(input.chatId || "").trim();
  const messageId = String(input.messageId || "").trim();
  if (!receptorUid || !chatId || !messageId) {
    throw new Error("missing_fields");
  }

  const user = auth.currentUser;
  if (!user) throw new Error("unauthenticated");
  const idToken = await user.getIdToken();

  const res = await fetch(abuseApiUrl("/api/abuse/issue-send-permit"), {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${idToken}`,
    },
    body: JSON.stringify({ receptorUid, chatId, messageId }),
    cache: "no-store",
  });
  const json = (await res.json().catch(() => ({}))) as {
    ok?: boolean;
    permitId?: string;
    expiresAtMs?: number;
    error?: string;
    blocked?: boolean;
    requireNewEpoch?: boolean;
    ipCoverage?: string;
  };
  if (!res.ok || !json?.ok || !json.permitId) {
    const err = new Error(String(json?.error || "permit_failed")) as Error & {
      blocked?: boolean;
      status?: number;
      requireNewEpoch?: boolean;
    };
    err.blocked = Boolean(json?.blocked);
    err.status = res.status;
    err.requireNewEpoch = Boolean(json?.requireNewEpoch);
    throw err;
  }
  return {
    permitId: String(json.permitId),
    expiresAtMs: Number(json.expiresAtMs || 0),
    ipCoverage: String(json.ipCoverage || "pending"),
  };
}
