/**
 * PROFILE_ANON_ABUSE_SCOPE — behavioral (no regex-only) A/B/C IP + lease + revoke.
 *   node --experimental-strip-types scripts/profile-anon-abuse-scope.harness.mjs
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { installHarnessAlias, installHarnessWindow } from "./harness-alias.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
installHarnessWindow();
installHarnessAlias(root);

process.env.ABUSE_IP_HASH_SECRET = "harness-abuse-ip-secret-v1";
process.env.NODE_ENV = "test";

const block = await import(
  pathToFileURL(path.join(root, "src/lib/abuse/profileAnonAbuseBlock.ts")).href
);
const ip = await import(pathToFileURL(path.join(root, "src/lib/abuse/abuseIpHash.ts")).href);
const ids = await import(
  pathToFileURL(path.join(root, "src/lib/abuse/profileAnonAbuseBlockIds.ts")).href
);

// --- Client bundle safety: shared module must not pull node:crypto ---
const sharedSrc = fs.readFileSync(
  path.join(root, "src/lib/abuse/profileAnonAbuseBlock.ts"),
  "utf8",
);
assert.doesNotMatch(sharedSrc, /from ["']node:crypto["']|require\(["']crypto["']\)/);
assert.doesNotMatch(sharedSrc, /ABUSE_RECEPTOR_GATE|receptor_gate/);

const writeSrc = fs.readFileSync(
  path.join(root, "src/lib/abuse/profileAnonAbuseBlockWrite.ts"),
  "utf8",
);
assert.doesNotMatch(writeSrc, /ABUSE_RECEPTOR_GATE|receptor_gates|receptor_gate/);
assert.match(writeSrc, /selectPermitsToRevokeOnBlock/);
assert.match(writeSrc, /shouldClearIpIndexOnBlockRemove/);
assert.doesNotMatch(writeSrc, /removeProfileAnonAbuseBlock[\s\S]*where\("receptorUid"/);
assert.doesNotMatch(writeSrc, /fall back to only the removing block/);
assert.doesNotMatch(writeSrc, /coverage: "pending"/);

assert.equal(
  block.shouldClearIpIndexOnBlockRemove({
    removingBlockId: "block_a",
    indexBlockId: "block_a",
    indexStatus: "active",
  }),
  true,
);
assert.equal(
  block.shouldClearIpIndexOnBlockRemove({
    removingBlockId: "block_a",
    indexBlockId: "block_b",
    indexStatus: "active",
  }),
  false,
);

assert.deepEqual(block.readCoveringBlockIdsFromIndex({ blockId: "b1" }), ["b1"]);
assert.deepEqual(
  block.mergeCoveringBlockIds(["b1"], "b2"),
  ["b1", "b2"],
);
const successor = block.resolveIpIndexSuccessorOnRemove({
  removingBlockId: "block_b",
  hash: "hash1",
  coveringBlockIds: ["block_a", "block_b"],
  blocksById: new Map([
    [
      "block_a",
      {
        id: "block_a",
        chatId: "chat_a",
        status: "active",
        expiresAtMs: Date.now() + 60_000,
        blockedIpHash: "hash1",
        ipHashes: ["hash1"],
      },
    ],
  ]),
});
assert.equal(successor?.blockId, "block_a");

assert.match(writeSrc, /coveringBlockIds/);
assert.match(writeSrc, /resolveIpIndexSuccessorOnRemove/);
assert.doesNotMatch(writeSrc, /contentDigest/);

const menuSrc = fs.readFileSync(
  path.join(root, "src/components/chat/AbuseProtectionMenu.tsx"),
  "utf8",
);
assert.match(menuSrc, /profileAnonAbuseBlock/);
assert.doesNotMatch(menuSrc, /profileAnonAbuseBlockIds|abuseIpHash/);

// --- Lease: third party cannot claim existing chat without lease ---
const thirdParty = block.decideVisitorLeaseBind({
  visitorAuthUid: "attacker",
  chatExists: true,
  leaseVisitorAuthUid: null,
});
assert.equal(thirdParty.action, "require_new_epoch");
assert.equal(thirdParty.reason, "legacy_unbound");
assert.equal(thirdParty.writeLease, false);

const foreign = block.decideVisitorLeaseBind({
  visitorAuthUid: "attacker",
  chatExists: true,
  leaseVisitorAuthUid: "owner_visitor",
});
assert.equal(foreign.action, "require_new_epoch");
assert.equal(foreign.reason, "foreign_lease");
assert.equal(foreign.writeLease, false);

const fresh = block.decideVisitorLeaseBind({
  visitorAuthUid: "visitor_a",
  chatExists: false,
  leaseVisitorAuthUid: null,
});
assert.equal(fresh.action, "create_atomic");

const refresh = block.decideVisitorLeaseBind({
  visitorAuthUid: "visitor_a",
  chatExists: true,
  leaseVisitorAuthUid: "visitor_a",
});
assert.equal(refresh.action, "refresh");

// --- A/B/C IP scope (same receptor) + other receptor ---
const nowMs = 1_700_000_000_000;
const hashA = ip.hashAbuseClientIp("203.0.113.10");
const hashC = ip.hashAbuseClientIp("198.51.100.20");
assert.ok(hashA && hashC && hashA !== hashC);

const activeIpIndex = [
  {
    receptorUid: "receptor_1",
    blockedIpHash: hashA,
    status: "active",
    expiresAtMs: nowMs + 30 * 60 * 1000,
  },
];

// A blocked IP → blocked for receptor_1
assert.equal(
  block.isVisitorIpBlockedForReceptor({
    receptorUid: "receptor_1",
    requestIpHash: hashA,
    activeIpIndex,
    nowMs,
  }),
  true,
  "A same IP must be blocked for that receptor",
);

// B same IP as A → blocked for receptor_1
assert.equal(
  block.isVisitorIpBlockedForReceptor({
    receptorUid: "receptor_1",
    requestIpHash: hashA,
    activeIpIndex,
    nowMs,
  }),
  true,
  "B same IP must be blocked for that receptor",
);

// C other IP → still sends to receptor_1
assert.equal(
  block.isVisitorIpBlockedForReceptor({
    receptorUid: "receptor_1",
    requestIpHash: hashC,
    activeIpIndex,
    nowMs,
  }),
  false,
  "C other IP must still send to that receptor",
);

// A other receptor → still sends
assert.equal(
  block.isVisitorIpBlockedForReceptor({
    receptorUid: "receptor_2",
    requestIpHash: hashA,
    activeIpIndex,
    nowMs,
  }),
  false,
  "A to different receptor must still send",
);

// --- Permit revoke: A (chat or IP) revoked, C not ---
const revoked = block.selectPermitsToRevokeOnBlock({
  blockedChatId: "anon_a__anon_to__demo",
  receptorUid: "receptor_1",
  blockedIpHashes: [hashA],
  permits: [
    {
      id: "prm_a_chat",
      chatId: "anon_a__anon_to__demo",
      receptorUid: "receptor_1",
      ipHash: hashA,
    },
    {
      id: "prm_b_same_ip_other_chat",
      chatId: "anon_b__anon_to__demo",
      receptorUid: "receptor_1",
      ipHash: hashA,
    },
    {
      id: "prm_c_other_ip",
      chatId: "anon_c__anon_to__demo",
      receptorUid: "receptor_1",
      ipHash: hashC,
    },
    {
      id: "prm_other_receptor",
      chatId: "anon_a__anon_to__other",
      receptorUid: "receptor_2",
      ipHash: hashA,
    },
  ],
});
assert.ok(revoked.includes("prm_a_chat"));
assert.ok(revoked.includes("prm_b_same_ip_other_chat"));
assert.ok(!revoked.includes("prm_c_other_ip"), "C prior permit must NOT be revoked");
assert.ok(!revoked.includes("prm_other_receptor"));

// --- XFF: exact last hop only; no left walk ---
const gcfHost = "ssrsayittomeapp-xyz-uc.a.run.app";
assert.equal(
  ip.getTrustedRequestClientIp(
    new Request("https://example.test", {
      headers: {
        host: gcfHost,
        "x-forwarded-for": "203.0.113.9, 198.51.100.1",
      },
    }),
  ),
  "198.51.100.1",
  "must take exact last hop",
);

assert.equal(
  ip.getTrustedRequestClientIp(
    new Request("https://example.test", {
      headers: {
        host: gcfHost,
        "x-forwarded-for": "203.0.113.9, 10.0.0.1",
      },
    }),
  ),
  "",
  "private last hop → empty (no walk left)",
);

assert.equal(
  ip.getTrustedRequestClientIp(
    new Request("https://example.test", {
      headers: {
        host: gcfHost,
        "x-forwarded-for": "203.0.113.9, not-an-ip",
      },
    }),
  ),
  "",
  "invalid last hop → empty (no walk left)",
);

assert.equal(
  ip.getTrustedRequestClientIp(
    new Request("https://example.test", {
      headers: {
        host: "sayittome-app.web.app",
        "x-forwarded-for": "203.0.113.9, 198.51.100.1",
      },
    }),
  ),
  "",
  "Hosting host → IP PENDING",
);

assert.equal(ip.canonicalizeIp("not:a:valid:thing:with:colons:only"), "");
assert.ok(ids.profileAnonAbuseBlockDocId("r1", "chat_a") !== ids.profileAnonAbuseBlockDocId("r1", "chat_b"));
assert.equal(
  ids.profileAnonAbuseMessagePermitId("c1", "m1"),
  ids.profileAnonAbuseMessagePermitId("c1", "m1"),
);
assert.notEqual(
  ids.profileAnonAbuseMessagePermitId("c1", "m1"),
  ids.profileAnonAbuseMessagePermitId("c1", "m2"),
);

// --- Canonical receptor: doc.id wins; uid field collision rejected ---
assert.deepEqual(
  block.resolveCanonicalReceptorFromProfileDoc({
    docId: "uid_canonical",
    data: { uid: "uid_canonical", username: "demo" },
  }),
  { ok: true, receptorUid: "uid_canonical" },
);
assert.deepEqual(
  block.resolveCanonicalReceptorFromProfileDoc({
    docId: "doc_a",
    data: { uid: "other_uid", username: "demo" },
  }),
  { ok: false, error: "profile_uid_collision" },
);

// --- Live anon epoch: use current live chatId, no implicit second rotation ---
const oldAnon = "anon_old_epoch";
const liveAnon = "anon_live_epoch";
const oldChat = `${oldAnon}__anon_to__demo_user`;
const liveResolved = block.resolveSendChatIdForLiveAnon({
  chatId: oldChat,
  username: "demo_user",
  liveAnonId: liveAnon,
});
assert.equal(liveResolved.epochSwitched, true);
assert.equal(liveResolved.chatId, `${liveAnon}__anon_to__demo_user`);
assert.equal(
  block.resolveSendChatIdForLiveAnon({
    chatId: liveResolved.chatId,
    username: "demo_user",
    liveAnonId: liveAnon,
  }).epochSwitched,
  false,
);

const rules = fs.readFileSync(path.join(root, "firestore.rules"), "utf8");
assert.match(rules, /hasValidAbuseSendPermit\(chatId, messageId\)/);
assert.match(rules, /permitIpIndexActive/);
assert.match(rules, /isAuthenticatedChatReceptor/);
assert.match(rules, /email_verified == true/);
assert.match(rules, /onlyClientReceiptUpdate/);
assert.doesNotMatch(rules, /isProfileSideMensaje/);
assert.doesNotMatch(rules, /receptor_gate|anon_abuse_receptor_gates/);

console.log(
  JSON.stringify(
    {
      gate: "PROFILE_ANON_ABUSE_SCOPE",
      pass: true,
      behavioral: [
        "legacy_unbound_no_write",
        "foreign_lease_no_write",
        "A_B_same_ip_blocked_C_other_ip_ok",
        "A_other_receptor_ok",
        "revoke_A_not_C",
        "xff_exact_last_hop_only",
        "shared_helpers_no_node_crypto",
        "no_global_receptor_gate",
        "canonical_receptor_doc_id",
        "live_anon_epoch_no_double_rotate",
      ],
      ipCoverage: "PENDING_until_ABUSE_IP_HASH_SECRET_and_direct_GCF_configured",
    },
    null,
    2,
  ),
);
