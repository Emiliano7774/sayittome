let soloOnline = false;
const listeners = new Set<() => void>();

export function setShuffleSoloOnlineFilter(next: boolean) {
  const value = Boolean(next);
  if (soloOnline === value) return;
  soloOnline = value;
  listeners.forEach((listener) => listener());
}

export function getShuffleSoloOnlineFilter() {
  return soloOnline;
}

export function subscribeShuffleSoloOnlineFilter(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
