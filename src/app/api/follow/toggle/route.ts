import { NextResponse } from "next/server";

import { loadFirebaseAdminFirestore } from "@/lib/admin/firebaseAdminNative";
import { verifyFirebaseIdToken } from "@/lib/admin/verifyAdminRequest";
import { getRepairAdminDb } from "@/lib/chat/historicalAuthorshipRepairAdmin";
import { nextSocialCount } from "@/lib/profile/followToggleCore";
import { invalidatePublicProfileRouteCache } from "@/lib/profile/publicProfileRouteCache";

export const dynamic = "force-dynamic";

function reply(body: unknown, status = 200) {
  return NextResponse.json(body, {
    status,
    headers: { "Cache-Control": "private, no-store, max-age=0, must-revalidate" },
  });
}

function exactUid(value: unknown) {
  const uid = String(value || "").trim();
  if (!uid || uid.length > 128 || uid.includes("/") || uid.includes("\\")) return "";
  return uid;
}

export async function POST(req: Request) {
  let actor;
  try {
    actor = await verifyFirebaseIdToken(req);
  } catch (error) {
    const status = Number((error as { status?: number })?.status || 401);
    return reply({ ok: false, error: status === 403 ? "forbidden" : "unauthorized" }, status);
  }
  let body: { targetUid?: unknown; following?: unknown };
  try {
    body = (await req.json()) as { targetUid?: unknown; following?: unknown };
  } catch {
    return reply({ ok: false, error: "invalid_json" }, 400);
  }

  const targetUid = exactUid(body.targetUid);
  if (!targetUid) return reply({ ok: false, error: "invalid_target" }, 400);
  if (targetUid === actor.uid) return reply({ ok: false, error: "cannot_follow_self" }, 400);

  try {
    const db = getRepairAdminDb();
    const { FieldValue } = loadFirebaseAdminFirestore();
    const result = await db.runTransaction(async (tx: {
      get: (ref: unknown) => Promise<{ exists: boolean; data: () => Record<string, unknown> }>;
      set: (ref: unknown, data: Record<string, unknown>, options?: { merge?: boolean }) => void;
      delete: (ref: unknown) => void;
    }) => {
      const actorRef = db.collection("usuarios").doc(actor.uid);
      const targetRef = db.collection("usuarios").doc(targetUid);
      const followId = `${actor.uid}_${targetUid}`;
      const followRef = db.collection("seguidores").doc(followId);
      const followerRef = targetRef.collection("seguidores").doc(actor.uid);
      const followingRef = actorRef.collection("siguiendo").doc(targetUid);
      const [actorSnap, targetSnap, followSnap] = await Promise.all([
        tx.get(actorRef),
        tx.get(targetRef),
        tx.get(followRef),
      ]);
      if (!actorSnap.exists || !targetSnap.exists) {
        throw Object.assign(new Error("profile_not_found"), { status: 404 });
      }

      const current = followSnap.exists;
      const desired =
        typeof body.following === "boolean" ? body.following : !current;
      const now = FieldValue.serverTimestamp();
      const payload = {
        id: followId,
        seguidorUid: actor.uid,
        seguidoUid: targetUid,
        updatedAt: now,
      };

      if (desired) {
        tx.set(followRef, { ...payload, createdAt: now }, { merge: true });
        tx.set(followerRef, { ...payload, createdAt: now }, { merge: true });
        tx.set(followingRef, { ...payload, createdAt: now }, { merge: true });
      } else {
        tx.delete(followRef);
        tx.delete(followerRef);
        tx.delete(followingRef);
      }
      if (desired !== current) {
        const actorData = actorSnap.data() || {};
        const targetData = targetSnap.data() || {};
        const delta = desired ? 1 : -1;
        const nextFollowing = nextSocialCount(actorData.siguiendoCount, delta);
        const nextFollowers = nextSocialCount(targetData.seguidoresCount, delta);
        tx.set(actorRef, { siguiendoCount: nextFollowing, updatedAt: now }, { merge: true });
        tx.set(
          targetRef,
          {
            seguidoresCount: nextFollowers,
            followersCount: nextFollowers,
            updatedAt: now,
          },
          { merge: true },
        );
        return {
          following: desired,
          siguiendoCount: nextFollowing,
          seguidoresCount: nextFollowers,
          username: String(targetData.username || targetData.usernameLower || "").trim(),
        };
      }

      return {
        following: desired,
        siguiendoCount: Number((actorSnap.data() || {}).siguiendoCount || 0),
        seguidoresCount: Number((targetSnap.data() || {}).seguidoresCount || 0),
        username: String((targetSnap.data() || {}).username || (targetSnap.data() || {}).usernameLower || "").trim(),
      };
    });

    if (result.username) invalidatePublicProfileRouteCache(result.username);
    return reply({ ok: true, ...result });
  } catch (error) {
    const code = String((error as Error)?.message || "");
    const status = Number((error as { status?: number })?.status || 0);
    console.error("follow_toggle", code || "follow_failed");
    if (code === "profile_not_found" || status === 404) {
      return reply({ ok: false, error: "profile_not_found" }, 404);
    }
    return reply({ ok: false, error: "follow_failed" }, 500);
  }
}
