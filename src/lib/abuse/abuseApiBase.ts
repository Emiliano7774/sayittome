/**
 * Abuse API base URL — direct Cloud Functions / Cloud Run only for IP path.
 * Default: us-central1 ssrsayittomeapp (project sayittome-app).
 * Override with NEXT_PUBLIC_ABUSE_API_BASE when the deployed URL differs.
 */
export const DEFAULT_ABUSE_API_BASE =
  "https://us-central1-sayittome-app.cloudfunctions.net/ssrsayittomeapp";

export function abuseApiBase(): string {
  const fromEnv = String(process.env.NEXT_PUBLIC_ABUSE_API_BASE || "").trim().replace(/\/$/, "");
  if (fromEnv) return fromEnv;
  // Browser: prefer explicit env; fall back to documented direct function URL.
  if (typeof window !== "undefined") return DEFAULT_ABUSE_API_BASE;
  // Server-side same-origin is fine for Hosting→function rewrite, but IP will be PENDING.
  return "";
}

export function abuseApiUrl(path: string): string {
  const base = abuseApiBase();
  const suffix = path.startsWith("/") ? path : `/${path}`;
  if (!base) return suffix;
  return `${base}${suffix}`;
}

export function abuseApiUsesDirectGcf(): boolean {
  const base = abuseApiBase();
  return /cloudfunctions\.net|\.a\.run\.app/i.test(base);
}
