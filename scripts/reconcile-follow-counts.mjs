/**
 * Raise profile follow stats up to the real follow edges.
 * Never lowers a count. Dry-run unless --apply --confirm.
 *
 *   node scripts/reconcile-follow-counts.mjs
 *   node scripts/reconcile-follow-counts.mjs --apply --confirm
 */

const APPLY = process.argv.includes("--apply");
const CONFIRM = process.argv.includes("--confirm");

function cleanId(value) {
  return String(value || "").trim();
}

export function planFollowCountPatches(input) {
  const edges = Array.isArray(input.edges) ? input.edges : [];
  const profiles = input.profiles instanceof Map ? input.profiles : new Map();
  const followersOf = new Map();
  const followingOf = new Map();

  for (const edge of edges) {
    const followerUid = cleanId(edge.followerUid);
    const targetUid = cleanId(edge.targetUid);
    if (!followerUid || !targetUid || followerUid === targetUid) continue;
    if (!followersOf.has(targetUid)) followersOf.set(targetUid, new Set());
    if (!followingOf.has(followerUid)) followingOf.set(followerUid, new Set());
    followersOf.get(targetUid).add(followerUid);
    followingOf.get(followerUid).add(targetUid);
  }

  const patches = [];
  for (const [uid, current] of profiles) {
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

function edgeFromDoc(path, data) {
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

async function readEdges(db) {
  const edges = [];
  const seen = new Set();
  const add = (edge) => {
    const followerUid = cleanId(edge.followerUid);
    const targetUid = cleanId(edge.targetUid);
    if (!followerUid || !targetUid || followerUid === targetUid) return;
    const key = `${followerUid}\n${targetUid}`;
    if (seen.has(key)) return;
    seen.add(key);
    edges.push({ followerUid, targetUid });
  };

  const top = await db.collection("seguidores").get();
  for (const doc of top.docs) add(edgeFromDoc(doc.ref.path, doc.data() || {}));

  for (const group of ["seguidores", "siguiendo"]) {
    try {
      const snap = await db.collectionGroup(group).get();
      for (const doc of snap.docs) add(edgeFromDoc(doc.ref.path, doc.data() || {}));
    } catch (error) {
      console.error(`follow_count_group_${group}`, error?.message || error);
    }
  }
  return edges;
}

async function main() {
  if (process.argv[1] && !process.argv[1].endsWith("reconcile-follow-counts.mjs")) return;
  if (APPLY && !CONFIRM) {
    console.error("Refusing --apply without --confirm.");
    process.exit(2);
  }

  const { initializeApp, applicationDefault, getApps } = await import("firebase-admin/app");
  const { getFirestore } = await import("firebase-admin/firestore");
  if (!getApps().length) {
    initializeApp({
      credential: applicationDefault(),
      projectId: "sayittome-app",
    });
  }
  const db = getFirestore();

  const edges = await readEdges(db);
  const profiles = new Map();
  const users = await db.collection("usuarios").select("seguidoresCount", "followersCount", "siguiendoCount").get();
  for (const doc of users.docs) {
    const data = doc.data() || {};
    profiles.set(doc.id, {
      seguidoresCount: Number(data.seguidoresCount) || 0,
      followersCount: Number(data.followersCount) || 0,
      siguiendoCount: Number(data.siguiendoCount) || 0,
    });
  }

  const patches = planFollowCountPatches({ edges, profiles });
  console.log(JSON.stringify({
    edges: edges.length,
    profiles: profiles.size,
    patches: patches.length,
    sample: patches.slice(0, 12),
    apply: APPLY,
  }, null, 2));

  if (!APPLY) return;

  let written = 0;
  for (let index = 0; index < patches.length; index += 400) {
    const batch = db.batch();
    for (const patch of patches.slice(index, index + 400)) {
      batch.set(
        db.collection("usuarios").doc(patch.uid),
        {
          seguidoresCount: patch.seguidoresCount,
          followersCount: patch.followersCount,
          siguiendoCount: patch.siguiendoCount,
        },
        { merge: true },
      );
    }
    await batch.commit();
    written += Math.min(400, patches.length - index);
    console.log(`follow_counts_written ${written}/${patches.length}`);
  }
}

if (process.argv[1] && process.argv[1].endsWith("reconcile-follow-counts.mjs")) {
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
