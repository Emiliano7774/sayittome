/**
 * Profile (/u/...) must not paint sticky main-tab keepalive underneath.
 * Static contract: freeze panels on non-main-tab paths + clear stale pathname override.
 */
import fs from "node:fs";

const cases = [];
function check(name, cond) {
  cases.push({ name, pass: Boolean(cond) });
  console.log(cond ? "PASS" : "FAIL", name);
}

const keepAlive = fs.readFileSync("src/lib/navigation/mainTabKeepAlive.ts", "utf8");
const pathnameStore = fs.readFileSync(
  "src/lib/navigation/mainTabInternalPathnameStore.ts",
  "utf8",
);
const fastNav = fs.readFileSync("src/lib/navigation/fastNavigate.ts", "utf8");
const host = fs.readFileSync("src/components/navigation/MainTabKeepAliveHost.tsx", "utf8");

check(
  "FREEZE_MAIN_TAB_PANELS_ON_NON_MAIN_TAB_PATH",
  keepAlive.includes("never paint sticky presented") &&
    keepAlive.includes("Must run before atomic handoff") &&
    keepAlive.includes('!(MAIN_TAB_HREFS as readonly string[]).includes(path)'),
);

check(
  "HOST_STILL_MOUNTS_FOR_PROFILE_AND_CHAT",
  keepAlive.includes('path.startsWith("/u/")') &&
    keepAlive.includes('path.startsWith("/chat/")'),
);

check(
  "SOFT_NAV_CLEARS_STALE_PATHNAME_OVERRIDE",
  fastNav.includes("clearStaleMainTabPathnameOverrideForHref") &&
    fastNav.includes('resetMainTabHistoryPathnameStore("soft-nav-non-main-tab")'),
);

check(
  "PATHNAME_STORE_PREFERS_LIVE_URL_OVER_STALE_OVERRIDE",
  pathnameStore.includes("Stale override after soft router.push") &&
    pathnameStore.includes("Prefer live URL when Next usePathname lags"),
);

check(
  "KEEPALIVE_HOST_RESETS_OVERRIDE_ON_NON_MAIN_TAB",
  host.includes('resetMainTabHistoryPathnameStore("keepalive-host-non-main-tab")') &&
    host.includes("hasMainTabHistoryPathnameOverride"),
);

const failed = cases.filter((c) => !c.pass);
const out = {
  gate: "PROFILE_OVER_KEEPALIVE_OVERLAY",
  pass: failed.length === 0,
  cases,
};
console.log(JSON.stringify(out, null, 2));
process.exit(failed.length === 0 ? 0 : 2);
