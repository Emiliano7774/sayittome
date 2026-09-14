const DEFAULT_ALLOW_ORIGIN = "https://sayittome-app.web.app";
const TRUSTED_ORIGINS = new Set([
  DEFAULT_ALLOW_ORIGIN,
  "https://sayittome-app.firebaseapp.com",
]);

function configuredOrigins(): Set<string> {
  const configured = String(process.env.ABUSE_CORS_ALLOW_ORIGIN || "")
    .split(",")
    .map((value) => value.trim().replace(/\/$/, ""))
    .filter(Boolean);
  return new Set([...TRUSTED_ORIGINS, ...configured]);
}

export function allowedAbuseOrigin(requestOrigin: string): string {
  const normalized = String(requestOrigin || "").trim().replace(/\/$/, "");
  return configuredOrigins().has(normalized) ? normalized : DEFAULT_ALLOW_ORIGIN;
}
