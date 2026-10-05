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

/** Chat session id an anonymous visitor may publish for shuffle. Never a Firebase uid. */
export function sanitizeShuffleVisitorChatId(value: unknown) {
  const id = String(value || "").trim();
  if (!/^anon_[a-z0-9_]{6,80}$/i.test(id)) return "";
  if (id.toLowerCase() === "anon_server") return "";
  return id;
}
