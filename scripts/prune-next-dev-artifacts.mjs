/**
 * Next.js 16 (Turbopack) leaves a large `.next/dev` tree after `next build`.
 * Firebase Web Frameworks globs `.next/**` into the SSR function bundle, so this
 * dev-only folder bloats the Cloud Functions upload (~1.6 GB) and stalls deploy.
 */
import { existsSync } from "node:fs";
import { rm } from "node:fs/promises";
import { createRequire } from "node:module";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

const targets = [join(".next", "dev"), join(".next", "cache", "turbopack")];

for (const dir of targets) {
  if (!existsSync(dir)) continue;
  await rm(dir, { recursive: true, force: true });
  console.log(`[prune-next-dev-artifacts] removed ${dir}`);
}

// Zero-hash assert only — do NOT materialize aliases as a success path.
const require = createRequire(import.meta.url);
const { collectHashedRefsFromDir } = require("./materialize-next-hashed-externals.cjs");
const serverDir = join(".next", "server");
if (existsSync(serverDir)) {
  const refs = [...collectHashedRefsFromDir(serverDir)];
  if (refs.length) {
    console.error(
      `[prune-next-dev-artifacts] FAIL zero-hash: ${refs.join(", ")} — use firebaseAdminNative`,
    );
    process.exit(1);
  }
  console.log("[prune-next-dev-artifacts] zero-hash OK");
}

void pathToFileURL;
