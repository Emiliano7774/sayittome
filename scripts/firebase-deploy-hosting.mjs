/**
 * Production Hosting deploy with observability and a clean Next output tree.
 * Ensures `.next/dev` never enters the SSR function bundle (Firebase globs `.next/**`).
 *
 * Hang diagnosis: `firebase deploy --only hosting` with hosting.source="." runs a
 * SECOND Next build + SSR function package. That phase prints little on Windows and
 * looks stuck for 6–10+ minutes. This wrapper heartbeats and writes a result file.
 */
import { existsSync, writeFileSync } from "node:fs";
import { rm } from "node:fs/promises";
import { spawn, execSync } from "node:child_process";

function gitSha() {
  try {
    return execSync("git rev-parse --short HEAD", { encoding: "utf8" }).trim();
  } catch {
    return "unknown";
  }
}

function run(cmd, args, env = process.env) {
  return new Promise((resolve, reject) => {
    const started = Date.now();
    const child = spawn(cmd, args, {
      stdio: "inherit",
      shell: process.platform === "win32",
      env,
    });
    const beat = setInterval(() => {
      const sec = Math.round((Date.now() - started) / 1000);
      console.log(`[deploy:hosting] still running ${cmd} ${args.join(" ")} (${sec}s)`);
    }, 15000);
    child.on("error", (error) => {
      clearInterval(beat);
      reject(error);
    });
    child.on("exit", (code) => {
      clearInterval(beat);
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
const sha = gitSha();
const builtAt = new Date().toISOString();
console.log(`[deploy:hosting] start ${builtAt} sha=${sha}`);

await ensureCleanDist();
await run("node", ["scripts/install-next-ssr-bin.mjs"]);
writeFileSync(
  "public/build-release.json",
  `${JSON.stringify({ sha, builtAt, source: "deploy:hosting" }, null, 2)}\n`,
  "utf8",
);

await run("npm", ["run", "build"], {
  ...process.env,
  NEXT_PUBLIC_BUILD_SHA: sha,
  NEXT_PUBLIC_BUILD_AT: builtAt,
});

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
console.log(
  "[deploy:hosting] firebase will rebuild frameworks + upload SSR. Heartbeat every 15s. Typical 6-12 min.",
);

const result = {
  sha,
  builtAt,
  distMb,
  firebaseExit: null,
  complete: false,
};
try {
  await run("firebase", ["deploy", "--only", "hosting", "--non-interactive", "--force"]);
  result.firebaseExit = 0;
  result.complete = true;
} catch (error) {
  result.firebaseExit = String(error?.message || error);
  writeFileSync(
    "scripts/last-hosting-deploy.json",
    `${JSON.stringify({ ...result, elapsedSec: Math.round((Date.now() - startedAt) / 1000) }, null, 2)}\n`,
    "utf8",
  );
  throw error;
}

const elapsedSec = Math.round((Date.now() - startedAt) / 1000);
result.elapsedSec = elapsedSec;
writeFileSync(
  "scripts/last-hosting-deploy.json",
  `${JSON.stringify(result, null, 2)}\n`,
  "utf8",
);
console.log(`[deploy:hosting] complete in ${elapsedSec}s sha=${sha}`);
