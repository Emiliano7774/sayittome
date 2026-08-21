/** Follow target is the profile document uid, never a visual/auth alias. */
export function resolveFollowButtonTargetUid(
  profile: { uid?: string } | string | null | undefined,
) {
  if (typeof profile === "string") return profile.trim();
  return String(profile?.uid || "").trim();
}

export function buildFollowId(myUid: string, targetUid: string) {
  return `${myUid}_${targetUid}`;
}
