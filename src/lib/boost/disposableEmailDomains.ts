const BLOCKED = new Set([
  "mailinator.com",
  "guerrillamail.com",
  "tempmail.com",
  "10minutemail.com",
  "yopmail.com",
  "throwaway.email",
  "getnada.com",
  "sharklasers.com",
  "guerrillamailblock.com",
  "dispostable.com",
  "maildrop.cc",
  "temp-mail.org",
  "fakeinbox.com",
  "trashmail.com",
]);

export function isDisposableEmail(email: string) {
  const domain = String(email || "").split("@")[1]?.toLowerCase().trim();
  if (!domain) return true;
  return BLOCKED.has(domain);
}
