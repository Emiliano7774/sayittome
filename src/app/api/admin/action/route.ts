import { NextResponse } from "next/server";

import { writeAdminLog } from "@/lib/admin/adminLogs";
import { assertAdminEmail, getAdminEmailFromRequest } from "@/lib/admin/isAdmin";
import {
  createFirestoreDoc,
  deleteFirestoreDoc,
  patchFirestoreDoc,
  runCollectionQuery,
} from "@/lib/firestore/rest";
import { deleteOrphanProfile } from "@/lib/profile/cleanupOrphans";

export const dynamic = "force-dynamic";

async function disableUserStories(uid: string, adminEmail: string) {
  const stories = await runCollectionQuery("historias", 500);
  let count = 0;

  for (const story of stories) {
    const owner = String(story.ownerUid || story.uid || "");
    if (owner !== uid) continue;

    await patchFirestoreDoc("historias", String(story.id), {
      active: false,
      adminDisabled: true,
      adminDeleted: true,
    });
    count += 1;
  }

  await writeAdminLog({
    adminEmail,
    action: "delete_story",
    targetUid: uid,
    metadata: { bulk: true, count },
  });
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const adminEmail = getAdminEmailFromRequest(req, body);
    assertAdminEmail(adminEmail);

    const action = String(body?.action || "");
    const uid = String(body?.uid || "");
    const chatId = String(body?.chatId || "");
    const messageId = String(body?.messageId || "");
    const storyId = String(body?.storyId || "");
    const blockId = String(body?.blockId || "");
    const extraMinutes = Number(body?.extraMinutes || 30);

    if (action === "ban_temp") {
      const until = new Date(Date.now() + (Number(body?.days || 7) * 86400000)).toISOString();
      await patchFirestoreDoc("usuarios", uid, {
        banned: true,
        suspendido: true,
        banUntil: until,
        bannedAt: new Date().toISOString(),
        bannedBy: adminEmail,
      });
    } else if (action === "ban_perm") {
      await patchFirestoreDoc("usuarios", uid, {
        banned: true,
        suspendido: true,
        banPermanent: true,
        bannedAt: new Date().toISOString(),
        bannedBy: adminEmail,
      });
    } else if (action === "unban") {
      await patchFirestoreDoc("usuarios", uid, {
        banned: false,
        suspendido: false,
        banPermanent: false,
        banUntil: "",
      });
    } else if (action === "blur_profile") {
      await patchFirestoreDoc("usuarios", uid, {
        adminBlurProfilePhoto: true,
        adminBlurFotosPerfil: true,
        adminBlurGallery: true,
        adminBlurReason: String(body?.reason || "moderacion"),
        adminBlurAt: new Date().toISOString(),
        adminBlurBy: adminEmail,
      });
    } else if (action === "unblur_profile") {
      await patchFirestoreDoc("usuarios", uid, {
        adminBlurProfilePhoto: false,
        adminBlurFotosPerfil: false,
        adminBlurGallery: false,
        adminBlurStories: false,
        adminBlurReason: "",
      });
    } else if (action === "blur_stories_flag") {
      await patchFirestoreDoc("usuarios", uid, {
        adminBlurStories: true,
        adminBlurReason: String(body?.reason || "moderacion"),
        adminBlurAt: new Date().toISOString(),
        adminBlurBy: adminEmail,
      });
    } else if (action === "delete_user_stories") {
      await disableUserStories(uid, adminEmail);
    } else if (action === "reset_username") {
      await patchFirestoreDoc("usuarios", uid, {
        username: String(body?.username || "usuario"),
        usernameLower: String(body?.username || "usuario").toLowerCase(),
      });
    } else if (action === "reset_bio") {
      await patchFirestoreDoc("usuarios", uid, { bio: "", descripcion: "" });
    } else if (action === "shadowban") {
      await patchFirestoreDoc("usuarios", uid, {
        shadowban: body?.enabled !== false,
      });
    } else if (action === "toggle_abuse_protection") {
      await patchFirestoreDoc("usuarios", uid, {
        abuseProtectionEnabled: body?.enabled !== false,
      });
    } else if (action === "blur_story" && storyId) {
      await patchFirestoreDoc("historias", storyId, {
        adminForceBlur: true,
        moderationRequiresBlur: true,
      });
    } else if (action === "unblur_story" && storyId) {
      await patchFirestoreDoc("historias", storyId, {
        adminForceBlur: false,
        moderationRequiresBlur: false,
      });
    } else if (action === "delete_story" && storyId) {
      await patchFirestoreDoc("historias", storyId, {
        adminDeleted: true,
        active: false,
      });
    } else if (action === "delete_chat" && chatId) {
      await patchFirestoreDoc("chats", chatId, {
        archived: true,
        adminDeleted: true,
        active: false,
      });
    } else if (action === "delete_message" && chatId && messageId) {
      await patchFirestoreDoc(`chats/${chatId}/mensajes`, messageId, {
        deleted: true,
        texto: "[mensaje eliminado por admin]",
        text: "[mensaje eliminado por admin]",
      });
    } else if (action === "mark_chat_suspicious" && chatId) {
      await patchFirestoreDoc("chats", chatId, {
        suspicious: true,
        suspiciousAt: new Date().toISOString(),
        suspiciousBy: adminEmail,
      });
    } else if (action === "remove_abuse_block" && blockId) {
      await deleteFirestoreDoc("anon_abuse_blocks", blockId);
    } else if (action === "extend_abuse_block" && blockId) {
      await patchFirestoreDoc("anon_abuse_blocks", blockId, {
        expiresAt: new Date(Date.now() + extraMinutes * 60 * 1000).toISOString(),
      });
    } else if (action === "create_abuse_block") {
      await createFirestoreDoc("anon_abuse_blocks", {
        receptorUid: String(body?.receptorUid || ""),
        blockedFingerprint: String(body?.blockedFingerprint || ""),
        blockedAnonId: String(body?.blockedAnonId || ""),
        blockedVisitorId: String(body?.blockedVisitorId || ""),
        motivo: String(body?.motivo || "admin"),
        createdAt: new Date().toISOString(),
        expiresAt: new Date(Date.now() + extraMinutes * 60 * 1000).toISOString(),
        chatId: chatId || "",
        blockedBy: adminEmail,
      });
    } else if (action === "delete_orphan_user" && uid) {
      await deleteOrphanProfile(uid, adminEmail);
    } else if (action === "cleanup_orphan_profiles") {
      const { cleanupOrphanProfiles } = await import("@/lib/profile/cleanupOrphans");
      const result = await cleanupOrphanProfiles(adminEmail, {
        dryRun: body?.dryRun === true,
      });
      return NextResponse.json({ ok: true, ...result });
    } else {
      return NextResponse.json({ ok: false, error: "unknown action" }, { status: 400 });
    }

    await writeAdminLog({
      adminEmail,
      action,
      targetUid: uid,
      targetId: storyId || chatId || messageId || blockId,
      metadata: body,
    });

    return NextResponse.json({ ok: true, ts: Date.now() });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : "unknown";
    const status = message === "forbidden" ? 403 : 500;
    return NextResponse.json({ ok: false, error: message }, { status });
  }
}
