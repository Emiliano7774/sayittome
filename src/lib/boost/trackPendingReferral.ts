import { clearPendingReferralCode, readPendingReferralCode } from "@/lib/boost/referralClientStorage";
import { getVisitorId } from "@/lib/abuse/fingerprint";

const TERMINAL_REFERRAL_REASONS = new Set([
  "invalid_code",
  "self_referral",
  "disposable_email",
  "same_device",
  "missing_fields",
]);

export function shouldClearPendingReferralAfterResponse(input: {
  responseOk: boolean;
  body?: { ok?: boolean; reason?: string; alreadyTracked?: boolean } | null;
}) {
  if (input.responseOk && input.body?.ok === true) return true;
  const reason = String(input.body?.reason || "").trim();
  return Boolean(reason && TERMINAL_REFERRAL_REASONS.has(reason));
}

export async function trackPendingReferralAfterSignup(input: {
  inviteeUid: string;
  inviteeEmail?: string | null;
}) {
  const referralCode = readPendingReferralCode();
  if (!referralCode) return { ok: true as const, skipped: true as const };

  try {
    const res = await fetch("/api/referral/track", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        inviteeUid: input.inviteeUid,
        referralCode,
        inviteeEmail: input.inviteeEmail || "",
        visitorId: getVisitorId(),
      }),
    });
    const body = (await res.json().catch(() => ({}))) as {
      ok?: boolean;
      reason?: string;
      alreadyTracked?: boolean;
    };

    if (shouldClearPendingReferralAfterResponse({ responseOk: res.ok, body })) {
      clearPendingReferralCode();
    }

    return {
      ok: res.ok && body.ok === true,
      retryable:
        !(res.ok && body.ok === true) &&
        !TERMINAL_REFERRAL_REASONS.has(String(body.reason || "")),
      reason: String(body.reason || ""),
    };
  } catch {
    // Non-blocking: profile setup should still succeed. Keep the code so a
    // later retry can finish attribution instead of silently losing credit.
    return { ok: false as const, retryable: true as const, reason: "network_error" };
  }
}
