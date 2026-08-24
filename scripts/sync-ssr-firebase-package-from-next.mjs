/**
 * Force-regenerate `.firebase/<site>/functions` SSR tree from the current
 * local `.next` so zero-hash gates never skip / false-PASS on a missing or
 * stale packaged artifact.
 *
 * This is NOT "materialize hashed aliases". It copies the already-clean
 * `.next` (must already have zero firebase-admin-<hash>) into the packaged
 * functions directory Firebase uploads.
 */
import {
  cpSync,
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(import.meta.url);
const { collectHashedRefsFromDir } = require("./materialize-next-hashed-externals.cjs");

const SITE = "sayittome-app";
const localNext = join(root, ".next");
const localServer = join(localNext, "server");
const localBuildIdPath = join(localNext, "BUILD_ID");
const functionsDir = join(root, ".firebase", SITE, "functions");
const packagedNext = join(functionsDir, ".next");
const packagedServer = join(packagedNext, "server");
const packagedBuildIdPath = join(packagedNext, "BUILD_ID");

function fail(msg) {
  throw new Error(`[sync-ssr-firebase-package] ${msg}`);
}

if (!existsSync(localServer)) {
  fail("missing .next/server — run npm run build first");
}
if (!existsSync(localBuildIdPath)) {
  fail("missing .next/BUILD_ID");
}

const localRefs = [...collectHashedRefsFromDir(localServer)];
if (localRefs.length) {
  fail(`local .next/server still has hashed refs: ${localRefs.join(", ")}`);
}

const localBuildId = readFileSync(localBuildIdPath, "utf8").trim();
const rootPkg = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));

mkdirSync(join(root, ".firebase", SITE), { recursive: true });

// Wipe prior packaged functions (stale hashes must not linger).
if (existsSync(functionsDir)) {
  rmSync(functionsDir, { recursive: true, force: true });
}
mkdirSync(functionsDir, { recursive: true });

// Fresh copy of the clean Next output Firebase SSR will serve.
cpSync(localNext, packagedNext, { recursive: true });

const packagedPkg = {
  name: "sayittome-ssr",
  private: true,
  type: "commonjs",
  engines: { node: "20" },
  dependencies: {
    next: rootPkg.dependencies?.next || rootPkg.devDependencies?.next || "16.2.6",
    "firebase-admin": rootPkg.dependencies?.["firebase-admin"] || "^14.1.0",
    "firebase-functions": rootPkg.dependencies?.["firebase-functions"] || "^6.3.2",
    react: rootPkg.dependencies?.react,
    "react-dom": rootPkg.dependencies?.["react-dom"],
  },
};
writeFileSync(join(functionsDir, "package.json"), `${JSON.stringify(packagedPkg, null, 2)}\n`);

// Minimal SSR entry placeholder — real deploy overwrites via prepareFrameworks;
// we only need .next/server present for the zero-hash gate before upload.
if (!existsSync(join(functionsDir, "server.js"))) {
  writeFileSync(
    join(functionsDir, "server.js"),
    `/** regenerated from local .next BUILD_ID=${localBuildId} */\nexports.ssr = true;\n`,
  );
}

const packagedBuildId = readFileSync(packagedBuildIdPath, "utf8").trim();
if (packagedBuildId !== localBuildId) {
  fail(`BUILD_ID mismatch after copy local=${localBuildId} packaged=${packagedBuildId}`);
}

const packagedRefs = [...collectHashedRefsFromDir(packagedServer)];
if (packagedRefs.length) {
  fail(`packaged .next/server has hashed refs after sync: ${packagedRefs.join(", ")}`);
}

console.log(
  JSON.stringify(
    {
      gate: "SYNC_SSR_FIREBASE_PACKAGE_FROM_NEXT",
      pass: true,
      site: SITE,
      buildId: localBuildId,
      functionsDir,
      localHashedRefs: localRefs,
      packagedHashedRefs: packagedRefs,
      materializeIsNotPass: true,
    },
    null,
    2,
  ),
);
