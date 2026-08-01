#!/usr/bin/env node
/**
 * Static guards for Storage egress mitigations.
 * Fails if high-risk patterns regress.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = process.cwd();
const fails = [];

function read(rel) {
  return readFileSync(join(ROOT, rel), "utf8");
}

function assert(cond, msg) {
  if (!cond) fails.push(msg);
}

const uploadHelper = read("src/lib/media/uploadFileToStorage.ts");
assert(
  uploadHelper.includes("storageUploadMetadata"),
  "uploadFileToStorage must apply storageUploadMetadata/cacheControl",
);

const uploadChat = read("src/lib/media/upload.ts");
assert(
  uploadChat.includes("storageUploadMetadata"),
  "upload.ts must apply storageUploadMetadata/cacheControl",
);

const cacheControl = read("src/lib/media/storageCacheControl.ts");
assert(
  cacheControl.includes("public,max-age=31536000,immutable"),
  "immutable cacheControl constant missing",
);

const indexStore = read("src/lib/stories/storiesIndexStore.ts");
assert(
  !/for \(const group of groups\) \{[\s\S]*?preloadStoryGroup\(group, 1\);/.test(indexStore),
  "stories index must not preload first media for every group",
);
assert(
  indexStore.includes("speculativeLimit"),
  "stories index must keep a bounded speculative preload limit",
);

const warm = read("src/lib/shuffle/warmImages.ts");
assert(warm.includes("warmedUrls"), "shuffle warm must session-dedupe URLs");
assert(warm.includes("Math.min(max, 16)"), "shuffle warm must cap per call");

const pool = read("src/hooks/useShufflePool.ts");
assert(
  pool.includes("warmShuffleImages(shownProfiles, 12") &&
    pool.includes("warmShuffleImages(profiles, 8"),
  "shuffle pool warm budgets must stay reduced",
);

const adaptive = read("src/lib/stories/adaptivePreloadPolicy.ts");
assert(
  /videoSpeculative:\s*false/.test(adaptive) &&
    !/upcomingUserFirstMedia:\s*2/.test(adaptive),
  "adaptive story preload must not enable aggressive videoSpeculative by default",
);

const buffers = read("src/components/stories/StoryMediaBuffers.tsx");
assert(
  buffers.includes('preload={backVisible ? "auto" : "metadata"}'),
  "story back buffer must use metadata preload while hidden",
);

const chat = read("src/components/chat/ProfileAnonChat.tsx");
assert(
  (chat.match(/enableRuntimeScan=\{false\}/g) || []).length >= 2,
  "chat media shells must disable runtime NSFW double-fetch",
);

const modernCard = read("src/components/modern/ModernShuffleCard.tsx");
assert(
  !/<img[\s\S]{0,120}profile\.photo[\s\S]{0,200}profile\.photo/.test(modernCard),
  "ModernShuffleCard must not render two img tags for the same photo",
);

const compress = read("src/lib/media/compressImageForUpload.ts");
assert(
  compress.includes("maxEdge") && compress.includes("toBlob"),
  "profile image compressor helper missing",
);

if (fails.length) {
  console.error("storage-egress-guards FAILED:");
  for (const fail of fails) console.error(` - ${fail}`);
  process.exit(1);
}

console.log(
  JSON.stringify(
    {
      ok: true,
      guards: [
        "upload_cache_control",
        "stories_index_bounded_preload",
        "shuffle_warm_budget",
        "adaptive_no_video_speculative",
        "story_back_metadata",
        "chat_no_runtime_scan_double_fetch",
        "modern_card_no_double_img",
        "profile_image_compressor",
      ],
    },
    null,
    2,
  ),
);
