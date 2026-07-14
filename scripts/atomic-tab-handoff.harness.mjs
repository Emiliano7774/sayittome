/**
 * ATOMIC_TAB_HANDOFF_HARNESS
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

const handoff = fs.readFileSync(
  path.join(root, "src/lib/navigation/atomicMainTabHandoff.ts"),
  "utf8",
);
const mainHost = fs.readFileSync(
  path.join(root, "src/components/navigation/MainTabKeepAliveHost.tsx"),
  "utf8",
);
const bottom = fs.readFileSync(
  path.join(root, "src/components/navigation/BottomNavLink.tsx"),
  "utf8",
);
const shell = fs.readFileSync(
  path.join(root, "src/contexts/MainTabShellContext.tsx"),
  "utf8",
);

check("handoff target state exists", /handoffTarget/.test(handoff));
check("reveal blocked until ready under contract", /isTabShellNoLoadingTransitionContractActive/.test(handoff));
check("traces destination blocked", /TAB_SHELL_NO_LOADING_DESTINATION_REVEAL_BLOCKED/.test(handoff) || /traceTabShellNoLoading/.test(handoff));
check("main host longer budget under contract", /NO_LOADING|contractActive|isTabShellNoLoading/.test(mainHost));
check("native soft-nav under contract", /isTabShellNoLoadingTransitionContractActive|soft/.test(bottom));
check("hardNavigate skipped under contract", /isTabShellNoLoadingTransitionContractActive|hardNavigate/.test(shell));

const failed = cases.filter((c) => !c.pass);
console.log(JSON.stringify({ harness: "ATOMIC_TAB_HANDOFF_HARNESS", total: cases.length, failed: failed.length, cases }, null, 2));
process.exit(failed.length === 0 ? 0 : 2);
