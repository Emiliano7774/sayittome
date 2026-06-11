import type { MessageKey } from "@/lib/i18n/getMessage";
import type { StoryMediaSource, StoryMediaType } from "@/lib/stories/types";

export function storyMediaSourceLabel(
  source: StoryMediaSource | undefined,
  mediaType: StoryMediaType,
  t: (key: MessageKey) => string,
) {
  if (!source || mediaType === "text") return null;

  if (source === "camera") {
    return mediaType === "video"
      ? t("story_media_camera_video")
      : t("story_media_camera_photo");
  }

  return mediaType === "video"
    ? t("story_media_gallery_video")
    : t("story_media_gallery_photo");
}
