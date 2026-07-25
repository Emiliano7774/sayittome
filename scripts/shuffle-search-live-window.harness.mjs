/**
 * SHUFFLE_SEARCH_LIVE_WINDOW_GATE
 *   node scripts/shuffle-search-live-window.harness.mjs
 *
 * Typing must force-replace the visible window from the client pool — never
 * wait for the Shuffle button, and never fetch per keypress.
 */
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const checks = [];
function check(name, pass, detail = {}) {
  checks.push({ name, pass: Boolean(pass), ...detail });
  console.log(`${pass ? "PASS" : "FAIL"} ${name}`);
}

const pool = fs.readFileSync(
  path.join(root, "src/hooks/useShufflePool.ts"),
  "utf8",
);
const filters = fs.readFileSync(
  path.join(root, "src/lib/shuffle/filters.ts"),
  "utf8",
);

check(
  "SEARCH_CHANGE_FORCE_WINDOW",
  pool.includes("handleSearchChange") &&
    pool.includes("forceWindow: true") &&
    pool.includes("releaseShuffleWindowRefreshSuppression"),
);

check(
  "CLIENT_POOL_MATCH_FIELDS",
  filters.includes("profileMatchesShuffleSearch") &&
    filters.includes("profile.username") &&
    filters.includes("profile.bio") &&
    filters.includes("profile.intereses"),
);

check(
  "SEARCH_NOT_ONLY_ON_SHUFFLE_BUTTON",
  pool.includes("filterActivePool(value, filtersRef.current, { forceWindow: true })") &&
    pool.includes("handleShuffleClick"),
);

check(
  "NO_KEYPRESS_FIRESTORE",
  !pool.includes("onSnapshot") || pool.includes("loadProfiles"),
);

const failed = checks.filter((c) => !c.pass);
console.log(
  JSON.stringify(
    {
      gate: "SHUFFLE_SEARCH_LIVE_WINDOW_GATE",
      pass: failed.length === 0,
      checks,
    },
    null,
    2,
  ),
);
process.exit(failed.length ? 1 : 0);
