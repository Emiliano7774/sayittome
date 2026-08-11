export const FCM_INSTALLATION_ID_RE =
  /^inst_[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export const FCM_INSTALLATION_SECRET_RE = /^[0-9a-f]{32,}$/i;
export const FCM_INSTALLATION_PROOF_RE = /^[0-9a-f]{64}$/i;
export const FCM_INSTALLATION_SECRET_BYTES = 16;

export function isValidFcmInstallationId(value: string) {
  return FCM_INSTALLATION_ID_RE.test(String(value || "").trim());
}

export function isValidInstallationSecret(value: string) {
  return FCM_INSTALLATION_SECRET_RE.test(String(value || "").trim());
}

export function isValidInstallationProof(value: string) {
  return FCM_INSTALLATION_PROOF_RE.test(String(value || "").trim());
}

export function isLegacyInstallationProof(value: string) {
  return /^p_[0-9a-f]{8}$/i.test(String(value || "").trim());
}

export function generateInstallationSecret(bytes = FCM_INSTALLATION_SECRET_BYTES) {
  const size = Math.max(FCM_INSTALLATION_SECRET_BYTES, Number(bytes) || FCM_INSTALLATION_SECRET_BYTES);
  const buf = new Uint8Array(size);
  if (typeof crypto === "undefined" || typeof crypto.getRandomValues !== "function") {
    throw new Error("crypto_unavailable");
  }
  crypto.getRandomValues(buf);
  return Array.from(buf, (b) => b.toString(16).padStart(2, "0")).join("");
}

function bytesToHex(bytes: ArrayBuffer | Uint8Array) {
  const view = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  return Array.from(view, (b) => b.toString(16).padStart(2, "0")).join("");
}

export async function makeInstallationProof(installationId: string, secret: string) {
  const id = String(installationId || "").trim();
  const key = String(secret || "").trim();
  if (!isValidFcmInstallationId(id) || !isValidInstallationSecret(key)) {
    throw new Error("invalid_installation_material");
  }
  if (typeof crypto === "undefined" || !crypto.subtle) {
    throw new Error("crypto_unavailable");
  }
  const enc = new TextEncoder();
  const cryptoKey = await crypto.subtle.importKey(
    "raw",
    enc.encode(key),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", cryptoKey, enc.encode(id));
  return bytesToHex(sig);
}

export function shouldClearPendingUnregister(input: {
  pendingInstallationId?: string;
  currentInstallationId?: string;
}) {
  const pending = String(input.pendingInstallationId || "").trim();
  const current = String(input.currentInstallationId || "").trim();
  if (!pending || !current) return false;
  return pending === current;
}

export function shouldFlushPendingUnregister(input: {
  pendingUid?: string;
  currentUid?: string;
  pendingToken?: string;
  currentToken?: string;
}) {
  const pendingUid = String(input.pendingUid || "").trim();
  const currentUid = String(input.currentUid || "").trim();
  const pendingToken = String(input.pendingToken || "").trim();
  const currentToken = String(input.currentToken || "").trim();
  if (!pendingUid || !currentUid || !pendingToken) return false;
  if (pendingUid !== currentUid) return false;
  if (currentToken && currentToken === pendingToken) return false;
  return true;
}

export function reconcilePendingBeforeRegister(input: {
  pendingUid?: string;
  pendingToken?: string;
  currentUid?: string;
  nextToken?: string;
  pendingInstallationId?: string;
  currentInstallationId?: string;
}): "none" | "clear_local" | "flush_then_register" | "register_claims" {
  const pendingUid = String(input.pendingUid || "").trim();
  const pendingToken = String(input.pendingToken || "").trim();
  const currentUid = String(input.currentUid || "").trim();
  const nextToken = String(input.nextToken || "").trim();
  if (!pendingUid || !pendingToken || !currentUid) return "none";
  if (
    !shouldClearPendingUnregister({
      pendingInstallationId: input.pendingInstallationId,
      currentInstallationId: input.currentInstallationId,
    })
  ) {
    return "none";
  }
  if (pendingUid !== currentUid) return "register_claims";
  if (nextToken && nextToken === pendingToken) return "clear_local";
  return "flush_then_register";
}
