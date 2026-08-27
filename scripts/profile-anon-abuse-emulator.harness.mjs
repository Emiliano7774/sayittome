/**
 * PROFILE_ANON_ABUSE_EMULATOR — real writer + rules against local Firestore emulator.
 * Requires emulator already running at 127.0.0.1:8080 (do NOT start another).
 *
 *   $env:FIRESTORE_EMULATOR_HOST='127.0.0.1:8080'
 *   $env:GCLOUD_PROJECT='sayittome-app'
 *   $env:ABUSE_IP_HASH_SECRET='harness-abuse-ip-secret-v1'
 *   node --experimental-strip-types scripts/profile-anon-abuse-emulator.harness.mjs
 *   echo EXIT:$LASTEXITCODE
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import net from "node:net";

import { installHarnessAlias, installHarnessWindow } from "./harness-alias.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function fail(msg, code = 1) {
  console.error(JSON.stringify({ gate: "PROFILE_ANON_ABUSE_EMULATOR", pass: false, error: msg }, null, 2));
  process.exit(code);
}

async function probeEmulator(host, port) {
  return new Promise((resolve) => {
    const socket = net.connect({ host, port }, () => {
      socket.end();
      resolve(true);
    });
    socket.on("error", () => resolve(false));
    socket.setTimeout(1500, () => {
      socket.destroy();
      resolve(false);
    });
  });
}

// Force local emulator — never production.
process.env.FIRESTORE_EMULATOR_HOST = "127.0.0.1:8080";
process.env.GCLOUD_PROJECT = "sayittome-app";
process.env.GOOGLE_CLOUD_PROJECT = "sayittome-app";
process.env.ABUSE_IP_HASH_SECRET = "harness-abuse-ip-secret-v1";
process.env.NODE_ENV = "test";
delete process.env.GOOGLE_APPLICATION_CREDENTIALS;

if (!(await probeEmulator("127.0.0.1", 8080))) {
  fail("firestore_emulator_not_reachable_127.0.0.1:8080", 2);
}

installHarnessWindow();
installHarnessAlias(root);

const {
  initializeTestEnvironment,
  assertFails,
  assertSucceeds,
} = await import("@firebase/rules-unit-testing");

const writeMod = await import(
  pathToFileURL(path.join(root, "src/lib/abuse/profileAnonAbuseBlockWrite.ts")).href
);
const ids = await import(
  pathToFileURL(path.join(root, "src/lib/abuse/profileAnonAbuseBlockIds.ts")).href
);
const ip = await import(pathToFileURL(path.join(root, "src/lib/abuse/abuseIpHash.ts")).href);
const blockHelpers = await import(
  pathToFileURL(path.join(root, "src/lib/abuse/profileAnonAbuseBlock.ts")).href
);

const rules = fs.readFileSync(path.join(root, "firestore.rules"), "utf8");

const testEnv = await initializeTestEnvironment({
  projectId: "sayittome-app",
  firestore: {
    host: "127.0.0.1",
    port: 8080,
    rules,
  },
});

const suffix = Date.now().toString(36);
const receptorUid = `receptor_${suffix}`;
const visitorA = `visitor_a_${suffix}`;
const visitorB = `visitor_b_${suffix}`;
const visitorC = `visitor_c_${suffix}`;
const username = `demo_${suffix}`;
const anonA = `anon_a_${suffix}`;
const anonB = `anon_b_${suffix}`;
const anonC = `anon_c_${suffix}`;
const chatA = `${anonA}__anon_to__${username}`;
const chatB = `${anonB}__anon_to__${username}`;
const chatC = `${anonC}__anon_to__${username}`;
const otherReceptor = `receptor_other_${suffix}`;
const otherUser = `other_${suffix}`;
const chatAOther = `${anonA}__anon_to__${otherUser}`;

function gcfReq(xffLast, extra = {}) {
  return new Request("https://ssrsayittomeapp-uc.a.run.app/api/abuse/bind-visitor-session", {
    method: "POST",
    headers: {
      host: "ssrsayittomeapp-xyz-uc.a.run.app",
      "x-forwarded-for": `203.0.113.1, ${xffLast}`,
      "content-type": "application/json",
      ...extra,
    },
  });
}

function hostingReq(xffLast) {
  return new Request("https://sayittome-app.web.app/api/abuse/bind-visitor-session", {
    method: "POST",
    headers: {
      host: "sayittome-app.web.app",
      "x-forwarded-for": `203.0.113.9, ${xffLast}`,
    },
  });
}

const results = [];

try {
  // Unique suffix fixtures — do not clearFirestore (avoids lock contention with live hub).
  // await testEnv.clearFirestore();

  // Seed profile docs via Admin (rules bypass)
  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    await db.doc(`usuarios/${receptorUid}`).set({
      uid: receptorUid,
      username,
      usernameLower: username,
    });
    await db.doc(`usuarios/${otherReceptor}`).set({
      uid: otherReceptor,
      username: otherUser,
      usernameLower: otherUser,
    });
  });

  // --- Writer pipeline: Hosting without trusted IP must 503 (no lease) ---
  {
    const denied = await writeMod.bindVisitorChatLease({
      visitorAuthUid: visitorA,
      chatId: chatA,
      username,
      receptorUid,
      req: hostingReq("198.51.100.10"),
    });
    assert.equal(denied.ok, false, "hosting bind must fail");
    assert.equal(denied.status, 503);
    assert.equal(denied.error, "abuse_ip_unavailable");
    results.push("hosting_bind_503_no_lease");
  }

  // --- Bind A with trusted IP ---
  const ipA = "198.51.100.10";
  const bindA = await writeMod.bindVisitorChatLease({
    visitorAuthUid: visitorA,
    chatId: chatA,
    username,
    receptorUid,
    req: gcfReq(ipA),
  });
  assert.equal(bindA.ok, true, `bindA failed: ${JSON.stringify(bindA)}`);
  assert.equal(bindA.created, true);
  results.push("bind_a_ok");

  // Third party cannot claim existing chat without lease for them
  const claimAttack = await writeMod.bindVisitorChatLease({
    visitorAuthUid: visitorB,
    chatId: chatA,
    username,
    receptorUid,
    req: gcfReq(ipA),
  });
  assert.equal(claimAttack.ok, false);
  assert.equal(claimAttack.requireNewEpoch, true);
  results.push("third_party_claim_denied");

  // Permit A
  const msgA = `msg_a_${suffix}`;
  const permitA = await writeMod.issueAbuseSendPermit({
    visitorAuthUid: visitorA,
    chatId: chatA,
    receptorUid,
    messageId: msgA,
    req: gcfReq(ipA),
  });
  assert.equal(permitA.ok, true, JSON.stringify(permitA));
  results.push("permit_a_ok");

  // messageId reuse denied
  const reuse = await writeMod.issueAbuseSendPermit({
    visitorAuthUid: visitorA,
    chatId: chatA,
    receptorUid,
    messageId: msgA,
    req: gcfReq(ipA),
  });
  assert.equal(reuse.ok, false);
  assert.equal(reuse.error, "message_id_permit_reuse");
  results.push("message_id_reuse_denied");

  // Block A
  const blocked = await writeMod.applyProfileAnonAbuseBlock({
    authUid: receptorUid,
    chatId: chatA,
    motivo: "bloqueo_30m",
  });
  assert.equal(blocked.ok, true, JSON.stringify(blocked));
  results.push("block_a_ok");

  // B same IP → blocked at permit
  const bindB = await writeMod.bindVisitorChatLease({
    visitorAuthUid: visitorB,
    chatId: chatB,
    username,
    receptorUid,
    req: gcfReq(ipA),
  });
  assert.equal(bindB.ok, true, JSON.stringify(bindB));
  const permitB = await writeMod.issueAbuseSendPermit({
    visitorAuthUid: visitorB,
    chatId: chatB,
    receptorUid,
    messageId: `msg_b_${suffix}`,
    req: gcfReq(ipA),
  });
  assert.equal(permitB.ok, false);
  assert.equal(permitB.blocked, true);
  results.push("B_same_ip_blocked");

  // C other IP → can send
  const ipC = "203.0.113.55";
  const bindC = await writeMod.bindVisitorChatLease({
    visitorAuthUid: visitorC,
    chatId: chatC,
    username,
    receptorUid,
    req: gcfReq(ipC),
  });
  assert.equal(bindC.ok, true, JSON.stringify(bindC));
  const permitC = await writeMod.issueAbuseSendPermit({
    visitorAuthUid: visitorC,
    chatId: chatC,
    receptorUid,
    messageId: `msg_c_${suffix}`,
    req: gcfReq(ipC),
  });
  assert.equal(permitC.ok, true, JSON.stringify(permitC));
  results.push("C_other_ip_ok");

  // A other receptor still ok
  const bindOther = await writeMod.bindVisitorChatLease({
    visitorAuthUid: visitorA,
    chatId: chatAOther,
    username: otherUser,
    receptorUid: otherReceptor,
    req: gcfReq(ipA),
  });
  assert.equal(bindOther.ok, true, JSON.stringify(bindOther));
  const permitOther = await writeMod.issueAbuseSendPermit({
    visitorAuthUid: visitorA,
    chatId: chatAOther,
    receptorUid: otherReceptor,
    messageId: `msg_a_other_${suffix}`,
    req: gcfReq(ipA),
  });
  assert.equal(permitOther.ok, true, JSON.stringify(permitOther));
  results.push("A_other_receptor_ok");

  // Prior permit A revoked; C not
  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    const aSnap = await db.doc(`anon_abuse_send_permits/${permitA.permitId}`).get();
    assert.equal(String(aSnap.data()?.status || ""), "revoked");
    const cSnap = await db.doc(`anon_abuse_send_permits/${permitC.permitId}`).get();
    assert.notEqual(String(cSnap.data()?.status || ""), "revoked");
  });
  results.push("revoke_A_not_C");

  // Remove overlap: block chatB same IP, remove chatA must keep IP index while B active
  const blockedB = await writeMod.applyProfileAnonAbuseBlock({
    authUid: receptorUid,
    chatId: chatB,
    motivo: "bloqueo_B_overlap",
  });
  assert.equal(blockedB.ok, true, JSON.stringify(blockedB));

  const ipHashA = ip.hashAbuseClientIp(ipA);
  const indexDocId = ids.profileAnonAbuseIpIndexId(receptorUid, ipHashA);

  // Inverse overlap: remove B must reassign index to A (not clear)
  const removedBOnly = await writeMod.removeProfileAnonAbuseBlock({
    blockId: blockedB.block.id,
    adminUid: "admin_1",
    adminEmail: "emilianomaturano@gmail.com",
  });
  assert.equal(removedBOnly.ok, true, JSON.stringify(removedBOnly));
  const permitAfterRemoveB = await writeMod.issueAbuseSendPermit({
    visitorAuthUid: visitorB,
    chatId: chatB,
    receptorUid,
    messageId: `msg_b_after_remove_b_${suffix}`,
    req: gcfReq(ipA),
  });
  assert.equal(permitAfterRemoveB.ok, false);
  assert.equal(permitAfterRemoveB.blocked, true);
  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    const indexSnap = await db.doc(`anon_abuse_ip_index/${indexDocId}`).get();
    assert.equal(String(indexSnap.data()?.blockId || ""), blocked.block.id);
    assert.equal(String(indexSnap.data()?.status || ""), "active");
    const covering = indexSnap.data()?.coveringBlockIds || [];
    assert.ok(Array.isArray(covering) && covering.includes(blocked.block.id));
  });
  results.push("remove_B_keeps_IP_when_A_overlap");

  // Re-block B for forward overlap remove-A test
  const blockedBAgain = await writeMod.applyProfileAnonAbuseBlock({
    authUid: receptorUid,
    chatId: chatB,
    motivo: "bloqueo_B_overlap_again",
  });
  assert.equal(blockedBAgain.ok, true, JSON.stringify(blockedBAgain));

  const removedAOnly = await writeMod.removeProfileAnonAbuseBlock({
    blockId: blocked.block.id,
    adminUid: "admin_1",
    adminEmail: "emilianomaturano@gmail.com",
  });
  assert.equal(removedAOnly.ok, true, JSON.stringify(removedAOnly));
  const permitBAfterRemoveA = await writeMod.issueAbuseSendPermit({
    visitorAuthUid: visitorB,
    chatId: chatB,
    receptorUid,
    messageId: `msg_b_after_remove_a_${suffix}`,
    req: gcfReq(ipA),
  });
  assert.equal(permitBAfterRemoveA.ok, false);
  assert.equal(permitBAfterRemoveA.blocked, true);
  results.push("remove_A_keeps_IP_when_B_overlap");

  // Order B→A: fresh pair, block B first then A, remove A keeps B index
  const anonD = `anon_d_${suffix}`;
  const anonE = `anon_e_${suffix}`;
  const chatD = `${anonD}__anon_to__${username}`;
  const chatE = `${anonE}__anon_to__${username}`;
  const visitorD = `visitor_d_${suffix}`;
  const visitorE = `visitor_e_${suffix}`;
  const ipOverlap = "198.51.100.88";
  for (const row of [
    { visitor: visitorD, chat: chatD, anon: anonD },
    { visitor: visitorE, chat: chatE, anon: anonE },
  ]) {
    const bind = await writeMod.bindVisitorChatLease({
      visitorAuthUid: row.visitor,
      chatId: row.chat,
      username,
      receptorUid,
      req: gcfReq(ipOverlap),
    });
    assert.equal(bind.ok, true, JSON.stringify(bind));
  }
  const blockD = await writeMod.applyProfileAnonAbuseBlock({
    authUid: receptorUid,
    chatId: chatD,
    motivo: "bloqueo_D_first",
  });
  assert.equal(blockD.ok, true, JSON.stringify(blockD));
  const blockE = await writeMod.applyProfileAnonAbuseBlock({
    authUid: receptorUid,
    chatId: chatE,
    motivo: "bloqueo_E_second",
  });
  assert.equal(blockE.ok, true, JSON.stringify(blockE));
  const removedD = await writeMod.removeProfileAnonAbuseBlock({
    blockId: blockD.block.id,
    adminUid: "admin_1",
    adminEmail: "emilianomaturano@gmail.com",
  });
  assert.equal(removedD.ok, true, JSON.stringify(removedD));
  const permitEAfterRemoveD = await writeMod.issueAbuseSendPermit({
    visitorAuthUid: visitorE,
    chatId: chatE,
    receptorUid,
    messageId: `msg_e_after_remove_d_${suffix}`,
    req: gcfReq(ipOverlap),
  });
  assert.equal(permitEAfterRemoveD.ok, false);
  assert.equal(permitEAfterRemoveD.blocked, true);
  results.push("remove_first_block_keeps_IP_when_second_overlap");

  // Concurrent remove idempotency on same block
  const [concurrent1, concurrent2] = await Promise.all([
    writeMod.removeProfileAnonAbuseBlock({
      blockId: blockedBAgain.block.id,
      adminUid: "admin_1",
      adminEmail: "emilianomaturano@gmail.com",
    }),
    writeMod.removeProfileAnonAbuseBlock({
      blockId: blockedBAgain.block.id,
      adminUid: "admin_1",
      adminEmail: "emilianomaturano@gmail.com",
    }),
  ]);
  assert.equal(concurrent1.ok || concurrent2.ok, true);
  results.push("remove_concurrent_idempotent");

  // Remove idempotent (B block still active until first remove below)
  const removed1 = await writeMod.removeProfileAnonAbuseBlock({
    blockId: blockE.block.id,
    adminUid: "admin_1",
    adminEmail: "emilianomaturano@gmail.com",
  });
  if (!removed1.ok) {
    throw new Error(`remove1_failed:${JSON.stringify(removed1)}`);
  }
  const removed2 = await writeMod.removeProfileAnonAbuseBlock({
    blockId: blockE.block.id,
    adminUid: "admin_1",
    adminEmail: "emilianomaturano@gmail.com",
  });
  if (!removed2.ok) {
    throw new Error(`remove2_failed:${JSON.stringify(removed2)}`);
  }
  results.push("remove_idempotent");

  // --- Rules: anon create without permit fails; with permit fields ok ---
  const visitorCtx = testEnv.authenticatedContext(visitorA, {
    firebase: { sign_in_provider: "anonymous" },
  });
  const vdb = visitorCtx.firestore();

  // Fresh lease+permit for rules create after remove
  const chatRules = `${anonA}_r__anon_to__${username}`;
  // need new anon for create_atomic - use brand new
  const anonR = `anon_r_${suffix}`;
  const chatR = `${anonR}__anon_to__${username}`;
  const visitorR = `visitor_r_${suffix}`;
  const bindR = await writeMod.bindVisitorChatLease({
    visitorAuthUid: visitorR,
    chatId: chatR,
    username,
    receptorUid,
    req: gcfReq("198.51.100.77"),
  });
  assert.equal(bindR.ok, true, JSON.stringify(bindR));
  const msgR = `msg_r_${suffix}`;
  const permitR = await writeMod.issueAbuseSendPermit({
    visitorAuthUid: visitorR,
    chatId: chatR,
    receptorUid,
    messageId: msgR,
    req: gcfReq("198.51.100.77"),
  });
  assert.equal(permitR.ok, true, JSON.stringify(permitR));

  const rulesVisitor = testEnv.authenticatedContext(visitorR, {
    firebase: { sign_in_provider: "anonymous" },
  });
  const rdb = rulesVisitor.firestore();

  await assertFails(
    rdb.doc(`chats/${chatR}/mensajes/bad1`).set({
      texto: "x",
      fromUid: anonR,
      senderKind: "anon",
    }),
  );
  results.push("rules_anon_create_without_permit_denied");

  await assertSucceeds(
    rdb.doc(`chats/${chatR}/mensajes/${msgR}`).set({
      texto: "hello",
      text: "hello",
      fromUid: anonR,
      senderKind: "anon",
      abuseSendPermitId: permitR.permitId,
      readBy: { [anonR]: true },
    }),
  );
  results.push("rules_anon_create_with_permit_ok");

  // forged profile senderKind by anon denied
  await assertFails(
    rdb.doc(`chats/${chatR}/mensajes/forge1`).set({
      texto: "forge",
      fromUid: `profile_${receptorUid}`,
      senderKind: "profile",
    }),
  );
  results.push("rules_anon_forge_profile_denied");

  // content update denied
  await assertFails(
    rdb.doc(`chats/${chatR}/mensajes/${msgR}`).update({ texto: "hacked" }),
  );
  results.push("rules_content_update_denied");

  // readBy update ok
  await assertSucceeds(
    rdb.doc(`chats/${chatR}/mensajes/${msgR}`).update({
      readBy: { [anonR]: true, [receptorUid]: true },
    }),
  );
  results.push("rules_readBy_update_ok");

  // delete denied on profile-anon
  await assertFails(rdb.doc(`chats/${chatR}/mensajes/${msgR}`).delete());
  results.push("rules_profile_anon_delete_denied");

  // owner forge anon author denied
  const ownerCtx = testEnv.authenticatedContext(receptorUid, {
    email: "owner@example.com",
    email_verified: true,
  });
  await assertFails(
    ownerCtx.firestore().doc(`chats/${chatR}/mensajes/owner_forge`).set({
      texto: "as anon",
      fromUid: anonR,
      senderKind: "anon",
    }),
  );
  results.push("rules_owner_forge_anon_denied");

  // owner legitimate profile reply ok
  await assertSucceeds(
    ownerCtx.firestore().doc(`chats/${chatR}/mensajes/owner_ok`).set({
      texto: "reply",
      fromUid: `profile_${receptorUid}`,
      senderKind: "profile",
    }),
  );
  results.push("rules_owner_profile_reply_ok");

  // seenBy receipt-only update ok (delivery receipts)
  await assertSucceeds(
    ownerCtx.firestore().doc(`chats/${chatR}/mensajes/${msgR}`).update({
      seenBy: { [receptorUid]: true },
    }),
  );
  results.push("rules_seenBy_update_ok");

  // content rollback denied (texto change)
  await assertFails(
    ownerCtx.firestore().doc(`chats/${chatR}/mensajes/${msgR}`).update({
      texto: "rollback hack",
    }),
  );
  results.push("rules_content_rollback_denied");

  // Expired block does not block permits after 30m
  const expiredNow = Date.now() + 31 * 60 * 1000;
  const chatExp = `${anonC}_exp__anon_to__${username}`;
  const visitorExp = `visitor_exp_${suffix}`;
  const bindExp = await writeMod.bindVisitorChatLease({
    visitorAuthUid: visitorExp,
    chatId: chatExp,
    username,
    receptorUid,
    req: gcfReq(ipC),
  });
  assert.equal(bindExp.ok, true, JSON.stringify(bindExp));
  const blockedExp = await writeMod.applyProfileAnonAbuseBlock({
    authUid: receptorUid,
    chatId: chatExp,
    motivo: "exp_test",
    nowMs: expiredNow - 31 * 60 * 1000,
  });
  assert.equal(blockedExp.ok, true, JSON.stringify(blockedExp));
  const permitAfterExpiry = await writeMod.issueAbuseSendPermit({
    visitorAuthUid: visitorExp,
    chatId: chatExp,
    receptorUid,
    messageId: `msg_exp_${suffix}`,
    req: gcfReq(ipC),
    nowMs: expiredNow,
  });
  assert.equal(permitAfterExpiry.ok, true, JSON.stringify(permitAfterExpiry));
  results.push("expired_block_no_longer_blocks_after_30m");

  // live anon mismatch helper
  assert.equal(
    blockHelpers.decideLiveAnonEpoch({
      chatId: chatA,
      liveAnonId: "anon_new_live",
      isOwnerReply: false,
    }).action,
    "require_new_epoch",
  );
  results.push("live_anon_mismatch_forces_epoch");

  console.log(
    JSON.stringify(
      {
        gate: "PROFILE_ANON_ABUSE_EMULATOR",
        pass: true,
        exitCode: 0,
        results,
        emulator: "127.0.0.1:8080",
      },
      null,
      2,
    ),
  );
  process.exitCode = 0;
} catch (error) {
  console.error(error);
  fail(String(error?.message || error), 1);
} finally {
  await testEnv.cleanup();
}
