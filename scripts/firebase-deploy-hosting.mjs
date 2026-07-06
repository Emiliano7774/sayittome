/**
 * Production Hosting deploy with observability and a clean Next output tree.
 * Ensures `.next/dev` never enters the SSR function bundle (Firebase globs `.next/**`).
 */
import { existsSync } from "node:fs";
import { rm } from "node:fs/promises";
import { spawn } from "node:child_process";

function run(cmd, args, env = process.env) {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, {
      stdio: "inherit",
      shell: process.platform === "win32",
      env,
    });
    child.on("error", reject);
    child.on("exit", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`${cmd} ${args.join(" ")} exited with code ${code}`));
    });
  });
}

async function ensureCleanDist() {
  if (existsSync(".next/dev")) {
    console.warn(
      "[deploy:hosting] Removing stale .next/dev before build (prevents ~1.6GB SSR upload).",
    );
    await rm(".next/dev", { recursive: true, force: true });
  }
}

const startedAt = Date.now();
console.log(`[deploy:hosting] start ${new Date().toISOString()}`);

await ensureCleanDist();
await run("npm", ["run", "build"]);

const distMb = await (async () => {
  const { readdir, stat } = await import("node:fs/promises");
  const { join } = await import("node:path");
  async function dirSize(dir) {
    let total = 0;
    for (const entry of await readdir(dir, { withFileTypes: true })) {
      const p = join(dir, entry.name);
      if (entry.isDirectory()) total += await dirSize(p);
      else total += (await stat(p)).size;
    }
    return total;
  }
  if (!existsSync(".next")) return 0;
  return Math.round((await dirSize(".next")) / (1024 * 1024));
})();

console.log(`[deploy:hosting] .next size before Firebase packaging: ~${distMb} MB`);

await run("firebase", ["deploy", "--only", "hosting"]);

const elapsedSec = Math.round((Date.now() - startedAt) / 1000);
console.log(`[deploy:hosting] complete in ${elapsedSec}s`);
