import { NextResponse } from "next/server";

import { verifyAdminIdToken } from "@/lib/admin/verifyAdminRequest";
import { getRepairAdminDb } from "@/lib/chat/historicalAuthorshipRepairAdmin";
import {
  edgeFromFollowPath,
  planFollowCountPatches,
  type FollowEdge,
  type StoredFollowCounts,
} from "@/lib/profile/followCountReconcile";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

function reply(body: unknown, status = 200) {
  return NextResponse.json(body, {
    status,
    headers: { "Cache-Control": "private, no-store, max-age=0, must-revalidate" },
  });
}

export async function POST(req: Request) {
  try {
    await verifyAdminIdToken(req);
  } catch (error) {
    const status = Number((error as { status?: number })?.status || 401);
    return reply({ ok: false, error: status === 403 ? "forbidden" : "unauthorized" }, status);
  }

  try {
    const db = getRepairAdminDb();
    const edges: FollowEdge[] = [];
    const seen = new Set<string>();
    const add = (edge: FollowEdge) => {
      const followerUid = String(edge.followerUid || "").trim();
      const targetUid = String(edge.targetUid || "").trim();
      if (!followerUid || !targetUid || followerUid === targetUid) return;
      const key = `${followerUid}\n${targetUid}`;
      if (seen.has(key)) return;
      seen.add(key);
      edges.push({ followerUid, targetUid });
    };

    const top = await db.collection("seguidores").get();
    for (const doc of top.docs) {
      add(edgeFromFollowPath(doc.ref.path, (doc.data() || {}) as Record<string, unknown>));
    }
    for (const group of ["seguidores", "siguiendo"] as const) {
      try {
        const snap = await db.collectionGroup(group).get();
        for (const doc of snap.docs) {
          add(edgeFromFollowPath(doc.ref.path, (doc.data() || {}) as Record<string, unknown>));
        }
      } catch (error) {
        console.error(`follow_count_group_${group}`, error);
      }
    }

    const profiles = new Map<string, StoredFollowCounts>();
    const users = await db
      .collection("usuarios")
      .select("seguidoresCount", "followersCount", "siguiendoCount")
      .get();
    for (const doc of users.docs) {
      const data = (doc.data() || {}) as Record<string, unknown>;
      profiles.set(doc.id, {
        seguidoresCount: Number(data.seguidoresCount) || 0,
        followersCount: Number(data.followersCount) || 0,
        siguiendoCount: Number(data.siguiendoCount) || 0,
      });
    }

    const patches = planFollowCountPatches({ edges, profiles });
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
    }

    return reply({
      ok: true,
      edges: edges.length,
      profiles: profiles.size,
      patches: patches.length,
      written,
    });
  } catch (error) {
    console.error("reconcile_follow_counts", error);
    return reply({ ok: false, error: "reconcile_failed" }, 500);
  }
}
