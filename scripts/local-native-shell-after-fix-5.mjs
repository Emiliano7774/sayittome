/**
 * LOCAL_NATIVE_SHELL_AFTER_FIX — 5-hop smoke (NOT the 20/20 release run).
 *
 * Simulates isNativeAppShell() via UA while forcing local micro-slide override,
 * then runs NATIVE_TRANSITION_LIFECYCLE_NO_SCREENCAST evidence on localhost.
 *
 * Expected sources: chats2 / stories1 / boost1 / settings1
 */
import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const base = process.argv.includes("--base")
  ? process.argv[process.argv.indexOf("--base") + 1]
  : "http://localhost:3010";
const out = path.join(
  root,
  "scripts",
  "ghost-filmstrip-out",
  "local-native-shell-after-fix-5",
);
const profile = path.join(root, "scripts", ".auth-capture-profile-chrome-diag");

const expectedSchedule = ["chats", "stories", "chats", "boost", "settings"];

const args = [
  path.join(root, "scripts", "auth-current-head-ghost-capture.mjs"),
  "--capture",
  "--release",
  "--chrome",
  "--native-lifecycle-no-screencast",
  "--simulate-native-shell",
  "--enable-micro-slide",
  "--runner-trace",
  "--hops",
  "5",
  "--base",
  base,
  "--out",
  out,
  "--profile",
  profile,
];

console.log("LOCAL_NATIVE_SHELL_AFTER_FIX 5-hop smoke");
console.log(["node", ...args].join(" "));
console.log("EXPECTED_SOURCE_SCHEDULE =", JSON.stringify(expectedSchedule));
console.log("PHYSICAL_EVIDENCE_PROVIDER_SELECTED = NATIVE_TRANSITION_LIFECYCLE_NO_SCREENCAST");
console.log("SIMULATE_NATIVE_SHELL = true (UA SayItToMeApp/wv)");

const child = spawn(process.execPath, args, { cwd: root, stdio: "inherit", env: process.env });
child.on("exit", (code) => process.exit(code ?? 1));
