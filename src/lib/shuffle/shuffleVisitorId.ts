/** Chat session id an anonymous visitor may publish for shuffle. Never a Firebase uid. */
export function sanitizeShuffleVisitorChatId(value: unknown) {
  const id = String(value || "").trim();
  if (!/^anon_[a-z0-9_]{6,80}$/i.test(id)) return "";
  if (id.toLowerCase() === "anon_server") return "";
  return id;
}
