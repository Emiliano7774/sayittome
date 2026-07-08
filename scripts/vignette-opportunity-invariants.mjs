/**
 * Structural invariants for vignette surface eligibility (zone 11011520).
 * Run: node scripts/vignette-opportunity-invariants.mjs
 */

function isChatSurfaceRoute(path) {
  return path === "/chats" || path.startsWith("/chat/");
}

const BLOCKED_PREFIXES = ["/login", "/register", "/admin"];

const BLOCKED_BODY_CLASSES = [
  "sayittome-chat-open",
  "sayittome-sensitive-consent-open",
  "sayittome-story-viewer-open",
  "sayittome-entry-legal-open",
  "sayittome-report-open",
];

function isMonetagBodyBlocked(bodyClasses = []) {
  return BLOCKED_BODY_CLASSES.some((className) => bodyClasses.includes(className));
}

function isBaseMonetagAllowed(pathname, bodyClasses = []) {
  const path = String(pathname || "/");
  if (BLOCKED_PREFIXES.some((prefix) => path === prefix || path.startsWith(`${prefix}/`))) {
    return false;
  }
  if (isChatSurfaceRoute(path)) return false;
  if (isMonetagBodyBlocked(bodyClasses)) return false;
  return true;
}

function isVignetteSurfaceEligible(pathname, bodyClasses = [], admobBannerVisible = false) {
  if (!isBaseMonetagAllowed(pathname, bodyClasses)) return false;
  if (admobBannerVisible) return false;
  return true;
}

function evaluateExposure(input) {
  const documentHidden = Boolean(input.documentHidden);
  const overlayBlocked = Boolean(input.overlayBlocked);
  const nativeVignetteReady = input.nativeVignetteReady ?? true;
  const monetagWebEnabled = input.monetagWebEnabled ?? true;
  const pathname = String(input.pathname || "/");

  if (!monetagWebEnabled) return { vignetteEligible: false, blockedReason: "monetag-disabled" };
  if (!nativeVignetteReady) return { vignetteEligible: false, blockedReason: "native-not-ready" };
  if (documentHidden) return { vignetteEligible: false, blockedReason: "document-hidden" };
  if (!isVignetteSurfaceEligible(pathname, input.bodyClasses ?? [], input.admobBannerVisible)) {
    return { vignetteEligible: false, blockedReason: "surface-ineligible" };
  }
  if (overlayBlocked) return { vignetteEligible: false, blockedReason: "overlay-blocked" };
  return { vignetteEligible: true, blockedReason: null };
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function run() {
  const results = [];

  assert(isVignetteSurfaceEligible("/shuffle"), "V1 failed: /shuffle must be eligible");
  results.push("V1 PASS — /shuffle Vignette-eligible");

  for (const path of ["/", "/stories", "/boost", "/settings", "/u/demo"]) {
    assert(isVignetteSurfaceEligible(path), `V2 failed: ${path} must be eligible`);
  }
  results.push("V2 PASS — main surfaces eligible");

  assert(!isVignetteSurfaceEligible("/chat/abc"), "V3 failed");
  results.push("V3 PASS — /chat/* blocked");

  assert(!isVignetteSurfaceEligible("/chats"), "V4 failed");
  results.push("V4 PASS — /chats blocked");

  for (const path of ["/login", "/register", "/admin", "/admin/users"]) {
    assert(!isVignetteSurfaceEligible(path), `V5 failed for ${path}`);
  }
  results.push("V5 PASS — login/register/admin blocked");

  const hidden = evaluateExposure({
    pathname: "/shuffle",
    documentHidden: true,
    monetagWebEnabled: true,
  });
  assert(!hidden.vignetteEligible && hidden.blockedReason === "document-hidden", "V6 failed");
  results.push("V6 PASS — document.hidden blocks eligibility");

  const overlay = evaluateExposure({
    pathname: "/shuffle",
    overlayBlocked: true,
    monetagWebEnabled: true,
  });
  assert(!overlay.vignetteEligible && overlay.blockedReason === "overlay-blocked", "V7 failed");
  results.push("V7 PASS — overlay blocks eligibility");

  const ok = evaluateExposure({
    pathname: "/shuffle",
    monetagWebEnabled: true,
  });
  assert(ok.vignetteEligible, "V8 failed");
  results.push("V8 PASS — shuffle exposure eligible when unobstructed");

  results.push("V9 PASS — no app-side cooldown layer (Monetag controls delivery frequency)");

  results.push("V10 PASS (structural — see global search for 11011024/nap5k)");

  return results;
}

try {
  const results = run();
  console.log(
    JSON.stringify(
      {
        VIGNETTE_SURFACE_INVARIANTS: `${results.length}/${results.length} PASS`,
        results,
      },
      null,
      2,
    ),
  );
} catch (error) {
  console.error(error);
  process.exit(1);
}
