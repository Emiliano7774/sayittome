/**
 * Native-shell visual spot-check 4/4 (timing gate OFF).
 */
import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const base = process.argv.includes("--base")
  ? process.argv[process.argv.indexOf("--base") + 1]
  : "http://localhost:3010";
const out = process.argv.includes("--out")
  ? process.argv[process.argv.indexOf("--out") + 1]
  : path.join(root, "scripts", "ghost-filmstrip-out", "local-native-shell-visual-spot-4");
const useChrome = process.argv.includes("--chrome");
const profile = path.join(
  root,
  "scripts",
  useChrome ? ".auth-capture-profile-chrome-diag" : ".auth-capture-profile",
);

const args = [
  path.join(root, "scripts", "auth-current-head-ghost-capture.mjs"),
  "--capture",
  "--release",
  "--visual-spot-check",
  "--simulate-native-shell",
  "--enable-micro-slide",
  "--runner-trace",
  "--hops",
  "4",
  "--base",
  base,
  "--out",
  out,
  "--profile",
  profile,
];
if (useChrome) args.splice(3, 0, "--chrome");

console.log("NATIVE_SHELL_VISUAL_SPOT_4");
console.log(["node", ...args].join(" "));
console.log("SIMULATE_NATIVE_SHELL = UA SayItToMeApp/wv");
console.log("CAPTURE_PROVIDER_SELECTED = CDP_SCREENCAST_VISUAL_SPOT_CHECK");
console.log("TIMING_ROBUSTNESS_GATE_ENABLED = false");
console.log("SOURCE_SCHEDULE =", JSON.stringify(["chats", "stories", "boost", "settings"]));

const child = spawn(process.execPath, args, { cwd: root, stdio: "inherit", env: process.env });
child.on("exit", (code) => process.exit(code ?? 1));
