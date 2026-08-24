/** In-memory lock to coalesce double-taps while a claim is in flight. */
const claiming = new Set<string>();

export function beginViewOnceClaim(messageId: string) {
  const id = String(messageId || "").trim();
  if (!id || claiming.has(id)) return false;
  claiming.add(id);
  return true;
}

export function endViewOnceClaim(messageId: string) {
  claiming.delete(String(messageId || "").trim());
}

export function isViewOnceClaimInFlight(messageId: string) {
  return claiming.has(String(messageId || "").trim());
}
