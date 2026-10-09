import type { InboxChat } from "@/hooks/useChatsInbox";
import type { AnonDirectInboxShell } from "@/lib/anonMatch/anonDirectInboxShell";
import { resolveAnonDirectViewerRole } from "@/lib/anonMatch/anonDirectInboxShell";

export const ANON_DIRECT_INBOX_KIND = "anon_direct" as const;

export type AnonDirectInboxChat = InboxChat & {
  inboxKind: typeof ANON_DIRECT_INBOX_KIND;
  sourceCollection: "chats_anonimos";
  anonDirectRole: "perfil" | "anonimo";
};

export function isAnonDirectInboxChat(
  chat: Pick<InboxChat, "inboxKind" | "sourceCollection"> | null | undefined,
): chat is AnonDirectInboxChat {
  return (
    chat?.inboxKind === ANON_DIRECT_INBOX_KIND ||
    chat?.sourceCollection === "chats_anonimos"
  );
}

/** Pure map: Context shell → GENERAL inbox row (never writes into `chats`). */
export function bridgeAnonDirectShellToInboxChat(
  shell: AnonDirectInboxShell,
  viewerAuthUid: string,
): AnonDirectInboxChat | null {
  const chatId = String(shell.chatId || "").trim();
  if (!chatId) return null;
  if (shell.estado !== "activo") return null;

  // A per-participant soft hide lasts only until a new message arrives.
  // Never delete the shared conversation or suppress the other party.
  const latestMarker = shell.latestMessageId
    ? `m:${shell.latestMessageId}`
    : shell.lastMessageAtMs
      ? `t:${shell.lastMessageAtMs}`
      : "__empty__";
  if (viewerAuthUid && shell.hiddenAtMessageByUid?.[viewerAuthUid] === latestMarker) {
    return null;
  }

  const role = resolveAnonDirectViewerRole(shell, viewerAuthUid);
  const preview = String(shell.lastMessage || shell.ultimoMensaje || "").trim();
  const atMs = shell.lastMessageAtMs || shell.updatedAtMs || 0;

  return {
    id: chatId,
    canonicalChatId: chatId,
    inboxKind: ANON_DIRECT_INBOX_KIND,
    sourceCollection: "chats_anonimos",
    anonDirectRole: role,
    lastMessage: preview || undefined,
    lastMessageSender: shell.lastMessageSender,
    latestMessageId: shell.latestMessageId,
    latestReadMessageIds: shell.latestReadMessageIds,
    readBy: shell.readBy,
    unreadCounts: shell.unreadCounts,
    lastMessageAt: atMs ? { toMillis: () => atMs } : undefined,
    updatedAt: atMs ? { toMillis: () => atMs } : undefined,
    // Display-only peer label — never profile-anon continuity / getChatAnonSenderId.
    otherUsername: "Anónimo",
    receptorUsername: "Anónimo",
  };
}

export function bridgeAnonDirectShellsToInboxChats(
  shells: AnonDirectInboxShell[],
  viewerAuthUid: string,
): AnonDirectInboxChat[] {
  const rows: AnonDirectInboxChat[] = [];
  for (const shell of shells) {
    const row = bridgeAnonDirectShellToInboxChat(shell, viewerAuthUid);
    if (row) rows.push(row);
  }
  return rows;
}

/** Merge profile `chats` rows with anon-direct bridge rows; sort by last activity. */
export function mergeInboxWithAnonDirectBridge(
  profileRows: InboxChat[],
  anonDirectRows: InboxChat[],
): InboxChat[] {
  const byId = new Map<string, InboxChat>();
  for (const row of profileRows) {
    if (isAnonDirectInboxChat(row)) continue;
    const id = row.canonicalChatId || row.id;
    if (id) byId.set(id, row);
  }
  for (const row of anonDirectRows) {
    if (!isAnonDirectInboxChat(row)) continue;
    const id = row.canonicalChatId || row.id;
    if (id) byId.set(id, row);
  }

  const activityMs = (chat: InboxChat) =>
    Number(chat.lastMessageAt?.toMillis?.() || chat.updatedAt?.toMillis?.() || 0) || 0;

  return [...byId.values()].sort((a, b) => activityMs(b) - activityMs(a));
}

/** Guard: anon-direct rows must open via openDirectChat, never /chat/{id}. */
export function anonDirectInboxOpenHref(_chatId: string) {
  return null as string | null;
}
