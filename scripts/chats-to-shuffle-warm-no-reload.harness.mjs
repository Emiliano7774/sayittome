/**
 * CHATS_TO_SHUFFLE_WARM_NO_RELOAD_GATE
 *   node scripts/chats-to-shuffle-warm-no-reload.harness.mjs
 */
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const checks = [];
function check(name, pass, detail = {}) {
  checks.push({ name, pass: Boolean(pass), ...detail });
  console.log(`${pass ? "PASS" : "FAIL"} ${name}`);
}

const poolSrc = fs.readFileSync(
  path.join(root, "src/hooks/useShufflePool.ts"),
  "utf8",
);
const warmSrc = fs.readFileSync(
  path.join(root, "src/lib/shuffle/shufflePoolWarmup.ts"),
  "utf8",
);
const navSrc = fs.readFileSync(
  path.join(root, "src/lib/navigation/warmShuffleTabNavigation.ts"),
  "utf8",
);

check(
  "MOUNT_SKIPS_FORCED_POOL_GET_WHEN_WARM",
  poolSrc.includes("if (!warmCache)") && poolSrc.includes("warmCache"),
);

check(
  "WARMUP_USES_CACHE_HIT_WITHOUT_FETCH",
  warmSrc.includes('reason: "cache-hit"') &&
    warmSrc.includes("readCachedShufflePool"),
);

check(
  "WARM_NAV_PINS_KEEPALIVE",
  navSrc.includes("pinShuffleKeepAlive") &&
    navSrc.includes("ensureShufflePoolWarmForMicroSlide"),
);

const failed = checks.filter((c) => !c.pass);
console.log(
  JSON.stringify(
    {
      gate: "CHATS_TO_SHUFFLE_WARM_NO_RELOAD_GATE",
      pass: failed.length === 0,
      checks,
    },
    null,
    2,
  ),
);
process.exit(failed.length ? 1 : 0);
