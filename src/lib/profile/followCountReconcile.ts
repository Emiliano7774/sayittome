export type FollowEdge = { followerUid: string; targetUid: string };

export type StoredFollowCounts = {
  seguidoresCount: number;
  followersCount: number;
  siguiendoCount: number;
};

export type FollowCountPatch = {
  uid: string;
  seguidoresCount: number;
  followersCount: number;
  siguiendoCount: number;
};

function cleanId(value: unknown) {
  return String(value || "").trim();
}

/** Raises stored stats up to the real edges. Never lowers a count. */
export function planFollowCountPatches(input: {
  edges: FollowEdge[];
  profiles: Map<string, StoredFollowCounts>;
}): FollowCountPatch[] {
  const followersOf = new Map<string, Set<string>>();
  const followingOf = new Map<string, Set<string>>();

  for (const edge of input.edges) {
    const followerUid = cleanId(edge.followerUid);
    const targetUid = cleanId(edge.targetUid);
    if (!followerUid || !targetUid || followerUid === targetUid) continue;
    if (!followersOf.has(targetUid)) followersOf.set(targetUid, new Set());
    if (!followingOf.has(followerUid)) followingOf.set(followerUid, new Set());
    followersOf.get(targetUid)?.add(followerUid);
    followingOf.get(followerUid)?.add(targetUid);
  }

  const patches: FollowCountPatch[] = [];
  for (const [uid, current] of input.profiles) {
    const edgeFollowers = followersOf.get(uid)?.size || 0;
    const edgeFollowing = followingOf.get(uid)?.size || 0;
    const storedFollowers = Math.max(
      Number(current.seguidoresCount) || 0,
      Number(current.followersCount) || 0,
    );
    const storedFollowing = Number(current.siguiendoCount) || 0;
    const seguidoresCount = Math.max(storedFollowers, edgeFollowers);
    const siguiendoCount = Math.max(storedFollowing, edgeFollowing);
    if (
      Number(current.seguidoresCount) === seguidoresCount &&
      Number(current.followersCount) === seguidoresCount &&
      storedFollowing === siguiendoCount
    ) {
      continue;
    }
    patches.push({
      uid,
      seguidoresCount,
      followersCount: seguidoresCount,
      siguiendoCount,
    });
  }
  return patches;
}

export function edgeFromFollowPath(path: string, data: Record<string, unknown>): FollowEdge {
  const parts = String(path || "").split("/");
  if (parts[0] === "usuarios" && parts[2] === "seguidores" && parts[3]) {
    return { followerUid: parts[3], targetUid: parts[1] };
  }
  if (parts[0] === "usuarios" && parts[2] === "siguiendo" && parts[3]) {
    return { followerUid: parts[1], targetUid: parts[3] };
  }
  return {
    followerUid: cleanId(data.seguidorUid),
    targetUid: cleanId(data.seguidoUid),
  };
}
