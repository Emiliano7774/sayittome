import type { AnonDirectChatState } from "@/lib/anonMatch/types";

/** Shared shell shape published by AnonMatchContext for GENERAL inbox bridge. */
export type AnonDirectInboxShell = {
  chatId: string;
  role: "perfil" | "anonimo";
  estado: AnonDirectChatState;
  tipo?: string;
  ultimoMensaje?: string;
  lastMessage?: string;
  lastMessageSender?: string;
  latestMessageId?: string;
  lastMessageAtMs?: number;
  updatedAtMs?: number;
  solicitanteAuthUid?: string;
  destinatarioAuthUid?: string;
  solicitanteAnonId?: string;
  anonId?: string;
  readBy?: Record<string, boolean>;
  latestReadMessageIds?: Record<string, string>;
  unreadCounts?: Record<string, number>;
};

function millisFrom(value: unknown): number {
  if (!value) return 0;
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof (value as { toMillis?: () => number }).toMillis === "function") {
    try {
      return Number((value as { toMillis: () => number }).toMillis()) || 0;
    } catch {
      return 0;
    }
  }
  if (typeof value === "string") {
    const parsed = Date.parse(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
}

function stringMap(raw: unknown): Record<string, string> | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    const k = String(key || "").trim();
    const v = String(value || "").trim();
    if (k && v) out[k] = v;
  }
  return Object.keys(out).length ? out : undefined;
}

function boolMap(raw: unknown): Record<string, boolean> | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  const out: Record<string, boolean> = {};
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    const k = String(key || "").trim();
    if (k && value === true) out[k] = true;
  }
  return Object.keys(out).length ? out : undefined;
}

function numberMap(raw: unknown): Record<string, number> | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  const out: Record<string, number> = {};
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    const k = String(key || "").trim();
    const n = Number(value);
    if (k && Number.isFinite(n)) out[k] = n;
  }
  return Object.keys(out).length ? out : undefined;
}

export function parseAnonDirectInboxShell(
  chatId: string,
  data: Record<string, unknown>,
  role: "perfil" | "anonimo",
): AnonDirectInboxShell {
  const estadoRaw = String(data.estado || "activo");
  const estado: AnonDirectChatState =
    estadoRaw === "cerrado" || estadoRaw === "denunciado" ? estadoRaw : "activo";

  const ultimoMensaje = String(data.ultimoMensaje || data.lastMessage || "").trim();
  const lastMessageAtMs =
    millisFrom(data.lastMessageAt) || millisFrom(data.updatedAt) || 0;

  return {
    chatId,
    role,
    estado,
    tipo: String(data.tipo || "").trim() || undefined,
    ultimoMensaje: ultimoMensaje || undefined,
    lastMessage: ultimoMensaje || undefined,
    lastMessageSender: String(data.lastMessageSender || "").trim() || undefined,
    latestMessageId: String(data.latestMessageId || "").trim() || undefined,
    lastMessageAtMs: lastMessageAtMs || undefined,
    updatedAtMs: millisFrom(data.updatedAt) || lastMessageAtMs || undefined,
    solicitanteAuthUid: String(data.solicitanteAuthUid || "").trim() || undefined,
    destinatarioAuthUid: String(data.destinatarioAuthUid || "").trim() || undefined,
    solicitanteAnonId: String(data.solicitanteAnonId || "").trim() || undefined,
    anonId: String(data.anonId || "").trim() || undefined,
    readBy: boolMap(data.readBy),
    latestReadMessageIds: stringMap(data.latestReadMessageIds),
    unreadCounts: numberMap(data.unreadCounts),
  };
}

export function resolveAnonDirectViewerRole(
  shell: Pick<AnonDirectInboxShell, "solicitanteAuthUid" | "destinatarioAuthUid" | "role">,
  viewerAuthUid: string,
): "perfil" | "anonimo" {
  const uid = String(viewerAuthUid || "").trim();
  if (uid && shell.solicitanteAuthUid === uid) {
    return shell.role === "perfil" ? "perfil" : "anonimo";
  }
  if (uid && shell.destinatarioAuthUid === uid) {
    return shell.role === "perfil" ? "perfil" : "anonimo";
  }
  return shell.role;
}
