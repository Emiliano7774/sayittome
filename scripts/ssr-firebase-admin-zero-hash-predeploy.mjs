/**
 * Hosting predeploy gate (AFTER firebase prepareFrameworks, BEFORE upload).
 * FAIL CLOSED:
 *  - packaged `.firebase/<site>/functions/.next/server` MUST exist
 *  - ZERO firebase-admin-<hash> inside it
 *  - if missing/stale vs local BUILD_ID → sync from current .next then re-assert
 * Never treats materialize or "local-only" as PASS.
 */
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(import.meta.url);
const { collectHashedRefsFromDir } = require("./materialize-next-hashed-externals.cjs");

const SITE = "sayittome-app";
const FIREBASE_ADMIN_HASHED = /firebase-admin-[a-f0-9]+/gi;

function rawScan(dir, out = []) {
  for (const name of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, name.name);
    if (name.isDirectory()) {
      rawScan(p, out);
      continue;
    }
    if (!name.name.endsWith(".js") && !name.name.endsWith(".json")) continue;
    let text;
    try {
      text = readFileSync(p, "utf8");
    } catch {
      continue;
    }
    const m = text.match(FIREBASE_ADMIN_HASHED);
    if (m) out.push(...m);
  }
  return out;
}

function assertZero(label, dir) {
  if (!existsSync(dir)) {
    throw new Error(`[ssr-zero-hash] ${label}: missing ${dir}`);
  }
  const refs = [...collectHashedRefsFromDir(dir)];
  const raw = [...new Set(rawScan(dir))];
  const all = [...new Set([...refs, ...raw])];
  if (all.length) {
    throw new Error(
      `[ssr-zero-hash] ${label}: ZERO firebase-admin-<hash> required; found: ${all.join(", ")}`,
    );
  }
  return all;
}

const localBuildIdPath = join(root, ".next", "BUILD_ID");
if (!existsSync(localBuildIdPath)) {
  throw new Error("[ssr-zero-hash] missing local .next/BUILD_ID");
}
const localBuildId = readFileSync(localBuildIdPath, "utf8").trim();
assertZero("local .next/server", join(root, ".next", "server"));

const packagedServer = join(root, ".firebase", SITE, "functions", ".next", "server");
const packagedBuildIdPath = join(root, ".firebase", SITE, "functions", ".next", "BUILD_ID");

function packagedIsFresh() {
  if (!existsSync(packagedServer) || !existsSync(packagedBuildIdPath)) return false;
  return readFileSync(packagedBuildIdPath, "utf8").trim() === localBuildId;
}

let syncRan = false;
if (!packagedIsFresh()) {
  const sync = spawnSync(
    process.execPath,
    [join(root, "scripts/sync-ssr-firebase-package-from-next.mjs")],
    { cwd: root, encoding: "utf8", stdio: "inherit" },
  );
  if (sync.status !== 0) {
    throw new Error("[ssr-zero-hash] sync from .next failed — refuse upload");
  }
  syncRan = true;
}

if (!existsSync(packagedServer)) {
  throw new Error(
    `[ssr-zero-hash] packaged ${SITE} functions missing after sync — refuse false PASS / upload`,
  );
}
const packagedBuildId = readFileSync(packagedBuildIdPath, "utf8").trim();
if (packagedBuildId !== localBuildId) {
  throw new Error(
    `[ssr-zero-hash] stale package BUILD_ID=${packagedBuildId} !== local ${localBuildId}`,
  );
}
const packagedRefs = assertZero(`packaged ${SITE}`, packagedServer);

console.log(
  JSON.stringify(
    {
      gate: "SSR_FIREBASE_ADMIN_ZERO_HASH_PREDEPLOY",
      pass: true,
      materializeIsNotPass: true,
      firebasePackageRequired: true,
      buildId: localBuildId,
      packagedBuildId,
      syncRan,
      packagedRefs,
    },
    null,
    2,
  ),
);
