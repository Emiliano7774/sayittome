/**
 * Reprocess failed staged rollout after Shuffle→Boost fix as recognized
 * direct-cold /boost source-default fail (not internal mid-loading).
 *
 * Usage:
 *   node scripts/reprocess-direct-cold-boost-source-rollout.mjs [outDir]
 */
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const failedDir = path.join(
  root,
  "scripts/ghost-filmstrip-out/staged-rollout-final-after-shuffle-boost-fix-1784123427388",
);
const outDir =
  process.argv[2] ||
  path.join(
    root,
    "scripts/ghost-filmstrip-out/direct-cold-boost-source-product-fix-reprocess",
  );

function readJson(filePath) {
  const buf = fs.readFileSync(filePath);
  let text;
  if (buf.length >= 2 && buf[0] === 0xff && buf[1] === 0xfe) {
    text = buf.toString("utf16le");
  } else if (
    buf.length >= 3 &&
    buf[0] === 0xef &&
    buf[1] === 0xbb &&
    buf[2] === 0xbf
  ) {
    text = buf.slice(3).toString("utf8");
  } else if (buf.length >= 2 && buf[0] === 0xfe && buf[1] === 0xff) {
    text = Buffer.from(buf).swap16().toString("utf16le");
  } else {
    text = buf.toString("utf8");
  }
  text = text.replace(/^\uFEFF/, "").replace(/^\u00EF\u00BB\u00BF/, "");
  const start = text.indexOf("{");
  if (start > 0) text = text.slice(start);
  return JSON.parse(text);
}

const finalStatus = readJson(path.join(failedDir, "FINAL_STATUS.json"));
const cold = readJson(path.join(failedDir, "fase10-cold.log"));
const rootCause = readJson(
  path.join(failedDir, "direct-cold-fail-root-cause.json"),
);

const boost = cold?.results?.["/boost"] || {};
let marker = null;
try {
  marker = boost.boostMarker ? JSON.parse(boost.boostMarker) : null;
} catch {
  marker = null;
}

const recognized =
  finalStatus.estado ===
    "STAGED_ROLLOUT_FINAL_AFTER_SHUFFLE_BOOST_DIRECT_COLD_FAILED_ROLLED_BACK_FALSE" &&
  cold?.pass === false &&
  boost.prepaintBoost === "1" &&
  boost.boostSuppress === "1" &&
  marker?.from === "/shuffle" &&
  typeof marker?.txId === "string" &&
  marker.txId.startsWith("htx-") &&
  String(finalStatus.targeted || "").includes("CLEAN") &&
  finalStatus.fresh === "8/8 CLEAN" &&
  finalStatus.logged === "8/8 CLEAN";

const out = {
  status: recognized
    ? "OLD_DIRECT_COLD_BOOST_FAIL_RECOGNIZED"
    : "REPROCESS_MISMATCH",
  recognized,
  estado: finalStatus.estado,
  targeted: finalStatus.targeted,
  fresh: finalStatus.fresh,
  logged: finalStatus.logged,
  coldBoost: {
    prepaintBoost: boost.prepaintBoost,
    boostSuppress: boost.boostSuppress,
    from: marker?.from ?? null,
    txId: marker?.txId ?? null,
  },
  primaryRoot: "DCB1_BEGINPOSTAUTH_DEFAULTS_NULL_SOURCE_TO_SHUFFLE",
  rootCauseNote: rootCause.coldFailRoot,
  note: "Internal gates passed; only direct cold /boost armed fake from=/shuffle.",
};

fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(
  path.join(outDir, "reprocess-old-direct-cold-boost-fail.json"),
  JSON.stringify(out, null, 2),
);
console.log(JSON.stringify(out, null, 2));
process.exit(recognized ? 0 : 1);
