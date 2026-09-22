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

function retryableAbuseStatus(status: number) {
  return status === 408 || status === 425 || status === 429 || status >= 500;
}

/**
 * Direct-GCF calls can transiently fail at the browser CORS/network layer.
 * Retry only transport/5xx failures; never retry semantic 4xx decisions.
 */
export async function fetchAbuseApi(path: string, init: RequestInit): Promise<Response> {
  const url = abuseApiUrl(path);
  let lastError: unknown = null;

  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      // keepalive lets bind/permit survive a document teardown, but some browsers
      // fail the first cross-origin attempt when keepalive is set. Retry that
      // transport failure as a normal request. Semantic 4xx responses are not retried.
      const keepalive = attempt === 0 && (init.keepalive ?? true);
      const response = await fetch(url, {
        ...init,
        cache: "no-store",
        keepalive,
      });
      if (!retryableAbuseStatus(response.status) || attempt === 2) {
        return response;
      }
    } catch (error) {
      lastError = error;
      if (attempt === 2) throw error;
    }

    await new Promise((resolve) => setTimeout(resolve, attempt === 0 ? 180 : 450));
  }

  throw lastError || new Error("abuse_api_unavailable");
}
