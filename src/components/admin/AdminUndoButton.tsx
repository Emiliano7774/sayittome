"use client";

import { useAdminApi } from "@/components/admin/AdminShell";
import { useT } from "@/contexts/LocaleContext";

type Props = {
  uid: string;
  undoAction: string;
  className?: string;
  onDone?: () => void | Promise<void>;
};

export default function AdminUndoButton({
  uid,
  undoAction,
  className = "rounded-xl border border-sky-400/30 bg-sky-500/15 px-4 py-2 text-sm font-black text-sky-100",
  onDone,
}: Props) {
  const t = useT();
  const admin = useAdminApi();

  const labelKey =
    undoAction === "unban"
      ? "admin_undo_unban"
      : undoAction === "unblur_profile"
        ? "admin_undo_unblur"
        : undoAction === "clear_moderation_tag"
          ? "admin_undo_clear_roleplay_tag"
          : undoAction === "clear_fake_profile_tag"
            ? "admin_undo_clear_fake_profile_tag"
            : undoAction === "unmark_chat_suspicious"
              ? "admin_undo_unmark_suspicious"
              : "admin_undo_revert";

  async function runUndo() {
    if (!uid) return;

    const payload: Record<string, unknown> = {
      action: undoAction,
      uid,
    };

    if (undoAction === "shadowban") {
      payload.enabled = false;
    }

    const json = await admin.postAction(payload);
    if (!json?.ok) {
      alert(t("admin_undo_fail"));
      return;
    }

    await onDone?.();
  }

  return (
    <button type="button" onClick={() => void runUndo()} className={className}>
      {t(labelKey)}
    </button>
  );
}
