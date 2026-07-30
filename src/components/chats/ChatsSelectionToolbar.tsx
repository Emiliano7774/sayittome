"use client";

import { Check, Trash2, X } from "lucide-react";

import ChatsMarkAllSeenButton from "@/components/chats/ChatsMarkAllSeenButton";
import { useT } from "@/contexts/LocaleContext";
import type { InboxChat } from "@/hooks/useChatsInbox";

type Props = {
  variant: "classic" | "modern";
  selectionMode: boolean;
  selectedCount: number;
  allSelected: boolean;
  hasChats: boolean;
  deleting: boolean;
  confirmOpen: boolean;
  chats?: InboxChat[];
  uid?: string;
  onEnterSelection: () => void;
  onExitSelection: () => void;
  onToggleSelectAll: () => void;
  onRequestDelete: () => void;
  onConfirmDelete: () => void;
  onCancelConfirm: () => void;
};

export default function ChatsSelectionToolbar({
  variant,
  selectionMode,
  selectedCount,
  allSelected,
  hasChats,
  deleting,
  confirmOpen,
  chats = [],
  uid = "",
  onEnterSelection,
  onExitSelection,
  onToggleSelectAll,
  onRequestDelete,
  onConfirmDelete,
  onCancelConfirm,
}: Props) {
  const t = useT();
  const accent = variant === "modern" ? "text-violet-400" : "text-[#8C84FF]";
  const accentBg = variant === "modern" ? "bg-violet-600" : "bg-[#8C84FF]";

  return (
    <>
      <div
        className={
          variant === "modern"
            ? "mb-4 flex items-center justify-between gap-3"
            : "flex items-center justify-between gap-3 border-b border-white/10 px-4 py-3"
        }
      >
        {selectionMode ? (
          <>
            <button
              type="button"
              onClick={onExitSelection}
              className="rounded-full p-2 text-white/60 transition hover:bg-white/5"
              aria-label={t("common_cancel")}
            >
              <X size={22} />
            </button>

            <p className="min-w-0 flex-1 truncate text-center text-sm font-black text-white/75">
              {t("chats_selected_count", { count: String(selectedCount) })}
            </p>

            <button
              type="button"
              onClick={onToggleSelectAll}
              disabled={!hasChats}
              className={`shrink-0 text-xs font-black ${accent}`}
            >
              {allSelected ? t("chats_deselect_all") : t("chats_select_all")}
            </button>

            <button
              type="button"
              onClick={onRequestDelete}
              disabled={selectedCount === 0 || deleting}
              className="rounded-full p-2 text-red-400 transition hover:bg-red-500/10 disabled:opacity-40"
              aria-label={t("chats_delete_selected")}
            >
              <Trash2 size={20} />
            </button>
          </>
        ) : (
          <>
            <p
              className={
                variant === "modern"
                  ? "text-2xl font-black tracking-[-0.04em] text-white"
                  : "text-lg font-black text-white"
              }
            >
              {t("chats_title")}
            </p>

            <div className="flex shrink-0 flex-wrap items-center justify-end gap-1.5">
              <ChatsMarkAllSeenButton
                chats={chats}
                uid={uid}
                className={`rounded-full px-3 py-2 text-xs font-black ${accent} disabled:opacity-35`}
              />
              <button
                type="button"
                onClick={onEnterSelection}
                disabled={!hasChats}
                className={`rounded-full px-3 py-2 text-xs font-black ${accent} disabled:opacity-35`}
              >
                {t("chats_select")}
              </button>
            </div>
          </>
        )}
      </div>

      {confirmOpen ? (
        <div className="fixed inset-0 z-[130] flex items-center justify-center bg-black/75 px-5">
          <div className="w-full max-w-md rounded-[24px] border border-white/10 bg-[#101010] p-6 shadow-2xl">
            <h2 className="text-xl font-black text-white">{t("chats_delete_confirm_title")}</h2>
            <p className="mt-3 text-sm leading-relaxed text-white/55">
              {t("chats_delete_confirm_body")}
            </p>

            <div className="mt-6 flex gap-3">
              <button
                type="button"
                onClick={onCancelConfirm}
                disabled={deleting}
                className="flex-1 rounded-full border border-white/10 px-4 py-3 text-sm font-black text-white/70"
              >
                {t("common_cancel")}
              </button>
              <button
                type="button"
                onClick={onConfirmDelete}
                disabled={deleting}
                className={`flex-1 rounded-full px-4 py-3 text-sm font-black text-white ${accentBg} disabled:opacity-50`}
              >
                {deleting ? t("common_loading") : t("chats_delete")}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}

export function ChatSelectionCheckbox({
  checked,
  variant,
}: {
  checked: boolean;
  variant: "classic" | "modern";
}) {
  const activeClass =
    variant === "modern"
      ? "border-violet-500 bg-violet-600 text-white"
      : "border-[#8C84FF] bg-[#8C84FF] text-white";

  return (
    <span
      className={[
        "flex h-6 w-6 shrink-0 items-center justify-center rounded-md border",
        checked ? activeClass : "border-white/20 bg-transparent text-transparent",
      ].join(" ")}
    >
      {checked ? <Check size={15} strokeWidth={3} /> : null}
    </span>
  );
}
