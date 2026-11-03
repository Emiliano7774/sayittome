/**
 * A/B: findIndex merge vs indexed-key merge for mergeRecentOnlineProfiles.
 * Equivalence vs in-script reference (original findIndex) + perf on synthetic 657 pool.
 */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { performance } = require("node:perf_hooks");
const ts = require("typescript");

const ROOT = path.resolve(__dirname, "..");
const POOL_SIZE = 657;
const EQUIV_CASES = 1200;
const EQUIV_SEED = 0x01000701;
const BENCH_ALTERNATING = 20;
const MEANINGFUL_MS = 20;

const moduleCache = new Map();

function resolveSrcFile(specifier) {
  const abs = path.join(ROOT, "src", specifier);
  const candidates = [abs, `${abs}.ts`, `${abs}.tsx`, `${abs}.js`];
  for (const candidate of candidates) {
    if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) return candidate;
  }
  throw new Error(`Cannot resolve ${specifier}`);
}

function loadTsModuleFromFile(filePath) {
  if (moduleCache.has(filePath)) return moduleCache.get(filePath);
  const source = fs.readFileSync(filePath, "utf8");
  const js = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const mod = { exports: {} };
  const sandbox = {
    exports: mod.exports,
    module: mod,
    require(id) {
      if (id === "server-only") return {};
      if (id.startsWith("@/")) {
        return loadTsModuleFromFile(resolveSrcFile(id.slice(2)));
      }
      throw new Error(`Unhandled require ${id} from ${filePath}`);
    },
    Set,
    Map,
    Boolean,
    Date,
    Number,
    String,
    Math,
    Array,
    Object,
    JSON,
    RegExp,
    console,
    process: { env: {} },
  };
  vm.runInNewContext(js, sandbox);
  moduleCache.set(filePath, mod.exports);
  return mod.exports;
}

const dedupe = loadTsModuleFromFile(resolveSrcFile("lib/shuffle/dedupeProfiles"));
const indexedMerge = loadTsModuleFromFile(
  resolveSrcFile("lib/shuffle/recentOnlineProfiles"),
).mergeRecentOnlineProfiles;

function mergeRecentOnlineProfilesReference(pool, recent) {
  const { dedupeShuffleProfiles, shuffleProfilesShareIdentity } = dedupe;
  if (recent.length === 0) return pool;
  const consumed = new Set();
  const overlaid = pool.map((old) => {
    if (old.shuffleVisitor === true) return old;
    const index = recent.findIndex(
      (next) => next.shuffleVisitor !== true && shuffleProfilesShareIdentity(old, next),
    );
    if (index < 0) return old;
    consumed.add(index);
    const fresh = recent[index];
    return {
      ...old,
      ...fresh,
      uid: old.uid,
      authUid: old.authUid || fresh.authUid,
      aliasIds: [...new Set([...(old.aliasIds || []), ...(fresh.aliasIds || [])])],
      shuffleFeatured: Boolean(old.shuffleFeatured || fresh.shuffleFeatured),
      presenceAt: fresh.presenceAt,
      lastActive: fresh.lastActive,
      onlineUntilAt: fresh.onlineUntilAt,
      showOnline: fresh.showOnline,
    };
  });
  for (let index = 0; index < recent.length; index++) {
    if (!consumed.has(index)) overlaid.push(recent[index]);
  }
  return dedupe.dedupeShuffleProfiles(overlaid);
}

function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function pick(rnd, arr) {
  return arr[Math.floor(rnd() * arr.length)];
}

function isoAt(rnd, baseMs) {
  const offset = Math.floor(rnd() * 7 * 24 * 3600 * 1000);
  return new Date(baseMs - offset).toISOString();
}

function makeRegistered(rnd, tag, baseMs) {
  const n = Math.floor(rnd() * 1_000_000);
  const uid = `reg-${tag}-${n}`;
  const sharedAlias = rnd() < 0.15 ? `shared-alias-${Math.floor(rnd() * 40)}` : null;
  const username =
    rnd() < 0.12 ? `user_dup_${Math.floor(rnd() * 25)}` : `user_${tag}_${n % 5000}`;
  const email =
    rnd() < 0.2 ? `person${Math.floor(rnd() * 30)}@example.invalid` : `private-${n}@example.invalid`;
  return {
    uid,
    authUid: rnd() < 0.85 ? uid : `auth-${n}`,
    firebaseUid: rnd() < 0.7 ? uid : `fb-${n}`,
    aliasIds: [
      uid,
      ...(sharedAlias ? [sharedAlias] : []),
      ...(rnd() < 0.3 ? [`legacy-${n}`] : []),
    ],
    username,
    usernameLower: username.toLowerCase(),
    usernameAliases: rnd() < 0.1 ? [`alias_${n % 200}`] : undefined,
    email,
    photo: `https://example.invalid/p/${uid}.jpg`,
    bio: rnd() < 0.5 ? `bio-${n}` : "",
    presenceAt: isoAt(rnd, baseMs),
    lastActive: isoAt(rnd, baseMs),
    onlineUntilAt: isoAt(rnd, baseMs + 600_000),
    showOnline: rnd() < 0.4,
    shuffleFeatured: rnd() < 0.05,
    mostrarUltimaVez: rnd() < 0.5,
  };
}

function makeAnonSession(rnd, tag, baseMs) {
  const n = Math.floor(rnd() * 1_000_000);
  const uid = `anon_${tag}_${n}`;
  return {
    uid,
    authUid: rnd() < 0.5 ? uid : undefined,
    username: rnd() < 0.5 ? "Anónimo" : `guest_${n % 9000}`,
    usernameLower: rnd() < 0.5 ? "anónimo" : `guest_${n % 9000}`,
    shuffleVisitor: rnd() < 0.55,
    showOnline: true,
    presenceAt: isoAt(rnd, baseMs),
    lastActive: isoAt(rnd, baseMs),
  };
}

function makeWeakUsernameOnly(rnd, baseMs) {
  const username = pick(rnd, ["ada", "bea", "carlos", "diana", "eve"]);
  return {
    uid: `weak-${Math.floor(rnd() * 99999)}`,
    username,
    usernameLower: username,
    showOnline: rnd() < 0.3,
    lastActive: isoAt(rnd, baseMs),
  };
}

function randomProfile(rnd, tag, baseMs) {
  const roll = rnd();
  if (roll < 0.12) return makeAnonSession(rnd, tag, baseMs);
  if (roll < 0.16) return makeWeakUsernameOnly(rnd, baseMs);
  return makeRegistered(rnd, tag, baseMs);
}

function randomProfileList(rnd, count, tag, baseMs) {
  const rows = [];
  for (let i = 0; i < count; i++) rows.push(randomProfile(rnd, `${tag}-${i}`, baseMs));
  if (rnd() < 0.35 && rows.length > 2) {
    const donor = rows[Math.floor(rnd() * rows.length)];
    const clone = {
      ...donor,
      uid: `${donor.uid}-dup-${Math.floor(rnd() * 999)}`,
      presenceAt: isoAt(rnd, baseMs),
      showOnline: !donor.showOnline,
    };
    rows.splice(Math.floor(rnd() * rows.length), 0, clone);
  }
  return rows;
}

function stableJson(value) {
  return JSON.stringify(value);
}

function percentile(sorted, p) {
  if (sorted.length === 0) return 0;
  const idx = Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1);
  return Number(sorted[idx].toFixed(3));
}

function syntheticPool657(baseMs) {
  const rnd = mulberry32(0x657657);
  return randomProfileList(rnd, POOL_SIZE, "bench-pool", baseMs);
}

function syntheticRecentFromPool(pool, count, rnd) {
  if (count === 0) return [];
  const picked = [];
  for (let i = 0; i < count; i++) {
    const base = pool[Math.floor(rnd() * pool.length)];
    picked.push({
      ...base,
      uid: rnd() < 0.4 ? base.uid : `recent-${i}-${base.uid}`,
      presenceAt: isoAt(rnd, baseMs),
      lastActive: isoAt(rnd, baseMs),
      showOnline: true,
      shuffleVisitor: rnd() < 0.08 ? true : base.shuffleVisitor,
    });
  }
  for (let i = 0; i < Math.min(8, count); i++) {
    picked.push(makeAnonSession(rnd, `recent-extra-${i}`, baseMs));
  }
  return picked;
}

const baseMs = Date.parse("2026-03-01T12:00:00.000Z");

function runEquivalence() {
  const rnd = mulberry32(EQUIV_SEED);
  for (let caseId = 0; caseId < EQUIV_CASES; caseId++) {
    const poolLen = 1 + Math.floor(rnd() * 45);
    const recentLen = Math.floor(rnd() * 55);
    const pool = randomProfileList(rnd, poolLen, "pool", baseMs);
    const recent = randomProfileList(rnd, recentLen, "recent", baseMs);
    const ref = mergeRecentOnlineProfilesReference(pool, recent);
    const next = indexedMerge(pool, recent);
    if (stableJson(ref) !== stableJson(next)) {
      console.error("EQUIV_FAIL", { caseId, poolLen, recentLen, ref, next });
      process.exitCode = 1;
      throw new Error(`equivalence failed at case ${caseId}`);
    }
  }
}

function benchMerge(fn, pool, recent, iterations) {
  const samples = [];
  for (let i = 0; i < iterations; i++) {
    const t0 = performance.now();
    fn(pool, recent);
    samples.push(performance.now() - t0);
  }
  samples.sort((a, b) => a - b);
  return { p50: percentile(samples, 50), p95: percentile(samples, 95), samples };
}

function runBenchmarks() {
  const pool = syntheticPool657(baseMs);
  const recentCounts = [0, 5, 50, 500];
  const rnd = mulberry32(0x657657);
  const scenarios = recentCounts.map((recentCount) => {
    const recent = syntheticRecentFromPool(pool, recentCount, rnd);
    const warmRef = () => mergeRecentOnlineProfilesReference(pool, recent);
    const warmNew = () => indexedMerge(pool, recent);
    warmRef();
    warmNew();
    warmRef();
    warmNew();

    const refSamples = [];
    const newSamples = [];
    for (let i = 0; i < BENCH_ALTERNATING; i++) {
      const useRef = i % 2 === 0;
      const t0 = performance.now();
      if (useRef) warmRef();
      else warmNew();
      const ms = performance.now() - t0;
      if (useRef) refSamples.push(ms);
      else newSamples.push(ms);
    }
    const ref = benchMerge(mergeRecentOnlineProfilesReference, pool, recent, BENCH_ALTERNATING);
    const next = benchMerge(indexedMerge, pool, recent, BENCH_ALTERNATING);
    const savingsP50 = Number((ref.p50 - next.p50).toFixed(3));
    const savingsP95 = Number((ref.p95 - next.p95).toFixed(3));
    return {
      recentCount,
      reference: ref,
      indexed: next,
      savingsMs: { p50: savingsP50, p95: savingsP95 },
      meaningfulP50: savingsP50 > MEANINGFUL_MS,
      meaningfulP95: savingsP95 > MEANINGFUL_MS,
    };
  });
  return scenarios;
}

function main() {
  runEquivalence();
  const benchmarks = runBenchmarks();
  const meaningful = benchmarks.filter((b) => b.meaningfulP50 || b.meaningfulP95);
  const adopt =
    meaningful.length > 0 ||
    benchmarks.some((b) => b.savingsMs.p50 > 0.5 || b.savingsMs.p95 > 0.5);
  const report = {
    equivalenceCases: EQUIV_CASES,
    equivalence: "pass",
    poolSize: POOL_SIZE,
    alternatingRunsPerArm: BENCH_ALTERNATING,
    meaningfulSavingsThresholdMs: MEANINGFUL_MS,
    benchmarks,
    meaningfulScenarios: meaningful.map((b) => b.recentCount),
    adoptIndexedMerge: adopt,
  };
  console.log("RECENT_ONLINE_INDEXED_AB", JSON.stringify(report, null, 2));
  if (!adopt) {
    console.error("Indexed merge did not show meaningful improvement; revert recommended.");
    process.exitCode = 1;
  }
}

if (require.main === module) {
  main();
}

module.exports = {
  mergeRecentOnlineProfilesReference,
  indexedMerge,
  runEquivalence,
  runBenchmarks,
};
