/**
 * Chat message authorship invariants — imports production authorshipGates.
 *
 * Usage: node --experimental-strip-types scripts/chat-message-authorship.harness.mjs
 */
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const child = spawnSync(
  process.execPath,
  ["--experimental-strip-types", path.join(root, "scripts/chat-authorship-gates.harness.mjs")],
  { stdio: "inherit" },
);
process.exit(child.status ?? 1);
