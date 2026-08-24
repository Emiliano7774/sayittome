/**
 * Fetch currently released Firestore rules for sayittome-app.
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const cfgPath = path.join(os.homedir(), ".config", "configstore", "firebase-tools.json");
const cfg = JSON.parse(fs.readFileSync(cfgPath, "utf8"));
const token = cfg.tokens?.access_token;
if (!token) {
  console.error(JSON.stringify({ ok: false, error: "no_access_token" }));
  process.exit(1);
}

const releaseRes = await fetch(
  "https://firebaserules.googleapis.com/v1/projects/sayittome-app/releases/cloud.firestore",
  { headers: { Authorization: `Bearer ${token}` } },
);
const release = await releaseRes.json();
const rulesetName = release.release?.rulesetName || release.rulesetName;
if (!rulesetName) {
  console.error(JSON.stringify({ ok: false, releaseStatus: releaseRes.status, release }, null, 2));
  process.exit(1);
}

const rulesetRes = await fetch(`https://firebaserules.googleapis.com/v1/${rulesetName}`, {
  headers: { Authorization: `Bearer ${token}` },
});
const ruleset = await rulesetRes.json();
const src = String(ruleset.source?.files?.[0]?.content || "");

const out = {
  ok: true,
  rulesetName,
  createTime: ruleset.createTime,
  hasCollectionExclude: src.includes("collection != 'viewOnceSecrets'"),
  hasStringPath: src.includes("string(request.path)"),
  hasViewOnceDeny: /match \/viewOnceSecrets\/\{secretId\}[\s\S]*?allow read, write: if false/.test(
    src,
  ),
  hasCatchAll2026: src.includes("timestamp.date(2026, 12, 31)"),
  catchAllSnippet: (() => {
    const i = src.lastIndexOf("match /{");
    return i >= 0 ? src.slice(i) : "";
  })(),
};

fs.writeFileSync(
  path.join("scripts", "backups", `firestore.rules.live-${Date.now()}.rules`),
  src,
  "utf8",
);
console.log(JSON.stringify(out, null, 2));
