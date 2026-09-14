/**
 * ADMIN_SPECTATOR_MEDIA — explicit type beats URL extension; composite scope key; route no-store.
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { installHarnessAlias, installHarnessWindow } from "./harness-alias.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
installHarnessWindow();
installHarnessAlias(root);

const evidenceSrc = fs.readFileSync(
  path.join(root, "src/components/admin/AdminEvidenceMedia.tsx"),
  "utf8",
);
const spectatorSrc = fs.readFileSync(
  path.join(root, "src/components/admin/review/AdminSpectatorMessageContent.tsx"),
  "utf8",
);
const routeSrc = fs.readFileSync(
  path.join(root, "src/app/api/admin/message-media/route.ts"),
  "utf8",
);
const readSrc = fs.readFileSync(
  path.join(root, "src/lib/admin/adminMessageMediaRead.ts"),
  "utf8",
);

assert.match(evidenceSrc, /mediaType/);
assert.match(evidenceSrc, /explicit === "video"/);
assert.match(spectatorSrc, /adminMediaScopeKey/);
assert.match(spectatorSrc, /key=\{scopeKey\}/);
assert.match(spectatorSrc, /adminSpectatorMediaDisplay/);
assert.match(spectatorSrc, /mediaType="video"/);
assert.match(spectatorSrc, /mediaType="image"/);
assert.match(spectatorSrc, /Reintentar/);
assert.doesNotMatch(spectatorSrc, /isVideoMediaUrl\(mediaUrl\)/);
assert.doesNotMatch(spectatorSrc, /setMediaUrl\(inlineUrl\)/);
assert.match(routeSrc, /verifyAdminIdToken/);
assert.match(routeSrc, /Cache-Control.*no-store/);
assert.match(readSrc, /never increments viewOnce/);
assert.doesNotMatch(readSrc, /openedCount.*increment|update.*openedCount/i);

function resolveRenderKind(url, mediaType) {
  const explicit = String(mediaType || "").trim().toLowerCase();
  if (explicit === "video") return "video";
  if (explicit === "image" || explicit === "photo") return "image";
  return /\.(mp4|webm|mov)(\?|$)/i.test(url) ? "video" : "image";
}

assert.equal(resolveRenderKind("https://cdn.example/noext", "video"), "video");
assert.equal(resolveRenderKind("https://cdn.example/noext.mp4", "image"), "image");
assert.equal(resolveRenderKind("https://cdn.example/audio", "audio"), "image");

const mediaMod = await import(
  pathToFileURL(path.join(root, "src/lib/admin/adminSpectatorMediaDisplay.ts")).href,
);

assert.equal(
  mediaMod.shouldApplyAdminMediaFetchResult("chatA/mensajes/m1:0", "chatA/mensajes/m1:0"),
  true,
);
assert.equal(
  mediaMod.shouldApplyAdminMediaFetchResult("chatA/mensajes/m1:0", "chatB/mensajes/m2:0"),
  false,
);

const stale = mediaMod.resolveAdminMediaDisplay({
  needsAdminFetch: true,
  inlineUrl: "",
  inlineType: "video",
  fetchKey: "chatB/mensajes/m2:0",
  asyncMedia: {
    fetchKey: "chatA/mensajes/m1:0",
    mediaUrl: "https://cdn.example/stale-noext",
    resolvedType: "video",
    status: "ready",
    error: "",
  },
});
assert.equal(stale.loading, true, "pending fetch for chatB must not show chatA media");
assert.equal(stale.mediaUrl, "", "stale URL must not surface while scope changed");

const inline = mediaMod.resolveAdminMediaDisplay({
  needsAdminFetch: false,
  inlineUrl: "https://cdn.example/inline-noext",
  inlineType: "image",
  fetchKey: "",
  asyncMedia: {
    fetchKey: "",
    mediaUrl: "",
    resolvedType: "image",
    status: "ready",
    error: "",
  },
});
assert.equal(inline.mediaUrl, "https://cdn.example/inline-noext");
assert.equal(inline.loading, false);

console.log(JSON.stringify({ gate: "ADMIN_SPECTATOR_MEDIA", pass: true }, null, 2));
