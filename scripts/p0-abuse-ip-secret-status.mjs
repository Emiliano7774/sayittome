/**
 * P0_ABUSE_IP_SECRET_STATUS — metadata only via Firebase CLI (never print secret value).
 * Does NOT create/set secrets or deploy. Run before runtime IP validation.
 *
 *   node scripts/p0-abuse-ip-secret-status.mjs
 */
import { execSync } from "node:child_process";

const PROJECT = "sayittome-app";
const SECRET = "ABUSE_IP_HASH_SECRET";

function run(cmd) {
  try {
    execSync(cmd, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
    return { ok: true };
  } catch (error) {
    const stderr = String(error.stderr || error.message || "");
    const stdout = String(error.stdout || "");
    const merged = `${stdout}\n${stderr}`;
    if (/404|NOT_FOUND|not found|no versions/i.test(merged)) {
      return { ok: false, reason: "not_found" };
    }
    if (/Permission|403|401/i.test(merged)) {
      return { ok: false, reason: "permission_denied" };
    }
    return { ok: false, reason: "cli_error", detail: merged.slice(0, 200) };
  }
}

const describe = run(
  `firebase functions:secrets:describe ${SECRET} --project ${PROJECT}`,
);
const access = run(
  `firebase functions:secrets:access ${SECRET} --project ${PROJECT}`,
);

const report = {
  gate: "P0_ABUSE_IP_SECRET_STATUS",
  project: PROJECT,
  secretName: SECRET,
  describeConfigured: describe.ok,
  accessConfigured: access.ok,
  status: describe.ok && access.ok ? "configured" : "missing",
  nextSteps: [
    "Manual only (never commit/log value): firebase functions:secrets:set ABUSE_IP_HASH_SECRET --project sayittome-app",
    "Grant SSR function: firebase functions:secrets:grantaccess ABUSE_IP_HASH_SECRET --project sayittome-app --region us-central1",
    "Validate runtime on DIRECT GCF URL with p0-gcf-ip-trust.harness.mjs before enabling gates/rules",
  ],
  activateGates: false,
  pass: true,
};

if (!describe.ok) report.describeReason = describe.reason;
if (!access.ok) report.accessReason = access.reason;

console.log(JSON.stringify(report, null, 2));
process.exit(0);
