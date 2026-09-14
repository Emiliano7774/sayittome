/**
 * PROFILE_ANON_ABUSE_SECURITY — thin wrapper; behavioral A/B/C lives in scope harness.
 *   node --experimental-strip-types scripts/profile-anon-abuse-security.harness.mjs
 */
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const scope = path.join(root, "scripts/profile-anon-abuse-scope.harness.mjs");
const result = spawnSync(process.execPath, ["--experimental-strip-types", scope], {
  cwd: root,
  stdio: "inherit",
  env: process.env,
});
process.exit(result.status ?? 1);
