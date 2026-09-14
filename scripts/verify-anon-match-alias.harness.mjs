/**
 * R8 focal harness — alias unit + consumer + emulator integration + next build gate.
 */
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

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
    timeout: 120_000,
    env: { ...process.env, ...extraEnv },
  });
  const stdout = result.stdout || "";
  const stderr = result.stderr || "";
  if (result.status !== 0 && result.status !== 2) {
    console.error(`${stdout}\n${stderr}`);
    process.exit(1);
  }
  return { ...parseGateJson(stdout, stderr), exitCode: result.status ?? 1 };
}

const unitGate = runNode("scripts/verify-anon-match-alias.unit.mjs", true);
assert.equal(unitGate.gate, "VERIFY_ANON_MATCH_ALIAS");
assert.equal(unitGate.pass, true);
assert.equal(unitGate.results.own_alias_bound_allowed, "ALLOWED");
assert.equal(unitGate.results.unbound_alias_denied, "DENIED");
assert.equal(unitGate.results.foreign_alias_denied, "DENIED");
assert.equal(unitGate.results.body_uid_spoof_denied, "DENIED");
assert.equal(unitGate.results.registered_profile_allowed, "ALLOWED");

const consumerGate = runNode("scripts/verify-anon-match-consumer.unit.mjs", true);
assert.equal(consumerGate.gate, "VERIFY_ANON_MATCH_CONSUMER");
assert.equal(consumerGate.pass, true);
assert.equal(consumerGate.results.profile_request_body, "ALLOWED");
assert.equal(consumerGate.results.anonymous_request_body, "ALLOWED");
assert.equal(consumerGate.results.firebase_anonymous_not_profile_branch, "ALLOWED");
assert.equal(consumerGate.results.anonymous_incoming_listener, "ALLOWED");

const firstClickGate = runNode("scripts/verify-anon-match-first-click.unit.mjs", true);
assert.equal(firstClickGate.gate, "VERIFY_ANON_MATCH_FIRST_CLICK");
assert.equal(firstClickGate.pass, true);
assert.equal(firstClickGate.results.first_click_immediate_body, "ALLOWED");
assert.equal(firstClickGate.results.legacy_client_alias_rejected, "DENIED");
assert.equal(firstClickGate.results.server_alias_distinct_from_legacy, "ALLOWED");

const integrationGate = runNode("scripts/verify-anon-match-alias.integration.mjs", true, {
  ANON_MATCH_INTEGRATION_TEST: "1",
});
assert.equal(integrationGate.gate, "VERIFY_ANON_MATCH_ALIAS_INTEGRATION");
if (integrationGate.exitCode === 2) {
  console.error("integration requires Firestore emulator on 8099 or 8080");
  process.exit(2);
}
assert.equal(integrationGate.pass, true);
assert.equal(integrationGate.results.server_issue_allowed, "ALLOWED");
assert.equal(integrationGate.results.client_alias_forbidden, "DENIED");
assert.equal(integrationGate.results.idempotent_owner_retry_allowed, "ALLOWED");
assert.equal(integrationGate.results.assert_foreign_denied, "DENIED");
assert.equal(integrationGate.results.rotation_new_alias_allowed, "ALLOWED");
assert.equal(integrationGate.results.patch_foreign_solicitud_denied, "DENIED");
assert.equal(integrationGate.results.patch_own_solicitud_allowed, "ALLOWED");

const build = spawnSync("npm", ["run", "build"], {
  cwd: root,
  encoding: "utf8",
  shell: true,
  timeout: 600_000,
});
if (build.status !== 0) {
  console.error(`${build.stdout || ""}\n${build.stderr || ""}`);
  process.exit(1);
}

console.log(
  JSON.stringify({
    gate: "VERIFY_ANON_MATCH_ALIAS_HARNESS",
    pass: true,
    unit: unitGate,
    consumer: consumerGate,
    firstClick: firstClickGate,
    integration: integrationGate,
    build: "PASS",
    note: "Server-issued alias + registered vs Firebase anonymous consumer paths",
  }),
);
