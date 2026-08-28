/**
 * Shared guards for Firebase Hosting SSR functions packaging.
 *
 * Deploy order (firebase-tools lib/deploy): prepareFrameworks → predeploy → upload.
 * Predeploy MUST validate the REAL `.firebase/<site>/functions` tree Firebase built.
 * Never substitute stub entry/package files to pass gates.
 */
import { createHash } from "node:crypto";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { isAbsolute, join, relative, resolve } from "node:path";

export const STUB_PACKAGE_NAME = "sayittome-ssr";
export const DEFAULT_SITE = "sayittome-app";
const FIREBASE_ADMIN_HASHED = /firebase-admin-[a-f0-9]+/gi;

export function functionsPaths(root, site = DEFAULT_SITE) {
  const functionsDir = join(root, ".firebase", site, "functions");
  return {
    functionsDir,
    indexJs: join(functionsDir, "index.js"),
    packageJson: join(functionsDir, "package.json"),
    serverJs: join(functionsDir, "server.js"),
    packagedNext: join(functionsDir, ".next"),
    packagedServer: join(functionsDir, ".next", "server"),
    packagedBuildId: join(functionsDir, ".next", "BUILD_ID"),
    packagedBuildRelease: join(functionsDir, "public", "build-release.json"),
    localBuildRelease: join(root, "public", "build-release.json"),
  };
}

export function sha256File(path) {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

/** Ensure resolved target stays inside sandboxRoot — required before rmSync. Empty rel = same dir (valid). */
export function assertPathContainedInRoot(targetPath, sandboxRoot) {
  const base = resolve(sandboxRoot);
  const resolved = resolve(targetPath);
  const rel = relative(base, resolved);
  if (rel.startsWith("..") || isAbsolute(rel)) {
    throw new Error(`[ssr-package-guard] path escape: ${resolved} not inside ${base}`);
  }
  return rel;
}

export const NODE_DEFAULT_MAIN = "index.js";

export function resolvePackageMainRel(mainRaw) {
  const main = String(mainRaw || "").trim() || NODE_DEFAULT_MAIN;
  if (main.includes("\\") || main.startsWith("/") || main.startsWith("..")) {
    throw new Error(`[ssr-package-guard] package.main must be a relative path inside functions dir`);
  }
  return main;
}

export function parseBuildReleaseJson(text, label) {
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error(`[ssr-package-guard] ${label}: invalid build-release.json JSON`);
  }
  const sha = String(parsed?.sha || "").trim();
  const builtAt = String(parsed?.builtAt || "").trim();
  if (!sha) {
    throw new Error(`[ssr-package-guard] ${label}: build-release.json missing sha`);
  }
  if (!builtAt) {
    throw new Error(`[ssr-package-guard] ${label}: build-release.json missing builtAt`);
  }
  return { sha, builtAt, source: String(parsed?.source || "").trim() };
}

export function parseFunctionsPackageJson(text, label) {
  let pkg;
  try {
    pkg = JSON.parse(text);
  } catch {
    throw new Error(`[ssr-package-guard] ${label}: invalid package.json JSON`);
  }
  if (!pkg || typeof pkg !== "object") {
    throw new Error(`[ssr-package-guard] ${label}: package.json must be an object`);
  }
  return pkg;
}

export function isStubPackageJsonText(text) {
  try {
    const pkg = JSON.parse(text);
    return pkg?.name === STUB_PACKAGE_NAME;
  } catch {
    return false;
  }
}

export function isStubServerJsText(text) {
  const trimmed = String(text || "").trim();
  return /^\/\*\* regenerated from local \.next BUILD_ID=/.test(trimmed) && /exports\.ssr\s*=\s*true/.test(trimmed);
}

export function isStubMainEntryText(text) {
  if (isStubServerJsText(text)) return true;
  const trimmed = String(text || "").trim();
  return trimmed === 'exports.ssr = true;' || /^exports\.ssr\s*=\s*true;?\s*$/.test(trimmed);
}

export function isStubFunctionsPackage(paths) {
  if (existsSync(paths.packageJson) && isStubPackageJsonText(readFileSync(paths.packageJson, "utf8"))) {
    return true;
  }
  try {
    const entry = readFunctionsMainEntry(paths);
    if (isStubMainEntryText(readFileSync(entry.mainPath, "utf8"))) return true;
  } catch {
    /* missing/invalid package — handled elsewhere */
  }
  return false;
}

export function readFunctionsMainEntry(paths) {
  const label = "functions package.json";
  if (!existsSync(paths.packageJson)) {
    throw new Error(`[ssr-package-guard] ${label}: missing package.json`);
  }
  const text = readFileSync(paths.packageJson, "utf8");
  const pkg = parseFunctionsPackageJson(text, label);
  const mainRel = resolvePackageMainRel(pkg.main);
  const mainPath = join(paths.functionsDir, mainRel);
  assertPathContainedInRoot(mainPath, paths.functionsDir);
  return { pkg, mainRel, mainPath };
}

export function assertValidFunctionsPackageJson(paths) {
  const label = "functions package.json";
  const text = readFileSync(paths.packageJson, "utf8");
  if (isStubPackageJsonText(text)) {
    throw new Error(`[ssr-package-guard] ${label}: stub ${STUB_PACKAGE_NAME} refused`);
  }
  const { pkg, mainRel, mainPath } = readFunctionsMainEntry(paths);
  if (!existsSync(mainPath)) {
    throw new Error(`[ssr-package-guard] ${label}: main file missing at ${mainRel}`);
  }
  const mainText = readFileSync(mainPath, "utf8");
  if (isStubMainEntryText(mainText)) {
    throw new Error(`[ssr-package-guard] ${label}: main entry ${mainRel} is a placeholder stub`);
  }
  return { main: mainRel, name: String(pkg.name || "").trim() };
}

export function assertBuildReleaseCoherent(root, paths) {
  if (!existsSync(paths.localBuildRelease)) {
    throw new Error(
      "[ssr-package-guard] missing local public/build-release.json — run deploy:hosting preflight first",
    );
  }
  if (!existsSync(paths.packagedBuildRelease)) {
    throw new Error(
      "[ssr-package-guard] missing functions/public/build-release.json — packaged SSR tree is stale or incomplete",
    );
  }
  const local = parseBuildReleaseJson(
    readFileSync(paths.localBuildRelease, "utf8"),
    "local public/build-release.json",
  );
  const packaged = parseBuildReleaseJson(
    readFileSync(paths.packagedBuildRelease, "utf8"),
    "functions/public/build-release.json",
  );
  if (local.sha !== packaged.sha) {
    throw new Error(
      `[ssr-package-guard] stale packaged build-release sha=${packaged.sha} !== local ${local.sha}`,
    );
  }
  if (local.builtAt !== packaged.builtAt) {
    throw new Error(
      `[ssr-package-guard] stale packaged build-release builtAt=${packaged.builtAt} !== local ${local.builtAt}`,
    );
  }
  return { local, packaged };
}

export function rawScanHashedRefs(dir, out = []) {
  if (!existsSync(dir)) return out;
  for (const name of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, name.name);
    if (name.isDirectory()) {
      rawScanHashedRefs(p, out);
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

export function collectZeroHashRefs(serverDir, collectHashedRefsFromDir) {
  const refs = [...collectHashedRefsFromDir(serverDir)];
  const raw = [...new Set(rawScanHashedRefs(serverDir))];
  return [...new Set([...refs, ...raw])];
}

export function assertZeroHashedRefs(label, serverDir, collectHashedRefsFromDir) {
  if (!existsSync(serverDir)) {
    throw new Error(`[ssr-package-guard] ${label}: missing ${serverDir}`);
  }
  const all = collectZeroHashRefs(serverDir, collectHashedRefsFromDir);
  if (all.length) {
    throw new Error(
      `[ssr-package-guard] ${label}: ZERO firebase-admin-<hash> required; found: ${all.join(", ")}`,
    );
  }
  return all;
}

/** Read-only local preflight before Firebase CLI (never mutates `.firebase`). */
export function assertLocalNextPreflight(root, collectHashedRefsFromDir) {
  const localServer = join(root, ".next", "server");
  const localBuildIdPath = join(root, ".next", "BUILD_ID");
  if (!existsSync(localServer)) {
    throw new Error("[ssr-package-guard] local preflight: missing .next/server — run npm run build first");
  }
  if (!existsSync(localBuildIdPath)) {
    throw new Error("[ssr-package-guard] local preflight: missing .next/BUILD_ID");
  }
  const localBuildId = readFileSync(localBuildIdPath, "utf8").trim();
  if (!localBuildId) {
    throw new Error("[ssr-package-guard] local preflight: empty .next/BUILD_ID");
  }
  const localRefs = assertZeroHashedRefs("local .next/server", localServer, collectHashedRefsFromDir);
  return { localBuildId, localRefs };
}

/**
 * Validate REAL Firebase-prepared functions package (post-prepareFrameworks predeploy).
 * packagedBuildId may legitimately differ from local pre-deploy BUILD_ID.
 */
export function assertPreparedFirebaseFunctionsPackage(root, collectHashedRefsFromDir, site = DEFAULT_SITE) {
  const paths = functionsPaths(root, site);

  if (!existsSync(paths.packageJson)) {
    throw new Error(`[ssr-package-guard] ${site}: missing package.json after prepareFrameworks`);
  }
  if (isStubFunctionsPackage(paths)) {
    throw new Error(
      `[ssr-package-guard] ${site}: stub sayittome-ssr/placeholder detected — refuse deploy/upload`,
    );
  }

  const packageMeta = assertValidFunctionsPackageJson(paths);

  if (!existsSync(paths.packagedServer)) {
    throw new Error(`[ssr-package-guard] ${site}: missing functions/.next/server after prepareFrameworks`);
  }

  const packagedBuildId = existsSync(paths.packagedBuildId)
    ? readFileSync(paths.packagedBuildId, "utf8").trim()
    : "";
  if (!packagedBuildId) {
    throw new Error(`[ssr-package-guard] ${site}: empty functions/.next/BUILD_ID — refuse stale/incomplete package`);
  }

  const buildRelease = assertBuildReleaseCoherent(root, paths);

  const packagedRefs = assertZeroHashedRefs(
    `packaged ${site} .next/server`,
    paths.packagedServer,
    collectHashedRefsFromDir,
  );

  return { paths, packagedBuildId, packagedRefs, packageMeta, buildRelease };
}
