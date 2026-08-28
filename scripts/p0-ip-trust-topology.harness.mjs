/**
 * P0_IP_TRUST_TOPOLOGY — direct GCF vs Hosting rewrite hop selection.
 * Output: fingerprints/booleans only — no raw IPs, tokens, or secrets.
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { installHarnessAlias, installHarnessWindow } from "./harness-alias.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
installHarnessWindow();
installHarnessAlias(root);

const hashSrc = fs.readFileSync(path.join(root, "src/lib/abuse/abuseIpHash.ts"), "utf8");
const analyzeSrc = fs.readFileSync(path.join(root, "src/lib/abuse/abuseIpTrustProbeAnalyze.ts"), "utf8");

assert.match(hashSrc, /DIRECT_GCF_HOST_SUFFIX = "\.cloudfunctions\.net"/);
assert.doesNotMatch(hashSrc, /endsWith\(["']\.a\.run\.app["']\)/);
assert.doesNotMatch(hashSrc, /headers\.get\(["']x-forwarded-host["']\)/i);
assert.doesNotMatch(analyzeSrc, /headers\.get\(["']x-forwarded-host["']\)/i);
assert.match(analyzeSrc, /requestIsDirectGcf \? getTrustedRequestClientIp/);

const { isDirectCloudFunctionsRequest, DIRECT_GCF_HOST_SUFFIX } = await import(
  pathToFileURL(path.join(root, "src/lib/abuse/abuseIpHash.ts")).href
);
const { analyzeIpTrustHeaders } = await import(
  pathToFileURL(path.join(root, "src/lib/abuse/abuseIpTrustProbeAnalyze.ts")).href
);

function mockRequest(headers) {
  return new Request("https://example.test/", { headers: new Headers(headers) });
}

assert.equal(DIRECT_GCF_HOST_SUFFIX, ".cloudfunctions.net");

assert.equal(
  isDirectCloudFunctionsRequest(
    mockRequest({ host: "us-central1-sayittome-app.cloudfunctions.net" }),
  ),
  true,
);
assert.equal(
  isDirectCloudFunctionsRequest(mockRequest({ host: "fh-ssrsayittomeapp-abc-uc.a.run.app" })),
  false,
);
assert.equal(isDirectCloudFunctionsRequest(mockRequest({ host: "sayittome-app.web.app" })), false);

const directCanonical = analyzeIpTrustHeaders(
  mockRequest({
    host: "us-central1-sayittome-app.cloudfunctions.net",
    "x-forwarded-for": "203.0.113.55, 198.51.100.10",
  }),
);
assert.equal(directCanonical.requestIsDirectGcf, true);
assert.equal(directCanonical.selectedPolicy, "last_public_hop_direct_gcf");
assert.ok(directCanonical.selectedFingerprint);
assert.equal(directCanonical.hostingRewriteTrusted, false);

const hostingRunHop = analyzeIpTrustHeaders(
  mockRequest({
    host: "fh-ssrsayittomeapp-6m7hihvtvq-uc.a.run.app",
    "x-forwarded-for": "203.0.113.55, 198.51.100.10",
  }),
);
assert.equal(hostingRunHop.requestIsDirectGcf, false);
assert.equal(hostingRunHop.selectedPolicy, "none");
assert.equal(hostingRunHop.selectedFingerprint, null);
assert.ok(hostingRunHop.hopFingerprints.length > 0, "hops still recorded for diag");

const hostingWeb = analyzeIpTrustHeaders(
  mockRequest({
    host: "sayittome-app.web.app",
    "x-forwarded-for": "203.0.113.55",
  }),
);
assert.equal(hostingWeb.requestIsDirectGcf, false);
assert.equal(hostingWeb.selectedPolicy, "none");
assert.equal(hostingWeb.selectedFingerprint, null);

const forwardedHostSpoof = analyzeIpTrustHeaders(
  mockRequest({
    host: "fh-ssrsayittomeapp-6m7hihvtvq-uc.a.run.app",
    "x-forwarded-host": "us-central1-sayittome-app.cloudfunctions.net",
    "x-forwarded-for": "203.0.113.55",
  }),
);
assert.equal(forwardedHostSpoof.requestIsDirectGcf, false);
assert.equal(forwardedHostSpoof.selectedPolicy, "none");
assert.equal(forwardedHostSpoof.selectedFingerprint, null);

console.log(
  JSON.stringify({
    gate: "P0_IP_TRUST_TOPOLOGY",
    pass: true,
    scenarios: {
      canonicalCloudFunctionsDirect: {
        requestIsDirectGcf: directCanonical.requestIsDirectGcf,
        selectedPolicy: directCanonical.selectedPolicy,
        hasSelectedFingerprint: Boolean(directCanonical.selectedFingerprint),
      },
      hostingRunAppRewrite: {
        requestIsDirectGcf: hostingRunHop.requestIsDirectGcf,
        selectedPolicy: hostingRunHop.selectedPolicy,
        hasSelectedFingerprint: Boolean(hostingRunHop.selectedFingerprint),
      },
      hostingWebApp: {
        requestIsDirectGcf: hostingWeb.requestIsDirectGcf,
        selectedPolicy: hostingWeb.selectedPolicy,
      },
      xForwardedHostIgnored: {
        requestIsDirectGcf: forwardedHostSpoof.requestIsDirectGcf,
        selectedPolicy: forwardedHostSpoof.selectedPolicy,
      },
    },
    activateGates: false,
    physicalPass: "PENDING_not_global_ip_pass",
  }),
);
