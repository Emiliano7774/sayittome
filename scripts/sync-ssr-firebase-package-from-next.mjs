/**
 * TEST-ONLY selective `.next` copy — import from fixture harness only.
 *
 * NEVER run during deploy preflight/predeploy. Firebase CLI owns entry/package
 * after prepareFrameworks. Copies ONLY `functions/.next` and preserves wrapper
 * files byte-identical. No CLI entrypoint on repo `.firebase`.
 */
import { cpSync, existsSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { createRequire } from "node:module";

import { assertPathContainedInRoot, readFunctionsMainEntry, sha256File } from "./ssr-firebase-package-guard.mjs";

const require = createRequire(import.meta.url);
const { collectHashedRefsFromDir } = require("./materialize-next-hashed-externals.cjs");

function fail(msg) {
  throw new Error(`[sync-ssr-firebase-package] ${msg}`);
}

/**
 * Copy only functions/.next from local build. Preserves wrapper files byte-identical.
 * @param {string} sandboxRoot - all rmSync targets must resolve inside this root
 */
export function selectiveCopyNextOnly(functionsDir, localNext, sandboxRoot) {
  if (!sandboxRoot) {
    fail("sandboxRoot required — refuse rmSync without validated containment root");
  }
  assertPathContainedInRoot(functionsDir, sandboxRoot);

  if (!existsSync(join(localNext, "server"))) {
    fail("missing .next/server in source");
  }
  if (!existsSync(join(localNext, "BUILD_ID"))) {
    fail("missing .next/BUILD_ID in source");
  }

  const localRefs = [...collectHashedRefsFromDir(join(localNext, "server"))];
  if (localRefs.length) {
    fail(`local .next/server still has hashed refs: ${localRefs.join(", ")}`);
  }

  const preserved = {};
  const pkgPath = join(functionsDir, "package.json");
  if (existsSync(pkgPath)) {
    preserved["package.json"] = sha256File(pkgPath);
    try {
      const { mainRel } = readFunctionsMainEntry({
        functionsDir,
        packageJson: pkgPath,
      });
      const mainPath = join(functionsDir, mainRel);
      if (existsSync(mainPath)) preserved[mainRel] = sha256File(mainPath);
    } catch {
      /* package invalid — copy still allowed in fixture harness */
    }
  }
  for (const rel of ["server.js", "index.js"]) {
    if (preserved[rel]) continue;
    const p = join(functionsDir, rel);
    if (existsSync(p)) preserved[rel] = sha256File(p);
  }

  const packagedNext = join(functionsDir, ".next");
  assertPathContainedInRoot(packagedNext, sandboxRoot);
  if (existsSync(packagedNext)) {
    rmSync(packagedNext, { recursive: true, force: true });
  }
  cpSync(localNext, packagedNext, { recursive: true });

  for (const [rel, beforeHash] of Object.entries(preserved)) {
    const p = join(functionsDir, rel);
    if (!existsSync(p)) {
      fail(`expected preserved ${rel} missing after selective .next copy`);
    }
    const afterHash = sha256File(p);
    if (afterHash !== beforeHash) {
      fail(`${rel} changed after selective .next copy (expected byte-identical wrapper)`);
    }
  }

  const packagedBuildId = readFileSync(join(packagedNext, "BUILD_ID"), "utf8").trim();
  const localBuildId = readFileSync(join(localNext, "BUILD_ID"), "utf8").trim();
  if (!packagedBuildId) {
    fail("empty BUILD_ID after selective .next copy");
  }
  if (packagedBuildId !== localBuildId) {
    fail(`BUILD_ID mismatch after copy local=${localBuildId} packaged=${packagedBuildId}`);
  }

  return { preserved: Object.keys(preserved), packagedBuildId, localBuildId, localRefs };
}
