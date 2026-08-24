/**
 * SSR_FIREBASE_ADMIN_ZERO_HASH
 * FAIL CLOSED:
 *  1) local .next/server must have ZERO firebase-admin-<hash>
 *  2) .firebase/<site>/functions must exist and match local BUILD_ID
 *     (stale/missing package → sync from current .next, then re-assert;
 *     never PASS by skipping .firebase)
 * Materializing hashed aliases is NOT a PASS.
 */
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(import.meta.url);
const { collectHashedRefsFromDir } = require("./materialize-next-hashed-externals.cjs");

const SITE = "sayittome-app";
const FIREBASE_ADMIN_HASHED = /firebase-admin-[a-f0-9]+/gi;
const FIREBASE_ADMIN_LITERAL =
  /from\s+["']firebase-admin(?:\/[^"']*)?["']|import\s*\(\s*["']firebase-admin(?:\/[^"']*)?["']\s*\)|require\s*\(\s*["']firebase-admin(?:\/[^"']*)?["']\s*\)/;

function collectRefs(dir) {
  return [...collectHashedRefsFromDir(dir)];
}

function rawScan(dir, out = []) {
  if (!existsSync(dir)) return out;
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
    const matches = text.match(FIREBASE_ADMIN_HASHED);
    if (matches) out.push(...matches);
  }
  return out;
}

function assertZeroHashedRefs(label, dir) {
  if (!existsSync(dir)) {
    throw new Error(`${label}: missing ${dir}`);
  }
  const refs = collectRefs(dir);
  const raw = [...new Set(rawScan(dir))];
  const all = [...new Set([...refs, ...raw])];
  assert.equal(
    all.length,
    0,
    `${label}: expected ZERO firebase-admin-<hash> refs, found: ${all.join(", ")}`,
  );
  return all;
}

function scanSrcForStaticAdminImports() {
  const hits = [];
  function walk(dir) {
    if (!existsSync(dir)) return;
    for (const name of readdirSync(dir, { withFileTypes: true })) {
      const p = join(dir, name.name);
      if (name.isDirectory()) {
        if (name.name === "node_modules" || name.name === ".next") continue;
        walk(p);
        continue;
      }
      if (!/\.(ts|tsx|js|mjs|cjs)$/.test(name.name)) continue;
      if (p.includes(`${join("lib", "admin", "firebaseAdminNative")}`)) continue;
      const text = readFileSync(p, "utf8");
      if (FIREBASE_ADMIN_LITERAL.test(text)) {
        hits.push(p.replace(root + "\\", "").replace(root + "/", ""));
      }
      FIREBASE_ADMIN_LITERAL.lastIndex = 0;
    }
  }
  walk(join(root, "src"));
  return hits;
}

const nativeSrc = readFileSync(join(root, "src/lib/admin/firebaseAdminNative.ts"), "utf8");
assert.match(nativeSrc, /createRequire|Function\("return require"\)/);
assert.doesNotMatch(
  nativeSrc,
  /from\s+["']firebase-admin|import\s*\(\s*["']firebase-admin|require\s*\(\s*["']firebase-admin/,
  "firebaseAdminNative must not contain static firebase-admin literals",
);

const staticHits = scanSrcForStaticAdminImports();
assert.equal(
  staticHits.length,
  0,
  `src must not statically import firebase-admin; use firebaseAdminNative. hits: ${staticHits.join(", ")}`,
);

const serverDir = join(root, ".next", "server");
assert.ok(existsSync(serverDir), ".next/server missing — run npm run build first");
const localRefs = assertZeroHashedRefs("local .next/server", serverDir);
const localBuildId = readFileSync(join(root, ".next", "BUILD_ID"), "utf8").trim();

const packagedServer = join(root, ".firebase", SITE, "functions", ".next", "server");
const packagedBuildIdPath = join(root, ".firebase", SITE, "functions", ".next", "BUILD_ID");

function packagedIsFresh() {
  if (!existsSync(packagedServer) || !existsSync(packagedBuildIdPath)) return false;
  const packagedBuildId = readFileSync(packagedBuildIdPath, "utf8").trim();
  return packagedBuildId === localBuildId;
}

let syncRan = false;
if (!packagedIsFresh()) {
  // Missing OR stale (old BUILD_ID / old hashed chunks) → force rebuild from current .next
  const sync = spawnSync(
    process.execPath,
    [join(root, "scripts/sync-ssr-firebase-package-from-next.mjs")],
    { cwd: root, encoding: "utf8" },
  );
  if (sync.status !== 0) {
    throw new Error(
      `failed to sync .firebase package from .next:\n${sync.stdout || ""}\n${sync.stderr || ""}`,
    );
  }
  syncRan = true;
}

assert.ok(
  existsSync(packagedServer),
  `.firebase/${SITE}/functions/.next/server missing after sync — refuse false PASS`,
);
const packagedBuildId = readFileSync(packagedBuildIdPath, "utf8").trim();
assert.equal(
  packagedBuildId,
  localBuildId,
  `stale .firebase package BUILD_ID=${packagedBuildId} !== local ${localBuildId}`,
);
const packagedRefs = assertZeroHashedRefs(`packaged ${SITE} .next/server`, packagedServer);

const nextConfig = readFileSync(join(root, "next.config.ts"), "utf8");
assert.match(nextConfig, /serverExternalPackages/);

const firebaseJson = JSON.parse(readFileSync(join(root, "firebase.json"), "utf8"));
const predeploy = firebaseJson.hosting?.predeploy || [];
assert.ok(
  predeploy.some((s) => String(s).includes("ssr-firebase-admin-zero-hash")),
  "firebase.json hosting.predeploy must run zero-hash gate",
);

console.log(
  JSON.stringify(
    {
      gate: "SSR_FIREBASE_ADMIN_ZERO_HASH",
      pass: true,
      hashedRefsInNextServer: localRefs,
      packagedHashedRefs: packagedRefs,
      buildId: localBuildId,
      packagedBuildId,
      syncRan,
      staticSrcHits: staticHits,
      materializeIsNotPass: true,
      firebasePackageRequired: true,
    },
    null,
    2,
  ),
);
