/**
 * ADMIN_LOGIN_SAFE_NEXT
 * Honor ?next=/admin for admin; reject open redirects; preserve auth gates;
 * anonymous session stays on /login; registered honors safe next;
 * authStateReady before admin/login redirects; explicit logout unchanged.
 *
 * Usage: node --experimental-strip-types scripts/admin-login-safe-next.harness.mjs
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { installHarnessAlias, installHarnessWindow } from "./harness-alias.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
installHarnessWindow();
installHarnessAlias(root);

const safe = await import(
  pathToFileURL(path.join(root, "src/lib/auth/safeReturnPath.ts")).href
);
const gate = await import(
  pathToFileURL(path.join(root, "src/lib/auth/loginSessionGate.ts")).href
);
const { ADMIN_EMAIL } = await import(
  pathToFileURL(path.join(root, "src/lib/admin/isAdmin.ts")).href
);

// --- anonymous session stays on login ---
assert.equal(gate.shouldAutoRedirectFromLogin(null), false);
assert.equal(gate.shouldAutoRedirectFromLogin(undefined), false);
assert.equal(gate.shouldAutoRedirectFromLogin({ isAnonymous: true }), false);
assert.equal(
  gate.shouldAutoRedirectFromLogin({ isAnonymous: true, uid: "anon1" }),
  false,
);

// --- registered session honors safe next (auto-redirect allowed) ---
assert.equal(gate.shouldAutoRedirectFromLogin({ isAnonymous: false }), true);
assert.equal(gate.shouldAutoRedirectFromLogin({}), true);

// --- login admin next ---
assert.equal(
  safe.applyPreferredPostAuthPath("/admin", ADMIN_EMAIL),
  "/admin",
  "admin next returns /admin",
);
assert.equal(
  safe.applyPreferredPostAuthPath("/admin/users", ADMIN_EMAIL),
  "/admin/users",
);
assert.equal(
  safe.applyPreferredPostAuthPath("%2Fadmin", ADMIN_EMAIL),
  "/admin",
);

// non-admin must not land on /admin
assert.equal(
  safe.applyPreferredPostAuthPath("/admin", "user@example.com"),
  safe.COMPLETE_POST_AUTH_PATH,
);
assert.equal(
  safe.applyPreferredPostAuthPath("/admin/moderation", null),
  safe.COMPLETE_POST_AUTH_PATH,
);

assert.equal(
  safe.applyPreferredPostAuthPath("/chats", "a@b.c"),
  "/chats",
  "registered safe next honored",
);
assert.equal(
  safe.applyPreferredPostAuthPath("/chat/abc123", "a@b.c"),
  "/chat/abc123",
);

// --- next malicioso / open redirect rechazado ---
const unsafeRaw = [
  "https://evil.example/phish",
  "//evil.example",
  "/\\evil",
  "https:%2F%2Fevil.example",
  "/login",
  "/register/setup",
  "/../etc/passwd",
  "javascript:alert(1)",
  "",
  null,
];
for (const raw of unsafeRaw) {
  assert.equal(
    safe.applyPreferredPostAuthPath(raw, ADMIN_EMAIL),
    safe.COMPLETE_POST_AUTH_PATH,
    `must reject: ${String(raw)}`,
  );
  assert.equal(
    safe.sanitizeSafeReturnPath(raw),
    null,
    `sanitize null: ${String(raw)}`,
  );
}

assert.equal(safe.sanitizeSafeReturnPath("/not-a-real-route"), "/not-a-real-route");
assert.equal(
  safe.applyPreferredPostAuthPath("/not-a-real-route", ADMIN_EMAIL),
  safe.COMPLETE_POST_AUTH_PATH,
);
assert.equal(safe.sanitizeSafeReturnPath("/admin/../../login"), null);
assert.equal(safe.sanitizeSafeReturnPath("//sayittome-app.web.app/admin"), null);

// --- wiring: LoginPage honors next + authStateReady + anon gate ---
const loginSrc = fs.readFileSync(path.join(root, "src/app/login/page.tsx"), "utf8");
assert.match(loginSrc, /readPreferredNextFromLocation|location\.search/);
assert.match(loginSrc, /preferredNext/);
assert.match(loginSrc, /auth\.authStateReady\(\)/);
assert.match(loginSrc, /shouldAutoRedirectFromLogin/);
assert.match(loginSrc, /resolvePostAuthPath\([\s\S]*preferredNext/);
assert.match(loginSrc, /signInWithEmailAndPassword/);
assert.doesNotMatch(loginSrc, /onAuthStateChanged/);
assert.doesNotMatch(loginSrc, /useSearchParams/);

// --- AdminShell: authStateReady before login redirect; next preserved ---
const shellSrc = fs.readFileSync(
  path.join(root, "src/components/admin/AdminShell.tsx"),
  "utf8",
);
assert.match(shellSrc, /auth\.authStateReady\(\)/);
assert.match(shellSrc, /login\?next=/);
assert.match(shellSrc, /encodeURIComponent\(nextPath\)/);
assert.doesNotMatch(shellSrc, /signOut/);

// --- sesión persistida: no signOut en init firebase; logout / anon mode intactos ---
const firebaseSrc = fs.readFileSync(path.join(root, "src/lib/firebase.ts"), "utf8");
assert.doesNotMatch(firebaseSrc, /signOut/);
assert.doesNotMatch(firebaseSrc, /setPersistence/);
assert.match(firebaseSrc, /getAuth/);

const logoutSrc = fs.readFileSync(path.join(root, "src/lib/auth/logout.ts"), "utf8");
assert.match(logoutSrc, /signOut\(auth\)/);
assert.match(logoutSrc, /export async function logoutAndResetAnon/);

const enterAnonSrc = fs.readFileSync(
  path.join(root, "src/lib/auth/enterAnonymousMode.ts"),
  "utf8",
);
assert.match(enterAnonSrc, /export async function enterAnonymousMode/);
assert.match(enterAnonSrc, /beginFreshAnonSession/);

const homeRestore = fs.readFileSync(
  path.join(root, "src/components/home/HomeSessionRestore.tsx"),
  "utf8",
);
assert.match(homeRestore, /auth\.authStateReady\(\)/);
assert.match(homeRestore, /user\.isAnonymous/);

const postAuthSrc = fs.readFileSync(
  path.join(root, "src/lib/auth/postAuthRedirect.ts"),
  "utf8",
);
assert.match(postAuthSrc, /applyPreferredPostAuthPath/);
assert.match(postAuthSrc, /\/register\/verify-email/);
assert.match(postAuthSrc, /\/register\/setup/);
assert.match(postAuthSrc, /preferredNext/);

console.log(
  JSON.stringify(
    {
      gate: "ADMIN_LOGIN_SAFE_NEXT",
      pass: true,
      anonymousStaysOnLogin: true,
      registeredHonorsSafeNext: true,
      adminNext: true,
      maliciousRejected: true,
      authStateReady: true,
      explicitLogoutPreserved: true,
      enterAnonymousPreserved: true,
    },
    null,
    2,
  ),
);
