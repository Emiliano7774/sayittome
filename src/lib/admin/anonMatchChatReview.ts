/** Pure mapping for the admin review of chats_anonimos. No I/O. */

export function firestoreTimeMs(value: unknown): number {
  if (typeof value === "number" && Number.isFinite(value)) {
    if (value <= 0) return 0;
    return value < 1e12 ? Math.round(value * 1000) : Math.round(value);
  }
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) return 0;
    const asNumber = Number(trimmed);
    if (Number.isFinite(asNumber) && asNumber > 0) {
      return asNumber < 1e12 ? Math.round(asNumber * 1000) : Math.round(asNumber);
    }
    const parsed = Date.parse(trimmed);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  if (value && typeof value === "object") {
    const row = value as { toMillis?: () => number; seconds?: number; _seconds?: number };
    if (typeof row.toMillis === "function") {
      try {
        const ms = Number(row.toMillis());
        return Number.isFinite(ms) && ms > 0 ? ms : 0;
      } catch {
        return 0;
      }
    }
    const seconds = Number(row.seconds ?? row._seconds);
    if (Number.isFinite(seconds) && seconds > 0) return Math.round(seconds * 1000);
  }
  return 0;
}

export function anonMatchMessageText(data: Record<string, unknown>): string {
  return String(data.texto || data.text || data.mensaje || data.message || "").trim();
}

export function anonMatchActivityMs(data: Record<string, unknown>): number {
  return firestoreTimeMs(data.updatedAt) || firestoreTimeMs(data.createdAt);
}

export function anonMatchInteractionId(
  sourceDocId: string,
  data: Record<string, unknown>,
) {
  for (const value of [data.chatId, data.directChatId, data.sessionId]) {
    const clean = String(value || "").trim();
    if (clean) return clean;
  }
  return String(sourceDocId || "").trim();
}

export type AdminAnonMatchChatRow = {
  id: string;
  sourceDocIds: string[];
  sourceCount: number;
  tipo: string;
  estado: string;
  solicitanteUid: string;
  destinatarioUid: string;
  solicitanteAnonId: string;
  destinatarioAnonId: string;
  ultimoMensaje: string;
  createdAtMs: number;
  updatedAtMs: number;
};

/** Collapse historical fragments that explicitly point to the same chat/session. */
export function collapseAnonMatchChatRows(rows: AdminAnonMatchChatRow[]) {
  const grouped = new Map<string, AdminAnonMatchChatRow>();
  for (const row of rows) {
    const id = String(row.id || "").trim();
    if (!id) continue;
    const previous = grouped.get(id);
    if (!previous) {
      grouped.set(id, {
        ...row,
        sourceDocIds: [...new Set(row.sourceDocIds.filter(Boolean))],
        sourceCount: Math.max(1, row.sourceCount || row.sourceDocIds.length),
      });
      continue;
    }

    const newest = row.updatedAtMs >= previous.updatedAtMs ? row : previous;
    const oldestCreated =
      [previous.createdAtMs, row.createdAtMs]
        .filter((value) => value > 0)
        .sort((a, b) => a - b)[0] || 0;
    const sourceDocIds = [...new Set([...previous.sourceDocIds, ...row.sourceDocIds])];
    grouped.set(id, {
      ...previous,
      ...newest,
      id,
      sourceDocIds,
      sourceCount: sourceDocIds.length,
      createdAtMs: oldestCreated,
      updatedAtMs: Math.max(previous.updatedAtMs, row.updatedAtMs),
      ultimoMensaje: newest.ultimoMensaje || previous.ultimoMensaje || row.ultimoMensaje,
    });
  }

  return [...grouped.values()].sort(
    (a, b) => b.updatedAtMs - a.updatedAtMs || a.id.localeCompare(b.id),
  );
}

export type AdminAnonMatchMessageRow = {
  id: string;
  collectionName: "mensajes" | "messages";
  text: string;
  senderId: string;
  senderTipo: string;
  type: string;
  createdAtMs: number;
};

/**
 * Modern anonymous-match chats write exclusively to `mensajes`. Some legacy
 * records used `messages`. Reading both at once can splice two historical
 * formats into one apparent conversation, so the canonical collection wins
 * and the legacy collection is only a fallback.
 */
export function selectAnonMatchMessageRows(input: {
  mensajes: AdminAnonMatchMessageRow[];
  messages: AdminAnonMatchMessageRow[];
}) {
  const selected = input.mensajes.length > 0 ? input.mensajes : input.messages;
  const byMessage = new Map<string, AdminAnonMatchMessageRow>();
  for (const row of selected) {
    const key = `${row.collectionName}:${row.id}`;
    if (!byMessage.has(key)) byMessage.set(key, row);
  }
  return [...byMessage.values()].sort(
    (a, b) => a.createdAtMs - b.createdAtMs || a.id.localeCompare(b.id),
  );
}
