/**
 * SSR_FIREBASE_ADMIN_ZERO_HASH — local read-only preflight BEFORE Firebase CLI.
 *
 * Validates local `.next/server` only. Does NOT mutate `.firebase` or create stubs.
 * Real packaged validation runs in ssr-firebase-admin-zero-hash-predeploy.mjs
 * after prepareFrameworks (prepareFrameworks → predeploy → upload).
 */
import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

import { assertLocalNextPreflight } from "./ssr-firebase-package-guard.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const { createRequire } = await import("node:module");
const require = createRequire(import.meta.url);
const { collectHashedRefsFromDir } = require("./materialize-next-hashed-externals.cjs");

const FIREBASE_ADMIN_LITERAL =
  /from\s+["']firebase-admin(?:\/[^"']*)?["']|import\s*\(\s*["']firebase-admin(?:\/[^"']*)?["']\s*\)|require\s*\(\s*["']firebase-admin(?:\/[^"']*)?["']\s*\)/;

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

const local = assertLocalNextPreflight(root, collectHashedRefsFromDir);

const nextConfig = readFileSync(join(root, "next.config.ts"), "utf8");
assert.match(nextConfig, /serverExternalPackages/);

const firebaseJson = JSON.parse(readFileSync(join(root, "firebase.json"), "utf8"));
const predeploy = firebaseJson.hosting?.predeploy || [];
assert.ok(
  predeploy.some((s) => String(s).includes("ssr-firebase-admin-zero-hash")),
  "firebase.json hosting.predeploy must run zero-hash gate",
);

const predeploySrc = readFileSync(
  join(root, "scripts/ssr-firebase-admin-zero-hash-predeploy.mjs"),
  "utf8",
);
assert.doesNotMatch(
  predeploySrc,
  /sync-ssr-firebase-package-from-next/,
  "predeploy must not invoke sync before upload",
);

const guardHarness = spawnSync(
  process.execPath,
  [join(root, "scripts/ssr-firebase-package-guard.harness.mjs")],
  { cwd: root, encoding: "utf8" },
);
assert.equal(
  guardHarness.status,
  0,
  `package guard harness failed:\n${guardHarness.stdout}\n${guardHarness.stderr}`,
);

console.log(
  JSON.stringify(
    {
      gate: "SSR_FIREBASE_ADMIN_ZERO_HASH",
      pass: true,
      phase: "local_preflight_read_only",
      hashedRefsInNextServer: local.localRefs,
      buildId: local.localBuildId,
      syncRan: false,
      staticSrcHits: staticHits,
      materializeIsNotPass: true,
      firebasePackageRequired: true,
      packagedValidation: "deferred_to_predeploy_after_prepareFrameworks",
    },
    null,
    2,
  ),
);
