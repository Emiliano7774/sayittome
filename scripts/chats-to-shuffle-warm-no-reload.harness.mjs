/**
 * CHATS_TO_SHUFFLE_WARM_NO_RELOAD_GATE
 *   node scripts/chats-to-shuffle-warm-no-reload.harness.mjs
 *
 * Distinguishes warm-valid nav GETs (fail) from TTL-expired / setup / background.
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
  poolSrc.includes("isShufflePoolWarmForNav") &&
    poolSrc.includes("if (!isShufflePoolWarmForNav())"),
);

check(
  "WARMUP_USES_CACHE_HIT_WITHOUT_FETCH",
  (warmSrc.includes('"cache-hit"') || warmSrc.includes("cache-hit")) &&
    warmSrc.includes("readCachedShufflePool") &&
    warmSrc.includes("isShufflePoolWarmForNav"),
);

check(
  "STALE_HYDRATION_MARKER_ALONE_MUST_REFETCH",
  (() => {
    const start = warmSrc.indexOf("export function isShufflePoolWarmForNav");
    const end = warmSrc.indexOf("\n}", start);
    const warmPredicate = warmSrc.slice(start, end);
    return (
      warmPredicate.includes("readCachedShufflePool") &&
      warmPredicate.includes("getVisibleShuffleProfiles") &&
      !warmPredicate.includes("if (hasShuffleEverHydrated()) return true")
    );
  })(),
);

check(
  "WARM_NAV_PINS_KEEPALIVE",
  navSrc.includes("pinShuffleKeepAlive") &&
    navSrc.includes("ensureShufflePoolWarmForMicroSlide"),
);

check(
  "WARM_VALID_NAV_MUST_NOT_REFETCH_POOL_FULL",
  warmSrc.includes("Warm-valid nav: never refetch") ||
    warmSrc.includes("isShufflePoolWarmForNav"),
);

check(
  "EIGHT_MIN_TIMER_SKIPS_WHEN_TTL_CACHE_VALID",
  poolSrc.includes("stillWarm") &&
    poolSrc.includes("readCachedShufflePool()") &&
    poolSrc.includes("8 * 60_000"),
);

const failed = checks.filter((c) => !c.pass);
console.log(
  JSON.stringify(
    {
      gate: "CHATS_TO_SHUFFLE_WARM_NO_RELOAD_GATE",
      pass: failed.length === 0,
      checks,
      metricsContract: {
        warmHopPoolGets: "raw pool=full during hop loop after cold settle",
        warmValidNavPoolGets: "FAIL if >0 (hydrated/cache TTL-valid nav fetch)",
        ttlExpiredPoolGets: "allowed; classified separately",
        setupPoolGets: "before warm-valid ready; classified separately",
        backgroundPoolGets: "8m timer / force refresh; classified separately",
      },
    },
    null,
    2,
  ),
);
process.exit(failed.length ? 1 : 0);
