/** Mandatory anon-match alert + competing-request cancellation contract. */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { installHarnessAlias, installHarnessWindow } from "./harness-alias.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
installHarnessWindow();
installHarnessAlias(root);

const read = (file) => fs.readFileSync(path.join(root, file), "utf8");
const alertSource = read("src/lib/anonMatch/incomingMatchAlert.ts");
const notificationSource = read("src/lib/chat/chatNotifications.ts");
const contextSource = read("src/contexts/AnonMatchContext.tsx");
const serviceSource = read("src/lib/anonMatch/service.ts");

assert.match(alertSource, /playIncomingWhipSound\(\)/);
assert.match(alertSource, /navigator\.vibrate/);
assert.match(alertSource, /showRequiredAnonMatchNotification/);
assert.match(notificationSource, /ANON_MATCH_CHANNEL_ID/);
assert.match(notificationSource, /showRequiredAnonMatchNotification/);
assert.match(notificationSource, /dismissRequiredAnonMatchNotification/);
assert.match(contextSource, /dismissIncomingAnonMatchRequestAlert\(id\)/);
assert.match(serviceSource, /cancelCompetingAnonMatchRequests/);
assert.match(serviceSource, /reason:\s*responderBusy[\s\S]*target_busy/);

const service = await import(
  pathToFileURL(path.join(root, "src/lib/anonMatch/service.ts")).href
);
const request = {
  solicitanteUid: "profile-a",
  solicitanteAnonId: "anon-a",
  destinatarioUid: "profile-b",
  anonId: "anon-b",
};
assert.equal(service.anonMatchRequestInvolvesParticipant(request, "profile-a", ""), true);
assert.equal(service.anonMatchRequestInvolvesParticipant(request, "profile-b", ""), true);
assert.equal(service.anonMatchRequestInvolvesParticipant(request, "", "anon-a"), true);
assert.equal(service.anonMatchRequestInvolvesParticipant(request, "", "anon-b"), true);
assert.equal(service.anonMatchRequestInvolvesParticipant(request, "profile-z", "anon-z"), false);

console.log(JSON.stringify({ gate: "ANON_MATCH_REQUIRED_ALERT", pass: true }, null, 2));
