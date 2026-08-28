/**
 * P0_ABUSE_IP_SECRET_STATUS — metadata only via Firebase CLI (never print secret value).
 */
import { execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const PROJECT = "sayittome-app";
const SECRET = "ABUSE_IP_HASH_SECRET";
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function run(cmd) {
  try {
    execSync(cmd, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
    return { ok: true };
  } catch (error) {
    const merged = `${String(error.stdout || "")}\n${String(error.stderr || error.message || "")}`;
    if (/404|NOT_FOUND|not found|no versions/i.test(merged)) {
      return { ok: false, reason: "not_found" };
    }
    if (/Permission|403|401/i.test(merged)) {
      return { ok: false, reason: "permission_denied" };
    }
    return { ok: false, reason: "cli_error" };
  }
}

const get = run(`firebase functions:secrets:get ${SECRET} --project ${PROJECT}`);
let frameworksBinding = false;
try {
  const firebaseJson = JSON.parse(fs.readFileSync(path.join(root, "firebase.json"), "utf8"));
  const secrets = firebaseJson?.hosting?.frameworksBackend?.secrets;
  frameworksBinding = Array.isArray(secrets) && secrets.includes(SECRET);
} catch {
  frameworksBinding = false;
}

const configured = get.ok;
const report = {
  gate: "P0_ABUSE_IP_SECRET_STATUS",
  project: PROJECT,
  secretConfigured: configured,
  frameworksBackendBinding: frameworksBinding,
  pass: configured && frameworksBinding,
  activateGates: false,
};

console.log(JSON.stringify(report, null, 2));
process.exit(report.pass ? 0 : 1);
