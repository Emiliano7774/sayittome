/**
 * Anon↔anon bombitas membership + claim decisions (compiled functions/lib).
 * Negatives: stranger, forged alias, closed session, repeat claim.
 * Positives: both directions, photo + video.
 *
 *   npm --prefix functions run build
 *   node scripts/anon-direct-viewonce-membership.unit.mjs
 */
import assert from "node:assert/strict";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(import.meta.url);
const lib = path.join(root, "functions/lib");
const deleteCore = require(path.join(lib, "deleteChatMessageCore.js"));
const viewOnceCore = require(path.join(lib, "viewOnceClaimCore.js"));

const SOL_AUTH = "firebase_solicitante_uid";
const DEST_AUTH = "firebase_destinatario_uid";
const STRANGER = "firebase_stranger_uid";
const SOL_ANON = "anon_solicitante_session";
const DEST_ANON = "anon_destinatario_session";
const MEDIA_PHOTO = "https://cdn.example/bomb.jpg";
const MEDIA_VIDEO = "https://cdn.example/bomb.mp4";

function activeChat(extra = {}) {
  return {
    solicitanteUid: "",
    solicitanteAnonId: SOL_ANON,
    solicitanteAuthUid: SOL_AUTH,
    destinatarioUid: "",
    destinatarioAnonId: DEST_ANON,
    destinatarioAuthUid: DEST_AUTH,
    anonId: DEST_ANON,
    estado: "activo",
    tipo: "anon_con_anonimo",
    ...extra,
  };
}

function bombMessage(fromAlias, type = "image") {
  return {
    viewOnce: true,
    viewOnceLimit: 1,
    viewOnceOpenedCount: 0,
    viewOnceSealed: true,
    senderId: fromAlias,
    senderTipo: "anonimo",
    type,
  };
}

// --- Membership gates ---
assert.equal(
  deleteCore.isAnonMatchChatDoc(activeChat()),
  true,
  "auth uid fields mark anon-match doc",
);
assert.equal(
  deleteCore.isChatMember({
    uid: SOL_AUTH,
    chat: activeChat(),
    message: bombMessage(DEST_ANON),
  }),
  true,
  "solicitante auth is member on active session",
);
assert.equal(
  deleteCore.isChatMember({
    uid: DEST_AUTH,
    chat: activeChat(),
    message: bombMessage(SOL_ANON),
  }),
  true,
  "destinatario auth is member on active session",
);
assert.equal(
  deleteCore.isChatMember({
    uid: STRANGER,
    chat: activeChat(),
    message: bombMessage(SOL_ANON),
  }),
  false,
  "stranger with chatId knowledge is not member",
);
assert.equal(
  deleteCore.isChatMember({
    uid: SOL_AUTH,
    chat: activeChat({ estado: "cerrado" }),
    message: bombMessage(DEST_ANON),
  }),
  false,
  "closed session blocks membership",
);
assert.equal(
  deleteCore.isChatMember({
    uid: DEST_AUTH,
    chat: activeChat({ estado: "denunciado" }),
    message: bombMessage(SOL_ANON),
  }),
  false,
  "denunciado session blocks membership",
);
assert.equal(
  deleteCore.isChatMember({
    uid: SOL_ANON,
    chat: activeChat(),
    message: bombMessage(DEST_ANON),
  }),
  false,
  "raw anon_* alias is not Firebase Auth membership",
);

// Forged alias: stranger claims to be bound via participantes only
assert.equal(
  deleteCore.isChatMember({
    uid: STRANGER,
    chat: activeChat({
      participantes: [STRANGER, SOL_ANON, DEST_ANON],
    }),
    message: bombMessage(SOL_ANON),
  }),
  false,
  "participantes forgery ignored on anon-match docs",
);

// Normal chats unchanged: no AuthUid fields → legacy path
assert.equal(
  deleteCore.isChatMember({
    uid: "uidA",
    chat: { participantes: ["uidA", "uidB"], targetUid: "uidA" },
    message: { fromUid: "uidB" },
  }),
  true,
  "normal chat membership preserved",
);

// --- Author binding ---
assert.equal(
  deleteCore.isAnonMatchBoundMessageAuthor({
    uid: SOL_AUTH,
    chat: activeChat(),
    message: bombMessage(SOL_ANON),
  }),
  true,
  "solicitante auth authors own anon_* messages",
);
assert.equal(
  deleteCore.isAnonMatchBoundMessageAuthor({
    uid: DEST_AUTH,
    chat: activeChat(),
    message: bombMessage(DEST_ANON),
  }),
  true,
  "destinatario auth authors own anon_* messages",
);
assert.equal(
  deleteCore.isAnonMatchBoundMessageAuthor({
    uid: SOL_AUTH,
    chat: activeChat(),
    message: bombMessage(DEST_ANON),
  }),
  false,
  "cannot forge peer alias as author",
);
assert.equal(
  deleteCore.isAnonMatchBoundMessageAuthor({
    uid: SOL_AUTH,
    chat: activeChat({ estado: "cerrado" }),
    message: bombMessage(SOL_ANON),
  }),
  false,
  "closed session cannot author/commit",
);
assert.equal(
  viewOnceCore.isViewOnceAuthor(SOL_AUTH, bombMessage(SOL_ANON), {
    chat: activeChat(),
  }),
  true,
);
assert.equal(
  viewOnceCore.isViewOnceAuthor(DEST_AUTH, bombMessage(SOL_ANON), {
    chat: activeChat(),
  }),
  false,
);

function claim(uid, message, chat, mediaUrl) {
  return viewOnceCore.decideViewOnceClaim({
    uid,
    isMember: deleteCore.isChatMember({ uid, chat, message }),
    message,
    secretMediaUrl: mediaUrl,
    authorContext: { chat },
  });
}

// Positive: destinatario claims solicitante photo
const photoClaim = claim(
  DEST_AUTH,
  bombMessage(SOL_ANON, "image"),
  activeChat(),
  MEDIA_PHOTO,
);
assert.equal(photoClaim.ok, true, "dest claims sol photo");
assert.equal(photoClaim.exhausted, true);
assert.equal(photoClaim.mediaUrl, MEDIA_PHOTO);

// Positive: solicitante claims destinatario video
const videoClaim = claim(
  SOL_AUTH,
  bombMessage(DEST_ANON, "video"),
  activeChat(),
  MEDIA_VIDEO,
);
assert.equal(videoClaim.ok, true, "sol claims dest video");
assert.equal(videoClaim.mediaUrl, MEDIA_VIDEO);

// Negative: author cannot claim own
const authorSelf = claim(
  SOL_AUTH,
  bombMessage(SOL_ANON, "image"),
  activeChat(),
  MEDIA_PHOTO,
);
assert.equal(authorSelf.ok, false);
assert.equal(authorSelf.reason, "author");

// Negative: stranger
const strangerClaim = claim(
  STRANGER,
  bombMessage(SOL_ANON, "image"),
  activeChat(),
  MEDIA_PHOTO,
);
assert.equal(strangerClaim.ok, false);
assert.equal(strangerClaim.reason, "not-member");

// Negative: closed session
const closedClaim = claim(
  DEST_AUTH,
  bombMessage(SOL_ANON, "image"),
  activeChat({ estado: "cerrado" }),
  MEDIA_PHOTO,
);
assert.equal(closedClaim.ok, false);
assert.equal(closedClaim.reason, "not-member");

// Negative: forged alias on message (stranger as "author" of peer alias) still not member
const forged = claim(
  STRANGER,
  { ...bombMessage(SOL_ANON, "image"), senderId: SOL_ANON },
  activeChat(),
  MEDIA_PHOTO,
);
assert.equal(forged.ok, false);
assert.equal(forged.reason, "not-member");

// Negative: repeat claim after exhaustion
const repeat = claim(
  DEST_AUTH,
  {
    ...bombMessage(SOL_ANON, "image"),
    viewOnceOpenedCount: 1,
    viewOnceExhausted: true,
  },
  activeChat(),
  MEDIA_PHOTO,
);
assert.equal(repeat.ok, false);
assert.equal(repeat.reason, "exhausted");

// Mock commit author gate (mirrors handleCommitViewOnceSecret checks)
function mockCommitAllowed(uid, message, chat) {
  if (!message.viewOnce) return { ok: false, reason: "not_view_once" };
  if (!viewOnceCore.isViewOnceAuthor(uid, message, { chat })) {
    return { ok: false, reason: "author_required" };
  }
  if (!deleteCore.isChatMember({ uid, chat, message })) {
    return { ok: false, reason: "not-member" };
  }
  return { ok: true };
}

assert.equal(
  mockCommitAllowed(SOL_AUTH, bombMessage(SOL_ANON, "image"), activeChat()).ok,
  true,
  "sol can commit own photo bomb",
);
assert.equal(
  mockCommitAllowed(DEST_AUTH, bombMessage(DEST_ANON, "video"), activeChat()).ok,
  true,
  "dest can commit own video bomb",
);
assert.equal(
  mockCommitAllowed(DEST_AUTH, bombMessage(SOL_ANON, "image"), activeChat()).reason,
  "author_required",
  "peer cannot commit foreign bomb",
);
assert.equal(
  mockCommitAllowed(STRANGER, bombMessage(SOL_ANON, "image"), activeChat()).reason,
  "author_required",
);
assert.equal(
  mockCommitAllowed(
    SOL_AUTH,
    bombMessage(SOL_ANON, "image"),
    activeChat({ estado: "cerrado" }),
  ).reason,
  "author_required",
  "closed session cannot commit",
);

console.log(
  JSON.stringify(
    {
      ok: true,
      suite: "anon-direct-viewonce-membership",
      positives: ["sol→dest photo claim", "dest→sol video claim", "both commit"],
      negatives: [
        "stranger",
        "forged participantes",
        "forged alias author",
        "closed",
        "denunciado",
        "author self-claim",
        "repeat exhausted",
      ],
      normalChatUnchanged: true,
    },
    null,
    2,
  ),
);
