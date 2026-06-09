const PENDING_REF_KEY = "sayittome_pending_referral_code";

export function captureReferralCodeFromUrl() {
  if (typeof window === "undefined") return;

  try {
    const params = new URLSearchParams(window.location.search);
    const ref = String(params.get("ref") || params.get("referral") || "").trim().toLowerCase();
    if (!ref || ref.length < 4) return;

    localStorage.setItem(PENDING_REF_KEY, ref);

    params.delete("ref");
    params.delete("referral");
    const nextQuery = params.toString();
    const nextUrl = `${window.location.pathname}${nextQuery ? `?${nextQuery}` : ""}${window.location.hash}`;
    window.history.replaceState({}, "", nextUrl);
  } catch {
    // ignore
  }
}

export function readPendingReferralCode() {
  if (typeof window === "undefined") return "";

  try {
    return String(localStorage.getItem(PENDING_REF_KEY) || "").trim().toLowerCase();
  } catch {
    return "";
  }
}

export function clearPendingReferralCode() {
  if (typeof window === "undefined") return;

  try {
    localStorage.removeItem(PENDING_REF_KEY);
  } catch {
    // ignore
  }
}
