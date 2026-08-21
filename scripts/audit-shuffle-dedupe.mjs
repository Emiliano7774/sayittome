/**
 * Shuffle dedupe audit — runs the real UID-canonical module.
 * Usage: node --experimental-strip-types scripts/audit-shuffle-dedupe.mjs
 */
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const harnesses = [
  "scripts/shuffle-dedupe.harness.mjs",
  "scripts/shuffle-visible-identity.harness.mjs",
];

for (const harness of harnesses) {
  const result = spawnSync(
    process.execPath,
    ["--experimental-strip-types", path.join(root, harness)],
    { stdio: "inherit", cwd: root },
  );
  if (result.status) process.exit(result.status);
}
process.exit(0);
