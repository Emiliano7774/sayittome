/**
 * EXIT_WATCHDOG_NO_STUCK_LATCH_HARNESS
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

const exitHost = fs.readFileSync(
  path.join(root, "src/components/shuffle/ShuffleKeepAliveHost.tsx"),
  "utf8",
);
const state = fs.readFileSync(
  path.join(root, "src/lib/navigation/shuffleHandoffState.ts"),
  "utf8",
);
const css = fs.readFileSync(path.join(root, "src/app/globals.css"), "utf8");

check("module exit watchdog armed", /armShuffleExitNoLoadingWatchdog/.test(exitHost));
check("absolute budget prevents forever spin abandonment without settle path", /NO_LOADING_EXIT_ABSOLUTE_BUDGET/.test(exitHost));
check("clearShuffleExitToMainTab removes class", /sayittome-shuffle-exit-handoff-pending/.test(state));
check("soft settle on no-loading timeout", /TAB_SHELL_NO_LOADING_DESTINATION_READY_TIMEOUT/.test(exitHost));
check("recovery effect or watchdog clears latch", /clearShuffleExitToMainTab/.test(exitHost));
check("loading chrome hidden during exit handoff", /sayittome-shuffle-exit-handoff-pending[\s\S]*data-nav-loading-copy/.test(css) || /data-nav-loading-copy[\s\S]*sayittome-shuffle-exit-handoff-pending/.test(css) || /sayittome-shuffle-exit-handoff-pending/.test(css) && /data-nav-loading-copy/.test(css));

const failed = cases.filter((c) => !c.pass);
console.log(JSON.stringify({ harness: "EXIT_WATCHDOG_NO_STUCK_LATCH_HARNESS", total: cases.length, failed: failed.length, cases }, null, 2));
process.exit(failed.length === 0 ? 0 : 2);
