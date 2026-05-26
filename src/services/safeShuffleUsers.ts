export function safeShuffleUsers<T>(
  incoming: T[],
  cached: T[]
): T[] {
  if (
    incoming.length === 0 &&
    cached.length > 0
  ) {
    return cached;
  }

  return incoming;
}
