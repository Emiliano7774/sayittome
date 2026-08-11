export function resolveStoryOwnerKeyFromState(input: {
  uid?: string | null;
  isAnonymous?: boolean;
  authReady: boolean;
  sessionId: string;
}) {
  const uid = String(input.uid || "").trim();
  if (uid && input.isAnonymous === false) return uid;
  if (!uid && !input.authReady) return "";
  return String(input.sessionId || "").trim();
}

export function canManageStory(
  story: {
    ownerUid?: string;
    anonSessionId?: string;
    isAnonymousStory?: boolean;
  },
  ownerKey: string,
) {
  const ownerUid = String(story.ownerUid || "");
  if (!ownerUid || !ownerKey) return false;

  if (story.isAnonymousStory || ownerUid.startsWith("anon_")) {
    const anonSessionId = String(story.anonSessionId || ownerUid);
    return ownerKey === anonSessionId;
  }

  return ownerKey === ownerUid;
}

export function isMineStoryGroup(
  group: {
    ownerUid: string;
    isAnonymousStory?: boolean;
    stories?: Array<{
      ownerUid?: string;
      anonSessionId?: string;
      isAnonymousStory?: boolean;
    }>;
  },
  ownerKey: string,
) {
  if (!ownerKey) return false;
  if (group.ownerUid === ownerKey) return true;
  const sample = group.stories?.[0];
  if (sample) return canManageStory(sample, ownerKey);
  return canManageStory(
    { ownerUid: group.ownerUid, isAnonymousStory: group.isAnonymousStory },
    ownerKey,
  );
}

export function splitMineStoryGroups<T extends {
  ownerUid: string;
  isAnonymousStory?: boolean;
  stories?: Array<{
    ownerUid?: string;
    anonSessionId?: string;
    isAnonymousStory?: boolean;
  }>;
}>(groups: T[], ownerKey: string) {
  if (!ownerKey) {
    return { mine: [] as T[], everyone: groups };
  }

  const mine = groups.filter((group) => isMineStoryGroup(group, ownerKey));
  const rest = groups.filter((group) => !isMineStoryGroup(group, ownerKey));
  return { mine, everyone: rest.length ? rest : groups };
}
