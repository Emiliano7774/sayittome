/**
 * Fixture tests for SSR Firebase functions package guard.
 * Uses temp dirs only — never mutates repo `.firebase` entry/package.
 */
import assert from "node:assert/strict";
import { cpSync, existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

import {
  assertPathContainedInRoot,
  assertPreparedFirebaseFunctionsPackage,
  functionsPaths,
  isStubFunctionsPackage,
  isStubPackageJsonText,
  isStubServerJsText,
  parseBuildReleaseJson,
  sha256File,
} from "./ssr-firebase-package-guard.mjs";
import { selectiveCopyNextOnly } from "./sync-ssr-firebase-package-from-next.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(import.meta.url);
const { collectHashedRefsFromDir } = require("./materialize-next-hashed-externals.cjs");
const systemTmp = tmpdir();

/** Real 149-style wrapper: main server.js, onRequest → firebase-frameworks (no index.js). */
const REAL149_SERVER_WRAPPER =
  'const { onRequest } = require("firebase-functions/v2/https");\n' +
  'const server = require("firebase-frameworks");\n' +
  "exports.ssrsayittomeapp = onRequest(server);\n";

const tempDirs = [];
function makeTemp(prefix) {
  const dir = mkdtempSync(join(systemTmp, prefix));
  assertPathContainedInRoot(dir, systemTmp);
  tempDirs.push(dir);
  return dir;
}

function writeBuildRelease(baseRoot, relDir, sha, builtAt) {
  const dir = join(baseRoot, relDir);
  mkdirSync(dir, { recursive: true });
  writeFileSync(
    join(dir, "build-release.json"),
    `${JSON.stringify({ sha, builtAt, source: "fixture" }, null, 2)}\n`,
  );
}

function seedWrapper149(baseRoot, site, { includeIndex = false } = {}) {
  const paths = functionsPaths(baseRoot, site);
  mkdirSync(paths.functionsDir, { recursive: true });
  writeFileSync(
    paths.packageJson,
    `${JSON.stringify(
      {
        name: "firebase-frameworks-sayittome-app",
        private: true,
        main: "server.js",
        engines: { node: "22" },
        dependencies: { "firebase-functions": "^6.3.2", "firebase-frameworks": "0.0.0-fixture" },
      },
      null,
      2,
    )}\n`,
  );
  writeFileSync(paths.serverJs, REAL149_SERVER_WRAPPER);
  if (includeIndex) {
    writeFileSync(
      paths.indexJs,
      `"use strict";\nmodule.exports = { ssrsayittomeapp: () => require("./server") };\n`,
    );
  }
  return paths;
}

function expectReject(fn, pattern) {
  let rejected = false;
  try {
    fn();
  } catch (error) {
    rejected = true;
    assert.match(String(error?.message || error), pattern);
  }
  assert.equal(rejected, true);
}

try {
  const localNext = join(root, ".next");
  assert.ok(existsSync(join(localNext, "server")), "run npm run build before package guard harness");

  const localRelease = existsSync(join(root, "public/build-release.json"))
    ? JSON.parse(readFileSync(join(root, "public/build-release.json"), "utf8"))
    : { sha: "fixturesha", builtAt: "2026-08-28T00:00:00.000Z" };

  const tempRoot = makeTemp("ssr-pkg-guard-");
  const site = "fixture-site";
  const paths = seedWrapper149(tempRoot, site);
  assert.ok(!existsSync(paths.indexJs), "149-style fixture has no index.js");
  writeBuildRelease(tempRoot, "public", localRelease.sha, localRelease.builtAt);
  writeBuildRelease(tempRoot, join(".firebase", site, "functions", "public"), localRelease.sha, localRelease.builtAt);

  const beforePackage = sha256File(paths.packageJson);
  const beforeServer = sha256File(paths.serverJs);

  const copy = selectiveCopyNextOnly(paths.functionsDir, localNext, tempRoot);
  assert.deepEqual(copy.preserved.sort(), ["package.json", "server.js"]);
  assert.equal(sha256File(paths.packageJson), beforePackage);
  assert.equal(sha256File(paths.serverJs), beforeServer);

  const prepared = assertPreparedFirebaseFunctionsPackage(tempRoot, collectHashedRefsFromDir, site);
  assert.ok(prepared.packagedBuildId.length > 0);
  assert.equal(prepared.packageMeta.main, "server.js");
  assert.equal(prepared.buildRelease.local.sha, localRelease.sha);

  const repoPkg = join(root, ".firebase", "sayittome-app", "functions", "package.json");
  if (existsSync(repoPkg)) {
    try {
      const repoMeta = assertPreparedFirebaseFunctionsPackage(root, collectHashedRefsFromDir, "sayittome-app");
      assert.equal(repoMeta.packageMeta.main, "server.js");
    } catch (error) {
      const msg = String(error?.message || error);
      if (!msg.includes("build-release")) throw error;
    }
  }

  expectReject(() => {
    const stubRoot = makeTemp("ssr-pkg-stub-");
    const stubPaths = seedWrapper149(stubRoot, site);
    writeBuildRelease(stubRoot, "public", localRelease.sha, localRelease.builtAt);
    writeFileSync(
      stubPaths.packageJson,
      `${JSON.stringify({ name: "sayittome-ssr", private: true }, null, 2)}\n`,
    );
    cpSync(localNext, stubPaths.packagedNext, { recursive: true });
    writeBuildRelease(stubRoot, join(".firebase", site, "functions", "public"), localRelease.sha, localRelease.builtAt);
    assertPreparedFirebaseFunctionsPackage(stubRoot, collectHashedRefsFromDir, site);
  }, /stub sayittome-ssr/);

  expectReject(() => {
    const missingRoot = makeTemp("ssr-pkg-missing-main-");
    const missingPaths = functionsPaths(missingRoot, site);
    mkdirSync(missingPaths.functionsDir, { recursive: true });
    writeFileSync(
      missingPaths.packageJson,
      `${JSON.stringify({ name: "fixture", private: true }, null, 2)}\n`,
    );
    cpSync(localNext, missingPaths.packagedNext, { recursive: true });
    writeBuildRelease(missingRoot, "public", localRelease.sha, localRelease.builtAt);
    writeBuildRelease(
      missingRoot,
      join(".firebase", site, "functions", "public"),
      localRelease.sha,
      localRelease.builtAt,
    );
    assertPreparedFirebaseFunctionsPackage(missingRoot, collectHashedRefsFromDir, site);
  }, /main file missing/);

  expectReject(() => {
    const emptyBidRoot = makeTemp("ssr-pkg-empty-bid-");
    const p = seedWrapper149(emptyBidRoot, site);
    cpSync(localNext, p.packagedNext, { recursive: true });
    writeFileSync(p.packagedBuildId, "\n");
    writeBuildRelease(emptyBidRoot, "public", localRelease.sha, localRelease.builtAt);
    writeBuildRelease(emptyBidRoot, join(".firebase", site, "functions", "public"), localRelease.sha, localRelease.builtAt);
    assertPreparedFirebaseFunctionsPackage(emptyBidRoot, collectHashedRefsFromDir, site);
  }, /empty functions\/\.next\/BUILD_ID/);

  expectReject(() => {
    const badPkgRoot = makeTemp("ssr-pkg-bad-json-");
    const p = seedWrapper149(badPkgRoot, site);
    writeFileSync(p.packageJson, "{ not-json");
    cpSync(localNext, p.packagedNext, { recursive: true });
    writeBuildRelease(badPkgRoot, "public", localRelease.sha, localRelease.builtAt);
    writeBuildRelease(badPkgRoot, join(".firebase", site, "functions", "public"), localRelease.sha, localRelease.builtAt);
    assertPreparedFirebaseFunctionsPackage(badPkgRoot, collectHashedRefsFromDir, site);
  }, /invalid package\.json JSON/);

  expectReject(() => {
    const placeholderRoot = makeTemp("ssr-pkg-placeholder-main-");
    const p = seedWrapper149(placeholderRoot, site);
    writeFileSync(
      p.packageJson,
      `${JSON.stringify({ name: "firebase-frameworks-fixture", private: true, main: "server.js" }, null, 2)}\n`,
    );
    writeFileSync(p.serverJs, `/** regenerated from local .next BUILD_ID=x */\nexports.ssr = true;\n`);
    cpSync(localNext, p.packagedNext, { recursive: true });
    writeBuildRelease(placeholderRoot, "public", localRelease.sha, localRelease.builtAt);
    writeBuildRelease(
      placeholderRoot,
      join(".firebase", site, "functions", "public"),
      localRelease.sha,
      localRelease.builtAt,
    );
    assertPreparedFirebaseFunctionsPackage(placeholderRoot, collectHashedRefsFromDir, site);
  }, /placeholder detected/);

  expectReject(() => {
    const staleRoot = makeTemp("ssr-pkg-stale-");
    const p = seedWrapper149(staleRoot, site);
    cpSync(localNext, p.packagedNext, { recursive: true });
    writeBuildRelease(staleRoot, "public", localRelease.sha, localRelease.builtAt);
    writeBuildRelease(
      staleRoot,
      join(".firebase", site, "functions", "public"),
      "deadbeef",
      localRelease.builtAt,
    );
    assertPreparedFirebaseFunctionsPackage(staleRoot, collectHashedRefsFromDir, site);
  }, /stale packaged build-release sha=/);

  expectReject(() => {
    const missingReleaseRoot = makeTemp("ssr-pkg-no-release-");
    const p = seedWrapper149(missingReleaseRoot, site);
    cpSync(localNext, p.packagedNext, { recursive: true });
    writeBuildRelease(missingReleaseRoot, "public", localRelease.sha, localRelease.builtAt);
    assertPreparedFirebaseFunctionsPackage(missingReleaseRoot, collectHashedRefsFromDir, site);
  }, /missing functions\/public\/build-release\.json/);

  expectReject(() => parseBuildReleaseJson("{", "fixture"), /invalid build-release\.json JSON/);

  expectReject(() => {
    assertPathContainedInRoot(join(tempRoot, "..", "escape"), tempRoot);
  }, /path escape/);

  expectReject(() => {
    selectiveCopyNextOnly(paths.functionsDir, localNext, undefined);
  }, /sandboxRoot required/);

  assert.equal(isStubPackageJsonText('{"name":"sayittome-ssr"}'), true);
  assert.equal(
    isStubServerJsText(`/** regenerated from local .next BUILD_ID=x */\nexports.ssr = true;\n`),
    true,
  );
  assert.equal(isStubFunctionsPackage({ packageJson: "/nope", serverJs: "/nope" }), false);

  const externalsSrc = readFileSync(join(root, "scripts/ssr-firebase-admin-externals.harness.mjs"), "utf8");
  assert.doesNotMatch(
    externalsSrc,
    /spawnSync[\s\S]{0,200}sync-ssr-firebase-package-from-next/,
    "local preflight harness must not spawn destructive sync before Firebase CLI",
  );

  const syncSrc = readFileSync(join(root, "scripts/sync-ssr-firebase-package-from-next.mjs"), "utf8");
  assert.doesNotMatch(syncSrc, /isDirectHarnessInvocation|--next-only/);

  console.log(
    JSON.stringify({
      gate: "SSR_FIREBASE_PACKAGE_GUARD",
      pass: true,
      scenarios: {
        real149MainServerJs: "pass_without_index_js",
        selectiveNextPreservesWrapper: "byte_identical_package_server",
        stubPackageRejected: true,
        missingMainFileRejected: true,
        placeholderMainRejected: true,
        emptyBuildIdRejected: true,
        invalidPackageJsonRejected: true,
        staleBuildReleaseRejected: true,
        missingPackagedBuildReleaseRejected: true,
        invalidBuildReleaseJsonRejected: true,
        pathEscapeRejected: true,
      },
      activateGates: false,
    }),
  );
} finally {
  for (const dir of tempDirs) {
    assertPathContainedInRoot(dir, systemTmp);
    try {
      rmSync(dir, { recursive: true, force: true });
    } catch {
      /* best-effort temp cleanup */
    }
  }
}
