const VISITOR_KEY = "sayittome_visitor_id";

export function getVisitorId() {
  if (typeof window === "undefined") return "visitor_server";

  let current = localStorage.getItem(VISITOR_KEY);

  if (!current) {
    current = `vis_${Math.random().toString(36).slice(2)}_${Date.now().toString(36)}`;
    localStorage.setItem(VISITOR_KEY, current);
  }

  return current;
}

/** Stable device key — survives anonymous session rotation. */
export function buildVisitorBlockKey(visitorId?: string) {
  const visitor = visitorId || getVisitorId();
  return `visitor::${visitor}`;
}

export function buildAbuseFingerprint(anonSessionId: string, visitorId?: string) {
  const visitor = visitorId || getVisitorId();
  return `${anonSessionId}::${visitor}`;
}
