/**
 * P0 coordinated rollout gate — preflight + verification gates + rollout plan.
 * Does NOT deploy. Order: Functions → Hosting/API/client → Rules draft (last).
 *
 * Usage: node scripts/p0-coordinated-rollout-gate.harness.mjs
 */
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const EXPECTED_BRANCH = "deploy/p0-rollout-20260914";
const MANIFEST_PATH = path.join(root, "scripts/p0-isolation-manifest.json");

function parseGateJson(stdout, stderr = "") {
  for (const text of [stdout, `${stderr}\n${stdout}`, `${stdout}\n${stderr}`]) {
    const lines = text.split(/\r?\n/);
    for (let i = lines.length - 1; i >= 0; i -= 1) {
      const line = lines[i].trim();
      if (!line.startsWith("{")) continue;
      try {
        const parsed = JSON.parse(line);
        if (parsed.gate) return parsed;
      } catch {
        /* try previous line */
      }
    }
  }
  throw new Error("gate_json_not_found");
}

function runNode(script, stripTypes = false, extraEnv = {}) {
  const args = stripTypes ? ["--experimental-strip-types", script] : [script];
  const result = spawnSync("node", args, {
    cwd: root,
    encoding: "utf8",
    shell: false,
    timeout: 600_000,
    env: { ...process.env, ...extraEnv },
  });
  const stdout = result.stdout || "";
  const stderr = result.stderr || "";
  if (result.status !== 0 && result.status !== 2) {
    console.error(`${stdout}\n${stderr}`);
    process.exit(1);
  }
  return { ...parseGateJson(stdout, stderr), exitCode: result.status ?? 1, stdout, stderr };
}

function git(args) {
  const result = spawnSync("git", args, { cwd: root, encoding: "utf8", shell: false });
  if (result.status !== 0) {
    throw new Error(`git ${args.join(" ")} failed: ${result.stderr || result.stdout}`);
  }
  return (result.stdout || "").trim();
}

function sha256File(relPath) {
  const abs = path.join(root, relPath);
  const data = fs.readFileSync(abs);
  return createHash("sha256").update(data).digest("hex");
}

function collectManifestFiles(manifest) {
  const set = new Set();
  for (const group of Object.values(manifest.files || {})) {
    for (const rel of group) set.add(rel);
  }
  set.add("scripts/p0-isolation-manifest.json");
  set.add("scripts/p0-client-rules-compat.unit.mjs");
  set.add("scripts/p0-coordinated-rollout-gate.harness.mjs");
  return [...set].sort();
}

function computeAssemblyHash(manifest) {
  const files = collectManifestFiles(manifest);
  const h = createHash("sha256");
  for (const rel of files) {
    h.update(rel);
    h.update("\0");
    h.update(sha256File(rel));
    h.update("\0");
  }
  return h.digest("hex");
}

// --- Preflight ---
const preflight = { pass: true, checks: {} };

let branch = "";
try {
  branch = git(["rev-parse", "--abbrev-ref", "HEAD"]);
} catch {
  branch = "unknown";
}
preflight.checks.branch = branch;
preflight.checks.branchOk = branch === EXPECTED_BRANCH;
if (!preflight.checks.branchOk) preflight.pass = false;

const porcelain = git(["status", "--porcelain"]);
preflight.checks.worktreeClean = porcelain === "";
preflight.checks.porcelain = porcelain || "(clean)";
if (!preflight.checks.worktreeClean) preflight.pass = false;

const commitHash = git(["rev-parse", "HEAD"]);
preflight.checks.commitHash = commitHash;

assert.ok(fs.existsSync(MANIFEST_PATH), "p0-isolation-manifest.json missing");
const manifest = JSON.parse(fs.readFileSync(MANIFEST_PATH, "utf8"));
preflight.checks.baseCommit = manifest.baseCommit;

const manifestFiles = collectManifestFiles(manifest);
for (const rel of manifestFiles) {
  if (!fs.existsSync(path.join(root, rel))) {
    preflight.pass = false;
    preflight.checks.missingFile = rel;
    break;
  }
}
preflight.checks.manifestFileCount = manifestFiles.length;
preflight.checks.assemblyHash = computeAssemblyHash(manifest);

const liveRules = fs.readFileSync(path.join(root, "firestore.rules"), "utf8");
const draftRules = fs.readFileSync(path.join(root, "firestore.rules.p0-privacy-draft.rules"), "utf8");
preflight.checks.prodRulesOpenWindow = /allow read: if openWindow\(\)/.test(liveRules);
preflight.checks.draftRulesPrivate = /mayReadChatData/.test(draftRules);
if (!preflight.checks.prodRulesOpenWindow || !preflight.checks.draftRulesPrivate) {
  preflight.pass = false;
}

if (!preflight.pass) {
  console.log(
    JSON.stringify({
      gate: "P0_COORDINATED_ROLLOUT",
      pass: false,
      phase: "preflight",
      preflight,
      deployExecuted: false,
      isolationPass: false,
    }),
  );
  process.exit(1);
}

// --- Verification gates (no deploy) ---
process.env.P0_ASSEMBLY_COMMIT = commitHash;

const payloadGate = runNode("scripts/profile-anon-send-payload.production.unit.mjs", true);
assert.equal(payloadGate.gate, "PROFILE_ANON_SEND_PAYLOAD_PRODUCTION");
assert.equal(payloadGate.pass, true);

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

const privateAuthGate = runNode("scripts/profile-anon-private-auth-functions.unit.mjs");
assert.equal(privateAuthGate.gate, "PROFILE_ANON_PRIVATE_AUTH_FUNCTIONS");
assert.equal(privateAuthGate.pass, true);

const anonMatchGate = runNode("scripts/verify-anon-match-alias.harness.mjs");
assert.equal(anonMatchGate.gate, "VERIFY_ANON_MATCH_ALIAS_HARNESS");
assert.equal(anonMatchGate.pass, true);

const clientCompatGate = runNode("scripts/p0-client-rules-compat.unit.mjs", true);
assert.equal(clientCompatGate.gate, "P0_CLIENT_RULES_COMPAT");
assert.equal(clientCompatGate.pass, true);
assert.equal(clientCompatGate.newClientPayloadCompatible, true);
assert.equal(clientCompatGate.legacyPayloadWouldBeDenied, true);
assert.equal(clientCompatGate.rulesDeployAllowed, false);

const privacyGate = runNode("scripts/p0-privacy-rules.harness.mjs");
assert.equal(privacyGate.gate, "P0_PRIVACY_RULES");
if (privacyGate.exitCode === 2) {
  console.error("P0_PRIVACY_RULES requires Firestore emulator on 8099 or 8080");
  process.exit(2);
}
assert.equal(privacyGate.pass, true);
assert.equal(privacyGate.isolationPass, false);
assert.equal(privacyGate.deployRules, false);

// --- Rollout plan (documentation + probes; no execution) ---
const deployOrder = [
  {
    step: 1,
    id: "functions",
    label: "Firebase Functions (membership, view-once, verified link)",
    command: "npm run build --prefix functions && firebase deploy --only functions",
    preflightProbe: "functions/lib/index.js exists; PROFILE_ANON_PRIVATE_AUTH_FUNCTIONS pass",
    postDeployProbe: [
      "Callable smoke: deleteChatMessage membership rejects stranger",
      "verifiedProfileLink claim/verify with fixed NOW (staging)",
    ],
    rollback: "firebase functions:log + redeploy previous functions bundle from prior git tag",
  },
  {
    step: 2,
    id: "hosting_api_client",
    label: "Hosting + Next API routes + client bundle (incl. bind-alias, profileAnonSendPayload, R8 consumer)",
    command: "npm run build && firebase deploy --only hosting",
    preflightProbe: "VERIFY_ANON_MATCH_ALIAS_HARNESS Next build PASS; bind-alias route present",
    postDeployProbe: [
      "GET /app-version.json gitCommit === assembly commit",
      "POST /api/anon-match/bind-alias (anonymous Bearer) returns server anonId",
      "First-click anon-match search: solicitanteAnonId present without retry loop",
    ],
    rollback: "firebase hosting:rollback or redeploy prior hosting release SHA",
  },
  {
    step: 3,
    id: "firestore_rules_draft",
    label: "Firestore rules (p0-privacy-draft) — LAST, only if step 2 probes green",
    command: "firebase deploy --only firestore:rules (copy draft → firestore.rules in controlled commit)",
    preflightProbe: "P0_CLIENT_RULES_COMPAT rulesDeployAllowed true AND prod bundle pinned",
    postDeployProbe: [
      "p0-privacy-rules.emulator.mjs draft matrix on staging project",
      "Physical smoke: visitor send without senderAuthUid; anon-match with bound alias",
    ],
    rollback: "Redeploy firestore.rules with openWindow() from previous release commit",
    blockedUntil: [
      "hosting_api_client postDeployProbe green",
      "clientCompatGate.rulesDeployAllowed === true",
      "physical smoke PASS",
    ],
  },
];

const rolloutBlockers = [
  ...clientCompatGate.blockers,
  {
    id: "RULES_DEPLOY_POLICY",
    severity: "rollout_order",
    detail: "rulesDeployAllowed remains false until Hosting/APK pin assembly commit and physical smoke pass",
  },
  {
    id: "ISOLATION_PASS_FALSE",
    severity: "expectation",
    detail: "isolationPass stays false until coordinated release completes; do not flip in harness",
  },
  ...(privacyGate.emulatorMode === "none"
    ? [{ id: "NO_EMULATOR", severity: "harness", detail: "Emulator required for full privacy matrix" }]
    : []),
];

console.log(
  JSON.stringify(
    {
      gate: "P0_COORDINATED_ROLLOUT",
      pass: true,
      deployExecuted: false,
      isolationPass: false,
      draftAccepted: false,
      deployRules: false,
      preflight,
      verification: {
        profileAnonSendPayload: payloadGate,
        functionsBuild: "PASS",
        profileAnonPrivateAuth: privateAuthGate,
        anonMatchHarness: anonMatchGate,
        clientRulesCompat: clientCompatGate,
        privacyRules: {
          pass: privacyGate.pass,
          isolationPass: privacyGate.isolationPass,
          emulatorMode: privacyGate.emulatorMode,
        },
      },
      deployOrder,
      rulesDeployAllowed: false,
      clientSurfaceReady: clientCompatGate.results.bind_alias_route_present === "ALLOWED",
      rolloutBlockers,
      productionStillMissing: [
        "Deploy Functions + Hosting/APK from this assembly commit",
        "Pin public/app-version.json gitCommit to assembly SHA after hosting deploy",
        "Physical prod smoke (anon-match first click, profile-anon visitor send, receptor read)",
        "Rules draft publish only after clientSurfaceReady + rulesDeployAllowed true",
        "UID público P0 §6 (separate track)",
        "Prod isolationPass / physicalPass (not emulator-only)",
      ],
      note: "Coordinated rollout plan verified locally; no deploy performed",
    },
    null,
    0,
  ),
);
