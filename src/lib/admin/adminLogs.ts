import { createFirestoreDoc } from "@/lib/firestore/rest";

export type AdminLogAction =
  | "ban_temp"
  | "ban_perm"
  | "unban"
  | "blur_profile"
  | "unblur_profile"
  | "blur_story"
  | "unblur_story"
  | "delete_story"
  | "delete_message"
  | "delete_chat"
  | "reset_username"
  | "reset_bio"
  | "tag_roleplay"
  | "clear_moderation_tag"
  | "shadowban"
  | "abuse_block_remove"
  | "abuse_block_extend"
  | "moderate"
  | "other";

export async function writeAdminLog(input: {
  adminEmail: string;
  action: AdminLogAction | string;
  targetUid?: string;
  targetId?: string;
  metadata?: Record<string, unknown>;
}) {
  const id = `log_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

  await createFirestoreDoc(
    "admin_logs",
    {
      timestamp: new Date().toISOString(),
      adminEmail: input.adminEmail,
      targetUid: input.targetUid || "",
      targetId: input.targetId || "",
      accion: input.action,
      action: input.action,
      metadata: JSON.stringify(input.metadata || {}),
    },
    id,
  );
}
