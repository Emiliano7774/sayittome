#!/usr/bin/env node
/**
 * Static guards for Storage egress mitigations + safe cache policy.
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
  uploadHelper.includes("storageUploadMetadata(contentType, path, cache)"),
  "uploadFileToStorage must apply path-aware cache metadata",
);

const uploadChat = read("src/lib/media/upload.ts");
assert(uploadChat.includes("storageUploadMetadata"), "upload.ts must apply cache metadata");
assert(uploadChat.includes("viewOnce"), "upload.ts must support viewOnce cache category");

const cacheControl = read("src/lib/media/storageCacheControl.ts");
assert(
  cacheControl.includes("public,max-age=31536000,immutable"),
  "profile immutable cacheControl constant missing",
);
assert(cacheControl.includes("private,no-store"), "private/no-store policy missing");
assert(cacheControl.includes("CHAT_CACHE_CONTROL"), "chat private cache policy missing");
assert(
  !/export function storageUploadMetadata\(\s*contentType: string\s*\)\s*\{[\s\S]*IMMUTABLE_STORAGE_CACHE_CONTROL/.test(
    cacheControl,
  ),
  "global public immutable helper must not remain",
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
  buffers.includes('preload={visible ? "auto" : "metadata"}'),
  "story back buffer must use metadata preload while hidden",
);

const chat = read("src/components/chat/ProfileAnonChat.tsx");
assert(
  chat.includes("enableRuntimeScan={!message.viewOnce}"),
  "chat must scan non-view-once media",
);
assert(
  chat.includes("{ viewOnce: previewViewOnce }"),
  "chat uploads must pass viewOnce into storage cache policy",
);

const avatar = read("src/components/chat/ChatPeerAvatar.tsx");
assert(avatar.includes("enablePhotoScan = true"), "avatar NSFW scan must remain on");

const detector = read("src/lib/moderation/nsfwDetector.ts");
assert(detector.includes("findLoadedMediaElement"), "NSFW must reuse DOM media");
assert(detector.includes("waitForDomMedia"), "NSFW must wait for rendered media");

const modernCard = read("src/components/modern/ModernShuffleCard.tsx");
assert(
  !/<img[\s\S]{0,120}profile\.photo[\s\S]{0,200}<img[\s\S]{0,80}profile\.photo/.test(modernCard),
  "ModernShuffleCard must not render two img tags for the same photo",
);

const compress = read("src/lib/media/compressImageForUpload.ts");
assert(
  compress.includes("maxEdge") &&
    compress.includes("toBlob") &&
    compress.includes("image/heic"),
  "profile image compressor helper incomplete",
);

const legacy = read("src/app/chat/[chatId]/legacy-chat.tsx");
assert(
  legacy.includes('cacheControl: "private,max-age=86400"'),
  "legacy chat must use private cache",
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
        "path_aware_cache_control",
        "private_chat_and_evidence",
        "stories_index_bounded_preload",
        "shuffle_warm_budget",
        "adaptive_no_video_speculative",
        "story_back_metadata",
        "nsfw_dom_reuse_enabled",
        "modern_card_no_double_img",
        "profile_image_compressor",
      ],
    },
    null,
    2,
  ),
);
