import {
  addAnonMatchAdminDoc,
  createAnonMatchAdminDoc,
  getAnonMatchAdminDoc,
  listAnonMatchAdminDocs,
  listAnonMatchMessageExcerpt,
  setAnonMatchAdminDoc,
} from "@/lib/anonMatch/anonMatchAdminStore";
import {
  buildAnonMatchRequestId,
  buildDirectChatSessionId,
  resolveDirectChatTipo,
  resolveTipoSolicitud,
} from "@/lib/anonMatch/chatId";
import {
  countAvailableMatchTargets,
  invalidateAnonMatchAvailabilityCache,
  pickAvailableMatchTarget,
  type MatchCandidate,
} from "@/lib/anonMatch/matchPool";
import { lookupAnonMatchAliasBinding } from "@/lib/anonMatch/anonMatchAliasAdmin";
import {
  ANON_MATCH_REQUEST_MS,
  type AnonMatchRequestState,
} from "@/lib/anonMatch/types";

function resolveDestinatario(row: Record<string, unknown>) {
  const destinatarioTipo = String(
    row.destinatarioTipo || (row.destinatarioUid ? "perfil" : row.anonId ? "anonimo" : ""),
  );
  const destinatarioUid = String(row.destinatarioUid || "");
  const destinatarioAnonId = String(row.anonId || "");

  return { destinatarioTipo, destinatarioUid, destinatarioAnonId };
}

async function resolveDestinatarioAuthUid(input: {
  destinatarioTipo: string;
  destinatarioUid: string;
  destinatarioAnonId: string;
  existing?: string;
}): Promise<string> {
  const existing = String(input.existing || "").trim();
  if (existing) return existing;
  if (input.destinatarioTipo === "perfil" && input.destinatarioUid) {
    return input.destinatarioUid;
  }
  if (input.destinatarioAnonId) {
    return (await lookupAnonMatchAliasBinding(input.destinatarioAnonId)) || "";
  }
  return "";
}

export { countAvailableMatchTargets as countAvailableAnons, countAvailableMatchTargets, pickAvailableMatchTarget as pickAvailableAnon, pickAvailableMatchTarget };

export async function createAnonMatchRequest(input: {
  solicitanteUid?: string;
  solicitanteAnonId?: string;
  /** Firebase Auth uid of the caller (anonymous or registered). Required for client listeners. */
  solicitanteAuthUid?: string;
  localAnonId?: string;
  excludeAnonIds?: string[];
  excludeUids?: string[];
  recentTargetIds?: string[];
  /** Where the searcher is — decides whose "quiénes pueden verme" accepts them. */
  pais?: string;
  provincia?: string;
  /** A quiénes quiero ver. Empty = anyone. */
  verPaises?: string[];
  verProvincias?: string[];
  idioma?: string;
}) {
  const solicitanteUid = String(input.solicitanteUid || "").trim();
  const solicitanteAnonId = String(input.solicitanteAnonId || "").trim();
  const solicitanteAuthUid = String(
    input.solicitanteAuthUid || solicitanteUid || "",
  ).trim();
  const solicitanteKey = solicitanteUid || solicitanteAnonId;

  if (!solicitanteKey) {
    return { ok: false as const, reason: "missing_solicitant" as const };
  }

  const now = Date.now();
  const excludeAnonIds = new Set(input.excludeAnonIds || []);
  const excludeUids = new Set(input.excludeUids || []);
  const localAnonId = String(input.localAnonId || "").trim();
  if (solicitanteAnonId) excludeAnonIds.add(solicitanteAnonId);
  if (localAnonId) excludeAnonIds.add(localAnonId);
  if (solicitanteUid) excludeUids.add(solicitanteUid);

  const picked = await pickAvailableMatchTarget({
    excludeAnonIds: Array.from(excludeAnonIds),
    excludeUids: Array.from(excludeUids),
    recentTargetIds: input.recentTargetIds,
    verPaises: input.verPaises,
    verProvincias: input.verProvincias,
    viewerPais: input.pais,
    viewerProvincia: input.provincia,
    idioma: input.idioma,
    now,
  });

  if (!picked) {
    return { ok: false as const, reason: "no_anon_available" as const };
  }

  if (!isValidTargetPick(picked, solicitanteUid, solicitanteAnonId, localAnonId, excludeAnonIds, excludeUids)) {
    return { ok: false as const, reason: "no_anon_available" as const };
  }

  const destinatarioTipo = picked.tipo;
  const destinatarioUid = picked.tipo === "perfil" ? picked.id : "";
  const destinatarioAnonId = picked.tipo === "anonimo" ? picked.id : "";
  const destinatarioAuthUid = await resolveDestinatarioAuthUid({
    destinatarioTipo,
    destinatarioUid,
    destinatarioAnonId,
  });
  const tipoSolicitud = resolveTipoSolicitud({
    solicitanteUid,
    solicitanteAnonId,
    destinatarioTipo,
  });
  const targetKey = picked.id;
  const solicitudId = buildAnonMatchRequestId(solicitanteKey, targetKey);
  const createdAt = new Date(now).toISOString();
  const expiresAt = new Date(now + ANON_MATCH_REQUEST_MS).toISOString();

  const created = await createAnonMatchAdminDoc("solicitudes_chat_anonimo", solicitudId, {
    solicitudId,
    solicitanteUid,
    solicitanteAnonId,
    solicitanteAuthUid,
    tipoSolicitud,
    destinatarioTipo,
    destinatarioUid,
    destinatarioAuthUid,
    anonId: destinatarioAnonId,
    estado: "pendiente",
    createdAt,
    updatedAt: createdAt,
    expiresAt,
    chatId: "",
    pais: input.pais || picked.pais || "",
    provincia: input.provincia || picked.provincia || "",
    idioma: input.idioma || picked.idioma || "es",
  });
  if (!created.created) {
    return { ok: false as const, reason: "request_already_exists" as const };
  }
  invalidateAnonMatchAvailabilityCache();

  return {
    ok: true as const,
    solicitudId,
    anonId: destinatarioAnonId,
    destinatarioUid,
    destinatarioTipo,
    expiresAt,
  };
}

function isValidTargetPick(
  picked: MatchCandidate,
  solicitanteUid: string,
  solicitanteAnonId: string,
  localAnonId: string,
  excludeAnonIds: Set<string>,
  excludeUids: Set<string>,
) {
  if (picked.tipo === "perfil") {
    if (!picked.id || excludeUids.has(picked.id) || picked.id === solicitanteUid) return false;
    return true;
  }

  if (
    !picked.id ||
    excludeAnonIds.has(picked.id) ||
    picked.id === solicitanteAnonId ||
    picked.id === localAnonId
  ) {
    return false;
  }

  return true;
}

function parseDate(value?: string | null) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

type AnonMatchRequestLookupHook = (
  solicitudId: string,
) => Promise<Record<string, unknown> | null> | Record<string, unknown> | null;

let testGetAnonMatchRequestHook: AnonMatchRequestLookupHook | null = null;

/** Integration harness only - inject solicitud rows without production Firestore REST. */
export function setAnonMatchTestGetRequestHook(hook: AnonMatchRequestLookupHook | null) {
  if (process.env.ANON_MATCH_INTEGRATION_TEST !== "1") return;
  testGetAnonMatchRequestHook = hook;
}

export async function getAnonMatchRequest(solicitudId: string) {
  if (process.env.ANON_MATCH_INTEGRATION_TEST === "1" && testGetAnonMatchRequestHook) {
    return testGetAnonMatchRequestHook(solicitudId);
  }
  return getAnonMatchAdminDoc("solicitudes_chat_anonimo", solicitudId);
}

export type IncomingAnonMatchRequestRow = {
  solicitudId: string;
  solicitanteUid: string;
  solicitanteAnonId: string;
  destinatarioTipo: "perfil" | "anonimo";
  expiresAt: string;
};

/**
 * Server-side incoming solicitudes for the authenticated caller.
 * Used by the client poller so match alerts do not depend on Firestore list rules
 * (legacy clients queried by anonId and always got permission-denied under privacy rules).
 */
export async function listIncomingAnonMatchRequests(input: {
  callerAuthUid: string;
  callerIsAnonymous: boolean;
  callerAnonId?: string;
}): Promise<IncomingAnonMatchRequestRow[]> {
  const authUid = String(input.callerAuthUid || "").trim();
  if (!authUid) return [];

  const callerAnonId = String(input.callerAnonId || "").trim();
  const now = Date.now();
  const rows: Record<string, unknown>[] = [];

  if (input.callerIsAnonymous) {
    const byAuth = await listAnonMatchAdminDocs("solicitudes_chat_anonimo", {
      limit: 25,
      where: { field: "destinatarioAuthUid", value: authUid },
    });
    rows.push(...byAuth);
    if (callerAnonId) {
      const byAnon = await listAnonMatchAdminDocs("solicitudes_chat_anonimo", {
        limit: 25,
        where: { field: "anonId", value: callerAnonId },
      });
      rows.push(...byAnon);
    }
  } else {
    const byUid = await listAnonMatchAdminDocs("solicitudes_chat_anonimo", {
      limit: 25,
      where: { field: "destinatarioUid", value: authUid },
    });
    rows.push(...byUid);
  }

  const seen = new Set<string>();
  const out: IncomingAnonMatchRequestRow[] = [];

  for (const row of rows) {
    const solicitudId = String(row.solicitudId || row.id || "").trim();
    if (!solicitudId || seen.has(solicitudId)) continue;
    seen.add(solicitudId);

    let estado = String(row.estado || "");
    if (estado === "pendiente") {
      estado = await expireAnonMatchRequestIfNeeded(row);
    }
    if (estado !== "pendiente") continue;

    const expiresAt = String(row.expiresAt || "");
    const expiresDate = parseDate(expiresAt);
    if (expiresDate && expiresDate.getTime() <= now) continue;

    const destinatarioTipo =
      String(row.destinatarioTipo || "") === "perfil" ? "perfil" : "anonimo";
    const solicitanteUid = String(row.solicitanteUid || "");
    const solicitanteAnonId = String(row.solicitanteAnonId || "");

    if (input.callerIsAnonymous) {
      if (destinatarioTipo === "perfil") continue;
      const destAuth = String(row.destinatarioAuthUid || "");
      const targetAnon = String(row.anonId || "");
      if (destAuth !== authUid && targetAnon !== callerAnonId) continue;
      if (callerAnonId && solicitanteAnonId === callerAnonId) continue;
    } else {
      if (String(row.destinatarioUid || "") !== authUid) continue;
      if (solicitanteUid && solicitanteUid === authUid) continue;
    }

    out.push({
      solicitudId,
      solicitanteUid,
      solicitanteAnonId,
      destinatarioTipo,
      expiresAt,
    });
  }

  return out.sort((a, b) => a.expiresAt.localeCompare(b.expiresAt));
}

async function getAnonDirectChat(chatId: string) {
  return getAnonMatchAdminDoc("chats_anonimos", chatId);
}

/** Vuelve a habilitar anonimos en el match - sin bloqueo permanente. */
async function releaseDirectChatParticipants(
  chat: Record<string, unknown>,
  now = new Date().toISOString(),
) {
  const ids = Array.from(
    new Set(
      [String(chat.anonId || ""), String(chat.solicitanteAnonId || "")].filter(Boolean),
    ),
  );

  await Promise.all(
    ids.map((anonId) =>
      setAnonMatchAdminDoc("anonimos_activos", anonId, {
        enChat: false,
        disponibleParaChat: true,
        chatActualId: "",
        updatedAt: now,
      }),
    ),
  );
}

function participantFingerprint(input: {
  solicitanteUid?: string;
  solicitanteAnonId?: string;
  destinatarioUid?: string;
  destinatarioAnonId?: string;
}) {
  const uids = [String(input.solicitanteUid || ""), String(input.destinatarioUid || "")]
    .filter(Boolean)
    .sort();
  const anons = [
    String(input.solicitanteAnonId || ""),
    String(input.destinatarioAnonId || ""),
  ]
    .filter(Boolean)
    .sort();

  return `${uids.join("|")}::${anons.join("|")}`;
}

function chatParticipantFingerprint(chat: Record<string, unknown>) {
  return participantFingerprint({
    solicitanteUid: String(chat.solicitanteUid || ""),
    solicitanteAnonId: String(chat.solicitanteAnonId || ""),
    destinatarioUid: String(chat.destinatarioUid || ""),
    destinatarioAnonId: String(chat.anonId || ""),
  });
}

async function closeActiveChatsForParticipantPair(
  participants: {
    solicitanteUid?: string;
    solicitanteAnonId?: string;
    destinatarioUid?: string;
    destinatarioAnonId?: string;
  },
  closedBy: string,
) {
  const target = participantFingerprint(participants);
  const rows = await listAnonMatchAdminDocs("chats_anonimos", { limit: 500, where: { field: "estado", value: "activo" } });
  const now = new Date().toISOString();

  for (const row of rows) {
    if (String(row.estado || "") !== "activo") continue;
    if (chatParticipantFingerprint(row) !== target) continue;

    const chatId = String(row.chatId || row.id || "");
    if (!chatId) continue;

    await setAnonMatchAdminDoc("chats_anonimos", chatId, {
      estado: "cerrado",
      cerradoPor: closedBy,
      cerradoAt: now,
      updatedAt: now,
    });
    await releaseDirectChatParticipants(row, now);
  }
}

export function userIsChatParticipant(
  chat: Record<string, unknown>,
  uid: string,
  anonId: string,
) {
  if (uid) {
    if (String(chat.solicitanteUid || "") === uid) return true;
    if (String(chat.destinatarioUid || "") === uid) return true;
  }
  if (anonId) {
    if (String(chat.anonId || "") === anonId) return true;
    if (String(chat.solicitanteAnonId || "") === anonId) return true;
  }
  return false;
}

export function anonMatchRequestInvolvesParticipant(
  row: Record<string, unknown>,
  uid: string,
  anonId: string,
) {
  if (uid) {
    if (String(row.solicitanteUid || "") === uid) return true;
    if (String(row.destinatarioUid || "") === uid) return true;
  }
  if (anonId) {
    if (String(row.solicitanteAnonId || "") === anonId) return true;
    if (String(row.anonId || "") === anonId) return true;
  }
  return false;
}

async function hasActiveDirectChatForParticipant(uid: string, anonId: string) {
  if (!uid && !anonId) return false;
  const rows = await listAnonMatchAdminDocs("chats_anonimos", { limit: 500, where: { field: "estado", value: "activo" } });
  return rows.some(
    (row) =>
      String(row.estado || "") === "activo" &&
      userIsChatParticipant(row, uid, anonId),
  );
}

async function cancelCompetingAnonMatchRequests(input: {
  exceptSolicitudId: string;
  participantUids: string[];
  participantAnonIds: string[];
  now: string;
}) {
  const rows = await listAnonMatchAdminDocs("solicitudes_chat_anonimo", {
    limit: 500,
    where: { field: "estado", value: "pendiente" },
  });

  for (const row of rows) {
    const solicitudId = String(row.solicitudId || row.id || "");
    if (!solicitudId || solicitudId === input.exceptSolicitudId) continue;
    if (String(row.estado || "") !== "pendiente") continue;
    const involvesAcceptedParticipant =
      input.participantUids.some((uid) =>
        anonMatchRequestInvolvesParticipant(row, uid, ""),
      ) ||
      input.participantAnonIds.some((anonId) =>
        anonMatchRequestInvolvesParticipant(row, "", anonId),
      );
    if (!involvesAcceptedParticipant) continue;

    await setAnonMatchAdminDoc("solicitudes_chat_anonimo", solicitudId, {
      estado: "cancelado",
      updatedAt: input.now,
    });
  }
  invalidateAnonMatchAvailabilityCache();
}

export async function expireAnonMatchRequestIfNeeded(row: Record<string, unknown>) {
  const estado = String(row.estado || "");
  if (estado !== "pendiente") return estado as AnonMatchRequestState;

  const expiresAt = parseDate(String(row.expiresAt || ""));
  if (!expiresAt || expiresAt.getTime() > Date.now()) return "pendiente";

  const solicitudId = String(row.solicitudId || row.id || "");
  if (!solicitudId) return "expirado";

  await setAnonMatchAdminDoc("solicitudes_chat_anonimo", solicitudId, {
    estado: "expirado",
    updatedAt: new Date().toISOString(),
  });
  invalidateAnonMatchAvailabilityCache();

  return "expirado";
}

/** Solicitante cancels their own pending request (e.g. retarget to a newly entered peer). */
export async function cancelAnonMatchRequest(solicitudId: string) {
  const id = String(solicitudId || "").trim();
  if (!id) return { ok: false as const, reason: "missing_solicitud" as const };

  const row = await getAnonMatchRequest(id);
  if (!row) return { ok: false as const, reason: "not_found" as const };

  const estado = await expireAnonMatchRequestIfNeeded(row);
  if (estado !== "pendiente") {
    return {
      ok: false as const,
      reason: estado === "expirado" ? ("expired" as const) : ("not_pending" as const),
      estado,
    };
  }

  const now = new Date().toISOString();
  await setAnonMatchAdminDoc("solicitudes_chat_anonimo", id, {
    estado: "cancelado",
    updatedAt: now,
  });
  invalidateAnonMatchAvailabilityCache();
  return { ok: true as const, estado: "cancelado" as const };
}

export async function respondAnonMatchRequest(input: {
  solicitudId: string;
  responderAnonId?: string;
  responderUid?: string;
  accept: boolean;
}) {
  const row = await getAnonMatchRequest(input.solicitudId);
  if (!row) return { ok: false as const, reason: "not_found" as const };

  const estado = await expireAnonMatchRequestIfNeeded(row);
  if (estado !== "pendiente") {
    return { ok: false as const, reason: estado === "expirado" ? "expired" as const : "not_pending" as const };
  }

  const solicitanteUid = String(row.solicitanteUid || "");
  const solicitanteAnonId = String(row.solicitanteAnonId || "");
  const { destinatarioTipo, destinatarioUid, destinatarioAnonId } = resolveDestinatario(row);
  const tipoSolicitud = String(row.tipoSolicitud || "");
  const solicitanteAuthUid = String(
    row.solicitanteAuthUid || solicitanteUid || "",
  ).trim();
  const destinatarioAuthUid = await resolveDestinatarioAuthUid({
    destinatarioTipo,
    destinatarioUid,
    destinatarioAnonId,
    existing: String(row.destinatarioAuthUid || input.responderUid || ""),
  });

  if (destinatarioTipo === "perfil") {
    if (!input.responderUid || input.responderUid !== destinatarioUid) {
      return { ok: false as const, reason: "forbidden" as const };
    }
  } else if (!input.responderAnonId || input.responderAnonId !== destinatarioAnonId) {
    return { ok: false as const, reason: "forbidden" as const };
  }

  if (
    solicitanteAnonId &&
    destinatarioAnonId &&
    solicitanteAnonId === destinatarioAnonId
  ) {
    return { ok: false as const, reason: "self_match" as const };
  }

  if (solicitanteUid && destinatarioUid && solicitanteUid === destinatarioUid) {
    return { ok: false as const, reason: "self_match" as const };
  }

  const now = new Date().toISOString();

  if (!input.accept) {
    await setAnonMatchAdminDoc("solicitudes_chat_anonimo", input.solicitudId, {
      estado: "rechazado",
      updatedAt: now,
    });
    invalidateAnonMatchAvailabilityCache();
    return { ok: true as const, estado: "rechazado" as const };
  }

  const [responderBusy, requesterBusy] = await Promise.all([
    hasActiveDirectChatForParticipant(
      String(input.responderUid || ""),
      String(input.responderAnonId || ""),
    ),
    hasActiveDirectChatForParticipant(solicitanteUid, solicitanteAnonId),
  ]);
  if (responderBusy || requesterBusy) {
    await setAnonMatchAdminDoc("solicitudes_chat_anonimo", input.solicitudId, {
      estado: "cancelado",
      updatedAt: now,
    });
    invalidateAnonMatchAvailabilityCache();
    return {
      ok: false as const,
      reason: responderBusy ? ("target_busy" as const) : ("requester_busy" as const),
    };
  }

  const chatId = buildDirectChatSessionId({
    solicitanteUid,
    solicitanteAnonId,
    destinatarioUid,
    destinatarioAnonId,
  });
  const chatTipo = resolveDirectChatTipo(tipoSolicitud);
  const closedBy =
    input.responderUid ||
    input.responderAnonId ||
    solicitanteUid ||
    solicitanteAnonId ||
    "system";

  await closeActiveChatsForParticipantPair(
    {
      solicitanteUid,
      solicitanteAnonId,
      destinatarioUid,
      destinatarioAnonId,
    },
    closedBy,
  );

  await setAnonMatchAdminDoc("chats_anonimos", chatId, {
    chatId,
    tipo: chatTipo,
    solicitanteUid,
    solicitanteAnonId,
    solicitanteAuthUid,
    destinatarioUid,
    destinatarioAuthUid,
    anonId: destinatarioAnonId,
    estado: "activo",
    createdAt: now,
    updatedAt: now,
    ultimoMensaje: "",
  });

  await setAnonMatchAdminDoc("solicitudes_chat_anonimo", input.solicitudId, {
    estado: "aceptado",
    chatId,
    solicitanteAuthUid,
    destinatarioAuthUid,
    updatedAt: now,
  });

  await cancelCompetingAnonMatchRequests({
    exceptSolicitudId: input.solicitudId,
    participantUids: [solicitanteUid, destinatarioUid].filter(Boolean),
    participantAnonIds: [solicitanteAnonId, destinatarioAnonId].filter(Boolean),
    now,
  });

  if (destinatarioAnonId) {
    await setAnonMatchAdminDoc("anonimos_activos", destinatarioAnonId, {
      enChat: true,
      disponibleParaChat: false,
      chatActualId: chatId,
      updatedAt: now,
    });
  }

  if (solicitanteAnonId) {
    await setAnonMatchAdminDoc("anonimos_activos", solicitanteAnonId, {
      enChat: true,
      disponibleParaChat: false,
      chatActualId: chatId,
      updatedAt: now,
    });
  }

  invalidateAnonMatchAvailabilityCache();

  return { ok: true as const, estado: "aceptado" as const, chatId };
}

export async function getAnonDirectChatRow(chatId: string) {
  return getAnonDirectChat(chatId);
}

export async function closeAnonDirectChat(input: {
  chatId: string;
  closedBy: string;
}) {
  const now = new Date().toISOString();
  const chat = await getAnonDirectChat(input.chatId);

  await setAnonMatchAdminDoc("chats_anonimos", input.chatId, {
    estado: "cerrado",
    cerradoPor: input.closedBy,
    cerradoAt: now,
    updatedAt: now,
  });

  if (chat) {
    await releaseDirectChatParticipants(chat, now);
  }

  return { ok: true as const };
}

async function resolveProfileUsername(uid: string) {
  if (!uid) return "";
  const user = await getAnonMatchAdminDoc("usuarios", uid);
  return String(user?.username || user?.usernameLower || "");
}

async function getAnonChatMessageExcerpt(chatId: string, limit = 8) {
  if (!chatId) return "";

  const rows = await listAnonMatchMessageExcerpt(chatId, limit).catch(() => []);
  const lines = rows
    .reverse()
    .map((message) => {
      const text = String(message.text || message.texto || message.mensaje || "").trim();
      if (!text) return "";
      const sender = String(message.senderId || message.remitenteId || message.autorId || "?");
      const shortSender = sender.length > 10 ? `${sender.slice(0, 6)}…` : sender;
      return `${shortSender}: ${text}`;
    })
    .filter(Boolean);

  return lines.join("\n");
}

function resolveAnonChatReportedParty(
  chat: Record<string, unknown>,
  reporterId: string,
  reporterUid: string,
) {
  const solicitanteUid = String(chat.solicitanteUid || "");
  const destinatarioUid = String(chat.destinatarioUid || "");
  const solicitanteAnonId = String(chat.solicitanteAnonId || "");
  const destinatarioAnonId = String(chat.anonId || "");

  const reporterIsSolicitante =
    (reporterUid && reporterUid === solicitanteUid) ||
    (reporterId && reporterId === solicitanteAnonId);
  const reporterIsDestinatario =
    (reporterUid && reporterUid === destinatarioUid) ||
    (reporterId && reporterId === destinatarioAnonId);

  if (reporterIsSolicitante) {
    return {
      targetUid: destinatarioUid,
      targetAnonId: destinatarioAnonId,
    };
  }

  if (reporterIsDestinatario) {
    return {
      targetUid: solicitanteUid,
      targetAnonId: solicitanteAnonId,
    };
  }

  return {
    targetUid: destinatarioUid || solicitanteUid,
    targetAnonId: destinatarioAnonId || solicitanteAnonId,
  };
}

export async function reportAnonDirectChat(input: {
  chatId: string;
  reporterId: string;
  reporterUid?: string;
  detalle?: string;
}) {
  const now = new Date().toISOString();
  const chat = (await getAnonDirectChat(input.chatId)) || {};
  const reporterUid = String(input.reporterUid || "");
  const reporterId = String(input.reporterId || "");
  const reportedParty = resolveAnonChatReportedParty(chat, reporterId, reporterUid);
  const reportedAnonId = String(chat.anonId || "");
  const reportedSolicitanteAnonId = String(chat.solicitanteAnonId || "");
  const solicitanteUid = String(chat.solicitanteUid || "");
  const destinatarioUid = String(chat.destinatarioUid || "");

  const [targetUsername, reporterUsername, solicitanteUsername, destinatarioUsername, chatExcerpt] =
    await Promise.all([
      resolveProfileUsername(reportedParty.targetUid),
      resolveProfileUsername(reporterUid),
      resolveProfileUsername(solicitanteUid),
      resolveProfileUsername(destinatarioUid),
      getAnonChatMessageExcerpt(input.chatId),
    ]);

  const targetLabel = targetUsername
    ? `@${targetUsername}`
    : reportedParty.targetAnonId
      ? `An\u00f3nimo ${reportedParty.targetAnonId.slice(0, 8)}`
      : "";
  const reporterLabel = reporterUsername
    ? `@${reporterUsername}`
    : reporterUid
      ? reporterUid.slice(0, 8)
      : reporterId
        ? `An\u00f3nimo ${reporterId.slice(0, 8)}`
        : "Desconocido";

  const detailParts = [
    String(input.detalle || "").trim(),
    chatExcerpt ? `Mensajes del chat:\n${chatExcerpt}` : "",
  ].filter(Boolean);

  await setAnonMatchAdminDoc("chats_anonimos", input.chatId, {
    estado: "denunciado",
    denunciadoPor: reporterId,
    denunciadoAt: now,
    updatedAt: now,
  });

  await addAnonMatchAdminDoc("reportes", {
    tipo: "chat_anonimo_directo",
    motivo: "denuncia_chat_anonimo",
    detalle: detailParts.join("\n\n") || "Chat an\u00f3nimo denunciado sin detalle adicional.",
    chatId: input.chatId,
    reporterUid,
    reporterEmail: "",
    reporterFingerprint: reporterId,
    reporterLabel,
    reportedAnonId,
    reportedSolicitanteAnonId,
    targetUid: reportedParty.targetUid,
    targetUsername: targetUsername || "",
    targetAnonId: reportedParty.targetAnonId,
    targetLabel,
    solicitanteUid,
    destinatarioUid,
    solicitanteUsername,
    destinatarioUsername,
    chatExcerpt,
    chatTipo: String(chat.tipo || ""),
    permanentBlock: false,
    blockedFingerprint: reporterId,
    estado: "pendiente",
    createdAt: now,
  });

  await releaseDirectChatParticipants(chat, now);

  return { ok: true as const };
}
