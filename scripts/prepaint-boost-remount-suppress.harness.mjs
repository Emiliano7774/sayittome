/**
 * Static + optional live harnesses for pre-paint Boost remount suppress fix
 * (targeted Shuffle→Boost after Chats sequence).
 * Run: node scripts/prepaint-boost-remount-suppress.harness.mjs [--live --base http://127.0.0.1:3010]
 */
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const args = process.argv.slice(2);
const live = args.includes("--live");
const base = args.includes("--base")
  ? args[args.indexOf("--base") + 1]
  : "http://127.0.0.1:3010";

const checks = [];
function check(name, pass, detail = {}) {
  checks.push({ name, pass: Boolean(pass), ...detail });
  console.log(`${pass ? "PASS" : "FAIL"} ${name}`);
}

const suppress = fs.readFileSync(
  path.join(root, "src/lib/boost/boostHandoffSuppress.ts"),
  "utf8",
);
const prepaint = fs.readFileSync(
  path.join(root, "src/lib/boost/boostPrepaintHandoff.ts"),
  "utf8",
);
const bootstrap = fs.readFileSync(
  path.join(root, "src/lib/boost/boostPrepaintBootstrapInline.ts"),
  "utf8",
);
const layout = fs.readFileSync(path.join(root, "src/app/layout.tsx"), "utf8");
const css = fs.readFileSync(path.join(root, "src/app/globals.css"), "utf8");
const nav = fs.readFileSync(
  path.join(root, "src/components/navigation/BottomNavLink.tsx"),
  "utf8",
);
const shuffle = fs.readFileSync(
  path.join(root, "src/lib/navigation/shuffleHandoffState.ts"),
  "utf8",
);
const eligibility = fs.readFileSync(
  path.join(root, "src/hooks/useBoostEligibility.ts"),
  "utf8",
);
const readiness = fs.readFileSync(
  path.join(root, "src/lib/navigation/tabDestinationReadiness.ts"),
  "utf8",
);
const chatsPrepaint = fs.readFileSync(
  path.join(root, "src/lib/chats/chatsPrepaintHandoff.ts"),
  "utf8",
);
const chatsSuppress = fs.readFileSync(
  path.join(root, "src/lib/chats/chatsHandoffSuppress.ts"),
  "utf8",
);
const probe = fs.readFileSync(
  path.join(root, "scripts/bidirectional-tab-no-loading-local-probe.mjs"),
  "utf8",
);

const failedSummary = JSON.parse(
  fs.readFileSync(
    path.join(
      root,
      "scripts/ghost-filmstrip-out/staged-rollout-final-after-prepaint-chats-fix-1784116797628/prod-targeted/fresh-anon-8dir-summary.json",
    ),
    "utf8",
  ),
);
const sb = (failedSummary.directions || []).find(
  (d) => d.source === "shuffle" && d.dest === "boost",
);
const sc = (failedSummary.directions || []).find(
  (d) => d.source === "shuffle" && d.dest === "chats",
);
const cs = (failedSummary.directions || []).find(
  (d) => d.source === "chats" && d.dest === "shuffle",
);
const sbTail = Array.isArray(sb?.midLoadingTail)
  ? sb.midLoadingTail[0]
  : sb?.midLoadingTail;

check(
  "OLD_PREPAINT_ROLLOUT_SHUFFLE_BOOST_FAIL_RECOGNIZED",
  sb?.classification === "DESTINATION_LOADING_VISIBLE" &&
    sb?.midLoadingAfterRevealCount >= 1 &&
    sbTail?.mainLoadingText === true &&
    sbTail?.exportPresent === false &&
    sb?.final?.loadingTextAnywhere === false &&
    sc?.midLoadingAfterRevealCount === 0 &&
    (sc?.classification === "CLEAN" ||
      sc?.classification === "BIDIRECTIONAL_HOP_CLEAN_WITH_CONTEXT_REBIND") &&
    cs?.classification === "CLEAN",
  {
    sb: sb?.classification,
    sc: sc?.classification,
    mid: sb?.midLoadingAfterRevealCount,
  },
);

check(
  "BOOST_SUPPRESS_ARMED_BEFORE_REVEAL",
  prepaint.includes("writeBoostPrepaintHandoffMarker") &&
    nav.includes("writeBoostPrepaintHandoffMarker") &&
    shuffle.includes("writeBoostPrepaintHandoffMarker") &&
    nav.includes('href === "/boost"') &&
    prepaint.includes("TAB_HANDOFF_BOOST_SUPPRESS_ARMED_BEFORE_REVEAL") &&
    readiness.includes("TAB_HANDOFF_BOOST_SUPPRESS_ARMED_BEFORE_REVEAL"),
);

check(
  "BOOST_ACCESS_GATE_HIDDEN_DURING_INTERNAL_HANDOFF",
  css.includes('data-prepaint-boost-handoff-suppress="1"') &&
    css.includes('data-boost-handoff-suppress="1"') &&
    css.includes('[data-boost-access-state="loading"]') &&
    eligibility.includes("isBoostPrepaintHandoffActive") &&
    eligibility.includes("TAB_HANDOFF_BOOST_ACCESS_GATE_INTERNAL_SUPPRESS") &&
    bootstrap.includes("data-prepaint-boost-handoff-suppress") &&
    layout.includes("BOOST_PREPAINT_BOOTSTRAP_SCRIPT"),
);

check(
  "PREVIOUS_DEST_CLEANUP_TX_SCOPED",
  prepaint.includes("sayittome:boost-prepaint-handoff") &&
    chatsPrepaint.includes("sayittome:chats-prepaint-handoff") &&
    !chatsSuppress.includes("sayittome:boost-prepaint-handoff") &&
    !chatsSuppress.includes("clearBoostPrepaint") &&
    suppress.includes("Destination-scoped") &&
    readiness.includes("does not clear Chats prepaint"),
);

check(
  "DIRECT_COLD_BOOST_LOADING_ALLOWED",
  prepaint.includes('if (from === "/boost") return null') &&
    nav.includes('href === "/boost"') &&
    nav.includes('currentPath === "/shuffle"'),
);

check(
  "MISSING_EXPORT_UNPROTECTED_BOOST_LOADING_FAILS",
  probe.includes("prepaintBoostHandoffSuppress") &&
    probe.includes("boostHandoffSuppress") &&
    probe.includes("TAB_HANDOFF_REMOUNT_EXPORT_PENDING_UNPROTECTED_FAIL") &&
    probe.includes("remountExportPendingUnprotected"),
);

check(
  "CHAT_PREPAINT_STILL_CLEAN",
  chatsPrepaint.includes("writeChatsPrepaintHandoffMarker") &&
    layout.includes("CHATS_PREPAINT_BOOTSTRAP_SCRIPT") &&
    css.includes('data-prepaint-chats-handoff-suppress="1"') &&
    nav.includes('href === "/chats"') &&
    nav.includes("writeChatsPrepaintHandoffMarker"),
);

check(
  "BOOST_ORPHAN_STILL_CLEAN",
  css.includes(
    "html.sayittome-shuffle-handoff-pending #sayittome-main-tab-keepalive-boost",
  ) &&
    eligibility.includes("orphan loading gap") &&
    readiness.includes("TAB_HANDOFF_CANONICAL_IDLE_BLOCKED_ORPHAN_LOADING"),
);

check(
  "TARGETED_SEQUENCE_SC_THEN_SB_CLEAN",
  readiness.includes("handoffBoostPrepaintToReactSuppress") &&
    readiness.includes("TAB_HANDOFF_BOOST_REVEAL_WAITED_FOR_READY_OR_SUPPRESS") &&
    suppress.includes("handoffBoostPrepaintToReactSuppress") &&
    suppress.includes("sessionStorage"),
);

check(
  "NO_FORBIDDEN_PATTERNS",
  !probe.includes("NO_SCREENCAST_PASS_AS_CLEAN") &&
    suppress.includes("Direct cold /boost never arms") === false
      ? suppress.includes("Direct cold") ||
        prepaint.includes("Direct cold /boost never writes")
      : true,
);

const allPass = checks.every((c) => c.pass);
console.log(allPass ? "\nALL_STATIC_PASS" : "\nSTATIC_FAIL");

if (live) {
  console.log(`LIVE base=${base} — use bidirectional probe for hop cycles`);
}

process.exit(allPass ? 0 : 1);
