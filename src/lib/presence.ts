/** Green dot, active filters and displayed "En línea" share one three-hour window. */
export const ONLINE_WINDOW_MS = 3 * 60 * 60 * 1000;
export const ONLINE_LABEL_MS = ONLINE_WINDOW_MS;
/** Registered profiles stay in Shuffle's connected discovery window for 100 hours. Anonymous visibility remains 3 hours. */
export const SHUFFLE_REGISTERED_ONLINE_WINDOW_MS = 100 * 60 * 60 * 1000;

export function parsePresenceDate(value?: string | null) {
  if (!value) return null;

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;

  return date;
}

/** Badge verde / filtro activos: heartbeat dentro de tres horas. */
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
  _online?: boolean,
  windowMs = ONLINE_WINDOW_MS,
) {
  return isLiveByConnection(lastActive, windowMs);
}

export function isActiveWithinWindow(
  presenceAt?: string | null,
  lastActive?: string | null,
  windowMs = ONLINE_WINDOW_MS,
  now = Date.now(),
) {
  return isLiveByConnection(presenceAt || lastActive, windowMs, now);
}

/** Perfil "online" para filtros Shuffle: heartbeat dentro de tres horas. */
export function isShuffleProfileOnline(
  profile: { presenceAt?: string | null; lastActive?: string | null; onlineUntilAt?: string | null },
  now = Date.now(),
  windowMs = ONLINE_WINDOW_MS,
) {
  if (profile.onlineUntilAt) {
    const expiry = parsePresenceDate(profile.onlineUntilAt);
    return Boolean(expiry && now <= expiry.getTime() && now >= expiry.getTime() - windowMs - 30_000);
  }
  return isLiveByConnection(profile.presenceAt || profile.lastActive, windowMs, now);
}

/**
 * Label copy: up to 3 hours → "en línea"; then → last-seen phrasing.
 */
export function formatLastSeen(
  lastActive?: string | null,
  online?: boolean,
  windowMs = ONLINE_WINDOW_MS,
  labelMs = ONLINE_LABEL_MS,
) {
  void online;
  const date = parsePresenceDate(lastActive);
  if (!date) return "sin actividad reciente";

  const diffMs = Date.now() - date.getTime();
  if (diffMs <= labelMs) return "en linea";

  if (diffMs <= windowMs) {
    const minutes = Math.max(1, Math.floor(diffMs / 60_000));
    return minutes === 1 ? "Ultima conexion hace 1 min" : `Ultima conexion hace ${minutes} min`;
  }

  const seconds = Math.floor(diffMs / 1000);
  if (seconds < 60) return "hace un momento";

  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) {
    return minutes === 1 ? "Ultima conexion hace 1 min" : `Ultima conexion hace ${minutes} min`;
  }

  const hours = Math.floor(minutes / 60);
  if (hours < 24) {
    return hours === 1 ? "Ultima conexion hace 1 hora" : `Ultima conexion hace ${hours} horas`;
  }

  const days = Math.floor(hours / 24);
  return `Ultima conexion hace ${days} d`;
}
