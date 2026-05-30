import type { AnonMatchConnectPhase } from "@/contexts/AnonMatchContext";

export type AnonDirectSearchSession = {
  active: boolean;
  phase: AnonMatchConnectPhase;
  solicitudId: string;
  savedAt: number;
};

const STORAGE_KEY = "sayittome_anon_direct_search_v1";

export function loadAnonDirectSearchSession(): AnonDirectSearchSession | null {
  if (typeof window === "undefined") return null;

  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as AnonDirectSearchSession;
    if (!parsed?.active) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function saveAnonDirectSearchSession(session: AnonDirectSearchSession) {
  if (typeof window === "undefined") return;

  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(session));
  } catch {
    // Ignore quota errors.
  }
}

export function clearAnonDirectSearchSession() {
  if (typeof window === "undefined") return;

  try {
    sessionStorage.removeItem(STORAGE_KEY);
  } catch {
    // Ignore.
  }
}
