/**
 * Next.js 16 (Turbopack) leaves a large `.next/dev` tree after `next build`.
 * Firebase Web Frameworks globs `.next/**` into the SSR function bundle, so this
 * dev-only folder bloats the Cloud Functions upload (~1.6 GB) and stalls deploy.
 */
import { existsSync } from "node:fs";
import { rm } from "node:fs/promises";
import { join } from "node:path";

const targets = [join(".next", "dev"), join(".next", "cache", "turbopack")];

for (const dir of targets) {
  if (!existsSync(dir)) continue;
  await rm(dir, { recursive: true, force: true });
  console.log(`[prune-next-dev-artifacts] removed ${dir}`);
}
