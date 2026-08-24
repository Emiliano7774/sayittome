/**
 * LOGIN_ERRORS_PASSWORD_RESET
 * Map real Firebase login codes (no email enumeration); forgot-password wiring;
 * preserve safe-next / anon login gates.
 *
 * Usage: node --experimental-strip-types scripts/login-errors-password-reset.harness.mjs
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { installHarnessAlias, installHarnessWindow } from "./harness-alias.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
installHarnessWindow();
installHarnessAlias(root);

const errors = await import(
  pathToFileURL(path.join(root, "src/lib/auth/registerErrors.ts")).href
);
const gate = await import(
  pathToFileURL(path.join(root, "src/lib/auth/loginSessionGate.ts")).href
);
const safe = await import(
  pathToFileURL(path.join(root, "src/lib/auth/safeReturnPath.ts")).href
);
const { ADMIN_EMAIL } = await import(
  pathToFileURL(path.join(root, "src/lib/admin/isAdmin.ts")).href
);
const { MESSAGES } = await import(
  pathToFileURL(path.join(root, "src/lib/i18n/messages.ts")).href
);

assert.equal(errors.normalizeLoginEmail("  Admin@Mail.COM "), "admin@mail.com");

// Credential failures collapse — no distinct user-not-found
for (const code of [
  "auth/invalid-credential",
  "auth/wrong-password",
  "auth/user-not-found",
  "auth/invalid-login-credentials",
]) {
  assert.equal(errors.mapLoginErrorCode(code), "error_login_invalid", code);
}

assert.equal(errors.mapLoginErrorCode("auth/too-many-requests"), "error_login_too_many");
assert.equal(errors.mapLoginErrorCode("auth/network-request-failed"), "error_login_network");
assert.equal(errors.mapLoginErrorCode("auth/invalid-email"), "error_register_invalid_email");
assert.equal(errors.mapLoginErrorCode("auth/user-disabled"), "error_login_disabled");

assert.match(MESSAGES.es.error_login_invalid, /restablec|contraseñ/i);
assert.match(MESSAGES.es.error_login_network, /red|conexión/i);
assert.match(MESSAGES.es.error_login_too_many, /Demasiados|minutos/i);

assert.equal(errors.isPasswordResetEnumeratingMiss("auth/user-not-found"), true);
assert.equal(errors.mapPasswordResetErrorCode("auth/network-request-failed"), "error_login_network");
assert.equal(errors.mapPasswordResetErrorCode("auth/too-many-requests"), "error_login_too_many");
assert.equal(errors.mapPasswordResetErrorCode("auth/missing-email"), "error_reset_need_email");

// Login page wiring
const loginSrc = fs.readFileSync(path.join(root, "src/app/login/page.tsx"), "utf8");
assert.match(loginSrc, /sendPasswordResetEmail/);
assert.match(loginSrc, /handleForgotPassword/);
assert.match(loginSrc, /normalizeLoginEmail/);
assert.match(loginSrc, /auth_forgot_password/);
assert.match(loginSrc, /auth_reset_sent/);
assert.match(loginSrc, /shouldAutoRedirectFromLogin/);
assert.match(loginSrc, /preferredNext/);
assert.match(loginSrc, /isPasswordResetEnumeratingMiss/);
assert.doesNotMatch(loginSrc, /authLastErrorMessage:\s*message/);
assert.doesNotMatch(
  loginSrc,
  /recordQaCriticalEvent\([\s\S]*AUTH_LOGIN_ERROR[\s\S]*message:/,
);

// Regression: anon stays; admin safe next; malicious next
assert.equal(gate.shouldAutoRedirectFromLogin({ isAnonymous: true }), false);
assert.equal(safe.applyPreferredPostAuthPath("/admin", ADMIN_EMAIL), "/admin");
assert.equal(
  safe.applyPreferredPostAuthPath("https://evil.example", ADMIN_EMAIL),
  safe.COMPLETE_POST_AUTH_PATH,
);

const logoutSrc = fs.readFileSync(path.join(root, "src/lib/auth/logout.ts"), "utf8");
assert.match(logoutSrc, /signOut\(auth\)/);
const enterAnon = fs.readFileSync(path.join(root, "src/lib/auth/enterAnonymousMode.ts"), "utf8");
assert.match(enterAnon, /enterAnonymousMode/);

console.log(
  JSON.stringify(
    {
      gate: "LOGIN_ERRORS_PASSWORD_RESET",
      pass: true,
      noEnumeration: true,
      forgotPasswordWired: true,
      safeNextPreserved: true,
      anonGatePreserved: true,
    },
    null,
    2,
  ),
);
