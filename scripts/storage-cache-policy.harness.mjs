#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { spawnSync } from "node:child_process";

const ROOT = process.cwd();
const fails = [];
function assert(cond, msg) {
  if (!cond) fails.push(msg);
}

const policySrc = readFileSync(join(ROOT, "src/lib/media/storageCacheControl.ts"), "utf8");
assert(policySrc.includes("PUBLIC_PROFILE_CACHE_CONTROL"), "profile public cache constant missing");
assert(policySrc.includes("PUBLIC_STORY_CACHE_CONTROL"), "story cache constant missing");
assert(policySrc.includes("CHAT_CACHE_CONTROL"), "chat private cache constant missing");
assert(policySrc.includes("VIEW_ONCE_CACHE_CONTROL"), "view-once no-store constant missing");
assert(policySrc.includes("EVIDENCE_CACHE_CONTROL"), "evidence no-store constant missing");
assert(
  policySrc.includes('return "private,no-store"') ||
    policySrc.includes("VIEW_ONCE_CACHE_CONTROL"),
  "view-once must map to no-store",
);
assert(!/export function storageUploadMetadata\(\s*contentType: string\s*\)/.test(policySrc),
  "storageUploadMetadata must accept path/options, not only contentType");

const uploadHelper = readFileSync(join(ROOT, "src/lib/media/uploadFileToStorage.ts"), "utf8");
assert(
  uploadHelper.includes("storageUploadMetadata(contentType, path, cache)"),
  "uploadFileToStorage must pass path into cache policy",
);

const chatUpload = readFileSync(join(ROOT, "src/lib/media/upload.ts"), "utf8");
assert(chatUpload.includes("viewOnce"), "chat upload must accept viewOnce option");
assert(
  chatUpload.includes('category: options?.viewOnce ? "view_once" : "chat"'),
  "chat upload must choose view_once vs chat category",
);

const legacy = readFileSync(join(ROOT, "src/app/chat/[chatId]/legacy-chat.tsx"), "utf8");
assert(
  legacy.includes('cacheControl: "private,max-age=86400"'),
  "legacy chat must not use public immutable cache",
);
assert(!legacy.includes("public,max-age=31536000,immutable"), "legacy chat public immutable forbidden");

const fixture = spawnSync(
  process.execPath,
  ["scripts/backfill-storage-cache-control.mjs", "--fixture"],
  { cwd: ROOT, encoding: "utf8" },
);
assert(fixture.status === 0, `backfill --fixture failed: ${fixture.stderr || fixture.stdout}`);
const fixtureJson = JSON.parse(fixture.stdout);
const byName = Object.fromEntries(fixtureJson.report.map((row) => [row.name, row.targetCacheControl]));
assert(byName["usuarios/u1/fotos/123_avatar.jpg"]?.startsWith("public"), "profile should be public cache");
assert(byName["historias/u1/456-story.jpg"]?.startsWith("public"), "story should be public day cache");
assert(byName["chats/c1/abc_jpg"]?.startsWith("private"), "chat should be private cache");
assert(byName["chats/c1/xyz_view_once_jpg"] === "private,no-store", "view-once heuristic no-store");
assert(byName["report_evidence/r1.png"] === "private,no-store", "evidence no-store");
assert(byName["roleplay_appeals/u1/note.jpg"] === "private,no-store", "appeals no-store");

if (fails.length) {
  console.error("storage-cache-policy FAILED");
  for (const fail of fails) console.error(` - ${fail}`);
  process.exit(1);
}

console.log(
  JSON.stringify(
    {
      ok: true,
      matrix: byName,
      guards: ["path_aware_uploads", "no_public_chat_cache", "fixture_policies"],
    },
    null,
    2,
  ),
);
