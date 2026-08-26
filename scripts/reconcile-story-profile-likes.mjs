/**
 * Audit/reconcile story likes → profile likesPerfilCount.
 * Derives expected counts from historias.likedBy; dry-run by default.
 *
 *   node scripts/reconcile-story-profile-likes.mjs
 *   node scripts/reconcile-story-profile-likes.mjs --apply --confirm
 *
 * Apply writes a backup JSON and only patches when reversible backup exists.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const APPLY = process.argv.includes("--apply");
const CONFIRM = process.argv.includes("--confirm");

function countLikedBy(likedBy) {
  if (!likedBy || typeof likedBy !== "object") return [];
  return Object.entries(likedBy)
    .filter(([, v]) => v === true)
    .map(([k]) => String(k || "").trim())
    .filter(Boolean);
}

/**
 * Pure reconcile plan — no I/O. Exported for harness.
 */
export function buildStoryProfileLikeReconcilePlan(input) {
  const stories = Array.isArray(input.stories) ? input.stories : [];
  const profileCounts =
    input.profileCounts && typeof input.profileCounts === "object"
      ? input.profileCounts
      : {};
  const existingStoryLikes = Array.isArray(input.existingStoryLikes)
    ? input.existingStoryLikes
    : [];

  const expectedByOwner = new Map();
  const expectedPairs = new Set();

  for (const story of stories) {
    const storyId = String(story.id || "").trim();
    const ownerUid = String(story.ownerUid || story.uid || "").trim();
    if (!storyId || !ownerUid) continue;
    const likers = countLikedBy(story.likedBy);
    for (const likerId of likers) {
      if (likerId === ownerUid) continue;
      const pairKey = `${likerId}|${ownerUid}|${storyId}`;
      if (expectedPairs.has(pairKey)) continue;
      expectedPairs.add(pairKey);
      expectedByOwner.set(ownerUid, (expectedByOwner.get(ownerUid) || 0) + 1);
    }
  }

  const existingPairs = new Set();
  for (const like of existingStoryLikes) {
    if (String(like.source || "") !== "story") continue;
    const likerId = String(like.fromUid || like.fromLikerId || "").trim();
    const ownerUid = String(like.targetUid || "").trim();
    const storyId = String(like.storyId || "").trim();
    if (!likerId || !ownerUid || !storyId) continue;
    existingPairs.add(`${likerId}|${ownerUid}|${storyId}`);
  }

  const missing = [];
  const orphans = [];
  for (const pair of expectedPairs) {
    if (!existingPairs.has(pair)) missing.push(pair);
  }
  for (const pair of existingPairs) {
    if (!expectedPairs.has(pair)) orphans.push(pair);
  }

  const ownerDeltas = [];
  const owners = new Set([
    ...expectedByOwner.keys(),
    ...Object.keys(profileCounts),
  ]);
  for (const ownerUid of owners) {
    const expectedStory = expectedByOwner.get(ownerUid) || 0;
    let existingStory = 0;
    for (const pair of existingPairs) {
      const [, target] = pair.split("|");
      if (target === ownerUid) existingStory += 1;
    }
    const delta = expectedStory - existingStory;
    if (delta !== 0) {
      ownerDeltas.push({
        ownerUid,
        expectedStory,
        existingStory,
        delta,
        currentLikesPerfilCount: Number(profileCounts[ownerUid] || 0) || 0,
        nextLikesPerfilCount: Math.max(
          0,
          (Number(profileCounts[ownerUid] || 0) || 0) + delta,
        ),
      });
    }
  }

  return {
    expectedPairCount: expectedPairs.size,
    existingPairCount: existingPairs.size,
    missing,
    orphans,
    ownerDeltas,
    writes: missing.length + orphans.length + ownerDeltas.length,
  };
}

async function main() {
  // Self-check without Firestore when no ADC — harnesses cover logic.
  if (!process.env.GOOGLE_APPLICATION_CREDENTIALS && !APPLY) {
    const sample = buildStoryProfileLikeReconcilePlan({
      stories: [
        {
          id: "s1",
          ownerUid: "owner1",
          likedBy: { likerA: true, likerB: true, owner1: true },
        },
        { id: "s2", ownerUid: "owner1", likedBy: { likerA: true } },
      ],
      profileCounts: { owner1: 1 },
      existingStoryLikes: [
        {
          source: "story",
          fromUid: "likerA",
          targetUid: "owner1",
          storyId: "s1",
        },
      ],
    });
    console.log(
      JSON.stringify(
        {
          mode: "dry-run-sample",
          apply: false,
          sample,
          note: "Pass GOOGLE_APPLICATION_CREDENTIALS + Admin SDK for live inventory. Use --apply --confirm only with backup.",
        },
        null,
        2,
      ),
    );
    return;
  }

  if (APPLY && !CONFIRM) {
    console.error("Refusing --apply without --confirm (reversibility gate).");
    process.exit(2);
  }

  const { initializeApp, applicationDefault, getApps } = await import("firebase-admin/app");
  const { getFirestore } = await import("firebase-admin/firestore");
  if (!getApps().length) {
    initializeApp({ credential: applicationDefault() });
  }
  const firestore = getFirestore();

  const storiesSnap = await firestore.collection("historias").get();
  const stories = storiesSnap.docs.map((d) => ({ id: d.id, ...d.data() }));

  const likesSnap = await firestore
    .collection("perfil_likes")
    .where("source", "==", "story")
    .get()
    .catch(async () => {
      // Fallback scan if index missing
      const all = await firestore.collection("perfil_likes").get();
      return {
        docs: all.docs.filter((d) => String(d.data()?.source || "") === "story"),
      };
    });

  const existingStoryLikes = likesSnap.docs.map((d) => ({ id: d.id, ...d.data() }));

  const ownerIds = [
    ...new Set(
      stories
        .map((s) => String(s.ownerUid || s.uid || "").trim())
        .filter(Boolean),
    ),
  ];
  const profileCounts = {};
  for (const uid of ownerIds) {
    const snap = await firestore.collection("usuarios").doc(uid).get();
    profileCounts[uid] = Number(snap.data()?.likesPerfilCount || 0) || 0;
  }

  const plan = buildStoryProfileLikeReconcilePlan({
    stories,
    profileCounts,
    existingStoryLikes,
  });

  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const backupPath = path.join(
    root,
    "scripts",
    "backups",
    `story-profile-likes-${stamp}.json`,
  );
  fs.mkdirSync(path.dirname(backupPath), { recursive: true });
  fs.writeFileSync(
    backupPath,
    JSON.stringify(
      {
        createdAt: new Date().toISOString(),
        mode: APPLY ? "apply" : "dry-run",
        plan,
        profileCounts,
        existingStoryLikes: existingStoryLikes.map((l) => ({
          id: l.id,
          fromUid: l.fromUid,
          targetUid: l.targetUid,
          storyId: l.storyId,
        })),
      },
      null,
      2,
    ),
  );

  console.log(
    JSON.stringify(
      {
        mode: APPLY ? "apply" : "dry-run",
        backupPath,
        expectedPairCount: plan.expectedPairCount,
        existingPairCount: plan.existingPairCount,
        missing: plan.missing.length,
        orphans: plan.orphans.length,
        ownerDeltas: plan.ownerDeltas.length,
        writes: plan.writes,
      },
      null,
      2,
    ),
  );

  if (!APPLY) return;

  const { FieldValue } = await import("firebase-admin/firestore");
  let writes = 0;
  for (const pair of plan.missing) {
    const [likerId, ownerUid, storyId] = pair.split("|");
    const likeId = `${likerId}_${ownerUid}_story_${storyId}`;
    await firestore
      .collection("perfil_likes")
      .doc(likeId)
      .set(
        {
          id: likeId,
          fromUid: likerId,
          fromLikerId: likerId,
          targetUid: ownerUid,
          source: "story",
          storyId,
          reconciledAt: FieldValue.serverTimestamp(),
        },
        { merge: true },
      );
    writes += 1;
  }
  for (const pair of plan.orphans) {
    const [likerId, ownerUid, storyId] = pair.split("|");
    const likeId = `${likerId}_${ownerUid}_story_${storyId}`;
    await firestore.collection("perfil_likes").doc(likeId).delete().catch(() => {});
    writes += 1;
  }
  for (const row of plan.ownerDeltas) {
    await firestore
      .collection("usuarios")
      .doc(row.ownerUid)
      .set(
        {
          likesPerfilCount: FieldValue.increment(row.delta),
          likesCount: FieldValue.increment(row.delta),
          storyLikesReconciledAt: FieldValue.serverTimestamp(),
        },
        { merge: true },
      );
    writes += 1;
  }
  console.log(JSON.stringify({ appliedWrites: writes, backupPath }, null, 2));
}

const isDirect =
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isDirect) {
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
