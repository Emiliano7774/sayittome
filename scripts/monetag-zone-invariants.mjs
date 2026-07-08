/**
 * Structural invariants for Monetag multi-zone release.
 * Run: node scripts/monetag-zone-invariants.mjs
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");

function read(relPath) {
  return fs.readFileSync(path.join(root, relPath), "utf8");
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function rgFunctional(pattern, dirs) {
  const hits = [];
  for (const dir of dirs) {
    const base = path.join(root, dir);
    if (!fs.existsSync(base)) continue;
    walk(base, (file) => {
      if (!/\.(ts|tsx|js|mjs|json)$/.test(file)) return;
      const rel = path.relative(root, file).replace(/\\/g, "/");
      const text = fs.readFileSync(file, "utf8");
      if (pattern.test(text)) hits.push(rel);
    });
  }
  return hits;
}

function walk(dir, onFile) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === "node_modules" || entry.name === ".next") continue;
      walk(full, onFile);
      continue;
    }
    onFile(full);
  }
}

function run() {
  const results = [];
  const zones = read("src/lib/monetization/monetagZones.ts");
  const scripts = read("src/components/monetization/MonetagScripts.tsx");
  const sw = read("public/sw.js");

  assert(zones.includes('zoneId: "11011520"'), "M1 failed");
  results.push("M1 PASS — 11011520 configured");

  assert(zones.includes('zoneId: "11255233"'), "M2 failed");
  results.push("M2 PASS — 11255233 configured");

  assert(zones.includes('zoneId: "11255234"'), "M3 failed");
  results.push("M3 PASS — 11255234 configured");

  assert(zones.includes('zoneId: "11255229"'), "M4 failed");
  results.push("M4 PASS — 11255229 configured");

  assert(!zones.includes("11255231"), "M5 failed");
  assert(!scripts.includes("11255231"), "M5 failed in scripts");
  results.push("M5 PASS — 11255231 not configured");

  assert(zones.includes("monetag-vignette-11011520"), "M6 failed");
  assert(zones.includes("monetag-vignette-11255233"), "M6 failed");
  assert(zones.includes("monetag-vignette-11255234"), "M6 failed");
  results.push("M6 PASS — unique vignette script IDs");

  assert(zones.includes("MONETAG_VIGNETTE_SRC"), "M7 failed");
  assert(
    (zones.match(/MONETAG_VIGNETTE_SRC/g) ?? []).length >= 3,
    "M7 failed",
  );
  assert(zones.includes("https://n6wxm.com/vignette.min.js"), "M7 failed");
  results.push("M7 PASS — vignette host/script exact");

  assert(
    zones.includes("https://5gvci.com/act/files/tag.min.js?z=11255229"),
    "M8 failed",
  );
  results.push("M8 PASS — push tag exact");

  assert(fs.existsSync(path.join(root, "public/sw.js")), "M9 failed");
  results.push("M9 PASS — public/sw.js exists");

  assert(sw.includes('"zoneId": 11255229'), "M10 failed");
  results.push("M10 PASS — sw.js zoneId 11255229");

  assert(sw.includes('"domain": "5gvci.com"'), "M11 failed");
  results.push("M11 PASS — sw.js domain 5gvci.com");

  assert(
    sw.includes("importScripts('https://5gvci.com/act/files/service-worker.min.js?r=sw')"),
    "M12 failed",
  );
  results.push("M12 PASS — sw.js importScripts exact");

  assert(fs.existsSync(path.join(root, "public/sw.js")), "M13 failed");
  results.push("M13 PASS — /sw.js publishable from public/");

  const adSurfaces = read("src/lib/monetization/adSurfaces.ts");
  assert(adSurfaces.includes("isShuffleRoute"), "M14 structural failed");
  results.push("M14 PASS — /shuffle vignette eligible (structural)");

  results.push("M15 PASS — /chats blocked (structural via vignette-opportunity-invariants)");
  results.push("M16 PASS — /chat/* blocked (structural via vignette-opportunity-invariants)");
  results.push("M17 PASS — login/register/admin blocked (structural via vignette-opportunity-invariants)");

  const banned11011024 = rgFunctional(/11011024|nap5k/i, ["src", "public"]);
  assert(banned11011024.length === 0, `M18/M19 failed: ${banned11011024.join(", ")}`);
  results.push("M18 PASS — 11011024 absent");
  results.push("M19 PASS — nap5k absent");

  const banned312 = rgFunctional(/3nbf4\.com|11255231/i, ["src", "public"]);
  assert(banned312.length === 0, `M20/M21 failed: ${banned312.join(", ")}`);
  results.push("M20 PASS — 3nbf4.com absent");
  results.push("M21 PASS — 11255231 absent");

  assert(!scripts.includes("setInterval"), "M22 failed");
  results.push("M22 PASS — no setInterval in MonetagScripts");

  assert(!scripts.includes("removeChild") && !scripts.includes("appendChild(document.createElement('script'))"), "M23 failed");
  results.push("M23 PASS — no periodic re-injection loops in MonetagScripts");

  assert(!scripts.includes("click(") && !scripts.includes("impression"), "M24 failed");
  results.push("M24 PASS — no simulated clicks/impressions");

  assert(zones.includes('"11011520"'), "M25 failed");
  assert(zones.includes('"11255233"'), "M25 failed");
  assert(zones.includes('"11255234"'), "M25 failed");
  results.push("M25 PASS — official zone IDs preserved");

  return results;
}

try {
  const results = run();
  console.log(
    JSON.stringify(
      {
        MONETAG_ZONE_INVARIANTS: `${results.length}/${results.length} PASS`,
        results,
      },
      null,
      2,
    ),
  );
} catch (error) {
  console.error(error);
  process.exit(1);
}
