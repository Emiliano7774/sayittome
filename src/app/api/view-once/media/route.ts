import { NextRequest, NextResponse } from "next/server";

import {
  mapAdminAuthFailure,
  verifyFirebaseIdTokenAllowingAnonymous,
} from "@/lib/admin/verifyAdminRequest";
import {
  VIEW_ONCE_FIELD_DELETE,
  executeViewOnceMediaDelivery,
  type ViewOnceDeliverDb,
} from "@/lib/media/viewOnceMediaDeliver";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const PRIVATE_RESPONSE_HEADERS = {
  "Cache-Control": "private, no-store, max-age=0, must-revalidate",
  "CDN-Cache-Control": "no-store",
  "Surrogate-Control": "no-store",
  Pragma: "no-cache",
  Expires: "0",
};

function deniedResponse(body: Record<string, unknown>, status: number) {
  return NextResponse.json(body, {
    status,
    headers: PRIVATE_RESPONSE_HEADERS,
  });
}

async function getViewOnceDeliverDb(): Promise<{
  db: ViewOnceDeliverDb;
  fieldDelete: unknown;
}> {
  const { getRepairAdminDb } = await import("@/lib/chat/historicalAuthorshipRepairAdmin");
  const { loadFirebaseAdminFirestore } = await import("@/lib/admin/firebaseAdminNative");
  const { FieldValue } = loadFirebaseAdminFirestore();
  const adminDb = getRepairAdminDb();

  const db: ViewOnceDeliverDb = {
    collection(name: string) {
      return {
        doc(id: string) {
          const ref = adminDb.collection(name).doc(id);
          return { path: `${name}/${id}`, _ref: ref };
        },
      };
    },
    runTransaction(fn) {
      return adminDb.runTransaction(async (tx: {
        get: (ref: unknown) => Promise<{ exists: boolean; data: () => Record<string, unknown> | undefined }>;
        set: (ref: unknown, data: Record<string, unknown>, options?: { merge?: boolean }) => void;
        delete: (ref: unknown) => void;
      }) =>
        fn({
          get: async (deliverRef) => {
            const snap = await tx.get(deliverRef._ref);
            return {
              exists: snap.exists,
              data: () => snap.data() as Record<string, unknown> | undefined,
            };
          },
          set: (deliverRef, data, options) => {
            tx.set(deliverRef._ref, data, options);
          },
          delete: (deliverRef) => {
            tx.delete(deliverRef._ref);
          },
        }),
      );
    },
  };

  return { db, fieldDelete: FieldValue.delete() };
}

export async function POST(req: NextRequest) {
  let uid = "";
  try {
    const principal = await verifyFirebaseIdTokenAllowingAnonymous(req);
    uid = String(principal.uid || "").trim();
  } catch (error) {
    const mapped = mapAdminAuthFailure(error);
    return deniedResponse(
      { ok: false, error: mapped.error, status: "DENIED" },
      mapped.status,
    );
  }

  let body: { chatId?: string; messageId?: string; mediaUrl?: unknown } = {};
  try {
    body = (await req.json()) as { chatId?: string; messageId?: string; mediaUrl?: unknown };
  } catch {
    return deniedResponse({ ok: false, error: "invalid_json", status: "DENIED" }, 400);
  }

  let db: ViewOnceDeliverDb;
  let fieldDelete: unknown = VIEW_ONCE_FIELD_DELETE;
  try {
    const wired = await getViewOnceDeliverDb();
    db = wired.db;
    fieldDelete = wired.fieldDelete;
  } catch {
    return deniedResponse({ ok: false, error: "unavailable", status: "DENIED" }, 503);
  }

  const result = await executeViewOnceMediaDelivery({
    db,
    uid,
    body,
    fieldDelete,
    fetchMedia: async (url) => {
      const upstream = await fetch(url, { cache: "no-store", redirect: "error" });
      if (!upstream.ok) {
        return {
          ok: false,
          status: upstream.status,
          contentType: "",
          body: null,
        };
      }
      const bodyBytes = await upstream.arrayBuffer();
      return {
        ok: true,
        status: upstream.status,
        contentType: upstream.headers.get("content-type") || "application/octet-stream",
        body: bodyBytes,
      };
    },
  });

  if (!result.ok) {
    return deniedResponse(
      { ok: false, error: result.error, status: result.gate },
      result.status,
    );
  }

  const headers = new Headers();
  headers.set("Content-Type", result.contentType);
  headers.set("Content-Length", String(result.bytes.byteLength));
  headers.set("Cache-Control", "private, no-store, max-age=0, must-revalidate");
  headers.set("CDN-Cache-Control", "no-store");
  headers.set("Surrogate-Control", "no-store");
  headers.set("Pragma", "no-cache");
  headers.set("Expires", "0");
  headers.set("Content-Disposition", "inline");
  headers.set("X-Content-Type-Options", "nosniff");

  return new Response(result.bytes, { status: 200, headers });
}
