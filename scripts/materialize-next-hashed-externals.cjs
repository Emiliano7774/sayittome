/**
 * Sync CJS entry used by the next CLI wrapper (must not be ESM-only).
 * Materializes Turbopack hashed server externals under .next/node_modules.
 */
const {
  cpSync,
  existsSync,
  lstatSync,
  mkdirSync,
  readdirSync,
  readlinkSync,
  rmSync,
} = require("node:fs");
const { dirname, join, resolve } = require("node:path");

const HASHED_EXTERNAL = /^(.+)-([a-f0-9]{12,})$/i;

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

function resolveSource(entryPath, packageName) {
  try {
    const st = lstatSync(entryPath);
    if (st.isSymbolicLink()) {
      const raw = readlinkSync(entryPath);
      const linked = resolve(dirname(entryPath), raw);
      if (existsSync(linked)) return linked;
    }
  } catch {
    /* fall through */
  }
  const fromRoot = resolve(process.cwd(), "node_modules", packageName);
  if (existsSync(fromRoot)) return fromRoot;
  return null;
}

function materializeNextHashedExternals(options = {}) {
  const nextNodeModules =
    options.nextNodeModules || join(process.cwd(), ".next", "node_modules");
  const entries = listHashedExternals(nextNodeModules);
  const fixed = [];

  for (const entry of entries) {
    const entryPath = join(nextNodeModules, entry.name);
    try {
      const st = lstatSync(entryPath);
      if (st.isDirectory() && !st.isSymbolicLink()) continue;
    } catch {
      /* missing */
    }

    const source = resolveSource(entryPath, entry.packageName);
    if (!source) {
      throw new Error(
        `Cannot materialize hashed external ${entry.name}: missing package ${entry.packageName}`,
      );
    }

    rmSync(entryPath, { recursive: true, force: true });
    mkdirSync(nextNodeModules, { recursive: true });
    cpSync(source, entryPath, { recursive: true, dereference: true });
    fixed.push(entry.name);
  }

  return { scanned: entries.length, fixed };
}

module.exports = {
  materializeNextHashedExternals,
  listHashedExternals,
};

if (require.main === module) {
  const result = materializeNextHashedExternals();
  console.log(JSON.stringify({ gate: "MATERIALIZE_NEXT_HASHED_EXTERNALS", ...result }, null, 2));
}
