import { NextResponse } from "next/server";

import { verifyFirebaseIdToken } from "@/lib/admin/verifyAdminRequest";
import {
  getFirestoreDoc,
  patchFirestoreDoc,
  runFilteredCollectionQueryAll,
} from "@/lib/firestore/rest";

export const dynamic = "force-dynamic";

function errorResponse(error: unknown) {
  const status = Number((error as { status?: number })?.status || 500);
  const message = error instanceof Error ? error.message : "unknown";
  return NextResponse.json({ ok: false, error: message }, { status });
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

export async function GET(req: Request) {
  try {
    const verified = await verifyFirebaseIdToken(req);
    const rows = await runFilteredCollectionQueryAll(
      "reclamos_perfil_rol",
      "uid",
      verified.uid,
    );

    const claims = rows
      .map((row) => ({
        id: String(row.id || ""),
        message: String(row.mensaje || ""),
        status: String(row.estado || "pendiente"),
        createdAt: String(row.createdAt || row._firestoreCreateTime || ""),
        adminReply: String(row.adminReply || ""),
        adminRepliedAt: String(row.adminRepliedAt || ""),
      }))
      .sort((left, right) => dateMs(right.createdAt) - dateMs(left.createdAt))
      .slice(0, 100);

    return NextResponse.json({ ok: true, claims });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function PATCH(req: Request) {
  try {
    const verified = await verifyFirebaseIdToken(req);
    const profile = await getFirestoreDoc("usuarios", verified.uid);
    if (!profile) {
      return NextResponse.json({ ok: false, error: "profile_not_found" }, { status: 404 });
    }

    const repliedAt = String(profile.lastAdminClaimReplyAt || "");
    if (repliedAt) {
      await patchFirestoreDoc("usuarios", verified.uid, {
        lastAdminClaimReplyDismissedAt: repliedAt,
        lastAdminClaimReplyRead: true,
      });
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    return errorResponse(error);
  }
}
