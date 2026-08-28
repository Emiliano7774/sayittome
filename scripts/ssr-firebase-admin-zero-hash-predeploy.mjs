/**
 * Hosting predeploy gate (AFTER firebase prepareFrameworks, BEFORE upload).
 * Read-only validation of the REAL `.firebase/<site>/functions` package.
 * Never syncs from local .next, never writes stub entry/package placeholders.
 */
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  DEFAULT_SITE,
  assertLocalNextPreflight,
  assertPreparedFirebaseFunctionsPackage,
} from "./ssr-firebase-package-guard.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(import.meta.url);
const { collectHashedRefsFromDir } = require("./materialize-next-hashed-externals.cjs");

const localPreflight = assertLocalNextPreflight(root, collectHashedRefsFromDir);
const prepared = assertPreparedFirebaseFunctionsPackage(root, collectHashedRefsFromDir, DEFAULT_SITE);

console.log(
  JSON.stringify(
    {
      gate: "SSR_FIREBASE_ADMIN_ZERO_HASH_PREDEPLOY",
      pass: true,
      materializeIsNotPass: true,
      firebasePackageRequired: true,
      localBuildId: localPreflight.localBuildId,
      packagedBuildId: prepared.packagedBuildId,
      buildIdCoherent:
        prepared.packagedBuildId === localPreflight.localBuildId
          ? "same_build"
          : "distinct_prepareFrameworks_build_ok",
      syncRan: false,
      packagedRefs: prepared.packagedRefs,
      releaseSha: prepared.buildRelease.packaged.sha,
      releaseBuiltAt: prepared.buildRelease.packaged.builtAt,
      packageMain: prepared.packageMeta.main,
    },
    null,
    2,
  ),
);
