/** Only registered public profiles participate in the reconnect pilot.
 * The clock is last foreground departure/heartbeat, NOT authentication/logout.
 * Anonymous arrivals and their three-hour Shuffle rule are unchanged. */
export const REGISTERED_RETURN_GAP_MS = 60_000;

export function mayAnnounceRegisteredReturn(input: {
  nowMs: number;
  lastForegroundMs?: number;
  lastAnnouncementMs?: number;
  clientAwaySinceMs?: number;
}): boolean {
  const { nowMs } = input;
  const priorForeground = Number(input.lastForegroundMs || 0);
  const priorAnnouncement = Number(input.lastAnnouncementMs || 0);
  if (!Number.isFinite(nowMs) || nowMs <= 0) return false;
  // On mobile, the browser may freeze before recording the departure in
  // Firestore. Validate a full minute since local blur/minimize and allow
  // this genuine return despite a stale/late presence heartbeat. The durable
  // per-profile announcement gate below still prevents rapid duplicates.
  const departedAt = Number(input.clientAwaySinceMs || 0);
  const resumedAfterFullMinute = Number.isFinite(departedAt) && departedAt > 0 &&
    departedAt <= nowMs && nowMs - departedAt >= REGISTERED_RETURN_GAP_MS;
  if (!resumedAfterFullMinute && priorForeground > 0 && nowMs - priorForeground < REGISTERED_RETURN_GAP_MS) return false;
  // Server-side dedupe across tabs, devices, retries, and request races.
  if (priorAnnouncement > 0 && nowMs - priorAnnouncement < REGISTERED_RETURN_GAP_MS) return false;
  // Future timestamps cannot turn the gate into an unbounded cooldown.
  if (priorForeground > nowMs + 30_000 || priorAnnouncement > nowMs + 30_000) return false;
  return true;
}
