/**
 * Authenticated Moderación smoke against production Hosting.
 * NEVER treats 401/403 as PASS. Requires post-auth code path (200 JSON or
 * meaningful admin error other than MODULE_NOT_FOUND).
 *
 * Auth: BENCH_EMAIL/BENCH_PASSWORD from .env.local (must be ADMIN_EMAIL),
 * or ADMIN_ID_TOKEN env.
 */
import { existsSync, readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const HOST = process.env.ADMIN_SMOKE_HOST || "https://sayittome-app.web.app";
const ADMIN_EMAIL = "emilianomaturano@gmail.com";
const API_KEY =
  process.env.NEXT_PUBLIC_FIREBASE_API_KEY || "AIzaSyBpQKCAwE-8Td3ZuaDqE3nvNwRGDGY8vdk";

function loadEnvLocal() {
  const envPath = resolve(root, ".env.local");
  const out = {};
  if (!existsSync(envPath)) return out;
  for (const line of readFileSync(envPath, "utf8").split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (!m) continue;
    out[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
  return out;
}

async function signInPassword(email, password) {
  const res = await fetch(
    `https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${encodeURIComponent(API_KEY)}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password, returnSecureToken: true }),
    },
  );
  const body = await res.json().catch(() => ({}));
  if (!res.ok || !body.idToken) {
    throw new Error(`signIn_failed status=${res.status} code=${body.error?.message || "?"}`);
  }
  return {
    idToken: String(body.idToken),
    email: String(body.email || email).toLowerCase(),
    localId: String(body.localId || ""),
  };
}

async function main() {
  const env = { ...loadEnvLocal(), ...process.env };
  let idToken = String(env.ADMIN_ID_TOKEN || "").trim();
  let email = "";

  if (!idToken) {
    const benchEmail = String(env.BENCH_EMAIL || "").trim().toLowerCase();
    const benchPassword = String(env.BENCH_PASSWORD || "");
    if (!benchEmail || !benchPassword) {
      console.error(
        JSON.stringify({
          gate: "ADMIN_MODERACION_AUTH_SMOKE",
          pass: false,
          reason: "missing_credentials",
          hint: "Set ADMIN_ID_TOKEN or BENCH_EMAIL/BENCH_PASSWORD in .env.local",
        }),
      );
      process.exit(1);
    }
    if (benchEmail !== ADMIN_EMAIL) {
      console.error(
        JSON.stringify({
          gate: "ADMIN_MODERACION_AUTH_SMOKE",
          pass: false,
          reason: "bench_email_not_admin",
          email: benchEmail,
        }),
      );
      process.exit(1);
    }
    const signed = await signInPassword(benchEmail, benchPassword);
    idToken = signed.idToken;
    email = signed.email;
  }

  const username = encodeURIComponent(String(env.ADMIN_SMOKE_USERNAME || "ana"));
  const url = `${HOST}/api/admin/user-chats?username=${username}`;
  const res = await fetch(url, {
    headers: {
      Authorization: `Bearer ${idToken}`,
      Accept: "application/json",
    },
    cache: "no-store",
  });
  const text = await res.text();
  let json = null;
  try {
    json = JSON.parse(text);
  } catch {
    json = null;
  }

  const bodySnippet = text.slice(0, 500);
  const hasModuleNotFound =
    /MODULE_NOT_FOUND|firebase-admin-[a-f0-9]+|Cannot find module/i.test(text);

  // 401/403 never PASS — they never hit post-auth Moderación code.
  if (res.status === 401 || res.status === 403) {
    console.error(
      JSON.stringify({
        gate: "ADMIN_MODERACION_AUTH_SMOKE",
        pass: false,
        reason: "auth_rejected_not_post_auth",
        status: res.status,
        email: email || "(token)",
        bodySnippet,
      }),
    );
    process.exit(1);
  }

  if (hasModuleNotFound) {
    console.error(
      JSON.stringify({
        gate: "ADMIN_MODERACION_AUTH_SMOKE",
        pass: false,
        reason: "module_not_found",
        status: res.status,
        bodySnippet,
      }),
    );
    process.exit(1);
  }

  const okPostAuth =
    res.status === 200 ||
    (res.status >= 400 &&
      res.status < 600 &&
      res.status !== 401 &&
      res.status !== 403 &&
      !hasModuleNotFound);

  if (!okPostAuth) {
    console.error(
      JSON.stringify({
        gate: "ADMIN_MODERACION_AUTH_SMOKE",
        pass: false,
        reason: "unexpected_status",
        status: res.status,
        bodySnippet,
      }),
    );
    process.exit(1);
  }

  console.log(
    JSON.stringify(
      {
        gate: "ADMIN_MODERACION_AUTH_SMOKE",
        pass: true,
        status: res.status,
        host: HOST,
        email: email || "(token)",
        ok: json?.ok,
        error: json?.error || null,
        chatCount: Array.isArray(json?.chats) ? json.chats.length : undefined,
        noModuleNotFound: true,
        postAuth: true,
      },
      null,
      2,
    ),
  );
}

main().catch((error) => {
  console.error(
    JSON.stringify({
      gate: "ADMIN_MODERACION_AUTH_SMOKE",
      pass: false,
      reason: String(error?.message || error),
    }),
  );
  process.exit(1);
});
