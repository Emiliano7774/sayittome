import { NextResponse } from "next/server";

import { writeAdminLog } from "@/lib/admin/adminLogs";
import { assertAdminEmail, getAdminEmailFromRequest } from "@/lib/admin/isAdmin";
import { patchFirestoreDoc } from "@/lib/firestore/rest";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const adminEmail = getAdminEmailFromRequest(req, body);
    assertAdminEmail(adminEmail);

    const action = String(body?.action || "");
    const collection = String(body?.collection || "");
    const id = String(body?.id || "");

    if (!collection || !id) {
      return NextResponse.json({ ok: false, error: "missing target" }, { status: 400 });
    }

    if (action === "blur_story") {
      await patchFirestoreDoc(collection, id, { adminForceBlur: true });
    } else if (action === "unblur_story") {
      await patchFirestoreDoc(collection, id, {
        adminForceBlur: false,
        moderationRequiresBlur: false,
      });
    } else if (action === "delete_story") {
      await patchFirestoreDoc(collection, id, { adminDeleted: true, active: false });
    } else if (action === "blur_profile_photo") {
      await patchFirestoreDoc(collection, id, {
        adminBlurProfilePhoto: true,
        adminBlurFotosPerfil: true,
        adminBlurAt: new Date().toISOString(),
        adminBlurBy: adminEmail,
      });
    } else if (action === "unblur_profile_photo") {
      await patchFirestoreDoc(collection, id, {
        adminBlurProfilePhoto: false,
        adminBlurFotosPerfil: false,
      });
    } else {
      return NextResponse.json({ ok: false, error: "unknown action" }, { status: 400 });
    }

    await writeAdminLog({
      adminEmail,
      action: "moderate",
      targetId: id,
      metadata: { action, collection },
    });

    return NextResponse.json({ ok: true, ts: Date.now() });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : "unknown";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
