export function profileChatCacheKey(input: {
  username: string;
  authUid?: string;
  anonSessionId?: string;
}) {
  const username = String(input.username || "").trim().toLowerCase();
  const authUid = String(input.authUid || "").trim();
  const anonSessionId = String(input.anonSessionId || "").trim();
  return `${username}|${authUid}|${anonSessionId}`;
}

export function profileChatCacheIdentity(authUid?: string, anonSessionId?: string) {
  return {
    authUid: String(authUid || "").trim(),
    anonSessionId: String(anonSessionId || "").trim(),
  };
}
