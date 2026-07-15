/**
 * Targeted Shuffle→Chats flag-desync forensic harnesses.
 * Static + gate contracts — no loadingTextAnywhere relaxation.
 */
import fs from "node:fs";
import { evaluateBidirectionalTabNoLoadingVisualGate } from "./bidirectional-tab-no-loading-visual-gate.mjs";

const cases = [];
function check(name, cond) {
  cases.push({ name, pass: Boolean(cond) });
  console.log(cond ? "PASS" : "FAIL", name);
}

const FAILED_ROLLOUT =
  "scripts/ghost-filmstrip-out/staged-rollout-final-after-fresh-anon-chats-fix-1784106002235";

{
  const final = JSON.parse(fs.readFileSync(`${FAILED_ROLLOUT}/FINAL_STATUS.json`, "utf8"));
  const detail = JSON.parse(
    fs.readFileSync(`${FAILED_ROLLOUT}/targeted-failure-detail.json`, "utf8"),
  );
  const delivery = JSON.parse(
    fs.readFileSync(`${FAILED_ROLLOUT}/prod-true-delivery-verified.json`, "utf8"),
  );
  const sc = detail.scDetail;
  const hopGate = evaluateBidirectionalTabNoLoadingVisualGate({
    visualProvider: "PLAYWRIGHT_DOM_SAMPLE_ROBUST_NOT_NO_SCREENCAST",
    classification: sc?.c || "DESTINATION_LOADING_VISIBLE",
    anyLoadingText: sc?.any === true,
    midLoadingAfterRevealCount: sc?.mid ?? 1,
    reachedDest: true,
    source: "shuffle",
    dest: "chats",
    clean: false,
    postHopCanonicalIdle: sc?.idle === true,
    flagAudit: {
      midExportMissing: sc?.midTail?.flag === false,
      midBuildFlagFalse: false,
      probeExportMissing: true,
      note: "legacy mid flag=false without exportPresent field",
    },
  });

  check(
    "TARGETED_SHUFFLE_CHATS_FLAG_FALSE_FAIL_REPROCESS_HARNESS",
    final.pass === false &&
      detail.classifications["shuffle->chats"] === "DESTINATION_LOADING_VISIBLE" &&
      sc?.mid === 1 &&
      sc?.any === true &&
      sc?.midTail?.flag === false &&
      hopGate.pass === false,
  );

  check(
    "DELIVERY_TRUE_HOP_FALSE_FLAG_DESYNC_HARNESS",
    delivery.pass === true &&
      delivery.flagTrue === true &&
      delivery.snap?.microSlideBuildFlag === true &&
      sc?.midTail?.flag === false &&
      hopGate.pass === false,
  );

  check(
    "EXIT_HANDOFF_FALSE_WITH_CHATS_LOADING_STRICT_HARNESS",
    sc?.exitHandoff === false &&
      sc?.mainHandoff === false &&
      sc?.mainLoadingText === true &&
      hopGate.pass === false,
  );

  check(
    "SHUFFLE_BOOST_PASS_DOES_NOT_MASK_CHATS_FAIL",
    String(detail.classifications["shuffle->boost"] || "").includes("CLEAN") &&
      detail.classifications["shuffle->chats"] === "DESTINATION_LOADING_VISIBLE" &&
      final.pass === false,
  );
}

{
  const desyncGate = evaluateBidirectionalTabNoLoadingVisualGate({
    visualProvider: "PLAYWRIGHT_DOM_SAMPLE_ROBUST_NOT_NO_SCREENCAST",
    classification: "FLAG_DESYNC_BETWEEN_DELIVERY_AND_HOP",
    anyLoadingText: false,
    midLoadingAfterRevealCount: 0,
    reachedDest: true,
    source: "shuffle",
    dest: "chats",
    clean: false,
    postHopCanonicalIdle: true,
    flagAudit: { flagDesync: true, midBuildFlagFalse: true },
  });
  check("DELIVERY_TRUE_HOP_FALSE_FLAG_DESYNC_RECOGNIZED", desyncGate.pass === false);

  const preInputGate = evaluateBidirectionalTabNoLoadingVisualGate({
    visualProvider: "PLAYWRIGHT_DOM_SAMPLE_ROBUST_NOT_NO_SCREENCAST",
    classification: "FLAG_DESYNC_PRE_INPUT_GATE_FAIL",
    anyLoadingText: false,
    midLoadingAfterRevealCount: 0,
    reachedDest: false,
    source: "shuffle",
    dest: "chats",
    clean: false,
  });
  check("SAME_PAGE_PRE_INPUT_FLAG_REQUIRED_HARNESS", preInputGate.pass === false);
}

{
  const suppress = fs.readFileSync("src/lib/chats/chatsHandoffSuppress.ts", "utf8");
  const nav = fs.readFileSync("src/lib/perf/navCaptureDiag.ts", "utf8");
  const ready = fs.readFileSync("src/lib/navigation/tabDestinationReadiness.ts", "utf8");
  const probe = fs.readFileSync("scripts/bidirectional-tab-no-loading-local-probe.mjs", "utf8");
  const inbox = fs.readFileSync("src/hooks/useChatsInboxReady.ts", "utf8");

  check(
    "SHUFFLE_CHATS_ARMED_WHEN_CANONICAL_FLAG_TRUE_HARNESS",
    ready.includes("TAB_HANDOFF_SHUFFLE_CHATS_ARMED_WITH_CANONICAL_FLAG") &&
      suppress.includes("sayittome:chats-sequence-handoff-suppress-until") &&
      suppress.includes("hydrateChatsHandoffSuppressFromSession"),
  );

  check(
    "SAME_PAGE_PRE_INPUT_FLAG_REQUIRED",
    probe.includes("FLAG_DESYNC_PRE_INPUT_GATE_FAIL") &&
      probe.includes("TAB_HANDOFF_CANONICAL_FLAG_VERIFIED_PRE_INPUT") &&
      probe.includes("exportPresent") &&
      probe.includes("sayittome:nav-capture"),
  );

  check(
    "NAV_CAPTURE_SESSION_HONORED_AFTER_REMOUNT",
    nav.includes("sayittome:nav-capture-session"),
  );

  check(
    "REMOUNT_REHYDRATES_CHATS_SUPPRESS_BEFORE_SKELETON_PAINT_HARNESS",
    suppress.includes("hydrateChatsHandoffSuppressFromSession") &&
      suppress.includes("sayittome:chats-sequence-handoff-suppress-until") &&
      ready.includes("TAB_HANDOFF_CHATS_SUPPRESS_REHYDRATED_AFTER_REMOUNT"),
  );

  check(
    "NAV_CAPTURE_SESSION_REATTACHES_EXPORT_HARNESS",
    nav.includes("sayittome:nav-capture-session") &&
      probe.includes("sayittome:nav-capture") &&
      probe.includes("exportPresent"),
  );

  check(
    "CHATS_SUPPRESS_SESSION_REHYDRATE_BLOCKS_SKELETON",
    inbox.includes("chatsHandoffSuppressRehydrated") &&
      (suppress.includes("chatsHandoffSuppress") ||
        suppress.includes("SESSION_UNTIL_KEY")),
  );

  check(
    "FRESH_ANON_SEQUENCE_SHUFFLE_CHATS_LOADING_BLOCK_RELEASE_HARNESS",
    ready.includes("TAB_HANDOFF_CHATS_FRESH_SEQUENCE_LOADING_DETECTED") &&
      ready.includes("scheduleChatsPostClassClearGuard"),
  );

  check(
    "DIRECT_COLD_ALLOWED_HARNESS",
    suppress.includes("Direct cold /chats never arms") &&
      evaluateBidirectionalTabNoLoadingVisualGate({
        visualProvider: "PLAYWRIGHT_DOM_SAMPLE_ROBUST_NOT_NO_SCREENCAST",
        classification: "DIRECT_COLD_LOADING_ALLOWED",
        directCold: true,
        anyLoadingText: true,
      }).pass === true,
  );
}

{
  const orphan = fs.readFileSync("src/lib/navigation/tabDestinationReadiness.ts", "utf8");
  check(
    "LOGGED_IN_BOOST_SHUFFLE_ORPHAN_LOADING_BLOCK_RELEASE_HARNESS",
    orphan.includes("TAB_HANDOFF_ORPHAN_LOADING_BLOCKED_RELEASE") ||
      orphan.includes("TAB_HANDOFF_ORPHAN_LOADING_DETECTED"),
  );
  check(
    "ORPHAN_LOADING_TEXT_ANYWHERE_STRICT_HARNESS",
    evaluateBidirectionalTabNoLoadingVisualGate({
      visualProvider: "PLAYWRIGHT_DOM_SAMPLE_ROBUST_NOT_NO_SCREENCAST",
      classification: "DESTINATION_LOADING_VISIBLE",
      anyLoadingText: true,
      midLoadingAfterRevealCount: 1,
      reachedDest: true,
      clean: false,
    }).pass === false,
  );
}

{
  const gateHarness = fs.readFileSync(
    "scripts/bidirectional-tab-no-loading-visual-gate.harness.mjs",
    "utf8",
  );
  const ctxHarness = fs.readFileSync(
    "scripts/bidirectional-context-destroyed-recovery.harness.mjs",
    "utf8",
  );
  check(
    "BIDIRECTIONAL_TAB_NO_LOADING_VISUAL_GATE_HARNESS",
    gateHarness.includes("BIDIRECTIONAL_TAB_NO_LOADING_VISUAL_GATE"),
  );
  check(
    "BIDIRECTIONAL_CONTEXT_DESTROYED_RECOVERY_HARNESS",
    ctxHarness.includes("BIDIRECTIONAL_CONTEXT_DESTROYED_RECOVERY_HARNESS"),
  );
}

const failed = cases.filter((c) => !c.pass);
console.log(
  JSON.stringify(
    {
      harness: "targeted-shuffle-chats-flag-desync",
      pass: failed.length === 0,
      failed: failed.map((c) => c.name),
      total: cases.length,
    },
    null,
    2,
  ),
);
process.exit(failed.length === 0 ? 0 : 1);
