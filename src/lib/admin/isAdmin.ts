export const ADMIN_EMAIL = "emilianomaturano@gmail.com";

export function isAdminEmail(email?: string | null) {
  return String(email || "").trim().toLowerCase() === ADMIN_EMAIL;
}

export function assertAdminEmail(email?: string | null) {
  if (!isAdminEmail(email)) {
    throw new Error("forbidden");
  }
}

export function getAdminEmailFromRequest(req: Request, body?: Record<string, unknown>) {
  const headerEmail = req.headers.get("x-admin-email");
  const bodyEmail = body?.adminEmail;
  return String(headerEmail || bodyEmail || "")
    .trim()
    .toLowerCase();
}
