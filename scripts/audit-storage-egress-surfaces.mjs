#!/usr/bin/env node
/**
 * Safe read-only Storage egress surface audit.
 * - Probes live shuffle photo headers/sizes
 * - Scans local source for high-risk download patterns
 * Does not modify bucket objects or deploy anything.
 */
import { createHash } from "node:crypto";
import { readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { join, relative } from "node:path";

const ROOT = process.cwd();
const BASE = process.env.BASE_URL || "https://sayittome-app.web.app";
const SAMPLE = Number(process.env.SAMPLE || 40);

function walk(dir, out = []) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (
      entry.name === "node_modules" ||
      entry.name === ".next" ||
      entry.name === ".firebase" ||
      entry.name === ".git" ||
      entry.name === ".preview-build" ||
      entry.name === ".worktrees"
    ) {
      continue;
    }
    const full = join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out);
    else if (/\.(ts|tsx|js|mjs|rules)$/.test(entry.name)) out.push(full);
  }
  return out;
}

function scanSource() {
  const files = walk(join(ROOT, "src")).concat([join(ROOT, "storage.rules")]);
  const patterns = [
    { id: "getDownloadURL", re: /getDownloadURL/g },
    { id: "uploadBytesResumable", re: /uploadBytesResumable/g },
    { id: "cacheControl", re: /cacheControl/g },
    { id: "preload_auto", re: /preload=["']auto["']/g },
    { id: "new Image()", re: /new Image\(/g },
    { id: "warmShuffleImages", re: /warmShuffleImages\(/g },
    { id: "preloadStoryGroup", re: /preloadStoryGroup\(/g },
    { id: "enableRuntimeScan_default_true_usage", re: /SensitiveMediaShell/g },
    { id: "allow_read_true", re: /allow read:\s*if true/g },
  ];
  const hits = Object.fromEntries(patterns.map((p) => [p.id, []]));
  for (const file of files) {
    const text = readFileSync(file, "utf8");
    const rel = relative(ROOT, file).replaceAll("\\", "/");
    for (const pattern of patterns) {
      const count = [...text.matchAll(pattern.re)].length;
      if (count > 0) hits[pattern.id].push({ file: rel, count });
    }
  }
  return hits;
}

async function probeUrl(url) {
  const head = await fetch(url, { method: "HEAD" }).catch(() => null);
  if (head?.ok) {
    return {
      url,
      status: head.status,
      bytes: Number(head.headers.get("content-length") || 0),
      cacheControl: head.headers.get("cache-control") || "",
      contentType: head.headers.get("content-type") || "",
      etag: head.headers.get("etag") || "",
    };
  }
  const get = await fetch(url);
  const buf = await get.arrayBuffer();
  return {
    url,
    status: get.status,
    bytes: buf.byteLength,
    cacheControl: get.headers.get("cache-control") || "",
    contentType: get.headers.get("content-type") || "",
    etag: get.headers.get("etag") || "",
  };
}

function percentile(sorted, p) {
  if (!sorted.length) return 0;
  const idx = Math.min(sorted.length - 1, Math.floor((sorted.length - 1) * p));
  return sorted[idx];
}

async function probeShuffle() {
  const res = await fetch(`${BASE}/api/shuffle`, { cache: "no-store" });
  const json = await res.json();
  const profiles = Array.isArray(json.profiles) ? json.profiles : [];
  const photos = [
    ...new Set(
      profiles
        .map((p) => String(p.photo || p.fotoPrincipal || p.foto || "").trim())
        .filter(Boolean),
    ),
  ];
  const sample = photos.slice(0, SAMPLE);
  const probed = [];
  for (const url of sample) {
    probed.push(await probeUrl(url));
  }
  const sizes = probed.map((p) => p.bytes).filter((n) => n > 0).sort((a, b) => a - b);
  const total = sizes.reduce((a, b) => a + b, 0);
  const avg = sizes.length ? total / sizes.length : 0;
  const cacheControls = {};
  const contentTypes = {};
  for (const row of probed) {
    cacheControls[row.cacheControl || "(missing)"] =
      (cacheControls[row.cacheControl || "(missing)"] || 0) + 1;
    contentTypes[row.contentType || "(missing)"] =
      (contentTypes[row.contentType || "(missing)"] || 0) + 1;
  }
  return {
    profiles: profiles.length,
    uniquePhotos: photos.length,
    sampled: probed.length,
    bytes: {
      totalSampled: total,
      avg,
      median: percentile(sizes, 0.5),
      p90: percentile(sizes, 0.9),
      max: sizes[sizes.length - 1] || 0,
    },
    cacheControls,
    contentTypes,
    topHeaviest: [...probed]
      .sort((a, b) => b.bytes - a.bytes)
      .slice(0, 10)
      .map((row) => ({
        bytes: row.bytes,
        mb: Number((row.bytes / 1024 / 1024).toFixed(2)),
        cacheControl: row.cacheControl,
        contentType: row.contentType,
        pathHash: createHash("sha1").update(row.url).digest("hex").slice(0, 12),
      })),
    estimates: {
      warm59PhotosPerSessionGB: Number(((avg * 59) / 1024 / 1024 / 1024).toFixed(3)),
      warm59x10kSessionsGB: Number(((avg * 59 * 10000) / 1024 / 1024 / 1024).toFixed(1)),
      uniquePhotosx100DownloadsGB: Number(
        ((avg * photos.length * 100) / 1024 / 1024 / 1024).toFixed(1),
      ),
    },
  };
}

const sourceHits = scanSource();
const shuffle = await probeShuffle();
const report = {
  generatedAt: new Date().toISOString(),
  base: BASE,
  sourceHits: Object.fromEntries(
    Object.entries(sourceHits).map(([k, rows]) => [
      k,
      { files: rows.length, total: rows.reduce((n, r) => n + r.count, 0) },
    ]),
  ),
  shuffle,
  conclusions: [
    "Most probed objects historically used private,max-age=0 (forces revalidation).",
    "Profile photos are often hundreds of KB to multi-MB originals with no thumbnails.",
    "Stories index previously preloaded first media for EVERY group on materialization.",
    "Shuffle warmImages can request dozens of full originals per session.",
  ],
};

const outPath = join(ROOT, "scripts", "checkpoints", "storage-egress-audit.json");
try {
  writeFileSync(outPath, JSON.stringify(report, null, 2));
} catch {
  // checkpoints dir may be absent in some checkouts
}
console.log(JSON.stringify(report, null, 2));
