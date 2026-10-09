/**
 * Client gate for profile→anon abuse. Never trusts local visitorId/IP.
 * Requires visitor Firebase ID token (anonymous Auth allowed).
 */
import { auth } from "@/lib/firebase";

export async function checkProfileAnonAbuseGate(input: {
  receptorUid: string;
  chatId?: string;
}): Promise<{ blocked: boolean }> {
  const receptorUid = String(input.receptorUid || "").trim();
  const chatId = String(input.chatId || "").trim();
  if (!receptorUid || !chatId) return { blocked: false };

  const user = auth.currentUser;
  if (!user) {
    throw new Error("unauthenticated");
  }
  const idToken = await user.getIdToken();

  const res = await fetch("/api/abuse/check", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${idToken}`,
    },
    body: JSON.stringify({ receptorUid, chatId }),
    cache: "no-store",
  });
  const json = (await res.json().catch(() => ({}))) as {
    ok?: boolean;
    blocked?: boolean;
    error?: string;
  };
  if (!res.ok || !json?.ok) {
    throw new Error(String(json?.error || "abuse_gate_failed"));
  }
  return { blocked: Boolean(json.blocked) };
}
