#!/usr/bin/env node
/**
 * Metadata-only Storage cacheControl backfill (no re-upload, no deletes).
 *
 * Policies:
 *   usuarios/           -> public,max-age=31536000,immutable
 *   historias/          -> public,max-age=86400
 *   chats/, chat_media/ -> private,max-age=86400
 *   report_evidence/, roleplay_appeals/ -> private,no-store
 *   *view-once* names   -> private,no-store (best-effort name heuristic)
 *
 * Usage:
 *   node scripts/backfill-storage-cache-control.mjs --dry-run --prefix=usuarios/ --limit=200
 *   node scripts/backfill-storage-cache-control.mjs --apply --prefix=historias/ --limit=500
 *   node scripts/backfill-storage-cache-control.mjs --fixture   # offline policy demo
 *
 * Auth:
 *   gcloud auth application-default login
 *   # or set GOOGLE_APPLICATION_CREDENTIALS to a service-account JSON path
 */
import { mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";

const args = process.argv.slice(2);
const apply = args.includes("--apply");
const dryRun = !apply;
const fixture = args.includes("--fixture");
const prefix =
  (args.find((a) => a.startsWith("--prefix=")) || "").slice("--prefix=".length) || "";
const limit = Number(
  (args.find((a) => a.startsWith("--limit=")) || "--limit=2000").slice("--limit=".length),
);
const pageSize = Math.min(
  500,
  Number((args.find((a) => a.startsWith("--page-size=")) || "--page-size=200").slice(12)),
);
const delayMs = Number(
  (args.find((a) => a.startsWith("--delay-ms=")) || "--delay-ms=25").slice("--delay-ms=".length),
);
const resumeFile =
  (args.find((a) => a.startsWith("--resume-file=")) || "").slice("--resume-file=".length) ||
  join(process.cwd(), "scripts", "checkpoints", "storage-cache-backfill-cursor.json");

const BUCKET =
  process.env.FIREBASE_STORAGE_BUCKET || "sayittome-app.firebasestorage.app";

const POLICY = {
  "usuarios/": "public,max-age=31536000,immutable",
  "historias/": "public,max-age=86400",
  "chats/": "private,max-age=86400",
  "chat_media/": "private,max-age=86400",
  "chats_anonimos/": "private,max-age=86400",
  "report_evidence/": "private,no-store",
  "roleplay_appeals/": "private,no-store",
};

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function policyForObjectName(name) {
  const path = String(name || "");
  if (/view[_-]?once|bomba/i.test(path)) return "private,no-store";
  for (const [p, cacheControl] of Object.entries(POLICY)) {
    if (path.startsWith(p)) return cacheControl;
  }
  return "private,max-age=3600";
}

function assertPrefixAllowed(selectedPrefix) {
  if (!selectedPrefix) {
    throw new Error("Refusing to scan entire bucket. Pass --prefix=usuarios/ (or another known prefix).");
  }
  const known = Object.keys(POLICY).some((p) => selectedPrefix.startsWith(p) || p.startsWith(selectedPrefix));
  if (!known) {
    throw new Error(`Unknown/unsafe prefix: ${selectedPrefix}`);
  }
}

function loadCursor() {
  if (!existsSync(resumeFile)) return null;
  try {
    return JSON.parse(readFileSync(resumeFile, "utf8"));
  } catch {
    return null;
  }
}

function saveCursor(cursor) {
  mkdirSync(join(process.cwd(), "scripts", "checkpoints"), { recursive: true });
  writeFileSync(resumeFile, JSON.stringify(cursor, null, 2));
}

async function runFixture() {
  const samples = [
    "usuarios/u1/fotos/123_avatar.jpg",
    "historias/u1/456-story.jpg",
    "chats/c1/abc_jpg",
    "chats/c1/xyz_view_once_jpg",
    "report_evidence/r1.png",
    "roleplay_appeals/u1/note.jpg",
  ];
  const report = samples.map((name) => ({
    name,
    targetCacheControl: policyForObjectName(name),
  }));
  console.log(
    JSON.stringify(
      {
        ok: true,
        mode: "fixture",
        note: "Offline policy matrix demo. No bucket access attempted.",
        report,
      },
      null,
      2,
    ),
  );
}

async function runLive() {
  assertPrefixAllowed(prefix);
  const { initializeApp, applicationDefault, getApps } = await import("firebase-admin/app");
  const { getStorage } = await import("firebase-admin/storage");

  if (!getApps().length) {
    initializeApp({
      credential: applicationDefault(),
      storageBucket: BUCKET,
    });
  }

  const bucket = getStorage().bucket(BUCKET);
  const cursor = loadCursor();
  let pageToken = cursor?.prefix === prefix ? cursor.pageToken : undefined;

  let scanned = 0;
  let alreadyGood = 0;
  let wouldUpdate = 0;
  let updated = 0;
  let errors = 0;
  let skipped = 0;

  console.log(
    JSON.stringify(
      {
        bucket: BUCKET,
        prefix,
        mode: dryRun ? "dry-run" : "apply",
        limit,
        pageSize,
        delayMs,
        resumeFrom: pageToken || null,
        targetPolicy: POLICY,
      },
      null,
      2,
    ),
  );

  while (scanned < limit) {
    const [batch, , apiResponse] = await bucket.getFiles({
      prefix,
      autoPaginate: false,
      maxResults: Math.min(pageSize, limit - scanned),
      pageToken,
    });

    for (const file of batch) {
      if (scanned >= limit) break;
      scanned += 1;
      const target = policyForObjectName(file.name);
      try {
        const [meta] = await file.getMetadata();
        const current = String(meta.cacheControl || "");
        if (current === target) {
          alreadyGood += 1;
          continue;
        }
        // Never "upgrade" private/sensitive objects to public by mistake.
        if (target.startsWith("public") && current.includes("no-store")) {
          skipped += 1;
          continue;
        }
        wouldUpdate += 1;
        if (!dryRun) {
          await file.setMetadata({ cacheControl: target });
          updated += 1;
        }
      } catch (error) {
        errors += 1;
        console.error("error", file.name, error?.message || error);
      }
      if (delayMs > 0) await sleep(delayMs);
    }

    pageToken = apiResponse?.nextPageToken;
    saveCursor({
      prefix,
      pageToken: pageToken || null,
      scanned,
      updatedAt: new Date().toISOString(),
    });
    if (!pageToken || batch.length === 0) break;
  }

  console.log(
    JSON.stringify(
      {
        ok: errors === 0,
        scanned,
        alreadyGood,
        wouldUpdate,
        updated: dryRun ? 0 : updated,
        skipped,
        dryRun,
        resumeFile,
        nextPageToken: pageToken || null,
      },
      null,
      2,
    ),
  );
}

if (fixture) {
  await runFixture();
} else {
  try {
    await runLive();
  } catch (error) {
    console.error(error?.message || error);
    console.error(
      "\nHint: run with --fixture for offline policy demo, or configure ADC:\n  gcloud auth application-default login\n",
    );
    process.exit(1);
  }
}
