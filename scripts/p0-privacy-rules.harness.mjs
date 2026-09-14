/**
 * P0_PRIVACY_RULES — baseline leak repro + draft matrix (reuse emulator :8080).
 * Does NOT deploy rules. Does NOT start a second emulator if 8080 is up.
 */
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import net from "node:net";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const statusPath = path.join(root, "scripts/p0-privacy-status.json");
const status = JSON.parse(fs.readFileSync(statusPath, "utf8"));
const draftRules = fs.readFileSync(path.join(root, "firestore.rules.p0-privacy-draft.rules"), "utf8");
const liveRules = fs.readFileSync(path.join(root, "firestore.rules"), "utf8");

function parseGateLine(line) {
  const trimmed = line.trim();
  if (!trimmed.startsWith("{")) return null;
  try {
    const parsed = JSON.parse(trimmed);
    if (parsed.gate && parsed.pass === true) return parsed;
  } catch {
    /* not gate JSON */
  }
  return null;
}

function parseEmulatorJson(stdout, stderr = "") {
  for (const text of [stdout, `${stdout}\n${stderr}`]) {
    const lines = text.split(/\r?\n/);
    for (let i = lines.length - 1; i >= 0; i -= 1) {
      const parsed = parseGateLine(lines[i]);
      if (parsed) return parsed;
    }
  }

  const blocks = [];
  let depth = 0;
  let start = -1;
  const out = `${stdout}\n${stderr}`;
  for (let i = 0; i < out.length; i++) {
    const ch = out[i];
    if (ch === "{") {
      if (depth === 0) start = i;
      depth += 1;
    } else if (ch === "}") {
      depth -= 1;
      if (depth === 0 && start >= 0) {
        blocks.push(out.slice(start, i + 1));
        start = -1;
      }
    }
  }
  for (let i = blocks.length - 1; i >= 0; i--) {
    try {
      const parsed = JSON.parse(blocks[i]);
      if (parsed.gate && parsed.pass === true) return parsed;
    } catch {
      /* try previous block */
    }
  }
  throw new Error("emulator_json_not_found");
}

function runNodeScript(script, stripTypes = false) {
  const args = stripTypes ? ["--experimental-strip-types", script] : [script];
  const result = spawnSync("node", args, {
    cwd: root,
    encoding: "utf8",
    shell: false,
    timeout: 120_000,
  });
  const stdout = result.stdout || "";
  const stderr = result.stderr || "";
  if (result.status !== 0) {
    console.error(`${stdout}\n${stderr}`);
    process.exit(1);
  }
  return { stdout, stderr };
}

const productionPayloadRun = runNodeScript(
  "scripts/profile-anon-send-payload.production.unit.mjs",
  true,
);
const productionPayloadGate = parseEmulatorJson(
  productionPayloadRun.stdout,
  productionPayloadRun.stderr,
);
assert.equal(productionPayloadGate.gate, "PROFILE_ANON_SEND_PAYLOAD_PRODUCTION");
assert.equal(productionPayloadGate.pass, true);

const functionsBuild = spawnSync("npm", ["run", "build"], {
  cwd: path.join(root, "functions"),
  encoding: "utf8",
  shell: true,
  timeout: 120_000,
});
if (functionsBuild.status !== 0) {
  console.error(`${functionsBuild.stdout || ""}\n${functionsBuild.stderr || ""}`);
  process.exit(1);
}

const privateAuthRun = runNodeScript("scripts/profile-anon-private-auth-functions.unit.mjs");
const privateAuthGate = parseEmulatorJson(privateAuthRun.stdout, privateAuthRun.stderr);
assert.equal(privateAuthGate.gate, "PROFILE_ANON_PRIVATE_AUTH_FUNCTIONS");
assert.equal(privateAuthGate.pass, true);

assert.equal(status.isolation.status, "FAIL_OPEN");
assert.equal(status.isolation.physicalPass, false);
assert.match(draftRules, /mayReadChatData/);
assert.match(draftRules, /participantes/);
assert.match(draftRules, /allow delete: if false/);
assert.match(draftRules, /chats_anonimos/);
assert.match(draftRules, /moderation_seen/);
assert.match(draftRules, /leaseBoundAnonId/);
assert.match(draftRules, /latestSenderAnonSessionId/);
assert.match(draftRules, /receiptFieldKeysAllowed/);
assert.match(draftRules, /onlyAnonMatchChatMetaUpdate/);
assert.match(liveRules, /allow read: if openWindow\(\)/);

function runIndependent(script, port, stripTypes = false) {
  const args = stripTypes ? ["--experimental-strip-types", script] : [script];
  const result = spawnSync("node", args, {
    cwd: root,
    encoding: "utf8",
    shell: false,
    timeout: 120_000,
    env: {
      ...process.env,
      P0_PRIVACY_EMULATOR_PORT: String(port),
      FIRESTORE_EMULATOR_HOST: `127.0.0.1:${port}`,
    },
  });
  const out = `${result.stdout || ""}\n${result.stderr || ""}`;
  if (result.status !== 0) {
    console.error(out);
    process.exit(1);
  }
  return parseEmulatorJson(result.stdout || "", result.stderr || "");
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

function runRunner(script, mode, port) {
  const args = mode ? [script, mode] : [script];
  return spawnSync("node", args, {
    cwd: root,
    encoding: "utf8",
    shell: false,
    timeout: 120_000,
    env: {
      ...process.env,
      P0_PRIVACY_EMULATOR_PORT: String(port),
      FIRESTORE_EMULATOR_HOST: `127.0.0.1:${port}`,
    },
  });
}

const port8080 = await probeEmulator("127.0.0.1", 8080);
const port8099 = port8080 ? false : await probeEmulator("127.0.0.1", 8099);
let baseline = { skipped: true };
let draft = { skipped: true };
let independent1618 = { skipped: true };
let independent1627 = { skipped: true };
let independent1630 = { skipped: true };
let independent1635 = { skipped: true };
let independent1648 = { skipped: true };
let compileGate = { skipped: true };
let emulatorMode = "none";

if (port8080 || port8099) {
  const port = port8080 ? 8080 : 8099;
  emulatorMode = port8080 ? "reuse_8080" : "reuse_8099";

  const compileResult = runRunner("scripts/p0-privacy-rules-compile.mjs", null, port);
  const compileOut = `${compileResult.stdout || ""}\n${compileResult.stderr || ""}`;
  if (compileResult.status !== 0) {
    console.error(compileOut);
    process.exit(1);
  }
  compileGate = parseEmulatorJson(compileResult.stdout || "", compileResult.stderr || "");
  assert.equal(compileGate.gate, "P0_PRIVACY_RULES_COMPILE");
  assert.equal(compileGate.pass, true);

  for (const mode of ["baseline", "draft"]) {
    const result = runRunner("scripts/p0-privacy-rules.emulator.mjs", mode, port);
    const out = `${result.stdout || ""}\n${result.stderr || ""}`;
    if (result.status !== 0) {
      console.error(out);
      process.exit(1);
    }
    const parsed = parseEmulatorJson(result.stdout || "", result.stderr || "");
    assert.equal(parsed.pass, true, `${mode} emulator pass`);
    assert.equal(parsed.isolationPass, false);
    if (mode === "baseline") {
      assert.equal(parsed.results.unauth_chat_get, "ALLOWED");
      assert.equal(parsed.results.foreign_auth_chat_get, "ALLOWED");
      baseline = parsed;
    } else {
      assert.equal(parsed.results.unauth_chat_get, "DENIED");
      assert.equal(parsed.results.foreign_auth_chat_get, "DENIED");
      assert.equal(parsed.results.participantes_escalation_update, "DENIED");
      assert.equal(parsed.results.participantes_escalation_read_after, "DENIED");
      assert.equal(parsed.results.foreign_chat_create, "DENIED");
      assert.equal(parsed.results.foreign_chat_delete_recreate, "DENIED");
      assert.equal(parsed.results.foreign_legacy_message_create, "DENIED");
      assert.equal(parsed.results.receptor_inbox_query, "ALLOWED");
      assert.equal(parsed.results.receptor_chats_query_receptorUid, "ALLOWED");
      assert.equal(parsed.results.receptor_chats_query_targetUid, "ALLOWED");
      assert.equal(parsed.results.legacy_participantes_query, "ALLOWED");
      assert.equal(parsed.results.visitor_receipt_wrong_uid_key, "DENIED");
      assert.equal(parsed.results.visitor_receipt_anon_alias, "ALLOWED");
      assert.equal(parsed.results.visitor_receipt_wrong_auth_uid, "DENIED");
      assert.equal(parsed.results.receptor_receipt_uid, "ALLOWED");
      assert.equal(parsed.results.receptor_receipt_profile_alias, "ALLOWED");
      assert.equal(parsed.results.visitor_chat_receipt_anon, "ALLOWED");
      assert.equal(parsed.results.receptor_chat_receipt_uid, "ALLOWED");
      assert.equal(parsed.results.visitor_seenBy_owner_denied, "DENIED");
      assert.equal(parsed.results.foreign_arbitrary_receipt_alias, "DENIED");
      assert.equal(parsed.results.independent_visitor_poison_latestSenderAnonSessionId, "DENIED");
      assert.equal(parsed.results.independent_visitor_receipt_unverified_anon, "DENIED");
      assert.equal(parsed.results.unauth_chats_anonimos_get, "DENIED");
      assert.equal(parsed.results.foreign_chats_anonimos_get, "DENIED");
      assert.equal(parsed.results.participant_chats_anonimos_get, "ALLOWED");
      assert.equal(parsed.results.unauth_chats_anonimos_message_get, "DENIED");
      assert.equal(parsed.results.anon_match_meta_update_allowed, "ALLOWED");
      assert.equal(parsed.results.anon_match_identity_update_denied, "DENIED");
      assert.equal(parsed.results.anon_match_own_message_create, "ALLOWED");
      assert.equal(parsed.results.anon_match_foreign_message_create, "DENIED");
      assert.equal(parsed.results.foreign_solicitud_rewrite_denied, "DENIED");
      assert.equal(parsed.results.receptor_lease_get_denied, "DENIED");
      assert.equal(parsed.results.admin_lease_get_allowed, "ALLOWED");
      assert.equal(parsed.results.receptor_participantes_no_visitor_uid, "ALLOWED");
      assert.equal(parsed.results.foreign_inbox_query, "DENIED");
      draft = parsed;
    }
  }

  independent1618 = runIndependent("scripts/p0-privacy-rules-independent.emulator.mjs", port);
  assert.equal(independent1618.gate, "P0_PRIVACY_INDEPENDENT_1618");
  assert.equal(independent1618.results.poison_latestSenderAnonSessionId, "DENIED");
  assert.equal(independent1618.results.receipt_readBy_unverified_anon, "DENIED");
  assert.equal(independent1618.results.receipt_readBy_verified_anon, "ALLOWED");

  independent1627 = runIndependent("scripts/p0-privacy-rules-independent-1627.emulator.mjs", port);
  assert.equal(independent1627.gate, "P0_PRIVACY_INDEPENDENT_1627");
  assert.equal(independent1627.results.visitor_seenBy_owner, "DENIED");
  assert.equal(independent1627.results.visitor_readAt_owner, "DENIED");
  assert.equal(independent1627.results.visitor_latestReadMessageIds_owner, "DENIED");
  assert.equal(independent1627.results.anon_match_foreign_sender_message, "DENIED");
  assert.equal(independent1627.results.anon_match_identity_escalation_destinatarioUid, "DENIED");
  assert.equal(independent1627.results.anon_match_third_party_read_after_escalation, "DENIED");
  assert.equal(independent1627.results.foreign_rewrites_solicitud, "DENIED");

  independent1630 = runIndependent("scripts/p0-privacy-rules-independent-1630.emulator.mjs", port);
  assert.equal(independent1630.gate, "P0_PRIVACY_INDEPENDENT_1630");
  assert.equal(independent1630.results.visitor_wipe_readBy_null, "DENIED");
  assert.equal(independent1630.results.visitor_wipe_readAt_null, "DENIED");
  assert.equal(independent1630.results.visitor_wipe_unreadCounts_scalar, "DENIED");
  assert.equal(independent1630.results.visitor_wipe_seenBy_empty_list, "DENIED");
  assert.equal(independent1630.results.visitor_wipe_message_readBy_null, "DENIED");

  independent1635 = runIndependent(
    "scripts/p0-privacy-rules-independent-1635.emulator.mjs",
    port,
    true,
  );
  assert.equal(independent1635.gate, "P0_PRIVACY_INDEPENDENT_1635");
  assert.equal(independent1635.results.visitor_atomic_batch_allowed, "ALLOWED");
  assert.equal(independent1635.results.visitor_second_send_from_unread_gt0_allowed, "ALLOWED");
  assert.equal(independent1635.results.owner_reply_readBy_false_both_aliases_allowed, "ALLOWED");
  assert.equal(independent1635.results.preview_without_message_denied, "DENIED");
  assert.equal(independent1635.results.unread_arbitrary_without_message_denied, "DENIED");
  assert.equal(independent1635.results.replay_existing_message_denied, "DENIED");
  assert.equal(independent1635.results.control_anon_message_no_public_uid_allowed, "ALLOWED");
  assert.equal(independent1635.results.senderAuthUid_denied_with_valid_permit, "DENIED");
  assert.equal(independent1635.results.createdByAuthUid_denied_with_valid_permit, "DENIED");
  assert.equal(independent1635.results.receptor_reads_visitor_message_authorship, "ALLOWED");

  independent1648 = runIndependent(
    "scripts/p0-privacy-rules-independent-1648.emulator.mjs",
    port,
    true,
  );
  assert.equal(independent1648.gate, "P0_PRIVACY_INDEPENDENT_1648");
  assert.equal(independent1648.results.visitor_control_batch_allowed, "ALLOWED");
  assert.equal(independent1648.results.owner_control_batch_allowed, "ALLOWED");
  assert.equal(independent1648.results.visitor_batch_foreign_readBy_denied, "DENIED");
  assert.equal(independent1648.results.visitor_batch_foreign_unreadCounts_denied, "DENIED");
  assert.equal(independent1648.results.visitor_batch_spoof_lastMessageSender_denied, "DENIED");
  assert.equal(independent1648.results.visitor_batch_foreign_typing_denied, "DENIED");
  assert.equal(independent1648.results.owner_batch_foreign_readBy_denied, "DENIED");
  assert.equal(independent1648.results.owner_batch_foreign_unreadCounts_denied, "DENIED");
  assert.equal(independent1648.results.owner_batch_spoof_lastMessageSender_denied, "DENIED");
  assert.equal(independent1648.results.owner_batch_foreign_typing_denied, "DENIED");
} else {
  baseline = { skipped: true, reason: "no_emulator_on_8080_or_8099" };
  draft = { skipped: true, reason: "no_emulator_on_8080_or_8099" };
  independent1618 = { skipped: true, reason: "no_emulator_on_8080_or_8099" };
  independent1627 = { skipped: true, reason: "no_emulator_on_8080_or_8099" };
  independent1630 = { skipped: true, reason: "no_emulator_on_8080_or_8099" };
  independent1635 = { skipped: true, reason: "no_emulator_on_8080_or_8099" };
  independent1648 = { skipped: true, reason: "no_emulator_on_8080_or_8099" };
  compileGate = { skipped: true, reason: "no_emulator_on_8080_or_8099" };
}

console.log(
  JSON.stringify({
    gate: "P0_PRIVACY_RULES",
    pass: emulatorMode !== "none",
    isolationPass: false,
    draftAccepted: false,
    emulatorMode,
    activeRuleset: status.activeRulesVerified,
    baseline,
    draft,
    compileGate,
    independent1618,
    independent1627,
    independent1630,
    independent1635,
    independent1648,
    deployRules: false,
    rollout: "PENDING_coordinated_release",
    physical: "PENDING_prod_rules_rollout",
  }),
);

if (emulatorMode === "none") process.exit(2);
