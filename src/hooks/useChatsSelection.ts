"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import { hardDeleteChats } from "@/lib/chat/deleteChats";
import type { InboxChat } from "@/hooks/useChatsInbox";

export function useChatsSelection(chats: InboxChat[]) {
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const visibleIds = useMemo(() => chats.map((chat) => chat.id), [chats]);

  const allSelected =
    visibleIds.length > 0 && visibleIds.every((id) => selectedIds.has(id));

  const enterSelectionMode = useCallback(() => {
    setSelectionMode(true);
    setSelectedIds(new Set());
  }, []);

  const exitSelectionMode = useCallback(() => {
    setSelectionMode(false);
    setSelectedIds(new Set());
    setConfirmOpen(false);
  }, []);

  const toggleSelectAll = useCallback(() => {
    if (visibleIds.length === 0) return;

    setSelectedIds((prev) => {
      if (visibleIds.every((id) => prev.has(id))) {
        setSelectionMode(false);
        return new Set();
      }
      return new Set(visibleIds);
    });
    setSelectionMode(true);
  }, [visibleIds]);

  const toggleChat = useCallback((chatId: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(chatId)) next.delete(chatId);
      else next.add(chatId);
      return next;
    });
    setSelectionMode(true);
  }, []);

  const requestDeleteSelected = useCallback(() => {
    if (selectedIds.size === 0) return;
    setConfirmOpen(true);
  }, [selectedIds.size]);

  useEffect(() => {
    document.body.classList.toggle(
      "sayittome-chats-selection-open",
      selectionMode || confirmOpen,
    );

    return () => {
      document.body.classList.remove("sayittome-chats-selection-open");
    };
  }, [confirmOpen, selectionMode]);

  useEffect(() => {
    const onBack = () => {
      if (confirmOpen) {
        setConfirmOpen(false);
        return;
      }
      if (selectionMode) {
        exitSelectionMode();
      }
    };

    window.addEventListener("sayittome:exit-chats-selection", onBack);
    return () => window.removeEventListener("sayittome:exit-chats-selection", onBack);
  }, [confirmOpen, exitSelectionMode, selectionMode]);

  const confirmDeleteSelected = useCallback(async () => {
    if (selectedIds.size === 0 || deleting) return;

    setDeleting(true);
    try {
      await hardDeleteChats([...selectedIds]);
      exitSelectionMode();
    } catch (error) {
      console.error(error);
      throw error;
    } finally {
      setDeleting(false);
      setConfirmOpen(false);
    }
  }, [deleting, exitSelectionMode, selectedIds]);

  return {
    selectionMode,
    selectedIds,
    selectedCount: selectedIds.size,
    allSelected,
    confirmOpen,
    deleting,
    setConfirmOpen,
    enterSelectionMode,
    exitSelectionMode,
    toggleSelectAll,
    toggleChat,
    requestDeleteSelected,
    confirmDeleteSelected,
  };
}
