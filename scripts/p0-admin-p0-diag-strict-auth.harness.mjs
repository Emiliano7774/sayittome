/**
 * P0_ADMIN_P0_DIAG_STRICT_AUTH — SDK-only guard for p0-abuse-config / p0-ip-trust-* routes.
 * Stubs verifyIdToken (revoked, non-admin, infra) — no real Firebase users.
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { installHarnessAlias, installHarnessWindow } from "./harness-alias.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
installHarnessWindow();
installHarnessAlias(root);

const strict = await import(
  pathToFileURL(path.join(root, "src/lib/admin/verifyAdminP0DiagStrict.ts")).href
);
const strictSrc = fs.readFileSync(
  path.join(root, "src/lib/admin/verifyAdminP0DiagStrict.ts"),
  "utf8",
);
const verifySrc = fs.readFileSync(path.join(root, "src/lib/admin/verifyAdminRequest.ts"), "utf8");

const routeFiles = [
  "src/app/api/admin/p0-abuse-config/route.ts",
  "src/app/api/admin/p0-ip-trust-echo/route.ts",
  "src/app/api/admin/p0-ip-trust-probe/route.ts",
];

for (const rel of routeFiles) {
  const src = fs.readFileSync(path.join(root, rel), "utf8");
  assert.match(src, /verifyAdminIdTokenStrictForP0Diag/);
  assert.doesNotMatch(src, /verifyAdminIdToken\(/);
}

assert.doesNotMatch(strictSrc, /identitytoolkit|verifyIdTokenViaIdentityToolkit/i);
assert.match(strictSrc, /verifyIdToken\(token, true\)|verifyIdToken\(idToken, checkRevoked\)/);
assert.doesNotMatch(verifySrc, /verifyAdminIdTokenStrictForP0Diag/);

const revokedErr = Object.assign(new Error("Firebase ID token has been revoked."), {
  code: "auth/id-token-revoked",
});
assert.deepEqual(strict.mapP0DiagStrictSdkError(revokedErr), {
  status: 401,
  error: "unauthorized",
});

const expiredErr = Object.assign(new Error("expired"), { code: "auth/id-token-expired" });
assert.deepEqual(strict.mapP0DiagStrictSdkError(expiredErr), {
  status: 401,
  error: "unauthorized",
});

const infraErr = Object.assign(new Error("network"), { code: "auth/network-request-failed" });
assert.deepEqual(strict.mapP0DiagStrictSdkError(infraErr), {
  status: 503,
  error: "unavailable",
});

let identityToolkitCalls = 0;
async function stubVerify(rejectWith) {
  return strict.verifyAdminTokenStrictWithDeps("stub-token", {
    verifyIdToken: async () => {
      throw rejectWith;
    },
  });
}

await assert.rejects(() => stubVerify(revokedErr), (error) => {
  assert.equal(error.status, 401);
  assert.equal(error.message, "unauthorized");
  return true;
});

await assert.rejects(
  () =>
    strict.verifyAdminTokenStrictWithDeps("stub-token", {
      verifyIdToken: async () => ({
        email: "other@gmail.com",
        uid: "uid_other",
        email_verified: true,
      }),
    }),
  (error) => {
    assert.equal(error.status, 403);
    assert.equal(error.message, "forbidden");
    return true;
  },
);

await assert.rejects(
  () =>
    strict.verifyAdminTokenStrictWithDeps("stub-token", {
      verifyIdToken: async () => ({
        email: "emilianomaturano@gmail.com",
        uid: "uid_admin",
        email_verified: false,
      }),
    }),
  (error) => {
    assert.equal(error.status, 401);
    return true;
  },
);

await assert.rejects(() => stubVerify(infraErr), (error) => {
  assert.equal(error.status, 503);
  assert.equal(error.message, "unavailable");
  return true;
});

// Guard: revoked must not be treated as infra (no fallback path exists in strict module).
assert.notEqual(strict.mapP0DiagStrictSdkError(revokedErr).status, 503);

console.log(
  JSON.stringify(
    {
      gate: "P0_ADMIN_P0_DIAG_STRICT_AUTH",
      pass: true,
      routes: routeFiles.map((f) => path.basename(path.dirname(f))),
      identityToolkitCalls,
      revokedMaps401: true,
      nonAdminMaps403: true,
      infraMaps503: true,
      activateGates: false,
    },
    null,
    2,
  ),
);
