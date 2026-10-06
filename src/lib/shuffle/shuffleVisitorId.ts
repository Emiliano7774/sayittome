/** Live anonymous sessions always show the green dot. They cannot hide last seen. */
export function forceShuffleVisitorOnline<T extends {
  shuffleVisitor?: boolean;
  showOnline?: boolean;
  mostrarUltimaVez?: boolean;
  online?: boolean;
}>(profile: T): T {
  if (profile.shuffleVisitor !== true) return profile;
  return {
    ...profile,
    mostrarUltimaVez: true,
    showOnline: true,
    online: true,
  };
}

/** One person, one card. Keeps the newest row when the same owner has several sessions. */
export function collapseRowsByOwner<T>(
  rows: T[],
  ownerOf: (row: T) => string,
  seenOf: (row: T) => number,
): T[] {
  const best = new Map<string, { row: T; seen: number }>();
  for (const row of rows) {
    const owner = String(ownerOf(row) || "").trim();
    if (!owner) continue;
    const seen = Number(seenOf(row) || 0);
    const prev = best.get(owner);
    if (!prev || seen >= prev.seen) best.set(owner, { row, seen });
  }
  return [...best.values()].map((item) => item.row);
}

/** Chat session id an anonymous visitor may publish for shuffle. Never a Firebase uid. */
export function sanitizeShuffleVisitorChatId(value: unknown) {
  const id = String(value || "").trim();
  if (!/^anon_[a-z0-9_]{6,80}$/i.test(id)) return "";
  if (id.toLowerCase() === "anon_server") return "";
  return id;
}
