import { clearPendingReferralCode, readPendingReferralCode } from "@/lib/boost/referralClientStorage";
import { getVisitorId } from "@/lib/abuse/fingerprint";

export async function trackPendingReferralAfterSignup(input: {
  inviteeUid: string;
  inviteeEmail?: string | null;
}) {
  const referralCode = readPendingReferralCode();
  if (!referralCode) return;

  try {
    await fetch("/api/referral/track", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        inviteeUid: input.inviteeUid,
        referralCode,
        inviteeEmail: input.inviteeEmail || "",
        visitorId: getVisitorId(),
      }),
    });
  } catch {
    // Non-blocking: profile setup should still succeed.
  } finally {
    clearPendingReferralCode();
  }
}
