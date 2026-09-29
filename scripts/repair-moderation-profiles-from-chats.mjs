/**
 * Rebuild moderation_profiles from ALL chats (metadata only).
 * Uses Firebase CLI access token (same pattern as inventory-lost-chats-global-temp.mjs).
 *
 *   node scripts/repair-moderation-profiles-from-chats.mjs --dry-run
 *   node scripts/repair-moderation-profiles-from-chats.mjs --apply
 *
 * Merge-only. Does not rewrite messages/media/authorship.
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { installHarnessAlias, installHarnessWindow } from "./harness-alias.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
installHarnessWindow();
installHarnessAlias(root);

const args = process.argv.slice(2);
const apply = args.includes("--apply");
const dryRun = args.includes("--dry-run") || !apply;
const reportPath = path.join(root, "scripts/repair-moderation-profiles-from-chats-last.json");

const PROJECT = "sayittome-app";
const ROOT =
  "https://firestore.googleapis.com/v1/projects/" +
  PROJECT +
  "/databases/(default)/documents";

const cfg = JSON.parse(
  fs.readFileSync(path.join(os.homedir(), ".config", "configstore", "firebase-tools.json"), "utf8"),
);
const TOKEN = cfg?.tokens?.access_token;
if (!TOKEN) throw new Error("firebase token missing — run firebase login");
const H = { Authorization: "Bearer " + TOKEN, "Content-Type": "application/json" };

function dec(v) {
  if (!v || typeof v !== "object") return undefined;
  if ("stringValue" in v) return v.stringValue;
  if ("integerValue" in v) return Number(v.integerValue);
  if ("doubleValue" in v) return Number(v.doubleValue);
  if ("booleanValue" in v) return v.booleanValue;
  if ("nullValue" in v) return null;
  if ("timestampValue" in v) return v.timestampValue;
  if ("mapValue" in v) {
    const o = {};
    for (const [k, x] of Object.entries(v.mapValue.fields || {})) o[k] = dec(x);
    return o;
  }
  if ("arrayValue" in v) return (v.arrayValue.values || []).map(dec);
}

function decodeDoc(d) {
  const data = {};
  for (const [k, v] of Object.entries(d.fields || {})) data[k] = dec(v);
  return {
    id: String(d.name || "").split("/").pop(),
    data,
    updateTime: d.updateTime || "",
  };
}

async function list(coll) {
  const out = [];
  let pageToken = "";
  do {
    const u = new URL(ROOT + "/" + coll);
    u.searchParams.set("pageSize", "300");
    if (pageToken) u.searchParams.set("pageToken", pageToken);
    const r = await fetch(u, { headers: H });
    if (!r.ok) throw new Error("list " + coll + " " + r.status + " " + (await r.text()));
    const j = await r.json();
    for (const d of j.documents || []) out.push(decodeDoc(d));
    pageToken = j.nextPageToken || "";
  } while (pageToken);
  return out;
}

function enc(value) {
  if (value === null || value === undefined) return { nullValue: null };
  if (typeof value === "string") return { stringValue: value };
  if (typeof value === "number") {
    if (Number.isInteger(value)) return { integerValue: String(value) };
    return { doubleValue: value };
  }
  if (typeof value === "boolean") return { booleanValue: value };
  return { stringValue: String(value) };
}

async function mergeProfile(docId, fields) {
  const name = `${ROOT}/moderation_profiles/${encodeURIComponent(docId)}`;
  const body = {
    fields: Object.fromEntries(
      Object.entries(fields).map(([k, v]) => [k, enc(v)]),
    ),
  };
  const mask = Object.keys(fields)
    .map((k) => `updateMask.fieldPaths=${encodeURIComponent(k)}`)
    .join("&");
  const r = await fetch(`${name}?${mask}`, {
    method: "PATCH",
    headers: H,
    body: JSON.stringify(body),
  });
  if (!r.ok) {
    throw new Error(`patch ${docId} ${r.status} ${await r.text()}`);
  }
}

const { planModerationProfileRepairFromChats } = await import(
  pathToFileURL(path.join(root, "src/lib/moderation/adminChatsFeed.ts")).href
);
const { safeProfileKey } = await import(
  pathToFileURL(path.join(root, "src/lib/moderation/classicFeed.ts")).href
);

const [users, chats, profiles] = await Promise.all([
  list("usuarios"),
  list("chats"),
  list("moderation_profiles"),
]);

const uidToUsername = {};
for (const u of users) {
  const username = String(u.data?.username || u.data?.nombre || "").trim();
  if (username && !username.startsWith("anon_")) uidToUsername[u.id] = username;
}

const rawRows = chats.map((c) => ({
  id: c.id,
  ...(c.data || {}),
  updatedAt: c.data?.updatedAt || c.updateTime,
  createdAt: c.data?.createdAt,
}));

const plan = planModerationProfileRepairFromChats(rawRows, uidToUsername);
const beforeKeys = new Set(profiles.map((p) => p.id));
const plannedKeys = plan.profiles.map((p) => p.usernameKey);
const missingBefore = plannedKeys.filter((k) => !beforeKeys.has(k));

const report = {
  mode: dryRun ? "dry-run" : "apply",
  generatedAt: new Date().toISOString(),
  chatsScanned: chats.length,
  chatsTotal: chats.length,
  usuariosScanned: users.length,
  moderationProfilesBefore: profiles.length,
  profilesPlanned: plan.profiles.length,
  missingProfileKeysBefore: missingBefore.length,
  missingProfileKeysSample: missingBefore.slice(0, 40),
  unresolvedChats: plan.unresolved.length,
  unresolvedSample: plan.unresolved.slice(0, 40),
  applied: 0,
  moderationProfilesAfter: null,
  coverageOk: null,
};

fs.writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
console.log(JSON.stringify({ phase: "planned", ...report }, null, 2));

if (dryRun) {
  console.log(
    JSON.stringify({
      gate: "REPAIR_MODERATION_PROFILES",
      pass: true,
      mode: "dry-run",
      reportPath,
    }),
  );
  process.exit(0);
}

let applied = 0;
for (const profile of plan.profiles) {
  await mergeProfile(profile.usernameKey, {
    username: profile.username,
    usernameKey: profile.usernameKey,
    ...(profile.uid ? { uid: profile.uid } : {}),
    lastModerationActivityMs: profile.lastModerationActivityMs || 0,
    lastMessagePreview: profile.lastMessagePreview || "Actividad histórica",
    lastChatId: profile.lastChatId || "",
    unseen: true,
    repairedFromChatsAt: new Date().toISOString(),
  });
  applied += 1;
  if (applied % 50 === 0) {
    console.log(JSON.stringify({ phase: "apply-progress", applied, of: plan.profiles.length }));
  }
}

const after = await list("moderation_profiles");
const afterKeys = new Set(after.map((p) => p.id));
const stillMissing = plannedKeys.filter((k) => !afterKeys.has(k));
const coverageOk = stillMissing.length === 0;

report.applied = applied;
report.moderationProfilesAfter = after.length;
report.coverageOk = coverageOk;
report.stillMissingAfter = stillMissing.slice(0, 40);
report.stillMissingCount = stillMissing.length;
// Sanity: planned keys that existed as chat owners should all be present.
report.sampleKeyCheck = plannedKeys.slice(0, 5).map((k) => ({
  key: k,
  present: afterKeys.has(k),
  expectedSafe: safeProfileKey(plan.profiles.find((p) => p.usernameKey === k)?.username || k),
}));

fs.writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
console.log(
  JSON.stringify({
    gate: "REPAIR_MODERATION_PROFILES",
    pass: coverageOk,
    mode: "apply",
    reportPath,
    applied,
    after: after.length,
    stillMissing: stillMissing.length,
    unresolvedChats: plan.unresolved.length,
  }),
);

if (!coverageOk) process.exit(1);
