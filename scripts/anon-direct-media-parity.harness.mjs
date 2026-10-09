/**
 * Anon-direct media/reply/viewOnce parity contracts + 0 extra Firestore reads.
 *   node --experimental-strip-types scripts/anon-direct-media-parity.harness.mjs
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { installHarnessAlias, installHarnessWindow } from "./harness-alias.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
installHarnessWindow();
installHarnessAlias(root);

const labels = await import(
  pathToFileURL(path.join(root, "src/lib/anonMatch/anonDirectMediaLabels.ts")).href
);
const model = await import(
  pathToFileURL(path.join(root, "src/lib/anonMatch/anonDirectMessageModel.ts")).href
);
const persist = await import(
  pathToFileURL(path.join(root, "src/lib/anonMatch/persistDirectMessage.ts")).href
);
const capability = await import(
  pathToFileURL(path.join(root, "src/lib/anonMatch/anonDirectViewOnceCapability.ts")).href
);
const risks = await import(
  pathToFileURL(path.join(root, "src/lib/anonMatch/anonDirectParityRisks.ts")).href
);

assert.equal(labels.anonDirectMediaLastMessageLabel("audio"), "audio");
assert.equal(labels.anonDirectMediaLastMessageLabel("image", "camera"), "enviado desde cámara");
assert.equal(labels.anonDirectMediaLastMessageLabel("video", "gallery"), "video");
assert.equal(
  labels.anonDirectIncomingNotifyBody({ type: "image", source: "gallery" }),
  "foto",
);
assert.equal(
  labels.anonDirectIncomingNotifyBody({ text: "hola", type: "image" }),
  "hola",
);

const mapped = model.mapAnonDirectMessageDoc({
  id: "m1",
  senderId: "anon_me",
  data: {
    senderId: "anon_peer",
    type: "image",
    mediaUrl: "https://example.test/a.jpg",
    source: "camera",
    reply: "📷 Foto",
    texto: "",
  },
});
assert.equal(mapped.mine, false);
assert.equal(mapped.type, "image");
assert.equal(mapped.mediaUrl, "https://example.test/a.jpg");
assert.equal(mapped.reply, "📷 Foto");
assert.equal(mapped.source, "camera");

const mine = model.mapAnonDirectMessageDoc({
  id: "m2",
  senderId: "anon_me",
  data: { senderId: "anon_me", type: "text", texto: "hola" },
});
assert.equal(mine.mine, true);
assert.equal(mine.text, "hola");

const bombMapped = model.mapAnonDirectMessageDoc({
  id: "m3",
  senderId: "anon_me",
  data: {
    senderId: "anon_peer",
    type: "image",
    viewOnce: true,
    mediaUrl: "https://example.test/leak.jpg",
    viewOnceSealed: true,
  },
});
assert.equal(bombMapped.viewOnce, true);
assert.equal(bombMapped.mediaUrl, undefined, "listener must redact bomb mediaUrl");

const bomb = capability.getAnonDirectViewOnceCapability();
assert.equal(bomb.status, "PASS");
assert.equal(bomb.maySendViewOnce, true);
assert.equal(bomb.mayClaimViewOnce, true);
assert.equal(bomb.mayShowWorkingBombUi, true);
assert.equal(bomb.collectionRootsOk, true);
assert.equal(bomb.storageChatsPrefixOk, true);

capability.assertAnonDirectViewOnceSendAllowed(true);
capability.assertAnonDirectViewOnceSendAllowed(false);

const preview = persist.buildAnonDirectPersistPayloadPreview({
  chatId: "c1",
  senderId: "anon_me",
  senderTipo: "anonimo",
  type: "image",
  mediaUrl: "https://example.test/a.jpg",
  source: "gallery",
});
assert.equal(preview.collectionRoot, "chats_anonimos");
assert.equal(preview.storageUploadPrefix, "chats/");
assert.equal(preview.includesMediaUrl, true);
assert.equal(preview.zeroExtraReads, true);
assert.equal(preview.viewOnce, false);

const bombPreview = persist.buildAnonDirectPersistPayloadPreview({
  chatId: "c1",
  senderId: "anon_me",
  senderTipo: "anonimo",
  type: "image",
  mediaUrl: "https://example.test/a.jpg",
  viewOnce: true,
});
assert.equal(bombPreview.viewOnce, true);
assert.equal(bombPreview.includesMediaUrl, false);
assert.equal(bombPreview.viewOnceRejected, false);

// 0 extra Firestore reads in persist/media-send modules (static contract).
const persistSrc = readFileSync(
  path.join(root, "src/lib/anonMatch/persistDirectMessage.ts"),
  "utf8",
);
const mediaSendSrc = readFileSync(
  path.join(root, "src/lib/anonMatch/anonDirectMediaSend.ts"),
  "utf8",
);
for (const [name, src] of [
  ["persistDirectMessage.ts", persistSrc],
  ["anonDirectMediaSend.ts", mediaSendSrc],
]) {
  assert.equal(src.includes("getDoc("), false, `${name} must not getDoc`);
  assert.equal(src.includes("getDocs("), false, `${name} must not getDocs`);
  assert.equal(src.includes("onSnapshot("), false, `${name} must not onSnapshot`);
}
assert.match(persistSrc, /buildViewOncePublicBirthFields/);
assert.match(persistSrc, /commitViewOnceSecret/);
assert.match(persistSrc, /mediaUrl && !viewOnce/);

// Window must keep black-screen expanded shell and bomb PASS wiring.
const windowSrc = readFileSync(
  path.join(root, "src/components/anonMatch/AnonDirectChatWindow.tsx"),
  "utf8",
);
assert.match(windowSrc, /fixed inset-0 z-\[120\] flex flex-col bg-black/);
assert.match(windowSrc, /sayittome-anon-chat-open/);
assert.match(windowSrc, /AnonDirectMediaComposer/);
assert.match(windowSrc, /data-anon-direct-chat-scroll/);
assert.match(windowSrc, /claimViewOnceMedia/);
assert.match(windowSrc, /\/api\/view-once\/media/);
assert.match(windowSrc, /setSecureBombScreen/);

const composerSrc = readFileSync(
  path.join(root, "src/components/anonMatch/AnonDirectMediaComposer.tsx"),
  "utf8",
);
assert.match(composerSrc, /data-anon-direct-bomb-status=\{bombCap\.status\}/);
assert.match(composerSrc, /uploadChatMessageMedia|sendAnonDirectMediaMessage/);
assert.match(composerSrc, /ChatAudioHoldLockMic/);
assert.match(composerSrc, /viewOnce: sendAsBomb/);
assert.match(composerSrc, /data-anon-direct-bomb-toggle/);

const membershipRisk = risks.ANON_DIRECT_PARITY_RISKS.find((r) => r.id === "viewonce_membership");
assert.ok(membershipRisk);
assert.equal(membershipRisk.severity, "resolved");

console.log(
  JSON.stringify(
    {
      ok: true,
      bombitas: bomb.status,
      bombReason: bomb.reason,
      zeroExtraReads: true,
      riskCount: risks.ANON_DIRECT_PARITY_RISKS.length,
    },
    null,
    2,
  ),
);
