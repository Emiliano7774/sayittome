type CacheEnvelope<T> = {
  savedAt: number;
  value: T;
};

export function readClientCache<T>(key: string, ttlMs: number): T | null {
  if (typeof window === "undefined") return null;

  try {
    const raw = window.sessionStorage.getItem(key);
    if (!raw) return null;

    const parsed = JSON.parse(raw) as CacheEnvelope<T>;
    if (!parsed?.savedAt || Date.now() - parsed.savedAt > ttlMs) {
      window.sessionStorage.removeItem(key);
      return null;
    }

    return parsed.value ?? null;
  } catch {
    return null;
  }
}

export function writeClientCache<T>(key: string, value: T) {
  if (typeof window === "undefined") return;

  try {
    const envelope: CacheEnvelope<T> = {
      savedAt: Date.now(),
      value,
    };
    window.sessionStorage.setItem(key, JSON.stringify(envelope));
  } catch {
    // Ignore quota errors.
  }
}

export function readDurableClientCache<T>(key: string, ttlMs: number): T | null {
  const sessionHit = readClientCache<T>(key, ttlMs);
  if (sessionHit !== null) return sessionHit;
  if (typeof window === "undefined") return null;

  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as CacheEnvelope<T>;
    if (!parsed?.savedAt || Date.now() - parsed.savedAt > ttlMs) {
      window.localStorage.removeItem(key);
      return null;
    }
    writeClientCache(key, parsed.value);
    return parsed.value ?? null;
  } catch {
    return null;
  }
}

export function writeDurableClientCache<T>(key: string, value: T) {
  writeClientCache(key, value);
  if (typeof window === "undefined") return;

  try {
    const envelope: CacheEnvelope<T> = { savedAt: Date.now(), value };
    window.localStorage.setItem(key, JSON.stringify(envelope));
  } catch {
    // Ignore quota / privacy-mode storage errors.
  }
}

export function removeDurableClientCache(key: string) {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.removeItem(key);
    window.localStorage.removeItem(key);
  } catch {
    // ignore
  }
}
