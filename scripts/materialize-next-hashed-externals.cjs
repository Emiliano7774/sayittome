/**
 * Sync CJS entry used by the next CLI wrapper (must not be ESM-only).
 * Materializes Turbopack hashed server externals under .next/node_modules.
 *
 * Firebase Hosting frameworks copies `.next` with glob(nodir:true). Directory
 * symlinks (esp. Windows absolute → firebase-admin) are often skipped, so the
 * GCF Linux package ships chunks that require `firebase-admin-<hash>/app` with
 * no matching package → ERR_MODULE_NOT_FOUND.
 */
const {
  cpSync,
  existsSync,
  lstatSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  readlinkSync,
  rmSync,
} = require("node:fs");
const { dirname, join, resolve, sep } = require("node:path");

const HASHED_EXTERNAL = /^(.+)-([a-f0-9]{12,})$/i;
const HASHED_IN_SOURCE = /(?:^|[\s"'`/])((?:@[^/]+\/)?[a-z0-9][a-z0-9._-]*)-([a-f0-9]{12,})(?:\/|"|'|`|\s|$)/gi;
const FIREBASE_ADMIN_HASHED = /firebase-admin-[a-f0-9]{12,}/gi;

function listHashedExternals(nextNodeModules) {
  if (!existsSync(nextNodeModules)) return [];
  return readdirSync(nextNodeModules)
    .map((name) => {
      const match = name.match(HASHED_EXTERNAL);
      if (!match) return null;
      return { name, packageName: match[1], hash: match[2] };
    })
    .filter(Boolean);
}

function collectHashedRefsFromDir(dir, out = new Set()) {
  if (!existsSync(dir)) return out;
  for (const name of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, name.name);
    if (name.isDirectory()) {
      collectHashedRefsFromDir(p, out);
      continue;
    }
    if (!name.name.endsWith(".js") && !name.name.endsWith(".json")) continue;
    let text;
    try {
      text = readFileSync(p, "utf8");
    } catch {
      continue;
    }
    for (const match of text.matchAll(FIREBASE_ADMIN_HASHED)) {
      out.add(match[0]);
    }
    HASHED_IN_SOURCE.lastIndex = 0;
  }
  return out;
}

function discoverHashedExternals(options = {}) {
  const cwd = options.cwd || process.cwd();
  const nextRoot = options.nextRoot || join(cwd, ".next");
  const nextNodeModules = options.nextNodeModules || join(nextRoot, "node_modules");
  const byName = new Map();

  for (const entry of listHashedExternals(nextNodeModules)) {
    byName.set(entry.name, entry);
  }

  const serverDir = join(nextRoot, "server");
  for (const name of collectHashedRefsFromDir(serverDir)) {
    const match = name.match(HASHED_EXTERNAL);
    if (!match) continue;
    if (!byName.has(name)) {
      byName.set(name, { name, packageName: match[1], hash: match[2] });
    }
  }

  return { nextRoot, nextNodeModules, entries: [...byName.values()] };
}

function resolveSource(entryPath, packageName, cwd) {
  try {
    if (existsSync(entryPath)) {
      const st = lstatSync(entryPath);
      if (st.isSymbolicLink()) {
        const raw = readlinkSync(entryPath);
        const linked = resolve(dirname(entryPath), raw);
        if (existsSync(linked)) return linked;
      } else if (st.isDirectory()) {
        return entryPath;
      }
    }
  } catch {
    /* fall through */
  }
  const fromRoot = resolve(cwd, "node_modules", packageName);
  if (existsSync(fromRoot)) return fromRoot;
  return null;
}

function isRealPackageDir(entryPath) {
  try {
    if (!existsSync(entryPath)) return false;
    const st = lstatSync(entryPath);
    if (st.isSymbolicLink()) return false;
    if (!st.isDirectory()) return false;
    return existsSync(join(entryPath, "package.json"));
  } catch {
    return false;
  }
}

function materializeNextHashedExternals(options = {}) {
  const cwd = resolve(options.cwd || process.cwd());
  const discovered = discoverHashedExternals({ ...options, cwd });
  const nextNodeModules = resolve(discovered.nextNodeModules);
  const entries = discovered.entries;
  const fixed = [];
  const skipped = [];

  mkdirSync(nextNodeModules, { recursive: true });

  for (const entry of entries) {
    const entryPath = join(nextNodeModules, entry.name);
    if (isRealPackageDir(entryPath)) {
      skipped.push(entry.name);
      continue;
    }

    const source = resolveSource(entryPath, entry.packageName, cwd);
    if (!source) {
      throw new Error(
        `Cannot materialize hashed external ${entry.name}: missing package ${entry.packageName}`,
      );
    }

    rmSync(entryPath, { recursive: true, force: true });
    cpSync(source, entryPath, { recursive: true, dereference: true });
    if (!isRealPackageDir(entryPath)) {
      throw new Error(`Materialize failed for ${entry.name}: not a real package directory`);
    }
    fixed.push(entry.name);
  }

  return { scanned: entries.length, fixed, skipped };
}

/**
 * Linux-GCF style checks: no symlinks, no Windows absolute link targets,
 * and Node can resolve `<alias>/app` from a server chunk path.
 */
function assertHashedExternalsResolved(options = {}) {
  const cwd = resolve(options.cwd || process.cwd());
  const discovered = discoverHashedExternals({ ...options, cwd });
  const nextRoot = resolve(discovered.nextRoot);
  const nextNodeModules = resolve(discovered.nextNodeModules);
  const entries = discovered.entries;
  const { createRequire } = require("node:module");
  const unresolved = [];
  const resolved = [];

  for (const entry of entries) {
    const entryPath = join(nextNodeModules, entry.name);
    if (!isRealPackageDir(entryPath)) {
      let detail = "missing";
      try {
        if (existsSync(entryPath) && lstatSync(entryPath).isSymbolicLink()) {
          const raw = String(readlinkSync(entryPath));
          detail = `symlink→${raw}`;
          if (/^[A-Za-z]:[\\/]/.test(raw) || raw.startsWith("\\\\")) {
            detail += " (Windows absolute — breaks Linux GCF)";
          }
        }
      } catch {
        /* keep detail */
      }
      unresolved.push({ name: entry.name, detail });
      continue;
    }

    try {
      const req = createRequire(join(nextRoot, "server", "chunks", "probe.cjs"));
      const resolvedPath = req.resolve(`${entry.name}/app`);
      if (!resolvedPath.split(sep).includes(entry.name) && !resolvedPath.includes(entry.name)) {
        unresolved.push({ name: entry.name, detail: `resolve missed alias: ${resolvedPath}` });
        continue;
      }
      req(`${entry.name}/app`);
      resolved.push(entry.name);
    } catch (error) {
      unresolved.push({
        name: entry.name,
        detail: error?.code || error?.message || String(error),
      });
    }
  }

  if (unresolved.length) {
    const lines = unresolved.map((u) => `  - ${u.name}: ${u.detail}`).join("\n");
    throw new Error(
      `Unresolved Turbopack hashed externals under ${nextNodeModules} (Linux GCF would MODULE_NOT_FOUND):\n${lines}`,
    );
  }

  return {
    scanned: entries.length,
    resolved,
    nextRoot,
    nextNodeModules,
  };
}

function materializeAndAssert(options = {}) {
  const materialized = materializeNextHashedExternals(options);
  const asserted = assertHashedExternalsResolved(options);
  return { ...materialized, asserted };
}

module.exports = {
  materializeNextHashedExternals,
  listHashedExternals,
  discoverHashedExternals,
  collectHashedRefsFromDir,
  assertHashedExternalsResolved,
  materializeAndAssert,
  isRealPackageDir,
};

if (require.main === module) {
  const result = materializeAndAssert();
  console.log(JSON.stringify({ gate: "MATERIALIZE_NEXT_HASHED_EXTERNALS", ...result }, null, 2));
}
