import { createHmac, timingSafeEqual, randomBytes } from "node:crypto";
import { isIP } from "node:net";

export function abuseIpHashSecret(): string {
  const secret = String(process.env.ABUSE_IP_HASH_SECRET || "").trim();
  if (secret) return secret;
  if (process.env.NODE_ENV === "production") {
    throw new Error("abuse_ip_hash_secret_missing");
  }
  return "local-dev-abuse-ip-hash-only";
}

export function abuseIpRuntimeReady(): { secretConfigured: boolean } {
  return {
    secretConfigured: Boolean(String(process.env.ABUSE_IP_HASH_SECRET || "").trim()),
  };
}

export function normalizeClientIpCandidate(raw: string): string {
  let value = String(raw || "").trim();
  if (!value) return "";
  value = value.replace(/^\[|\]$/g, "");
  const zone = value.indexOf("%");
  if (zone >= 0) value = value.slice(0, zone);
  if (/^\d{1,3}(\.\d{1,3}){3}:\d+$/.test(value)) {
    value = value.replace(/:\d+$/, "");
  }
  return value.trim();
}

export function canonicalizeIp(raw: string): string {
  const candidate = normalizeClientIpCandidate(raw);
  if (!candidate) return "";
  const family = isIP(candidate);
  if (family === 4) return candidate;
  if (family !== 6) return "";

  const lower = candidate.toLowerCase();
  const [head = "", tail = ""] = lower.split("::");
  const headParts = head ? head.split(":").filter(Boolean) : [];
  const tailParts = tail ? tail.split(":").filter(Boolean) : [];
  if (lower.includes("::")) {
    const missing = 8 - headParts.length - tailParts.length;
    if (missing < 0) return "";
    const full = [...headParts, ...Array(missing).fill("0"), ...tailParts];
    if (full.length !== 8) return "";
    return full.map((p) => p.padStart(4, "0")).join(":");
  }
  const parts = lower.split(":");
  if (parts.length !== 8) return "";
  return parts.map((p) => p.padStart(4, "0")).join(":");
}

function isPublicCanonicalIp(ip: string): boolean {
  const v = canonicalizeIp(ip);
  if (!v) return false;
  if (isIP(v) === 4) {
    const parts = v.split(".").map(Number);
    if (parts.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) return false;
    if (parts[0] === 10) return false;
    if (parts[0] === 127) return false;
    if (parts[0] === 0) return false;
    if (parts[0] === 169 && parts[1] === 254) return false;
    if (parts[0] === 172 && parts[1]! >= 16 && parts[1]! <= 31) return false;
    if (parts[0] === 192 && parts[1] === 168) return false;
    return true;
  }
  if (isIP(v) === 6) {
    if (v === "0000:0000:0000:0000:0000:0000:0000:0001") return false;
    if (v.startsWith("fe80:")) return false;
    if (v.startsWith("fc") || v.startsWith("fd")) return false;
    if (v.startsWith("0000:0000:0000:0000:0000:ffff:")) return false;
    return true;
  }
  return false;
}

export function isDirectCloudFunctionsRequest(req: Request): boolean {
  const host = String(req.headers.get("host") || "")
    .trim()
    .toLowerCase()
    .split(":")[0];
  if (!host) return false;
  if (host.endsWith(".cloudfunctions.net")) return true;
  if (host.endsWith(".a.run.app")) return true;
  return false;
}

export function getTrustedRequestClientIp(req: Request): string {
  if (!isDirectCloudFunctionsRequest(req)) return "";

  const forwarded = String(req.headers.get("x-forwarded-for") || "").trim();
  if (!forwarded) return "";

  const parts = forwarded.split(",");
  const lastRaw = parts[parts.length - 1] || "";
  const last = canonicalizeIp(lastRaw);
  if (!last || !isPublicCanonicalIp(last)) return "";
  return last;
}

export function hashAbuseClientIp(ip: string, secret = abuseIpHashSecret()): string {
  const normalized = canonicalizeIp(ip);
  if (!normalized || !isPublicCanonicalIp(normalized)) return "";
  return createHmac("sha256", secret).update(`abuse-ip-v1:${normalized}`).digest("hex");
}

export function abuseIpHashesEqual(a: string, b: string): boolean {
  const left = String(a || "").trim();
  const right = String(b || "").trim();
  if (!left || !right || left.length !== right.length) return false;
  try {
    return timingSafeEqual(Buffer.from(left, "utf8"), Buffer.from(right, "utf8"));
  } catch {
    return false;
  }
}

export function newAbusePermitId(): string {
  return `prm_${randomBytes(16).toString("hex")}`;
}

export function newAbuseEpochId(): string {
  return `ep_${randomBytes(8).toString("hex")}`;
}
