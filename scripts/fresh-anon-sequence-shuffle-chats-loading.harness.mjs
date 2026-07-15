/**
 * Fresh-anon exact sequence Shuffle→Chats flash after exitHandoff=false.
 * Static + gate contracts — no gate relaxation.
 */
import fs from "node:fs";
import { evaluateBidirectionalTabNoLoadingVisualGate } from "./bidirectional-tab-no-loading-visual-gate.mjs";

const cases = [];
function check(name, cond) {
  cases.push({ name, pass: Boolean(cond) });
  console.log(cond ? "PASS" : "FAIL", name);
}

{
  const oldFail = evaluateBidirectionalTabNoLoadingVisualGate({
    visualProvider: "PLAYWRIGHT_DOM_SAMPLE_ROBUST_NOT_NO_SCREENCAST",
    classification: "DESTINATION_LOADING_VISIBLE",
    anyLoadingText: true,
    midLoadingAfterRevealCount: 1,
    reachedDest: true,
    source: "shuffle",
    dest: "chats",
    clean: false,
    postHopCanonicalIdle: true,
  });
  check(
    "OLD_FRESH_ANON_SEQUENCE_SHUFFLE_CHATS_FAIL_RECOGNIZED",
    oldFail.pass === false &&
      oldFail.classification === "DESTINATION_LOADING_VISIBLE",
  );
  check(
    "EXIT_HANDOFF_FALSE_WITH_LOADING_STILL_FAILS",
    oldFail.pass === false,
  );
  check("LOADING_TEXT_ANYWHERE_STRICT_STILL_ENFORCED", oldFail.pass === false);
}

{
  const targetedPass = evaluateBidirectionalTabNoLoadingVisualGate({
    visualProvider: "PLAYWRIGHT_DOM_SAMPLE_ROBUST_NOT_NO_SCREENCAST",
    classification: "BIDIRECTIONAL_HOP_CLEAN_WITH_CONTEXT_REBIND",
    anyLoadingText: false,
    midLoadingAfterRevealCount: 0,
    reachedDest: true,
    source: "shuffle",
    dest: "chats",
    clean: true,
    postHopCanonicalIdle: true,
  });
  check(
    "TARGETED_PASS_BUT_SEQUENCE_FAIL_RECOGNIZED",
    targetedPass.pass === true &&
      evaluateBidirectionalTabNoLoadingVisualGate({
        visualProvider: "PLAYWRIGHT_DOM_SAMPLE_ROBUST_NOT_NO_SCREENCAST",
        classification: "DESTINATION_LOADING_VISIBLE",
        anyLoadingText: true,
        midLoadingAfterRevealCount: 1,
        reachedDest: true,
        source: "shuffle",
        dest: "chats",
        clean: false,
        postHopCanonicalIdle: true,
      }).pass === false,
  );
}

const ready = fs.readFileSync("src/lib/navigation/tabDestinationReadiness.ts", "utf8");
const css = fs.readFileSync("src/app/globals.css", "utf8");
const inbox = fs.readFileSync("src/hooks/useChatsInboxReady.ts", "utf8");
const suppress = fs.readFileSync("src/lib/chats/chatsHandoffSuppress.ts", "utf8");

check(
  "FRESH_ANON_SEQUENCE_SHUFFLE_CHATS_LOADING_BLOCK_RELEASE_HARNESS",
  ready.includes("TAB_HANDOFF_CHATS_FRESH_SEQUENCE_LOADING_DETECTED") &&
    ready.includes("TAB_HANDOFF_CHATS_FRESH_SEQUENCE_BLOCKED_RELEASE") &&
    ready.includes("scheduleChatsPostClassClearGuard"),
);
check(
  "EXIT_HANDOFF_FALSE_WITH_CHATS_LOADING_STRICT_HARNESS",
  ready.includes("TAB_HANDOFF_CHATS_SUPPRESS_HELD_AFTER_EXIT_CLEAR") &&
    ready.includes("chatsLayoutLoading"),
);
check(
  "CHATS_TOKEN_HELD_AFTER_CLASS_CLEAR",
  ready.includes("chatsHandoffSuppress") &&
    css.includes("data-chats-handoff-suppress"),
);
check(
  "CHATS_TOKEN_HELD_AFTER_CLASS_CLEAR_HARNESS",
  css.includes('html[data-chats-handoff-suppress="1"]') &&
    ready.includes("isChatsSequenceHandoffSuppressActive") &&
    ready.includes("chatsPostAuthSettle"),
);
check(
  "CANONICAL_IDLE_BLOCKED_BY_FRESH_CHATS_LOADING_HARNESS",
  ready.includes("TAB_HANDOFF_CANONICAL_IDLE_BLOCKED_FRESH_CHATS_LOADING"),
);
check(
  "CHATS_MAIN_LOADING_TEXT_BLOCKS_RELEASE",
  ready.includes("TAB_HANDOFF_CHATS_INBOX_LOADING_BLOCKED_RELEASE") &&
    ready.includes("chatsHostHasLayoutLoading"),
);
check(
  "DIRECT_COLD_CHATS_LOADING_ALLOWED",
  suppress.includes("Direct cold") &&
    inbox.includes("Direct cold") &&
    ready.includes("TAB_HANDOFF_CHATS_DIRECT_COLD_LOADING_ALLOWED"),
);
check(
  "DIRECT_COLD_CHATS_LOADING_ALLOWED_HARNESS",
  suppress.includes("Direct cold") && inbox.includes("Direct cold"),
);
check(
  "LOGGED_IN_SHUFFLE_CHATS_STILL_CLEAN",
  ready.includes("TAB_HANDOFF_CHATS_LOGGED_IN_READY_AFTER_REBIND") &&
    ready.includes("armChatsHandoffSuppressAndSettle"),
);
check(
  "LOGGED_IN_SHUFFLE_CHATS_LOADING_BLOCK_RELEASE_HARNESS",
  ready.includes("TAB_HANDOFF_CHATS_INBOX_LOADING_BLOCKED_RELEASE") &&
    ready.includes("armChatsHandoffSuppressAndSettle"),
);
check(
  "BOOST_ORPHAN_FIX_STILL_HELD",
  ready.includes("armBoostSequenceHandoffSuppress") &&
    ready.includes("TAB_HANDOFF_CANONICAL_IDLE_BLOCKED_ORPHAN_LOADING"),
);
check(
  "LOGGED_IN_BOOST_SHUFFLE_ORPHAN_LOADING_BLOCK_RELEASE_HARNESS",
  ready.includes("armBoostSequenceHandoffSuppress") &&
    fs.readFileSync("src/lib/boost/boostHandoffSuppress.ts", "utf8").includes(
      "armBoostSequenceHandoffSuppress",
    ),
);
check(
  "ORPHAN_LOADING_TEXT_ANYWHERE_STRICT_HARNESS",
  ready.includes("detectOrphanMainLoadingText") ||
    fs
      .readFileSync("scripts/bidirectional-tab-no-loading-visual-gate.mjs", "utf8")
      .includes("anyLoadingText"),
);
check(
  "CHATS_AND_BOOST_SEQUENCE_GUARDS_COEXIST_HARNESS",
  suppress.includes("armChatsSequenceHandoffSuppress") &&
    !suppress.includes("clearBoost") &&
    !fs
      .readFileSync("src/lib/boost/boostHandoffSuppress.ts", "utf8")
      .includes("clearChats"),
);

const failed = cases.filter((c) => !c.pass);
const out = {
  gate: "FRESH_ANON_SEQUENCE_SHUFFLE_CHATS_LOADING",
  pass: failed.length === 0,
  cases,
};
console.log(JSON.stringify(out, null, 2));
process.exit(failed.length === 0 ? 0 : 2);
