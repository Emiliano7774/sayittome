#!/usr/bin/env node
/**
 * Metadata-only Storage cacheControl backfill (no re-upload, no deletes).
 *
 * Requires Application Default Credentials or GOOGLE_APPLICATION_CREDENTIALS.
 *
 *   node scripts/backfill-storage-cache-control.mjs --dry-run
 *   node scripts/backfill-storage-cache-control.mjs --apply --prefix=usuarios/ --limit=500
 */
import { initializeApp, applicationDefault, getApps } from "firebase-admin/app";
import { getStorage } from "firebase-admin/storage";

const args = process.argv.slice(2);
const apply = args.includes("--apply");
const dryRun = !apply;
const prefix =
  (args.find((a) => a.startsWith("--prefix=")) || "").slice("--prefix=".length) || "";
const limit = Number(
  (args.find((a) => a.startsWith("--limit=")) || "--limit=2000").slice("--limit=".length),
);
const CACHE = "public,max-age=31536000,immutable";
const BUCKET =
  process.env.FIREBASE_STORAGE_BUCKET || "sayittome-app.firebasestorage.app";

if (!getApps().length) {
  initializeApp({
    credential: applicationDefault(),
    storageBucket: BUCKET,
  });
}

const bucket = getStorage().bucket(BUCKET);

let scanned = 0;
let alreadyGood = 0;
let wouldUpdate = 0;
let updated = 0;
let errors = 0;

console.log(
  JSON.stringify(
    {
      bucket: BUCKET,
      prefix: prefix || "(all)",
      mode: dryRun ? "dry-run" : "apply",
      limit,
      targetCacheControl: CACHE,
    },
    null,
    2,
  ),
);

const [files] = await bucket.getFiles({
  prefix: prefix || undefined,
  maxResults: limit,
  autoPaginate: true,
});

for (const file of files.slice(0, limit)) {
  scanned += 1;
  try {
    const [meta] = await file.getMetadata();
    const current = String(meta.cacheControl || "");
    if (current.includes("max-age=31536000")) {
      alreadyGood += 1;
      continue;
    }
    wouldUpdate += 1;
    if (!dryRun) {
      await file.setMetadata({ cacheControl: CACHE });
      updated += 1;
    }
  } catch (error) {
    errors += 1;
    console.error("error", file.name, error?.message || error);
  }
}

console.log(
  JSON.stringify(
    {
      ok: errors === 0,
      scanned,
      alreadyGood,
      wouldUpdate,
      updated: dryRun ? 0 : updated,
      dryRun,
    },
    null,
    2,
  ),
);
