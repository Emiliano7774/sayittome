import { getStoryGroup } from "@/lib/stories/storiesIndexStore";

export function profileHasStory(ownerUid?: string, username?: string) {
  const group = getStoryGroup(ownerUid, username);
  return Boolean(group && group.stories.length > 0);
}
