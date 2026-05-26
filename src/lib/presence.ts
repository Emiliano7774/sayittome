export const ONLINE_WINDOW_MS = 15 * 60 * 1000;

export function parsePresenceDate(value?: string | null) {
  if (!value) return null;

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;

  return date;
}

/** Badge verde / "en linea": solo con heartbeat reciente, no con `online` pegado en DB. */
export function isLiveByConnection(
  heartbeatAt?: string | null,
  windowMs = ONLINE_WINDOW_MS,
  now = Date.now(),
) {
  const date = parsePresenceDate(heartbeatAt);
  if (!date) return false;

  return now - date.getTime() <= windowMs;
}

export function isRecentlyActive(
  lastActive?: string | null,
  online?: boolean,
  windowMs = ONLINE_WINDOW_MS,
) {
  if (online === false) return false;

  return isLiveByConnection(lastActive, windowMs);
}

export function formatLastSeen(
  lastActive?: string | null,
  online?: boolean,
  windowMs = ONLINE_WINDOW_MS,
) {
  if (isRecentlyActive(lastActive, online, windowMs)) return "en linea";

  const date = parsePresenceDate(lastActive);
  if (!date) return "sin actividad reciente";

  const diffMs = Date.now() - date.getTime();

  const seconds = Math.floor(diffMs / 1000);
  if (seconds < 60) return "hace un momento";

  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `Ultima vez hace ${minutes} min`;

  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `Ultima vez hace ${hours} h`;

  const days = Math.floor(hours / 24);
  return `Ultima vez hace ${days} d`;
}
