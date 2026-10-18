/** Only registered public profiles participate in the reconnect pilot.
 * The clock is last foreground departure/heartbeat, NOT authentication/logout.
 * Anonymous arrivals and their three-hour Shuffle rule are unchanged. */
export const REGISTERED_RETURN_GAP_MS = 60_000;

export function mayAnnounceRegisteredReturn(input: {
  nowMs: number;
  lastForegroundMs?: number;
  lastAnnouncementMs?: number;
}): boolean {
  const { nowMs } = input;
  const priorForeground = Number(input.lastForegroundMs || 0);
  const priorAnnouncement = Number(input.lastAnnouncementMs || 0);
  if (!Number.isFinite(nowMs) || nowMs <= 0) return false;
  // A concurrent tab/device still active updates this timestamp every 90s.
  if (priorForeground > 0 && nowMs - priorForeground < REGISTERED_RETURN_GAP_MS) return false;
  // Server-side dedupe across tabs, devices, retries, and request races.
  if (priorAnnouncement > 0 && nowMs - priorAnnouncement < REGISTERED_RETURN_GAP_MS) return false;
  // Future timestamps cannot turn the gate into an unbounded cooldown.
  if (priorForeground > nowMs + 30_000 || priorAnnouncement > nowMs + 30_000) return false;
  return true;
}
