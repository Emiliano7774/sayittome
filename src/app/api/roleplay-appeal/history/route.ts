import { NextResponse } from "next/server";

import { readBearerToken, verifyFirebaseIdToken } from "@/lib/admin/verifyAdminRequest";
import {
  getFirestoreDoc,
  patchFirestoreDocAuthed,
} from "@/lib/firestore/rest";

export const dynamic = "force-dynamic";

type ClaimRow = Record<string, unknown> & { id: string };

function errorResponse(error: unknown) {
  const status = Number((error as { status?: number })?.status || 500);
  const message = error instanceof Error ? error.message : "unknown";
  return NextResponse.json(
    { ok: false, error: message },
    {
      status,
      headers: {
        "Cache-Control": "private, no-store, max-age=0, must-revalidate",
        "CDN-Cache-Control": "no-store",
      },
    },
  );
}

function dateMs(value: unknown) {
  if (typeof value === "number") {
    return value > 1_000_000_000_000 ? value : value * 1000;
  }
  if (typeof value === "string") {
    const parsed = Date.parse(value);
    return Number.isNaN(parsed) ? 0 : parsed;
  }
  return 0;
}

function dateIso(value: unknown) {
  if (typeof value === "string") return value;
  if (typeof value === "number") {
    const ms = value > 1_000_000_000_000 ? value : value * 1000;
    return Number.isFinite(ms) ? new Date(ms).toISOString() : "";
  }
  if (value && typeof value === "object") {
    const timestamp = value as {
      toDate?: () => Date;
      seconds?: number;
      _seconds?: number;
    };
    if (typeof timestamp.toDate === "function") {
      const date = timestamp.toDate();
      return Number.isNaN(date.getTime()) ? "" : date.toISOString();
    }
    const seconds = Number(timestamp.seconds ?? timestamp._seconds ?? 0);
    if (seconds > 0) return new Date(seconds * 1000).toISOString();
  }
  return "";
}

function privateJson(body: Record<string, unknown>, status = 200) {
  return NextResponse.json(body, {
    status,
    headers: {
      "Cache-Control": "private, no-store, max-age=0, must-revalidate",
      "CDN-Cache-Control": "no-store",
    },
  });
}

export async function GET(req: Request) {
  try {
    const verified = await verifyFirebaseIdToken(req);
    // The token establishes whose private history may be returned. Read with
    // the server Admin SDK afterwards: the previous unauthenticated REST
    // runQuery was correctly denied by Firestore rules in production.
    const { getRepairAdminDb } = await import(
      "@/lib/chat/historicalAuthorshipRepairAdmin"
    );
    const snapshot = await getRepairAdminDb()
      .collection("reclamos_perfil_rol")
      .where("uid", "==", verified.uid)
      .limit(200)
      .get();
    const rows: ClaimRow[] = snapshot.docs.map(
      (doc: { id: string; data: () => Record<string, unknown> }): ClaimRow => ({
        id: doc.id,
        ...doc.data(),
      }),
    );

    const claims = rows
      .map((row) => ({
        id: String(row.id || ""),
        message: String(row.mensaje || ""),
        status: String(row.estado || "pendiente"),
        createdAt: dateIso(row.createdAt || row._firestoreCreateTime),
        adminReply: String(row.adminReply || ""),
        adminRepliedAt: dateIso(row.adminRepliedAt),
      }))
      .sort((left, right) => dateMs(right.createdAt) - dateMs(left.createdAt))
      .slice(0, 100);

    return privateJson({ ok: true, claims });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function PATCH(req: Request) {
  try {
    const verified = await verifyFirebaseIdToken(req);
    const idToken = readBearerToken(req);
    const profile = await getFirestoreDoc("usuarios", verified.uid);
    if (!profile) {
      return NextResponse.json({ ok: false, error: "profile_not_found" }, { status: 404 });
    }

    const repliedAt = String(profile.lastAdminClaimReplyAt || "");
    if (repliedAt) {
      await patchFirestoreDocAuthed(idToken, "usuarios", verified.uid, {
        lastAdminClaimReplyDismissedAt: repliedAt,
        lastAdminClaimReplyRead: true,
      });
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    return errorResponse(error);
  }
}
