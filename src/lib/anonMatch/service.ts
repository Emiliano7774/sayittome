import {
  createFirestoreDoc,
  parseFirestoreDoc,
  patchFirestoreDoc,
  runCollectionQuery,
} from "@/lib/firestore/rest";
import {
  buildAnonMatchRequestId,
  buildDirectChatId,
  resolveDirectChatTipo,
  resolveTipoSolicitud,
} from "@/lib/anonMatch/chatId";
import {
  countAvailableMatchTargets,
  pickAvailableMatchTarget,
  type MatchCandidate,
} from "@/lib/anonMatch/matchPool";
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

export { countAvailableMatchTargets as countAvailableAnons, countAvailableMatchTargets, pickAvailableMatchTarget as pickAvailableAnon, pickAvailableMatchTarget };

export async function createAnonMatchRequest(input: {
  solicitanteUid?: string;
  solicitanteAnonId?: string;
  localAnonId?: string;
  excludeAnonIds?: string[];
  excludeUids?: string[];
  pais?: string;
  provincia?: string;
  idioma?: string;
}) {
  const solicitanteUid = String(input.solicitanteUid || "").trim();
  const solicitanteAnonId = String(input.solicitanteAnonId || "").trim();
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
    pais: input.pais,
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
  const tipoSolicitud = resolveTipoSolicitud({
    solicitanteUid,
    solicitanteAnonId,
    destinatarioTipo,
  });
  const targetKey = picked.id;
  const solicitudId = buildAnonMatchRequestId(solicitanteKey, targetKey);
  const createdAt = new Date(now).toISOString();
  const expiresAt = new Date(now + ANON_MATCH_REQUEST_MS).toISOString();

  await createFirestoreDoc(
    "solicitudes_chat_anonimo",
    {
      solicitudId,
      solicitanteUid,
      solicitanteAnonId,
      tipoSolicitud,
      destinatarioTipo,
      destinatarioUid,
      anonId: destinatarioAnonId,
      estado: "pendiente",
      createdAt,
      updatedAt: createdAt,
      expiresAt,
      chatId: "",
      pais: input.pais || picked.pais || "",
      provincia: input.provincia || picked.provincia || "",
      idioma: input.idioma || picked.idioma || "es",
    },
    solicitudId,
  );

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

export async function getAnonMatchRequest(solicitudId: string) {
  const url = `https://firestore.googleapis.com/v1/projects/sayittome-app/databases/(default)/documents/solicitudes_chat_anonimo/${encodeURIComponent(solicitudId)}?key=${process.env.FIREBASE_API_KEY || "AIzaSyBpQKCAwE-8Td3ZuaDqE3nvNwRGDGY8vdk"}`;
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) return null;
  return parseFirestoreDoc(await res.json()) as Record<string, unknown>;
}

async function getAnonDirectChat(chatId: string) {
  const url = `https://firestore.googleapis.com/v1/projects/sayittome-app/databases/(default)/documents/chats_anonimos/${encodeURIComponent(chatId)}?key=${process.env.FIREBASE_API_KEY || "AIzaSyBpQKCAwE-8Td3ZuaDqE3nvNwRGDGY8vdk"}`;
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) return null;
  return parseFirestoreDoc(await res.json()) as Record<string, unknown>;
}

/** Vuelve a habilitar anónimos en el match — sin bloqueo permanente. */
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
      patchFirestoreDoc("anonimos_activos", anonId, {
        enChat: false,
        disponibleParaChat: true,
        chatActualId: "",
        updatedAt: now,
      }),
    ),
  );
}

export async function expireAnonMatchRequestIfNeeded(row: Record<string, unknown>) {
  const estado = String(row.estado || "");
  if (estado !== "pendiente") return estado as AnonMatchRequestState;

  const expiresAt = parseDate(String(row.expiresAt || ""));
  if (!expiresAt || expiresAt.getTime() > Date.now()) return "pendiente";

  const solicitudId = String(row.solicitudId || row.id || "");
  if (!solicitudId) return "expirado";

  await patchFirestoreDoc("solicitudes_chat_anonimo", solicitudId, {
    estado: "expirado",
    updatedAt: new Date().toISOString(),
  });

  return "expirado";
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
    await patchFirestoreDoc("solicitudes_chat_anonimo", input.solicitudId, {
      estado: "rechazado",
      updatedAt: now,
    });
    return { ok: true as const, estado: "rechazado" as const };
  }

  const chatId = buildDirectChatId({
    solicitanteUid,
    solicitanteAnonId,
    destinatarioUid,
    destinatarioAnonId,
  });
  const chatTipo = resolveDirectChatTipo(tipoSolicitud);

  const existingChat = await getAnonDirectChat(chatId);
  const chatFields = {
    chatId,
    tipo: chatTipo,
    solicitanteUid,
    solicitanteAnonId,
    destinatarioUid,
    anonId: destinatarioAnonId,
    estado: "activo",
    updatedAt: now,
    ultimoMensaje: String(existingChat?.ultimoMensaje || ""),
    cerradoPor: "",
    cerradoAt: "",
    denunciadoPor: "",
    denunciadoAt: "",
  };

  if (existingChat) {
    await patchFirestoreDoc("chats_anonimos", chatId, chatFields);
  } else {
    await createFirestoreDoc(
      "chats_anonimos",
      {
        ...chatFields,
        createdAt: now,
        ultimoMensaje: "",
      },
      chatId,
    );
  }

  await patchFirestoreDoc("solicitudes_chat_anonimo", input.solicitudId, {
    estado: "aceptado",
    chatId,
    updatedAt: now,
  });

  if (destinatarioAnonId) {
    await patchFirestoreDoc("anonimos_activos", destinatarioAnonId, {
      enChat: true,
      disponibleParaChat: false,
      chatActualId: chatId,
      updatedAt: now,
    });
  }

  if (solicitanteAnonId) {
    await patchFirestoreDoc("anonimos_activos", solicitanteAnonId, {
      enChat: true,
      disponibleParaChat: false,
      chatActualId: chatId,
      updatedAt: now,
    });
  }

  return { ok: true as const, estado: "aceptado" as const, chatId };
}

export async function closeAnonDirectChat(input: {
  chatId: string;
  closedBy: string;
}) {
  const now = new Date().toISOString();
  const chat = await getAnonDirectChat(input.chatId);

  await patchFirestoreDoc("chats_anonimos", input.chatId, {
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

export async function reportAnonDirectChat(input: {
  chatId: string;
  reporterId: string;
  reporterUid?: string;
  detalle?: string;
}) {
  const now = new Date().toISOString();
  const chat = (await getAnonDirectChat(input.chatId)) || {};
  const reportedAnonId = String(chat.anonId || "");
  const reportedSolicitanteAnonId = String(chat.solicitanteAnonId || "");

  await patchFirestoreDoc("chats_anonimos", input.chatId, {
    estado: "denunciado",
    denunciadoPor: input.reporterId,
    denunciadoAt: now,
    updatedAt: now,
  });

  await createFirestoreDoc("reportes", {
    tipo: "chat_anonimo_directo",
    motivo: "denuncia_chat_anonimo",
    detalle: String(input.detalle || ""),
    chatId: input.chatId,
    reporterUid: input.reporterUid || "",
    reporterFingerprint: input.reporterId,
    reportedAnonId,
    reportedSolicitanteAnonId,
    solicitanteUid: String(chat.solicitanteUid || ""),
    chatTipo: String(chat.tipo || ""),
    permanentBlock: false,
    blockedFingerprint: input.reporterId,
    estado: "pendiente",
    createdAt: now,
  });

  await releaseDirectChatParticipants(chat, now);

  return { ok: true as const };
}
