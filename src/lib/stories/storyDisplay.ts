import type { MessageKey } from "@/lib/i18n/getMessage";
import type { StoryItem, StoryUserGroup } from "@/lib/stories/types";
import { isInvalidPublicStoryUsername } from "@/lib/stories/storyAuthor";

type Translator = (key: MessageKey, values?: Record<string, string>) => string;

export function isAnonymousStory(
  item: Pick<StoryItem, "isAnonymousStory" | "ownerUid"> | Pick<StoryUserGroup, "isAnonymousStory" | "ownerUid">,
) {
  return item.isAnonymousStory === true || String(item.ownerUid || "").startsWith("anon_");
}

export function latestStoryInGroup(group: StoryUserGroup) {
  if (group.stories.length === 0) return null;
  return group.stories[group.stories.length - 1];
}

export function storyDisplayName(
  item: Pick<StoryItem, "ownerUsername" | "isAnonymousStory" | "ownerUid">,
  t: Translator,
) {
  if (isAnonymousStory(item)) {
    return t("stories_anonymous_uploader");
  }

  const username = String(item.ownerUsername || "").trim();
  if (!username || isInvalidPublicStoryUsername(username)) {
    return t("stories_title");
  }

  return username;
}
