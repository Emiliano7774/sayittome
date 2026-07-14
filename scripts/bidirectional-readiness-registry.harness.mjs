/**
 * BIDIRECTIONAL_READINESS_REGISTRY_HARNESS
 * Static/source-level checks for tab destination readiness registry.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const cases = [];
function check(name, cond) {
  cases.push({ name, pass: Boolean(cond) });
  console.log(cond ? "PASS" : "FAIL", name);
}

const readiness = fs.readFileSync(
  path.join(root, "src/lib/navigation/tabDestinationReadiness.ts"),
  "utf8",
);
const handoff = fs.readFileSync(
  path.join(root, "src/lib/navigation/atomicMainTabHandoff.ts"),
  "utf8",
);
const exitHost = fs.readFileSync(
  path.join(root, "src/components/shuffle/ShuffleKeepAliveHost.tsx"),
  "utf8",
);

check("exports getTabDestinationVisualReadiness", /export function getTabDestinationVisualReadiness/.test(readiness));
check("covers shuffle", /tab === "\/shuffle"/.test(readiness) || /\/shuffle/.test(readiness));
check("covers chats", /\/chats/.test(readiness));
check("covers stories", /\/stories/.test(readiness));
check("covers boost", /\/boost/.test(readiness));
check("covers settings", /\/settings/.test(readiness));
check("stable frames required", /STABLE_FRAMES_REQUIRED/.test(readiness));
check("loading shell detection", /hasLoadingShell/.test(readiness));
check("loading text detection", /hasVisibleLoadingText/.test(readiness));
check("contract gated by micro-slide flag", /isMainTabToShuffleMicroSlideEnabled/.test(readiness));
check("atomic handoff uses readiness", /getTabDestinationVisualReadiness/.test(handoff));
check("exit host uses readiness", /getTabDestinationVisualReadiness/.test(exitHost));
check("exit watchdog present", /armShuffleExitNoLoadingWatchdog/.test(exitHost));

const failed = cases.filter((c) => !c.pass);
console.log(JSON.stringify({ harness: "BIDIRECTIONAL_READINESS_REGISTRY_HARNESS", total: cases.length, failed: failed.length, cases }, null, 2));
process.exit(failed.length === 0 ? 0 : 2);
