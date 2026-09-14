/**
 * R8 integration — server-issued alias: no client choice, idempotent owner, foreign denied, rotate.
 * Usage: FIRESTORE_EMULATOR_HOST=127.0.0.1:8099 ANON_MATCH_INTEGRATION_TEST=1 node --experimental-strip-types scripts/verify-anon-match-alias.integration.mjs
 */
import assert from "node:assert/strict";
import net from "node:net";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { installHarnessAlias } from "./harness-alias.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
installHarnessAlias(root);

process.env.ANON_MATCH_INTEGRATION_TEST = "1";
process.env.FIRESTORE_EMULATOR_HOST =
  process.env.FIRESTORE_EMULATOR_HOST || "127.0.0.1:8099";
process.env.GCLOUD_PROJECT = process.env.GCLOUD_PROJECT || "sayittome-app";

const verifyUrl = pathToFileURL(
  path.join(root, "src/lib/anonMatch/verifyAnonMatchCaller.ts"),
).href;
const solicitudAuthUrl = pathToFileURL(
  path.join(root, "src/lib/anonMatch/anonMatchSolicitudAuth.ts"),
).href;
const bindRouteUrl = pathToFileURL(
  path.join(root, "src/app/api/anon-match/bind-alias/route.ts"),
).href;
const requestRouteUrl = pathToFileURL(
  path.join(root, "src/app/api/anon-match/request/route.ts"),
).href;
const serviceUrl = pathToFileURL(path.join(root, "src/lib/anonMatch/service.ts")).href;

const {
  issueServerAnonMatchAlias,
  lookupAnonMatchAliasBinding,
  lookupActiveAnonMatchAliasForAuth,
  assertAnonMatchAliasForCaller,
  setAnonMatchTestAuthOverride,
} = await import(verifyUrl);
const { assertCallerOwnsAnonMatchSolicitud } = await import(solicitudAuthUrl);
const { POST: bindAliasPost } = await import(bindRouteUrl);
const { PATCH: requestPatch } = await import(requestRouteUrl);
const { setAnonMatchTestGetRequestHook } = await import(serviceUrl);

const OWNER = "anon_match_owner_uid_r8";
const STRANGER = "anon_match_stranger_uid_r8";
const SOLICITUD_ID = "sol_r8_integration_test";

const results = {};

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

const [host, portRaw] = process.env.FIRESTORE_EMULATOR_HOST.split(":");
const port = Number(portRaw || 8099);
if (!(await probeEmulator(host, port))) {
  console.log(
    JSON.stringify({
      gate: "VERIFY_ANON_MATCH_ALIAS_INTEGRATION",
      pass: false,
      skipped: true,
      reason: "emulator_not_reachable",
      host,
      port,
    }),
  );
  process.exit(2);
}

async function clearAuthSession(authUid) {
  const adminUrl = pathToFileURL(
    path.join(root, "src/lib/chat/historicalAuthorshipRepairAdmin.ts"),
  ).href;
  const { getRepairAdminDb } = await import(adminUrl);
  const db = getRepairAdminDb();
  const sessionSnap = await db.collection("anon_abuse_anon_match_sessions").doc(authUid).get();
  const active = String((sessionSnap.data() || {}).activeAnonId || "").trim();
  const previous = String((sessionSnap.data() || {}).previousAnonId || "").trim();
  await db.collection("anon_abuse_anon_match_sessions").doc(authUid).delete();
  for (const aliasId of [active, previous]) {
    if (aliasId) await db.collection("anon_abuse_anon_aliases").doc(aliasId).delete();
  }
}

async function expectRejects(label, fn, errorName, status = 403) {
  try {
    await fn();
    assert.fail(`${label} should reject`);
  } catch (error) {
    assert.equal(String(error?.message || error), errorName, label);
    if (status) assert.equal(Number(error?.status || 0), status, `${label} status`);
    results[label] = "DENIED";
  }
}

await clearAuthSession(OWNER);
await clearAuthSession(STRANGER);

const firstIssue = await issueServerAnonMatchAlias({ authUid: OWNER });
assert.match(firstIssue.anonId, /^anon_/);
assert.equal(firstIssue.created, true);
results.server_issue_allowed = "ALLOWED";

const retryIssue = await issueServerAnonMatchAlias({ authUid: OWNER });
assert.equal(retryIssue.anonId, firstIssue.anonId);
assert.equal(retryIssue.created, false);
results.idempotent_owner_retry_allowed = "ALLOWED";

setAnonMatchTestAuthOverride(async () => ({ uid: OWNER, isAnonymous: true }));
const clientAliasRes = await bindAliasPost(
  new Request("http://local/api/anon-match/bind-alias", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ anonId: "anon_client_forbidden_pick" }),
  }),
);
assert.equal(clientAliasRes.status, 400);
const clientAliasJson = await clientAliasRes.json();
assert.equal(clientAliasJson.error, "client_alias_forbidden");
results.client_alias_forbidden = "DENIED";

const bindRouteRes = await bindAliasPost(
  new Request("http://local/api/anon-match/bind-alias", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({}),
  }),
);
assert.equal(bindRouteRes.status, 200);
const bindRouteJson = await bindRouteRes.json();
assert.equal(bindRouteJson.anonId, firstIssue.anonId);
results.bind_alias_route_idempotent = "ALLOWED";

await assertAnonMatchAliasForCaller({ uid: OWNER, isAnonymous: true }, firstIssue.anonId);
results.assert_bound_own_allowed = "ALLOWED";

await expectRejects("assert_unbound_denied", async () => {
  await assertAnonMatchAliasForCaller({ uid: OWNER, isAnonymous: true }, "anon_r8_unbound_test");
}, "unbound_alias");

const strangerIssue = await issueServerAnonMatchAlias({ authUid: STRANGER });
assert.notEqual(strangerIssue.anonId, firstIssue.anonId);

await expectRejects("assert_foreign_denied", async () => {
  await assertAnonMatchAliasForCaller({ uid: STRANGER, isAnonymous: true }, firstIssue.anonId);
}, "foreign_alias");

const rotated = await issueServerAnonMatchAlias({ authUid: OWNER, rotate: true });
assert.notEqual(rotated.anonId, firstIssue.anonId);
assert.equal(rotated.rotated, true);
assert.equal(await lookupActiveAnonMatchAliasForAuth(OWNER), rotated.anonId);
assert.equal(await lookupAnonMatchAliasBinding(firstIssue.anonId), OWNER);
results.rotation_new_alias_allowed = "ALLOWED";
results.rotation_old_alias_still_owned = "ALLOWED";

await assertAnonMatchAliasForCaller({ uid: OWNER, isAnonymous: true }, firstIssue.anonId);
results.rotation_no_thread_merge = "ALLOWED";

await assertCallerOwnsAnonMatchSolicitud(
  { uid: OWNER, isAnonymous: true },
  {
    solicitudId: SOLICITUD_ID,
    solicitanteAnonId: rotated.anonId,
    estado: "pendiente",
    expiresAt: new Date(Date.now() + 60_000).toISOString(),
  },
);
results.solicitud_owner_allowed = "ALLOWED";

await expectRejects(
  "solicitud_foreign_denied",
  async () => {
    await assertCallerOwnsAnonMatchSolicitud(
      { uid: STRANGER, isAnonymous: true },
      {
        solicitudId: SOLICITUD_ID,
        solicitanteAnonId: rotated.anonId,
        estado: "pendiente",
      },
    );
  },
  "foreign_alias",
);

setAnonMatchTestGetRequestHook(() => ({
  solicitudId: SOLICITUD_ID,
  solicitanteAnonId: rotated.anonId,
  estado: "pendiente",
  expiresAt: new Date(Date.now() + 60_000).toISOString(),
  chatId: "",
  anonId: "",
}));

const patchOwn = await requestPatch(
  new Request("http://local/api/anon-match/request", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ solicitudId: SOLICITUD_ID }),
  }),
);
assert.equal(patchOwn.status, 200);
results.patch_own_solicitud_allowed = "ALLOWED";

setAnonMatchTestAuthOverride(async () => ({ uid: STRANGER, isAnonymous: true }));
const patchForeign = await requestPatch(
  new Request("http://local/api/anon-match/request", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ solicitudId: SOLICITUD_ID }),
  }),
);
assert.equal(patchForeign.status, 403);
results.patch_foreign_solicitud_denied = "DENIED";

setAnonMatchTestAuthOverride(null);
setAnonMatchTestGetRequestHook(null);

console.log(
  JSON.stringify({
    gate: "VERIFY_ANON_MATCH_ALIAS_INTEGRATION",
    pass: true,
    emulator: process.env.FIRESTORE_EMULATOR_HOST,
    results,
    note: "Server-issued alias only; client pick forbidden; rotate keeps old thread alias",
  }),
);
