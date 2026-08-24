/**
 * SSR_FIREBASE_ADMIN_EXTERNALS
 * Guards Turbopack hashed firebase-admin aliases that break Firebase SSR.
 * Firebase Hosting frameworks runs `next build` (not npm scripts); the
 * node_modules/.bin/next shim must materialize aliases after every build.
 */
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import {
  existsSync,
  lstatSync,
  readFileSync,
  readdirSync,
  readlinkSync,
} from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const pkg = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));

assert.match(
  String(pkg.scripts?.postinstall || ""),
  /install-next-ssr-bin/,
  "postinstall must install next bin shim (Firebase ignores npm postbuild)",
);
assert.ok(existsSync(join(root, "scripts/bin-next/next")));
assert.ok(existsSync(join(root, "scripts/materialize-next-hashed-externals.cjs")));
assert.ok(existsSync(join(root, "scripts/install-next-ssr-bin.mjs")));

const nextConfig = readFileSync(join(root, "next.config.ts"), "utf8");
assert.match(nextConfig, /serverExternalPackages/);
assert.match(nextConfig, /firebase-admin/);

const shimSrc = readFileSync(join(root, "scripts/bin-next/next"), "utf8");
assert.match(shimSrc, /materializeNextHashedExternals/);
assert.match(shimSrc, /args\[0\] === "build"/);

const HASHED = /firebase-admin-[a-f0-9]{12,}/gi;

function collectHashedRefs(dir, out = new Set()) {
  if (!existsSync(dir)) return out;
  for (const name of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, name.name);
    if (name.isDirectory()) {
      collectHashedRefs(p, out);
      continue;
    }
    if (!name.name.endsWith(".js")) continue;
    const text = readFileSync(p, "utf8");
    for (const match of text.matchAll(HASHED)) out.add(match[0]);
  }
  return out;
}

function assertAliasMaterialized(baseDir, alias) {
  const aliasPath = join(baseDir, ".next", "node_modules", alias);
  assert.ok(existsSync(aliasPath), `missing alias ${alias} under ${baseDir}`);
  const st = lstatSync(aliasPath);
  assert.equal(
    st.isSymbolicLink(),
    false,
    `hashed alias ${alias} must be a real directory (not symlink) for GCF`,
  );
  // Resolve like Turbopack runtime: from a server chunk, walk up to .next/node_modules.
  const req = createRequire(join(baseDir, ".next", "server", "chunks", "probe.cjs"));
  const resolved = req.resolve(`${alias}/app`);
  assert.ok(resolved.includes(alias), `resolved ${alias}/app → ${resolved}`);
  req(`${alias}/app`);
}

const serverDir = join(root, ".next", "server");
assert.ok(existsSync(serverDir), ".next/server missing — run npm run build first");

const refs = [...collectHashedRefs(serverDir)];
assert.ok(refs.length >= 1, "expected turbopack hashed firebase-admin refs in server chunks");
for (const alias of refs) {
  assertAliasMaterialized(root, alias);
}

const packaged = join(root, ".firebase", "sayittome-app", "functions");
let packagedRefs = [];
if (existsSync(join(packaged, "package.json"))) {
  const packagedPkg = JSON.parse(readFileSync(join(packaged, "package.json"), "utf8"));
  assert.ok(packagedPkg.dependencies?.["firebase-admin"]);
  packagedRefs = [...collectHashedRefs(join(packaged, ".next", "server"))];
  if (packagedRefs.length) {
    const require = createRequire(import.meta.url);
    const { materializeNextHashedExternals } = require("./materialize-next-hashed-externals.cjs");
    materializeNextHashedExternals({
      nextNodeModules: join(packaged, ".next", "node_modules"),
    });
    for (const alias of packagedRefs) {
      assertAliasMaterialized(packaged, alias);
    }
  }
}

console.log(
  JSON.stringify(
    {
      gate: "SSR_FIREBASE_ADMIN_EXTERNALS",
      pass: true,
      hashedRefsInNextServer: refs,
      materialized: true,
      packagedHashedRefs: packagedRefs,
    },
    null,
    2,
  ),
);
