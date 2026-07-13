/**
 * Chromium native-shell soft-nav release 20/20 multi-source NO_SCREENCAST.
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
  : path.join(root, "scripts", "ghost-filmstrip-out", "local-chromium-native-shell-soft-nav-20");
const profile = path.join(root, "scripts", ".auth-capture-profile");

const args = [
  path.join(root, "scripts", "auth-current-head-ghost-capture.mjs"),
  "--capture",
  "--release",
  "--native-lifecycle-no-screencast",
  "--simulate-native-shell",
  "--enable-micro-slide",
  "--runner-trace",
  "--hops",
  "20",
  "--base",
  base,
  "--out",
  out,
  "--profile",
  profile,
];

console.log("CHROMIUM_NATIVE_SHELL_SOFT_NAV_RELEASE_20");
console.log(["node", ...args].join(" "));
console.log("SIMULATE_NATIVE_SHELL = UA SayItToMeApp/wv");
console.log("PHYSICAL_EVIDENCE_PROVIDER_SELECTED = NATIVE_TRANSITION_LIFECYCLE_NO_SCREENCAST");
console.log("Expected distribution:", JSON.stringify({ chats: 8, stories: 4, boost: 4, settings: 4 }));

const child = spawn(process.execPath, args, { cwd: root, stdio: "inherit", env: process.env });
child.on("exit", (code) => process.exit(code ?? 1));
