/**
 * Chats + Boost sequence guards coexist (tx-scoped suppress, no cross-clear).
 */
import fs from "node:fs";

const cases = [];
function check(name, cond) {
  cases.push({ name, pass: Boolean(cond) });
  console.log(cond ? "PASS" : "FAIL", name);
}

const chatsSrc = fs.readFileSync("src/lib/chats/chatsHandoffSuppress.ts", "utf8");
const boostSrc = fs.readFileSync("src/lib/boost/boostHandoffSuppress.ts", "utf8");
const readySrc = fs.readFileSync("src/lib/navigation/tabDestinationReadiness.ts", "utf8");
const inboxSrc = fs.readFileSync("src/hooks/useChatsInboxReady.ts", "utf8");
const css = fs.readFileSync("src/app/globals.css", "utf8");

check(
  "LOGGED_IN_SHUFFLE_CHATS_LOADING_BLOCK_RELEASE_HARNESS",
  readySrc.includes("TAB_HANDOFF_CHATS_INBOX_LOADING_BLOCKED_RELEASE") &&
    readySrc.includes("armChatsSequenceHandoffSuppress"),
);
check(
  "CHATS_MAIN_LOADING_TEXT_STRICT_HARNESS",
  readySrc.includes("TAB_HANDOFF_CHATS_INBOX_LOADING_DETECTED") &&
    inboxSrc.includes("isChatsSequenceHandoffSuppressActive"),
);
check(
  "CANONICAL_IDLE_BLOCKED_BY_CHATS_LOADING_HARNESS",
  readySrc.includes("TAB_HANDOFF_CANONICAL_IDLE_BLOCKED_CHATS_LOADING") ||
    readySrc.includes("CANONICAL_IDLE_BLOCKED_CHATS_LOADING") ||
    readySrc.includes("TAB_HANDOFF_CHATS_INBOX_LOADING_BLOCKED_RELEASE"),
);
check(
  "DIRECT_COLD_CHATS_LOADING_ALLOWED_HARNESS",
  chatsSrc.includes("Direct cold") &&
    inboxSrc.includes("Direct cold") &&
    !css.includes("html:not([data-chats") /* no global hide without handoff token */,
);
check(
  "DESTINATION_GUARD_TOKEN_OWNERSHIP_HARNESS",
  chatsSrc.includes("chatsSequenceHandoffSuppressTxId") &&
    chatsSrc.includes("opts.txId !== chatsSequenceHandoffSuppressTxId"),
);
check(
  "SETTLE_CSS_TOKEN_LIFECYCLE_HARNESS",
  css.includes('data-shuffle-exit-handoff-target="/chats"') &&
    css.includes("data-chats-post-auth-settle") &&
    readySrc.includes("TAB_HANDOFF_CHATS_SETTLE_CSS_HELD"),
);
check(
  "LOGGED_IN_BOOST_SHUFFLE_ORPHAN_LOADING_BLOCK_RELEASE_HARNESS",
  boostSrc.includes("armBoostSequenceHandoffSuppress") &&
    readySrc.includes("armBoostSequenceHandoffSuppress"),
);
check(
  "ORPHAN_LOADING_TEXT_ANYWHERE_STRICT_HARNESS",
  readySrc.includes("loadingTextAnywhere") ||
    fs
      .readFileSync("scripts/bidirectional-tab-no-loading-visual-gate.mjs", "utf8")
      .includes("anyLoadingText"),
);
check(
  "CHATS_AND_BOOST_SEQUENCE_GUARDS_COEXIST_HARNESS",
  chatsSrc.includes("armChatsSequenceHandoffSuppress") &&
    boostSrc.includes("armBoostSequenceHandoffSuppress") &&
    !chatsSrc.includes("clearBoost") &&
    !boostSrc.includes("clearChats"),
);

const failed = cases.filter((c) => !c.pass);
const out = {
  gate: "CHATS_AND_BOOST_SEQUENCE_GUARDS_COEXIST",
  pass: failed.length === 0,
  cases,
};
console.log(JSON.stringify(out, null, 2));
process.exit(failed.length === 0 ? 0 : 2);
