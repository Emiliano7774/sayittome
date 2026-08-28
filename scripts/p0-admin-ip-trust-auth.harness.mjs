/**
 * P0_ADMIN_IP_TRUST_AUTH
 * - offline: contract + pure helpers (no network)
 * - live (--live): unauthenticated admin endpoints must return 401/403,
 *   Cache-Control private+no-store (Hosting + direct SSR), exact CORS (no wildcard)
 *
 * 404/5xx/network are FAIL (exit 1). Never pass:true on unexpected HTTP.
 */
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { installHarnessAlias, installHarnessWindow } from "./harness-alias.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const runLive = process.argv.includes("--live");
const HOST = process.env.P0_IP_TRUST_LIVE_HOST || "https://sayittome-app.web.app";
const DIRECT_SSR =
  process.env.P0_DIRECT_SSR_BASE_URL ||
  "https://us-central1-sayittome-app.cloudfunctions.net/ssrsayittomeapp";
const ALLOWED_ORIGIN = "https://sayittome-app.web.app";
const EVIL_ORIGIN = "https://evil-not-allowed.example";

const P0_ROUTES = [
  "/api/admin/p0-abuse-config",
  "/api/admin/p0-ip-trust-echo",
  "/api/admin/p0-ip-trust-probe",
];

function fail(reason, extra = {}) {
  console.error(JSON.stringify({ gate: "P0_ADMIN_IP_TRUST_AUTH", pass: false, reason, ...extra }));
  process.exit(1);
}

function assertPrivateNoStore(cacheControl, context) {
  const cc = String(cacheControl || "").toLowerCase();
  if (!cc.includes("private") || !cc.includes("no-store")) {
    fail("live_cache_not_private_no_store", { cacheControl, ...context });
  }
  if (cc.includes("public")) {
    fail("live_cache_contains_public", { cacheControl, ...context });
  }
}

installHarnessWindow();
installHarnessAlias(root);

const shared = await import(
  pathToFileURL(path.join(root, "src/lib/abuse/abuseIpTrustProbeShared.ts")).href
);
const analyzeSrc = fs.readFileSync(
  path.join(root, "src/lib/abuse/abuseIpTrustProbeAnalyze.ts"),
  "utf8",
);
const hashSrc = fs.readFileSync(path.join(root, "src/lib/abuse/abuseIpHash.ts"), "utf8");
const probeBarrel = fs.readFileSync(path.join(root, "src/lib/abuse/abuseIpTrustProbe.ts"), "utf8");
const cors = fs.readFileSync(path.join(root, "src/lib/admin/adminPrivateApi.ts"), "utf8");
const nextConfig = fs.readFileSync(path.join(root, "next.config.ts"), "utf8");
const clientProbe = fs.readFileSync(
  path.join(root, "src/lib/admin/p0IpTrustClientProbe.ts"),
  "utf8",
);
const probeRoute = fs.readFileSync(
  path.join(root, "src/app/api/admin/p0-ip-trust-probe/route.ts"),
  "utf8",
);
const panel = fs.readFileSync(
  path.join(root, "src/components/admin/panels/AdminSystemPanel.tsx"),
  "utf8",
);

assert.match(cors, /private, no-store, max-age=0/);
assert.match(cors, /X-Forwarded-For, Forwarded, X-Real-IP/);
assert.match(nextConfig, /p0-abuse-config/);
assert.match(nextConfig, /private, no-store, max-age=0/);
assert.match(analyzeSrc, /node:crypto/);
assert.match(analyzeSrc, /abuseIpHashSecret/);
assert.match(hashSrc, /DIRECT_GCF_HOST_SUFFIX/);
assert.doesNotMatch(hashSrc, /endsWith\(["']\.a\.run\.app["']\)/);
assert.doesNotMatch(hashSrc, /headers\.get\(["']x-forwarded-host["']\)/i);
assert.doesNotMatch(analyzeSrc, /headers\.get\(["']x-forwarded-host["']\)/i);
assert.doesNotMatch(probeBarrel, /node:crypto/);
assert.match(clientProbe, /abuseIpTrustProbeShared/);
assert.doesNotMatch(clientProbe, /abuseIpTrustProbeAnalyze/);
assert.match(panel, /abuseIpTrustProbeShared/);
assert.doesNotMatch(panel, /from "@\/lib\/abuse\/abuseIpTrustProbe"/);
assert.match(clientProbe, /browserToDirectSsr/);
assert.match(clientProbe, /getIdToken/);
assert.match(probeRoute, /P0_IP_TRUST_PROBE_TIMEOUT_MS/);
assert.match(probeRoute, /isProbeHttpSuccess/);
assert.match(probeRoute, /verifyAdminIdTokenStrictForP0Diag/);
assert.doesNotMatch(probeRoute, /verifyAdminIdToken\(/);
assert.match(
  fs.readFileSync(path.join(root, "src/app/api/admin/p0-abuse-config/route.ts"), "utf8"),
  /verifyAdminIdTokenStrictForP0Diag/,
);
assert.match(panel, /runClientDirectEchoProbe/);
assert.match(panel, /interpretCrossPathBaselines/);
assert.match(panel, /Dual path/);

const nullCompare = shared.compareIpTrustFingerprints(null, null);
assert.equal(nullCompare, null);

const partialCompare = shared.compareIpTrustFingerprints(
  {
    gate: "P0_IP_TRUST_ANALYSIS",
    selectedFingerprint: "a",
    forwardedHopCount: 1,
    requestHost: null,
    requestIsDirectGcf: true,
    hostingRewriteTrusted: false,
    forwardedPresent: false,
    hopFingerprints: [],
    xRealIpFingerprint: null,
    forwardedHeaderFingerprint: null,
    selectedPolicy: "last_public_hop_direct_gcf",
    topologyNote: "",
    activateGates: false,
  },
  {
    gate: "P0_IP_TRUST_ANALYSIS",
    selectedFingerprint: null,
    forwardedHopCount: 0,
    requestHost: null,
    requestIsDirectGcf: true,
    hostingRewriteTrusted: false,
    forwardedPresent: false,
    hopFingerprints: [],
    xRealIpFingerprint: null,
    forwardedHeaderFingerprint: null,
    selectedPolicy: "none",
    topologyNote: "",
    activateGates: false,
  },
);
assert.equal(partialCompare, null);

const cross = shared.interpretCrossPathBaselines({
  clientBaseline: { selectedFingerprint: "same" },
  serverBaseline: { selectedFingerprint: "same" },
});
assert.equal(cross.physicalPassHint, "SUSPICIOUS_same_selected_may_be_proxy_not_client_ip");

const topologyHarness = spawnSync(
  process.execPath,
  [path.join(root, "scripts/p0-ip-trust-topology.harness.mjs")],
  { cwd: root, encoding: "utf8" },
);
assert.equal(
  topologyHarness.status,
  0,
  `topology harness failed:\n${topologyHarness.stdout}\n${topologyHarness.stderr}`,
);

const offline = {
  gate: "P0_ADMIN_IP_TRUST_AUTH_OFFLINE",
  pass: true,
  phase: "contract_and_pure",
};

let live = { skipped: true };

async function assertNoAuthRoute(baseUrl, path, method = "GET") {
  const url = `${baseUrl}${path}`;
  let res;
  try {
    res = await fetch(url, { method, cache: "no-store" });
  } catch (error) {
    fail("live_fetch_failed", { url, error: String(error?.message || error) });
  }

  if (res.status === 404) {
    fail("live_route_not_found", { status: 404, url, hint: "deploy p0-ip-trust-diag" });
  }
  if (res.status >= 500) {
    fail("live_server_error", { status: res.status, url });
  }
  if (res.status !== 401 && res.status !== 403) {
    fail("live_unexpected_status_no_auth", {
      status: res.status,
      url,
      expected: [401, 403],
    });
  }

  assertPrivateNoStore(res.headers.get("cache-control"), { url, path: "no_auth" });
  return { url, status: res.status, cacheControl: res.headers.get("cache-control") };
}

async function assertCorsPreflight(baseUrl, path) {
  const url = `${baseUrl}${path}`;

  let allowed;
  try {
    allowed = await fetch(url, {
      method: "OPTIONS",
      headers: {
        Origin: ALLOWED_ORIGIN,
        "Access-Control-Request-Method": "GET",
        "Access-Control-Request-Headers": "Authorization, X-Forwarded-For",
      },
    });
  } catch (error) {
    fail("live_preflight_failed", { url, error: String(error?.message || error) });
  }

  if (allowed.status !== 204 && allowed.status !== 200) {
    fail("live_preflight_unexpected_status", { status: allowed.status, url });
  }

  const allowOrigin = String(allowed.headers.get("access-control-allow-origin") || "");
  if (allowOrigin !== ALLOWED_ORIGIN) {
    fail("live_cors_allow_origin_mismatch", { allowOrigin, expected: ALLOWED_ORIGIN, url });
  }
  if (allowOrigin === "*") {
    fail("live_cors_wildcard", { allowOrigin, url });
  }

  const allowHeaders = String(allowed.headers.get("access-control-allow-headers") || "");
  if (!/x-forwarded-for/i.test(allowHeaders)) {
    fail("live_cors_missing_x_forwarded_for", { allowHeaders, url });
  }

  assertPrivateNoStore(allowed.headers.get("cache-control"), { url, path: "preflight_allowed" });

  let evil;
  try {
    evil = await fetch(url, {
      method: "OPTIONS",
      headers: {
        Origin: EVIL_ORIGIN,
        "Access-Control-Request-Method": "GET",
        "Access-Control-Request-Headers": "Authorization",
      },
    });
  } catch (error) {
    fail("live_evil_preflight_failed", { url, error: String(error?.message || error) });
  }

  const evilAllow = String(evil.headers.get("access-control-allow-origin") || "");
  if (evilAllow === "*" || evilAllow === EVIL_ORIGIN) {
    fail("live_cors_evil_origin_allowed", { evilAllow, url });
  }

  return { url, corsAllowOrigin: allowOrigin };
}

if (runLive) {
  const hostingResults = [];
  for (const route of P0_ROUTES) {
    const method = route.endsWith("probe") ? "POST" : "GET";
    hostingResults.push(await assertNoAuthRoute(HOST, route, method));
    await assertCorsPreflight(HOST, route);
  }

  const directEcho = await assertNoAuthRoute(DIRECT_SSR, "/api/admin/p0-ip-trust-echo", "GET");
  await assertCorsPreflight(DIRECT_SSR, "/api/admin/p0-ip-trust-echo");

  live = {
    gate: "P0_ADMIN_IP_TRUST_AUTH_LIVE",
    pass: true,
    host: HOST,
    directSsr: DIRECT_SSR,
    hostingRoutes: hostingResults,
    directEcho,
    corsExactOrigin: ALLOWED_ORIGIN,
    evilOriginBlocked: true,
    cachePolicy: "private,no-store",
  };
}

console.log(
  JSON.stringify(
    {
      gate: "P0_ADMIN_IP_TRUST_AUTH",
      pass: true,
      offline,
      live,
      physical: "PENDING_admin_ui_dual_path",
      activateGates: false,
      hint: runLive ? null : "Run with --live for prod auth/CORS/cache gate",
    },
    null,
    2,
  ),
);
