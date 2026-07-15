/**
 * Reprocess failed staged rollout after prepaint-chats as recognized Shuffle→Boost fail.
 * Does not mutate the original artifact; writes classification into product-fix root.
 */
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const failedDir = path.join(
  root,
  "scripts/ghost-filmstrip-out/staged-rollout-final-after-prepaint-chats-fix-1784116797628",
);
const outDir =
  process.argv[2] ||
  path.join(
    root,
    "scripts/ghost-filmstrip-out/targeted-shuffle-boost-loading-product-fix-1784118347787",
  );

const summary = JSON.parse(
  fs.readFileSync(
    path.join(failedDir, "prod-targeted/fresh-anon-8dir-summary.json"),
    "utf8",
  ),
);
const finalStatus = JSON.parse(
  fs.readFileSync(path.join(failedDir, "FINAL_STATUS.json"), "utf8"),
);

const sb = (summary.directions || []).find(
  (d) => d.source === "shuffle" && d.dest === "boost",
);
const sc = (summary.directions || []).find(
  (d) => d.source === "shuffle" && d.dest === "chats",
);
const cs = (summary.directions || []).find(
  (d) => d.source === "chats" && d.dest === "shuffle",
);
const sbTail = Array.isArray(sb?.midLoadingTail)
  ? sb.midLoadingTail[0]
  : sb?.midLoadingTail;

const recognized =
  finalStatus.estado ===
    "STAGED_ROLLOUT_FINAL_AFTER_PREPAINT_CHATS_TARGETED_FAILED_ROLLED_BACK_FALSE" &&
  sb?.classification === "DESTINATION_LOADING_VISIBLE" &&
  Number(sb?.midLoadingAfterRevealCount || 0) >= 1 &&
  sbTail?.loadingTextAnywhere === true &&
  sbTail?.mainLoadingText === true &&
  sbTail?.exportPresent === false &&
  sb?.final?.loadingTextAnywhere === false &&
  sc?.midLoadingAfterRevealCount === 0 &&
  (sc?.classification === "CLEAN" ||
    sc?.classification === "BIDIRECTIONAL_HOP_CLEAN_WITH_CONTEXT_REBIND");

const out = {
  status: recognized
    ? "OLD_PREPAINT_ROLLOUT_SHUFFLE_BOOST_FAIL_RECOGNIZED"
    : "REPROCESS_MISMATCH",
  recognized,
  estado: finalStatus.estado,
  chatsToShuffle: cs?.classification,
  shuffleToChats: sc?.classification,
  shuffleToBoost: sb?.classification,
  midLoadingAfterRevealCount: sb?.midLoadingAfterRevealCount,
  midTail: sbTail,
  finalIdleClean: sb?.final?.loadingTextAnywhere === false,
  primaryRoot: "SBL1_BOOST_SUPPRESS_NOT_ARMED_BEFORE_REVEAL",
  secondaryRoots: [
    "SBL2_BOOST_ACCESS_GATE_TREATS_INTERNAL_HANDOFF_AS_COLD",
    "SBL6_EXIT_HANDOFF_FALSE_WITH_BOOST_LOADING_VISIBLE",
    "SBL8_EXPORT_OR_FLAG_REBIND_GAP_DURING_SHUFFLE_BOOST",
  ],
  note: "Final idle clean does not compensate mid loading. Chats prepaint passed; Boost lacked session prepaint.",
};

fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(
  path.join(outDir, "reprocess-old-prepaint-rollout-shuffle-boost-fail.json"),
  JSON.stringify(out, null, 2),
);
console.log(out.status);
process.exit(recognized ? 0 : 1);
