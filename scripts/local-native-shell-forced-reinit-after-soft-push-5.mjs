/**
 * LOCAL_NATIVE_SHELL_FORCED_REINIT_AFTER_SOFT_PUSH — 5 hops.
 * Enables sessionStorage force_soft_push_module_reinit and runs native-shell capture.
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
  `local-native-shell-forced-reinit-after-soft-push-${Date.now()}`,
);
const profile = path.join(root, "scripts", ".auth-capture-profile-chrome-diag");

const args = [
  path.join(root, "scripts", "auth-current-head-ghost-capture.mjs"),
  "--capture",
  "--release",
  "--chrome",
  "--native-lifecycle-no-screencast",
  "--simulate-native-shell",
  "--enable-micro-slide",
  "--force-soft-push-module-reinit",
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

console.log("LOCAL_NATIVE_SHELL_FORCED_REINIT_AFTER_SOFT_PUSH");
console.log(["node", ...args].join(" "));
console.log("OUT =", out);

const child = spawn(process.execPath, args, { cwd: root, stdio: "inherit", env: process.env });
child.on("exit", (code) => {
  console.log("FORCED_REINIT_OUT =", out);
  process.exit(code ?? 1);
});
