import { NextResponse } from "next/server";

import { ADMIN_EMAIL } from "@/lib/admin/isAdmin";

export const dynamic = "force-dynamic";

const API_KEY = process.env.FIREBASE_API_KEY || "AIzaSyBpQKCAwE-8Td3ZuaDqE3nvNwRGDGY8vdk";
const PROJECT_ID = "sayittome-app";

async function patchDoc(collection: string, id: string, fields: Record<string, unknown>) {
  const url = new URL(
    `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents/${collection}/${encodeURIComponent(id)}`,
  );
  url.searchParams.set("key", API_KEY);

  Object.keys(fields).forEach((key) => {
    url.searchParams.append("updateMask.fieldPaths", key);
  });

  const firestoreFields: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(fields)) {
    if (typeof value === "boolean") {
      firestoreFields[key] = { booleanValue: value };
    } else if (typeof value === "string") {
      firestoreFields[key] = { stringValue: value };
    }
  }

  const res = await fetch(url.toString(), {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ fields: firestoreFields }),
    cache: "no-store",
  });

  if (!res.ok) {
    throw new Error(`patch ${collection}/${id} ${res.status}`);
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const adminEmail = String(body?.adminEmail || "").trim().toLowerCase();

    if (adminEmail !== ADMIN_EMAIL) {
      return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
    }

    const action = String(body?.action || "");
    const collection = String(body?.collection || "");
    const id = String(body?.id || "");

    if (!collection || !id) {
      return NextResponse.json({ ok: false, error: "missing target" }, { status: 400 });
    }

    if (action === "blur_story") {
      await patchDoc(collection, id, { adminForceBlur: true });
    } else if (action === "unblur_story") {
      await patchDoc(collection, id, { adminForceBlur: false, moderationRequiresBlur: false });
    } else if (action === "delete_story") {
      await patchDoc(collection, id, { adminDeleted: true, active: false });
    } else if (action === "blur_profile_photo") {
      await patchDoc(collection, id, {
        adminBlurProfilePhoto: true,
        adminBlurFotosPerfil: true,
      });
    } else if (action === "unblur_profile_photo") {
      await patchDoc(collection, id, {
        adminBlurProfilePhoto: false,
        adminBlurFotosPerfil: false,
      });
    } else {
      return NextResponse.json({ ok: false, error: "unknown action" }, { status: 400 });
    }

    return NextResponse.json({ ok: true, ts: Date.now() });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : "unknown";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
