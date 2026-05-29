export type ProfileAnonSenderKind = "anon" | "profile";

export function profileReplyAuthorId(targetUid: string) {
  const uid = String(targetUid || "").trim();
  return uid ? `profile_${uid}` : "profile_unknown";
}

export function isProfileReplyAuthorId(from: string) {
  return String(from || "").startsWith("profile_");
}

export function resolveProfileAnonSenderKind(input: {
  senderKind?: string;
  from: string;
  threadAnonId: string;
  profileUid: string;
}): ProfileAnonSenderKind {
  const { senderKind, from, threadAnonId, profileUid } = input;

  if (senderKind === "profile" || senderKind === "anon") {
    return senderKind;
  }

  if (profileUid && (from === profileUid || from === profileReplyAuthorId(profileUid))) {
    return "profile";
  }

  if (isProfileReplyAuthorId(from)) {
    return "profile";
  }

  if (from === threadAnonId || from.startsWith("anon_")) {
    return "anon";
  }

  if (profileUid && from && from !== threadAnonId) {
    return "profile";
  }

  return "anon";
}

export function resolveProfileAnonMessageMine(input: {
  senderKind?: string;
  from: string;
  threadAnonId: string;
  profileUid: string;
  isOwnerViewing: boolean;
  ownerUid?: string;
}) {
  const kind = resolveProfileAnonSenderKind({
    senderKind: input.senderKind,
    from: input.from,
    threadAnonId: input.threadAnonId,
    profileUid: input.profileUid,
  });

  if (input.isOwnerViewing) {
    return kind === "profile";
  }

  return kind === "anon";
}
