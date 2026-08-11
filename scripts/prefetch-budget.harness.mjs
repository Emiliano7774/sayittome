#!/usr/bin/env node
/**
 * Static + optional live budget checks for speculative media prefetch.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = process.cwd();
const fails = [];
function assert(cond, msg) {
  if (!cond) fails.push(msg);
}

const indexStore = readFileSync(join(ROOT, "src/lib/stories/storiesIndexStore.ts"), "utf8");
const speculative = indexStore.match(/speculativeLimit\s*=\s*(\d+)/);
assert(speculative, "stories speculativeLimit missing");
assert(Number(speculative[1]) <= 4, `stories speculativeLimit too high: ${speculative?.[1]}`);

const warm = readFileSync(join(ROOT, "src/lib/shuffle/warmImages.ts"), "utf8");
assert(warm.includes("Math.min(max, 16)"), "shuffle warm hard cap missing");

const pool = readFileSync(join(ROOT, "src/hooks/useShufflePool.ts"), "utf8");
const windowWarm = pool.match(/warmShuffleImages\(shownProfiles,\s*(\d+)/);
const poolWarm = pool.match(/warmShuffleImages\(profiles,\s*(\d+)/);
assert(windowWarm && Number(windowWarm[1]) <= 12, "window warm budget too high");
assert(poolWarm && Number(poolWarm[1]) <= 8, "pool warm budget too high");

const maxWarmPerSession =
  Number(windowWarm?.[1] || 0) + Number(poolWarm?.[1] || 0);
assert(maxWarmPerSession <= 20, `combined shuffle warm budget too high: ${maxWarmPerSession}`);

const buffers = readFileSync(
  join(ROOT, "src/components/stories/StoryMediaBuffers.tsx"),
  "utf8",
);
assert(
  buffers.includes('preload={visible ? "auto" : "metadata"}'),
  "hidden story video must not force preload=auto",
);
assert(!buffers.includes('preload="auto"'), "only the visible slot may use preload=auto via visible?auto:metadata");

if (fails.length) {
  console.error("prefetch-budget FAILED");
  for (const fail of fails) console.error(` - ${fail}`);
  process.exit(1);
}

console.log(
  JSON.stringify(
    {
      ok: true,
      storiesSpeculativeLimit: Number(speculative[1]),
      shuffleWarm: {
        window: Number(windowWarm[1]),
        pool: Number(poolWarm[1]),
        combinedMax: maxWarmPerSession,
      },
      hiddenVideoPreload: "metadata",
    },
    null,
    2,
  ),
);
