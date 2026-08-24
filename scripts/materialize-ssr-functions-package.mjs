/**
 * Hosting predeploy gate (runs AFTER firebase prepareFrameworks, BEFORE upload).
 * Materializes Turbopack hashed firebase-admin-* aliases inside the packaged
 * SSR Cloud Function and FAILS deploy if any remain unresolved for Linux Node.
 */
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(import.meta.url);
const {
  materializeAndAssert,
  discoverHashedExternals,
  collectHashedRefsFromDir,
} = require("./materialize-next-hashed-externals.cjs");

function findPackagedFunctionsRoots() {
  const base = join(root, ".firebase");
  if (!existsSync(base)) return [];
  const out = [];
  for (const project of readdirSync(base)) {
    const functionsDir = join(base, project, "functions");
    const pkg = join(functionsDir, "package.json");
    if (existsSync(pkg) && existsSync(join(functionsDir, ".next"))) {
      out.push(functionsDir);
    }
  }
  return out;
}

function assertNoWindowsAbsoluteSymlinks(nextNodeModules) {
  if (!existsSync(nextNodeModules)) return;
  const { readdirSync: rd, lstatSync, readlinkSync } = require("node:fs");
  for (const name of rd(nextNodeModules)) {
    const p = join(nextNodeModules, name);
    let st;
    try {
      st = lstatSync(p);
    } catch {
      continue;
    }
    if (!st.isSymbolicLink()) continue;
    const raw = String(readlinkSync(p));
    if (/^[A-Za-z]:[\\/]/.test(raw) || raw.startsWith("\\\\")) {
      throw new Error(
        `Packaged SSR still has Windows-absolute symlink ${name} → ${raw} (would break Linux GCF)`,
      );
    }
    throw new Error(
      `Packaged SSR hashed external ${name} is still a symlink → ${raw}; must be a real directory`,
    );
  }
}

const packagedRoots = findPackagedFunctionsRoots();
if (!packagedRoots.length) {
  // Local .next must still be clean when frameworks cache skips rewrite.
  const localNext = join(root, ".next");
  if (!existsSync(join(localNext, "server"))) {
    throw new Error(
      "[ssr-functions-package] no .firebase/<site>/functions package and no local .next/server — run deploy after a frameworks build",
    );
  }
  const local = materializeAndAssert({ cwd: root, nextRoot: localNext });
  console.log(
    JSON.stringify(
      {
        gate: "SSR_FUNCTIONS_PACKAGE_HASHED_EXTERNALS",
        mode: "local-next-only",
        pass: true,
        ...local,
      },
      null,
      2,
    ),
  );
  process.exit(0);
}

const reports = [];
for (const functionsDir of packagedRoots) {
  const nextRoot = join(functionsDir, ".next");
  const nextNodeModules = join(nextRoot, "node_modules");
  const pkg = JSON.parse(readFileSync(join(functionsDir, "package.json"), "utf8"));
  if (!pkg.dependencies?.["firebase-admin"] && !pkg.dependencies?.firebase) {
    // Still materialize if chunks reference hashed aliases.
  }

  const before = discoverHashedExternals({ cwd: functionsDir, nextRoot, nextNodeModules });
  const refs = [...collectHashedRefsFromDir(join(nextRoot, "server"))];
  const result = materializeAndAssert({
    cwd: root, // resolve firebase-admin from project node_modules
    nextRoot,
    nextNodeModules,
  });
  assertNoWindowsAbsoluteSymlinks(nextNodeModules);

  // Fail closed: any firebase-admin-* ref in chunks must resolve as a real dir.
  for (const alias of refs) {
    const aliasPath = join(nextNodeModules, alias);
    const st = existsSync(aliasPath) ? statSync(aliasPath) : null;
    if (!st?.isDirectory()) {
      throw new Error(`Packaged chunk ref ${alias} missing as real directory under ${nextNodeModules}`);
    }
  }

  reports.push({
    functionsDir,
    beforeScanned: before.entries.length,
    chunkRefs: refs,
    ...result,
  });
}

console.log(
  JSON.stringify(
    {
      gate: "SSR_FUNCTIONS_PACKAGE_HASHED_EXTERNALS",
      mode: "packaged-functions",
      pass: true,
      packages: reports,
    },
    null,
    2,
  ),
);
