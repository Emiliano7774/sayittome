export const ONLINE_LABEL_MS = 3 * 60 * 1000;
/** Green dot + "activos/en línea" filter membership. */
export const ONLINE_WINDOW_MS = 15 * 60 * 1000;

export function parsePresenceDate(value?: string | null) {
  if (!value) return null;

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;

  return date;
}

/** Badge verde / filtro activos: heartbeat dentro de 15 min. */
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

/** Perfil "online" para filtros shuffle: heartbeat real dentro de la ventana (15 min). */
export function isShuffleProfileOnline(
  profile: { presenceAt?: string | null; lastActive?: string | null },
  now = Date.now(),
  windowMs = ONLINE_WINDOW_MS,
) {
  return isLiveByConnection(profile.presenceAt || profile.lastActive, windowMs, now);
}

/**
 * Label copy: 0–3 min → "en línea"; 3–15 min → minutes (caller keeps green via 15m window);
 * after 15 min → last-seen phrasing.
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
