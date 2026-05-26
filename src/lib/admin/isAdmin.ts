export const ADMIN_EMAIL = "emilianomaturano@gmail.com";

export function isAdminEmail(email?: string | null) {
  return String(email || "").trim().toLowerCase() === ADMIN_EMAIL;
}
