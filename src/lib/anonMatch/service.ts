import {
  createFirestoreDoc,
  parseFirestoreDoc,
  patchFirestoreDoc,
  runCollectionQuery,
} from "@/lib/firestore/rest";
import { buildAnonDirectChatId, buildAnonMatchRequestId, buildAnonToAnonDirectChatId } from "@/lib/anonMatch/chatId";
import {
  ANON_MATCH_ACTIVE_MS,
  ANON_MATCH_REQUEST_MS,
  type AnonMatchRequestState,
} from "@/lib/anonMatch/types";

type AnonPresenceRow = {
  id: string;
  anonId?: string;
  lastSeenAt?: string;
  updatedAt?: string;
  expiresAt?: string;
  disponibleParaChat?: boolean;
  enChat?: boolean;
  chatActualId?: string;
  pais?: string;
  provincia?: string;
  idioma?: string;
};

function parseDate(value?: string | null) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function isAnonPresenceActive(row: AnonPresenceRow, now = Date.now()) {
  const expiresAt = parseDate(row.expiresAt);
  if (expiresAt && expiresAt.getTime() > now) return true;

  const lastSeen = parseDate(row.lastSeenAt || row.updatedAt);
  if (!lastSeen) return false;

  return now - lastSeen.getTime() <= ANON_MATCH_ACTIVE_MS;
}

function isAnonAvailable(row: AnonPresenceRow, now = Date.now()) {
  if (!isAnonPresenceActive(row, now)) return false;
  if (row.disponibleParaChat === false) return false;
  if (row.enChat === true) return false;
  if (row.chatActualId) return false;
  return true;
}

async function listPendingRequestAnonIds(now = Date.now()) {
  const rows = await runCollectionQuery("solicitudes_chat_anonimo", 200, "createdAt", "DESCENDING");
  const pending = new Set<string>();

  for (const row of rows) {
    const estado = String(row.estado || "");
    const anonId = String(row.anonId || "");
    if (!anonId || estado !== "pendiente") continue;

    const expiresAt = parseDate(String(row.expiresAt || ""));
    if (expiresAt && expiresAt.getTime() <= now) continue;

    pending.add(anonId);
  }

  return pending;
}

export async function pickAvailableAnon(input: {
  excludeAnonIds?: string[];
  pais?: string;
  idioma?: string;
  now?: number;
}) {
  const now = input.now ?? Date.now();
  const exclude = new Set(input.excludeAnonIds || []);
  const pending = await listPendingRequestAnonIds(now);
  const rows = (await runCollectionQuery("anonimos_activos", 250)) as AnonPresenceRow[];

  const eligible = rows.filter((row) => {
    const anonId = String(row.anonId || row.id || "");
    if (!anonId || exclude.has(anonId) || pending.has(anonId)) return false;
    return isAnonAvailable(row, now);
  });

  if (eligible.length === 0) return null;

  const preferred = eligible.filter((row) => {
    if (input.pais && row.pais && row.pais !== input.pais) return false;
    if (input.idioma && row.idioma && row.idioma !== input.idioma) return false;
    return true;
  });

  const pool = preferred.length > 0 ? preferred : eligible;
  return pool[Math.floor(Math.random() * pool.length)];
}

export async function countAvailableAnons(excludeAnonIds: string[] = []) {
  const now = Date.now();
  const exclude = new Set(excludeAnonIds);
  const pending = await listPendingRequestAnonIds(now);
  const rows = (await runCollectionQuery("anonimos_activos", 250)) as AnonPresenceRow[];

  return rows.filter((row) => {
    const anonId = String(row.anonId || row.id || "");
    if (!anonId || exclude.has(anonId) || pending.has(anonId)) return false;
    return isAnonAvailable(row, now);
  }).length;
}

export async function createAnonMatchRequest(input: {
  solicitanteUid?: string;
  solicitanteAnonId?: string;
  excludeAnonIds?: string[];
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
  const exclude = new Set(input.excludeAnonIds || []);
  if (solicitanteAnonId) exclude.add(solicitanteAnonId);

  const picked = await pickAvailableAnon({
    excludeAnonIds: Array.from(exclude),
    pais: input.pais,
    idioma: input.idioma,
    now,
  });

  if (!picked) {
    return { ok: false as const, reason: "no_anon_available" as const };
  }

  const anonId = String(picked.anonId || picked.id || "");
  const solicitudId = buildAnonMatchRequestId(solicitanteKey, anonId);
  const createdAt = new Date(now).toISOString();
  const expiresAt = new Date(now + ANON_MATCH_REQUEST_MS).toISOString();
  const tipoSolicitud = solicitanteUid ? "perfil_a_anonimo" : "anon_a_anonimo";

  await createFirestoreDoc(
    "solicitudes_chat_anonimo",
    {
      solicitudId,
      solicitanteUid,
      solicitanteAnonId,
      tipoSolicitud,
      anonId,
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
    anonId,
    expiresAt,
  };
}

export async function getAnonMatchRequest(solicitudId: string) {
  const url = `https://firestore.googleapis.com/v1/projects/sayittome-app/databases/(default)/documents/solicitudes_chat_anonimo/${encodeURIComponent(solicitudId)}?key=${process.env.FIREBASE_API_KEY || "AIzaSyBpQKCAwE-8Td3ZuaDqE3nvNwRGDGY8vdk"}`;
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) return null;
  return parseFirestoreDoc(await res.json()) as Record<string, unknown>;
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
  anonId: string;
  accept: boolean;
}) {
  const row = await getAnonMatchRequest(input.solicitudId);
  if (!row) return { ok: false as const, reason: "not_found" as const };

  const estado = await expireAnonMatchRequestIfNeeded(row);
  if (estado !== "pendiente") {
    return { ok: false as const, reason: estado === "expirado" ? "expired" as const : "not_pending" as const };
  }

  if (String(row.anonId || "") !== input.anonId) {
    return { ok: false as const, reason: "forbidden" as const };
  }

  const now = new Date().toISOString();
  const solicitanteUid = String(row.solicitanteUid || "");
  const solicitanteAnonId = String(row.solicitanteAnonId || "");
  const isAnonToAnon = !solicitanteUid && Boolean(solicitanteAnonId);

  if (!input.accept) {
    await patchFirestoreDoc("solicitudes_chat_anonimo", input.solicitudId, {
      estado: "rechazado",
      updatedAt: now,
    });
    return { ok: true as const, estado: "rechazado" as const };
  }

  const chatId = isAnonToAnon
    ? buildAnonToAnonDirectChatId(solicitanteAnonId, input.anonId)
    : buildAnonDirectChatId(solicitanteUid, input.anonId);

  await createFirestoreDoc(
    "chats_anonimos",
    {
      chatId,
      tipo: isAnonToAnon ? "anon_con_anonimo" : "perfil_con_anonimo",
      solicitanteUid,
      solicitanteAnonId,
      anonId: input.anonId,
      estado: "activo",
      createdAt: now,
      updatedAt: now,
      ultimoMensaje: "",
    },
    chatId,
  );

  await patchFirestoreDoc("solicitudes_chat_anonimo", input.solicitudId, {
    estado: "aceptado",
    chatId,
    updatedAt: now,
  });

  await patchFirestoreDoc("anonimos_activos", input.anonId, {
    enChat: true,
    disponibleParaChat: false,
    chatActualId: chatId,
    updatedAt: now,
  });

  if (isAnonToAnon && solicitanteAnonId) {
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
  await patchFirestoreDoc("chats_anonimos", input.chatId, {
    estado: "cerrado",
    cerradoPor: input.closedBy,
    cerradoAt: now,
    updatedAt: now,
  });

  const url = `https://firestore.googleapis.com/v1/projects/sayittome-app/databases/(default)/documents/chats_anonimos/${encodeURIComponent(input.chatId)}?key=${process.env.FIREBASE_API_KEY || "AIzaSyBpQKCAwE-8Td3ZuaDqE3nvNwRGDGY8vdk"}`;
  const res = await fetch(url, { cache: "no-store" });
  if (res.ok) {
    const chat = parseFirestoreDoc(await res.json()) as Record<string, unknown>;
    const anonId = String(chat.anonId || "");
    const solicitanteAnonId = String(chat.solicitanteAnonId || "");

    if (anonId) {
      await patchFirestoreDoc("anonimos_activos", anonId, {
        enChat: false,
        disponibleParaChat: true,
        chatActualId: "",
        updatedAt: now,
      });
    }

    if (solicitanteAnonId) {
      await patchFirestoreDoc("anonimos_activos", solicitanteAnonId, {
        enChat: false,
        disponibleParaChat: true,
        chatActualId: "",
        updatedAt: now,
      });
    }
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
    blockedFingerprint: input.reporterId,
    estado: "pendiente",
    createdAt: now,
  });

  await closeAnonDirectChat({ chatId: input.chatId, closedBy: input.reporterId });

  return { ok: true as const };
}
