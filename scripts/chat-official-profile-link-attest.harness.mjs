/**
 * CHAT_OFFICIAL_PROFILE_LINK_ATTEST
 * Badge only after server verify + MAC. Complete forgeries stay hidden.
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { installHarnessAlias, installHarnessWindow } from "./harness-alias.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
installHarnessWindow();
installHarnessAlias(root);

const decide = await import(
  pathToFileURL(path.join(root, "src/lib/chat/officialProfileLinkMessage.ts")).href
);
const ticket = await import(
  pathToFileURL(path.join(root, "src/lib/profile/verifiedProfileLinkTicket.ts")).href
);
const verifyMod = await import(
  pathToFileURL(path.join(root, "src/lib/chat/verifiedProfileLinkVerify.ts")).href
);
const core = await import(
  pathToFileURL(path.join(root, "functions/src/verifiedProfileLinkCore.ts")).href
);

const modern = fs.readFileSync(path.join(root, "src/components/chat/ProfileAnonChat.tsx"), "utf8");
const classic = fs.readFileSync(path.join(root, "src/app/chat/[chatId]/legacy-chat.tsx"), "utf8");
const functionsIndex = fs.readFileSync(path.join(root, "functions/src/index.ts"), "utf8");
const logoutSrc = fs.readFileSync(path.join(root, "src/lib/auth/logout.ts"), "utf8");

assert.match(modern, /ChatOfficialProfileVerifiedBadge/);
assert.match(classic, /ChatOfficialProfileVerifiedBadge/);
assert.match(functionsIndex, /verifyVerifiedProfileLink/);
assert.match(functionsIndex, /defineSecret/);
assert.match(functionsIndex, /VERIFIED_PROFILE_LINK_MAC/);
assert.match(logoutSrc, /clearVerifiedProfileLinkTicket/);
assert.match(logoutSrc, /disarmVerifiedProfileLinkClaimRetry/);
assert.match(modern, /scheduleVerifiedProfileLinkClaimRetry/);
assert.match(classic, /scheduleVerifiedProfileLinkClaimRetry/);
assert.match(modern, /armVerifiedProfileLinkClaimRetry/);
assert.match(classic, /armVerifiedProfileLinkClaimRetry/);
assert.match(
  fs.readFileSync(path.join(root, "src/lib/profile/verifiedProfileLinkTicket.ts"), "utf8"),
  /clearVerifiedProfileLinkTicketIfExact/,
);
assert.doesNotMatch(
  fs.readFileSync(path.join(root, "src/lib/chat/persistAnonMessage.ts"), "utf8"),
  /verifiedProfileAttestation:/,
);

const SECRET = "unit-test-mac-secret";
const OFFICIAL = "https://sytm.me/@sex";
const chatId = "chat_owner_sex";
const messageId = "msg_attested";
const ticketId = "b".repeat(40);
const ownerUid = "uid_owner";
const forgedComplete = {
  ticketId,
  ownerUid,
  username: "sex",
  chatId,
  messageId,
};

assert.equal(
  decide.decideOfficialProfileLinkRender({
    text: OFFICIAL,
    chatId,
    id: messageId,
    verifiedProfileAttestation: forgedComplete,
  }),
  null,
  "complete forged object must not render before verify",
);
assert.equal(
  decide.decideOfficialProfileLinkRender(
    {
      text: OFFICIAL,
      chatId,
      id: messageId,
      verifiedProfileAttestation: forgedComplete,
    },
    { ok: false },
  ),
  null,
  "verify false/error/offline => no badge",
);
assert.equal(
  decide.decideOfficialProfileLinkRender(
    {
      text: OFFICIAL,
      chatId,
      id: messageId,
      verifiedProfileAttestation: forgedComplete,
    },
    null,
  ),
  null,
);

assert.equal(
  core.decideIssueVerifiedProfileLinkTicket({
    uid: ownerUid,
    username: "sex",
    profileUsername: "sex",
    nowMs: 1_000,
    secret: "",
  }).error,
  "failed-precondition",
);

const issued = core.decideIssueVerifiedProfileLinkTicket({
  uid: ownerUid,
  username: "Sex",
  profileUsername: "sex",
  nowMs: 1_000,
  secret: SECRET,
});
assert.equal(issued.ok, true);

function signedTicket(patch) {
  const base = {
    ticketId,
    ownerUid,
    username: "sex",
    text: OFFICIAL,
    expiresAtMs: 20_000,
    consumed: false,
    ...patch,
  };
  const mac = core.signVerifiedProfileLinkTicket(SECRET, base);
  assert.equal(mac.ok, true);
  return { ...base, mac: mac.mac };
}

const unsigned = {
  ticketId,
  ownerUid,
  username: "sex",
  text: OFFICIAL,
  expiresAtMs: 20_000,
  consumed: true,
  consumedChatId: chatId,
  consumedMessageId: messageId,
};
assert.equal(
  core.decideVerifyVerifiedProfileLink({
    secret: SECRET,
    ticket: unsigned,
    messageText: OFFICIAL,
    messageAuthorUid: ownerUid,
    chatId,
    messageId,
  }).reason,
  "bad-mac",
);

const live = signedTicket({});
assert.equal(
  core.decideClaimVerifiedProfileLinkTicket({
    uid: ownerUid,
    secret: SECRET,
    ticket: live,
    messageText: OFFICIAL,
    messageAuthorUid: `profile_${ownerUid}`,
    chatId,
    messageId,
    nowMs: 1_000,
  }).ok,
  true,
  "owner copy+claim PASS",
);
const altered = { ...live, mac: "c".repeat(64) };
assert.equal(
  core.decideClaimVerifiedProfileLinkTicket({
    uid: ownerUid,
    secret: SECRET,
    ticket: altered,
    messageText: OFFICIAL,
    messageAuthorUid: ownerUid,
    chatId,
    messageId,
    nowMs: 1_000,
  }).reason,
  "bad-mac",
);

const consumed = signedTicket({
  consumed: true,
  consumedChatId: chatId,
  consumedMessageId: messageId,
});

assert.equal(
  core.decideVerifyVerifiedProfileLink({
    secret: SECRET,
    ticket: consumed,
    messageText: OFFICIAL,
    messageAuthorUid: ownerUid,
    chatId: "other_chat",
    messageId,
  }).reason,
  "other-chat",
);
assert.equal(
  core.decideVerifyVerifiedProfileLink({
    secret: SECRET,
    ticket: consumed,
    messageText: OFFICIAL,
    messageAuthorUid: ownerUid,
    chatId,
    messageId: "other_msg",
  }).reason,
  "other-message",
);
assert.equal(
  core.decideClaimVerifiedProfileLinkTicket({
    uid: ownerUid,
    secret: SECRET,
    ticket: consumed,
    messageText: OFFICIAL,
    messageAuthorUid: ownerUid,
    chatId,
    messageId,
    nowMs: 1_000,
  }).ok,
  true,
  "same ticket+chat+message claim is idempotent",
);
assert.equal(
  core.decideClaimVerifiedProfileLinkTicket({
    uid: ownerUid,
    secret: SECRET,
    ticket: consumed,
    messageText: OFFICIAL,
    messageAuthorUid: ownerUid,
    chatId,
    messageId,
    nowMs: 1_000,
  }).alreadyClaimed,
  true,
);
assert.equal(
  core.decideClaimVerifiedProfileLinkTicket({
    uid: ownerUid,
    secret: SECRET,
    ticket: signedTicket({ expiresAtMs: 500 }),
    messageText: OFFICIAL,
    messageAuthorUid: ownerUid,
    chatId,
    messageId,
    nowMs: 1_000,
  }).reason,
  "expired",
);

const verified = core.decideVerifyVerifiedProfileLink({
  secret: SECRET,
  ticket: consumed,
  messageText: OFFICIAL,
  messageAuthorUid: `profile_${ownerUid}`,
  chatId,
  messageId,
});
assert.equal(verified.ok, true);
assert.equal(verified.username, "sex");

const badge = decide.decideOfficialProfileLinkRender(
  {
    text: OFFICIAL,
    chatId,
    id: messageId,
    verifiedProfileAttestation: { ticketId },
  },
  { ok: true, username: verified.username },
);
assert.ok(badge);
assert.equal(badge.profileHref, "/u/sex");
assert.equal(
  decide.decideOfficialProfileLinkRender({
    text: OFFICIAL,
    chatId,
    id: messageId,
    verifiedProfileAttestation: { ticketId },
  }),
  null,
  "remount without a new verify stays hidden",
);

const memory = verifyMod.createVerifiedProfileLinkVerifyMemory();
memory.set("k", { ok: true, username: "sex" });
assert.equal(memory.persistable(), false);
memory.clear();
assert.equal(memory.get("k"), null);

ticket.storeVerifiedProfileLinkTicket({
  ticketId,
  ownerUid,
  username: "sex",
  text: OFFICIAL,
  expiresAtMs: Date.now() + 60_000,
});
assert.equal(ticket.consumeVerifiedProfileLinkTicket({ ownerUid, text: "hola" }), null);
assert.equal(ticket.peekVerifiedProfileLinkTicket(ownerUid), null, "mismatch clears ticket");

ticket.storeVerifiedProfileLinkTicket({
  ticketId,
  ownerUid,
  username: "sex",
  text: OFFICIAL,
  expiresAtMs: Date.now() + 60_000,
});
assert.equal(ticket.peekVerifiedProfileLinkTicket("other_uid"), null);

const issuedClient = await ticket.issueVerifiedProfileLinkTicket({
  username: "sex",
  ownerUid,
  callIssue: async () => ({ ticketId, text: OFFICIAL, expiresAtMs: Date.now() + 60_000 }),
});
assert.equal(issuedClient.ok, true);
assert.equal(issuedClient.ticket?.ticketId, ticketId);

let claimCalls = 0;
const firstClaim = await ticket.maybeClaimVerifiedProfileLink({
  chatId,
  messageId,
  text: OFFICIAL,
  ownerUid,
  callClaim: async () => {
    claimCalls += 1;
    throw Object.assign(new Error("unavailable"), { code: "unavailable" });
  },
});
assert.equal(firstClaim.ok, false);
assert.equal(firstClaim.retryable, true);
assert.equal(ticket.peekVerifiedProfileLinkTicket(ownerUid)?.boundMessageId, messageId);

const otherMsg = await ticket.maybeClaimVerifiedProfileLink({
  chatId,
  messageId: "other_msg",
  text: OFFICIAL,
  ownerUid,
  callClaim: async () => ({ ok: true }),
});
assert.equal(otherMsg.ok, false);
assert.equal(otherMsg.stage, "other-message");

const retrySame = await ticket.maybeClaimVerifiedProfileLink({
  chatId,
  messageId,
  text: OFFICIAL,
  ownerUid,
  callClaim: async () => {
    claimCalls += 1;
    return { ok: true };
  },
});
assert.equal(retrySame.ok, true);
assert.equal(retrySame.ticketId, ticketId);
assert.equal(claimCalls, 2);
assert.equal(ticket.peekVerifiedProfileLinkTicket(ownerUid), null);

assert.equal(
  (
    await ticket.maybeClaimVerifiedProfileLink({
      chatId,
      messageId,
      text: OFFICIAL,
      ownerUid,
      callClaim: async () => {
        throw new Error("should not run without local ticket");
      },
    })
  ).ok,
  false,
);

// Copy must not report verified success without an issued ticket.
const bubbleSrc = fs.readFileSync(
  path.join(root, "src/components/profile/VerifiedLinkBubble.tsx"),
  "utf8",
);
const linkSrc = fs.readFileSync(path.join(root, "src/lib/profile/verifiedLink.ts"), "utf8");
assert.match(linkSrc, /reason: "issue_failed"/);
assert.match(linkSrc, /reason: "claim_pending"/);
assert.match(linkSrc, /scheduleVerifiedProfileLinkClaimRetry/);
assert.match(bubbleSrc, /VERIFIED_PROFILE_LINK_CLAIM_PENDING_COPY_MESSAGE/);
assert.equal(
  (
    await import(
      pathToFileURL(path.join(root, "src/lib/profile/verifiedLink.ts")).href
    )
  ).VERIFIED_PROFILE_LINK_CLAIM_PENDING_COPY_MESSAGE,
  "El link anterior todavía se está verificando. Reintentá en unos segundos",
);
assert.doesNotMatch(
  bubbleSrc.slice(bubbleSrc.indexOf('if (result.reason === "claim_pending")'), bubbleSrc.indexOf('if (result.reason === "claim_pending")') + 280),
  /setModalLink|showToast\("Link verificado/,
);
assert.doesNotMatch(
  linkSrc.slice(linkSrc.indexOf("export async function copyVerifiedProfileLink")),
  /issued\?\.text \|\| getVerifiedProfileUrl/,
);
assert.match(bubbleSrc, /recopyVerifiedProfileLinkText/);
assert.doesNotMatch(
  bubbleSrc.slice(bubbleSrc.indexOf("async function copyFromModal")),
  /copyVerifiedProfileLink\(username\)/,
);
assert.match(modern, /claim\.ok/);
assert.match(classic, /claim\.ok/);
assert.match(modern, /verifiedProfileAttestation: \{ ticketId: claim\.ticketId \}/);
assert.match(classic, /verifiedProfileAttestation: \{ ticketId: claim\.ticketId \}/);
assert.match(
  fs.readFileSync(path.join(root, "functions/src/verifiedProfileLinkCore.ts"), "utf8"),
  /alreadyClaimed: true/,
);
assert.match(
  fs.readFileSync(path.join(root, "functions/src/verifiedProfileLink.ts"), "utf8"),
  /decision\.alreadyClaimed/,
);
assert.match(
  fs.readFileSync(path.join(root, "functions/src/verifiedProfileLink.ts"), "utf8"),
  /resolveChatMessageLocationForVerifiedLink/,
);
assert.match(
  fs.readFileSync(path.join(root, "functions/src/verifiedProfileLink.ts"), "utf8"),
  /boundChatId/,
);
assert.match(
  fs.readFileSync(path.join(root, "functions/src/verifiedProfileLinkCore.ts"), "utf8"),
  /reason === "no-secret"/,
);
assert.match(modern, /verifiedLinkChatId/);
assert.match(modern, /persisted\.canonicalChatId/);
assert.doesNotMatch(
  fs
    .readFileSync(path.join(root, "src/lib/profile/verifiedProfileLinkTicket.ts"), "utf8")
    .slice(
      fs
        .readFileSync(path.join(root, "src/lib/profile/verifiedProfileLinkTicket.ts"), "utf8")
        .indexOf("const permanent"),
      fs
        .readFileSync(path.join(root, "src/lib/profile/verifiedProfileLinkTicket.ts"), "utf8")
        .indexOf("const permanent") + 180,
    ),
  /not-found/,
);

// not-found must keep the bound ticket for retry (lost race / alias).
ticket.clearVerifiedProfileLinkTicket();
ticket.storeVerifiedProfileLinkTicket({
  ticketId,
  ownerUid,
  username: "sex",
  text: OFFICIAL,
  expiresAtMs: Date.now() + 60_000,
});
const notFound = await ticket.maybeClaimVerifiedProfileLink({
  chatId,
  messageId,
  text: OFFICIAL,
  ownerUid,
  callClaim: async () => {
    throw Object.assign(new Error("not-found"), { code: "functions/not-found" });
  },
});
assert.equal(notFound.ok, false);
assert.equal(notFound.retryable, true);
assert.equal(ticket.peekVerifiedProfileLinkTicket(ownerUid)?.boundMessageId, messageId);

// no-secret scrub must keep attestation (fail closed on badge, not destroy).
assert.equal(
  core.decideKeepVerifiedProfileAttestation({
    attestation: { ticketId },
    secret: "",
    ticket: null,
    chatId,
    messageId,
    messageText: OFFICIAL,
    messageAuthorUid: ownerUid,
  }),
  "keep",
);

const offline = await verifyMod.callVerifyVerifiedProfileLink(
  { chatId, messageId, ticketId },
  async () => {
    throw new Error("offline");
  },
);
assert.deepEqual(offline, { ok: false });
assert.equal(
  decide.decideOfficialProfileLinkRender(
    {
      text: OFFICIAL,
      chatId,
      id: messageId,
      verifiedProfileAttestation: forgedComplete,
    },
    offline,
  ),
  null,
);

console.log(JSON.stringify({ gate: "CHAT_OFFICIAL_PROFILE_LINK_ATTEST", pass: true }, null, 2));
