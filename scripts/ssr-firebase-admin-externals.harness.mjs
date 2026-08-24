/**
 * SSR_FIREBASE_ADMIN_EXTERNALS
 * Guards Turbopack hashed firebase-admin aliases that break Firebase SSR.
 * Firebase Hosting frameworks runs next build (not npm scripts); the
 * node_modules/.bin/next shim must materialize aliases after every build.
 * Hosting predeploy must gate the packaged .firebase/<site>/functions artifact.
 */
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import {
  existsSync,
  lstatSync,
  readFileSync,
} from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(import.meta.url);
const pkg = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
const {
  discoverHashedExternals,
  assertHashedExternalsResolved,
  isRealPackageDir,
  collectHashedRefsFromDir,
} = require("./materialize-next-hashed-externals.cjs");

assert.match(
  String(pkg.scripts?.postinstall || ""),
  /install-next-ssr-bin/,
  "postinstall must install next bin shim (Firebase ignores npm postbuild)",
);
assert.ok(existsSync(join(root, "scripts/bin-next/next")));
assert.ok(existsSync(join(root, "scripts/materialize-next-hashed-externals.cjs")));
assert.ok(existsSync(join(root, "scripts/install-next-ssr-bin.mjs")));
assert.ok(existsSync(join(root, "scripts/materialize-ssr-functions-package.mjs")));

const firebaseJson = JSON.parse(readFileSync(join(root, "firebase.json"), "utf8"));
const predeploy = firebaseJson.hosting?.predeploy || [];
assert.ok(
  predeploy.some((s) => String(s).includes("materialize-ssr-functions-package")),
  "firebase.json hosting.predeploy must gate packaged SSR hashed externals",
);

const nextConfig = readFileSync(join(root, "next.config.ts"), "utf8");
assert.match(nextConfig, /serverExternalPackages/);
assert.match(nextConfig, /firebase-admin/);

const shimSrc = readFileSync(join(root, "scripts/bin-next/next"), "utf8");
assert.match(shimSrc, /materializeAndAssert|materializeNextHashedExternals/);
assert.match(shimSrc, /args\[0\] === "build"/);
assert.match(shimSrc, /materializeAndAssert/);

const serverDir = join(root, ".next", "server");
assert.ok(existsSync(serverDir), ".next/server missing — run npm run build first");

const refs = [...collectHashedRefsFromDir(serverDir)];
const discovery = discoverHashedExternals({ cwd: root });

// Webpack builds should ideally emit zero hashed refs. If any remain (Turbopack
// or residual), they MUST already be real dirs — do NOT silently materialize.
if (refs.length || discovery.entries.length) {
  const asserted = assertHashedExternalsResolved({ cwd: root });
  for (const alias of new Set([...refs, ...discovery.entries.map((e) => e.name)])) {
    assert.ok(
      isRealPackageDir(join(root, ".next", "node_modules", alias)),
      "hashed alias " + alias + " must be a real directory (not symlink) for GCF",
    );
  }
  assert.equal(asserted.resolved.length, discovery.entries.length);
}

const packaged = join(root, ".firebase", "sayittome-app", "functions");
let packagedRefs = [];
if (existsSync(join(packaged, "package.json"))) {
  const packagedPkg = JSON.parse(readFileSync(join(packaged, "package.json"), "utf8"));
  assert.ok(
    packagedPkg.dependencies?.["firebase-admin"] || packagedPkg.dependencies?.next,
    "packaged SSR function must declare runtime deps",
  );
  packagedRefs = [...collectHashedRefsFromDir(join(packaged, ".next", "server"))];
  if (packagedRefs.length) {
    // FAIL closed — do not auto-fix here; predeploy gate must have materialized.
    assertHashedExternalsResolved({
      cwd: root,
      nextRoot: join(packaged, ".next"),
      nextNodeModules: join(packaged, ".next", "node_modules"),
    });
    for (const alias of packagedRefs) {
      const aliasPath = join(packaged, ".next", "node_modules", alias);
      assert.ok(isRealPackageDir(aliasPath), "packaged alias " + alias + " must be real dir");
      const st = lstatSync(aliasPath);
      assert.equal(st.isSymbolicLink(), false, "packaged " + alias + " must not be symlink");
    }
  }
}

console.log(
  JSON.stringify(
    {
      gate: "SSR_FIREBASE_ADMIN_EXTERNALS",
      pass: true,
      hashedRefsInNextServer: refs,
      discovered: discovery.entries.map((e) => e.name),
      webpackPreferred: false,
      materializeAssertAfterBuild: /materializeAndAssert/.test(shimSrc),
      packagedHashedRefs: packagedRefs,
      packagedPresent: existsSync(join(packaged, "package.json")),
    },
    null,
    2,
  ),
);
