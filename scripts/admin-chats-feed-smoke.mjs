/**
 * Production smoke for /api/admin/chats-feed.
 * Auth via ADMIN_ID_TOKEN or BENCH_EMAIL/BENCH_PASSWORD (.env.local).
 * Never prints the token.
 *
 *   node scripts/admin-chats-feed-smoke.mjs
 */
import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
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
    throw new Error(`signIn_failed status=${res.status}`);
  }
  return String(body.idToken);
}

async function main() {
  const env = { ...loadEnvLocal(), ...process.env };
  let idToken = String(env.ADMIN_ID_TOKEN || "").trim();
  if (!idToken && existsSync(resolve(root, "scripts/.tmp-admin-id-token.txt"))) {
    idToken = readFileSync(resolve(root, "scripts/.tmp-admin-id-token.txt"), "utf8").trim();
  }
  if (!idToken) {
    const benchEmail = String(env.BENCH_EMAIL || "").trim().toLowerCase();
    const benchPassword = String(env.BENCH_PASSWORD || "");
    if (!benchEmail || !benchPassword || benchEmail !== ADMIN_EMAIL) {
      console.log(
        JSON.stringify({
          gate: "ADMIN_CHATS_FEED_SMOKE",
          pass: false,
          reason: "missing_admin_credentials",
        }),
      );
      process.exit(1);
    }
    idToken = await signInPassword(benchEmail, benchPassword);
  }

  const res = await fetch(`${HOST}/api/admin/chats-feed`, {
    cache: "no-store",
    headers: { Authorization: `Bearer ${idToken}` },
  });
  const json = await res.json().catch(() => ({}));
  const total = Number(json.total || 0);
  const scanned = Number(json.scanned || 0);
  const pass =
    res.ok &&
    json.ok === true &&
    scanned >= 1164 &&
    total >= 1164 &&
    Array.isArray(json.chats) &&
    json.chats.length >= 1164;

  console.log(
    JSON.stringify({
      gate: "ADMIN_CHATS_FEED_SMOKE",
      pass,
      status: res.status,
      host: HOST,
      scanned,
      total,
      chatsLen: Array.isArray(json.chats) ? json.chats.length : 0,
      uidMapSize:
        json.uidToUsername && typeof json.uidToUsername === "object"
          ? Object.keys(json.uidToUsername).length
          : 0,
      error: json.error || null,
    }),
  );
  process.exit(pass ? 0 : 1);
}

main().catch((error) => {
  console.log(
    JSON.stringify({
      gate: "ADMIN_CHATS_FEED_SMOKE",
      pass: false,
      error: String(error?.message || error),
    }),
  );
  process.exit(1);
});
