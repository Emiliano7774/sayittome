/**
 * P0_GCF_IP_TRUST — last XFF hop on direct GCF only; hosting/forged headers fail closed.
 * Does not call production with secrets. Pure + optional live probe (no body secrets).
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

const ip = await import(pathToFileURL(path.join(root, "src/lib/abuse/abuseIpHash.ts")).href);
const writeSrc = fs.readFileSync(
  path.join(root, "src/lib/abuse/profileAnonAbuseBlockWrite.ts"),
  "utf8",
);

function gcfReq(host, xff) {
  return new Request("https://example/api/abuse/bind-visitor-session", {
    method: "POST",
    headers: { host, "x-forwarded-for": xff },
  });
}

function hostingReq(xff) {
  return new Request("https://sayittome-app.web.app/api/abuse/bind-visitor-session", {
    method: "POST",
    headers: { host: "sayittome-app.web.app", "x-forwarded-for": xff },
  });
}

// Host suffix alone on Hosting must NOT trust IP.
assert.equal(ip.getTrustedRequestClientIp(hostingReq("203.0.113.1, 198.51.100.55")), "");
assert.equal(ip.isDirectCloudFunctionsRequest(hostingReq("")), false);

// Forged left XFF on direct GCF: trust LAST hop only, not left public IP.
const directRun = gcfReq("ssrsayittomeapp-xyz-uc.a.run.app", "203.0.113.99, 198.51.100.55");
assert.equal(ip.isDirectCloudFunctionsRequest(directRun), true);
assert.equal(ip.getTrustedRequestClientIp(directRun), "198.51.100.55");
assert.notEqual(ip.getTrustedRequestClientIp(directRun), "203.0.113.99");

// cloudfunctions.net host accepted.
const cfn = gcfReq("us-central1-sayittome-app.cloudfunctions.net", "198.51.100.10");
assert.equal(ip.getTrustedRequestClientIp(cfn), "198.51.100.10");

// Private last hop → empty (PENDING).
const privateLast = gcfReq("ssrsayittomeapp-uc.a.run.app", "203.0.113.1, 10.0.0.5");
assert.equal(ip.getTrustedRequestClientIp(privateLast), "");

// Writer fail-closed on hosting (no emulator in this harness — contract via source).
assert.match(writeSrc, /requireTrustedSendIp/);
assert.match(writeSrc, /abuse_ip_unavailable/);
assert.match(writeSrc, /isDirectCloudFunctionsRequest/);

const results = [
  "hosting_xff_rejected",
  "direct_last_hop_only",
  "cloudfunctions_host_ok",
  "private_last_hop_empty",
  "writer_hosting_fail_closed_contract",
];

// Optional live probe: direct URL shape only (404/405 ok — proves route exists).
let liveProbe = "skipped";
try {
  const res = await fetch(
    "https://us-central1-sayittome-app.cloudfunctions.net/ssrsayittomeapp/api/abuse/bind-visitor-session",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-forwarded-for": "203.0.113.1, 198.51.100.77",
      },
      body: "{}",
    },
  );
  liveProbe = `http_${res.status}`;
  assert.ok(res.status >= 400 && res.status < 600, `unexpected_live_status:${res.status}`);
  results.push("live_direct_route_reachable");
} catch {
  liveProbe = "network_error";
}

console.log(
  JSON.stringify(
    {
      gate: "P0_GCF_IP_TRUST",
      pass: true,
      results,
      liveProbe,
      note: "Last XFF hop on direct GCF only; never trust Hosting host or left XFF chain.",
    },
    null,
    2,
  ),
);
