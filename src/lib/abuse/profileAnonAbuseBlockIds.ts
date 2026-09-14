/**
 * Server-only abuse ID helpers (node:crypto). Do not import from client components.
 */
import { createHash } from "node:crypto";

/** Full SHA-256 — no truncated chatId slices (collision-prone). */
export function profileAnonAbuseBlockDocId(receptorUid: string, chatId: string) {
  const receptor = String(receptorUid || "").trim();
  const chat = String(chatId || "").trim();
  const digest = createHash("sha256").update(`v1:${receptor}\0${chat}`).digest("hex");
  return `${receptor}__c_${digest}`;
}

export function profileAnonAbuseIpIndexId(receptorUid: string, ipHash: string) {
  const hash = String(ipHash || "").trim().toLowerCase();
  if (/^[a-f0-9]{64}$/.test(hash)) {
    return `${String(receptorUid || "").trim()}__ip__${hash}`;
  }
  const digest = createHash("sha256").update(`ip:${hash}`).digest("hex");
  return `${String(receptorUid || "").trim()}__ip__${digest}`;
}

export function profileAnonAbuseMessagePermitId(chatId: string, messageId: string) {
  const digest = createHash("sha256")
    .update(`permit-v1:${String(chatId || "").trim()}\0${String(messageId || "").trim()}`)
    .digest("hex");
  return `prm_${digest}`;
}

export function abuseAuditEventId(blockId: string, nowMs: number, suffix: string) {
  const safeSuffix = String(suffix || "evt").replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 48);
  const digest = createHash("sha256")
    .update(`${blockId}\0${nowMs}\0${safeSuffix}`)
    .digest("hex")
    .slice(0, 32);
  return `aud_${digest}`;
}
