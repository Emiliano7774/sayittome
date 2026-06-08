import { isPublicProfile } from "@/lib/profile/isPublicProfile";
import { isShuffleProfileOnline, ONLINE_WINDOW_MS } from "@/lib/presence";
import { runCollectionQuery } from "@/lib/firestore/rest";

export type MatchParticipantTipo = "perfil" | "anonimo";

export type MatchCandidate = {
  tipo: MatchParticipantTipo;
  id: string;
  pais?: string;
  provincia?: string;
  idioma?: string;
};

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

type ProfileRow = Record<string, unknown> & {
  id?: string;
  uid?: string;
  presenceAt?: string;
  lastActive?: string;
  lastActiveAt?: string;
  lastSeenAt?: string;
  pais?: string;
  provincia?: string;
  idioma?: string;
  banned?: boolean;
};

const MATCH_POOL_QUERY_LIMIT = 50;
const MATCH_AUX_QUERY_LIMIT = 50;
const MATCH_POOL_CACHE_MS = 2 * 60_000;

type PoolCache = {
  anonRows: AnonPresenceRow[];
  profileRows: ProfileRow[];
  fetchedAt: number;
};

let poolCache: PoolCache | null = null;
let pendingTargetsCache: {
  pendingAnonIds: Set<string>;
  pendingUids: Set<string>;
  fetchedAt: number;
} | null = null;
let busyParticipantsCache: {
  busyAnonIds: Set<string>;
  busyUids: Set<string>;
  fetchedAt: number;
} | null = null;

function parseDate(value?: string | null) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function isAnonOnline(row: AnonPresenceRow, now = Date.now()) {
  const lastSeen = parseDate(row.lastSeenAt || row.updatedAt);
  if (!lastSeen) return false;
  return now - lastSeen.getTime() <= ONLINE_WINDOW_MS;
}

function isAnonAvailable(row: AnonPresenceRow, now = Date.now()) {
  if (!isAnonOnline(row, now)) return false;
  if (row.disponibleParaChat === false) return false;
  if (row.enChat === true) return false;
  if (row.chatActualId) return false;
  return true;
}

function profilePresenceAt(row: ProfileRow) {
  return String(
    row.presenceAt || row.lastActiveAt || row.lastSeenAt || row.lastActive || "",
  );
}

function isProfileAvailable(
  row: ProfileRow,
  now: number,
  excludeUids: Set<string>,
  pendingUids: Set<string>,
  busyUids: Set<string>,
) {
  const uid = String(row.uid || row.id || "").trim();
  if (!uid || excludeUids.has(uid) || pendingUids.has(uid) || busyUids.has(uid)) {
    return false;
  }
  if (row.banned === true) return false;
  if (!isPublicProfile(row)) return false;

  return isShuffleProfileOnline(
    { presenceAt: profilePresenceAt(row), lastActive: profilePresenceAt(row) },
    now,
    ONLINE_WINDOW_MS,
  );
}

async function getMatchPoolRows(now = Date.now()) {
  if (poolCache && now - poolCache.fetchedAt < MATCH_POOL_CACHE_MS) {
    return poolCache;
  }

  const [anonRows, profileRows] = await Promise.all([
    runCollectionQuery("anonimos_activos", MATCH_POOL_QUERY_LIMIT) as Promise<
      AnonPresenceRow[]
    >,
    runCollectionQuery("usuarios", MATCH_POOL_QUERY_LIMIT) as Promise<ProfileRow[]>,
  ]);

  poolCache = { anonRows, profileRows, fetchedAt: now };
  return poolCache;
}

export async function listPendingMatchTargets(now = Date.now()) {
  if (
    pendingTargetsCache &&
    now - pendingTargetsCache.fetchedAt < MATCH_POOL_CACHE_MS
  ) {
    return {
      pendingAnonIds: pendingTargetsCache.pendingAnonIds,
      pendingUids: pendingTargetsCache.pendingUids,
    };
  }

  const rows = await runCollectionQuery(
    "solicitudes_chat_anonimo",
    MATCH_AUX_QUERY_LIMIT,
    "createdAt",
    "DESCENDING",
  );
  const pendingAnonIds = new Set<string>();
  const pendingUids = new Set<string>();

  for (const row of rows) {
    const estado = String(row.estado || "");
    if (estado !== "pendiente") continue;

    const expiresAt = parseDate(String(row.expiresAt || ""));
    if (expiresAt && expiresAt.getTime() <= now) continue;

    const destinatarioTipo = String(row.destinatarioTipo || "");
    const destinatarioUid = String(row.destinatarioUid || "");
    const anonId = String(row.anonId || "");

    if (destinatarioTipo === "perfil" && destinatarioUid) {
      pendingUids.add(destinatarioUid);
    } else if (anonId) {
      pendingAnonIds.add(anonId);
    }
  }

  pendingTargetsCache = { pendingAnonIds, pendingUids, fetchedAt: now };
  return { pendingAnonIds, pendingUids };
}

export async function listBusyDirectChatParticipants(now = Date.now()) {
  if (
    busyParticipantsCache &&
    now - busyParticipantsCache.fetchedAt < MATCH_POOL_CACHE_MS
  ) {
    return {
      busyAnonIds: busyParticipantsCache.busyAnonIds,
      busyUids: busyParticipantsCache.busyUids,
    };
  }

  const rows = await runCollectionQuery(
    "chats_anonimos",
    MATCH_AUX_QUERY_LIMIT,
    "updatedAt",
    "DESCENDING",
  );
  const busyAnonIds = new Set<string>();
  const busyUids = new Set<string>();

  for (const row of rows) {
    if (String(row.estado || "") !== "activo") continue;

    for (const uid of [
      String(row.solicitanteUid || ""),
      String(row.destinatarioUid || ""),
    ]) {
      if (uid) busyUids.add(uid);
    }

    for (const anonId of [
      String(row.anonId || ""),
      String(row.solicitanteAnonId || ""),
    ]) {
      if (anonId) busyAnonIds.add(anonId);
    }
  }

  busyParticipantsCache = { busyAnonIds, busyUids, fetchedAt: now };
  return { busyAnonIds, busyUids };
}

export async function pickAvailableMatchTarget(input: {
  excludeAnonIds?: string[];
  excludeUids?: string[];
  pais?: string;
  idioma?: string;
  now?: number;
}): Promise<MatchCandidate | null> {
  const now = input.now ?? Date.now();
  const excludeAnonIds = new Set(input.excludeAnonIds || []);
  const excludeUids = new Set(input.excludeUids || []);
  const { pendingAnonIds, pendingUids } = await listPendingMatchTargets(now);
  const { busyAnonIds, busyUids } = await listBusyDirectChatParticipants(now);
  const { anonRows, profileRows } = await getMatchPoolRows(now);

  const anonCandidates: MatchCandidate[] = anonRows
    .map((row) => {
      const id = String(row.anonId || row.id || "");
      if (!id || excludeAnonIds.has(id) || pendingAnonIds.has(id) || busyAnonIds.has(id)) {
        return null;
      }
      if (!isAnonAvailable(row, now)) return null;
      return {
        tipo: "anonimo" as const,
        id,
        pais: String(row.pais || ""),
        provincia: String(row.provincia || ""),
        idioma: String(row.idioma || "es"),
      };
    })
    .filter(Boolean) as MatchCandidate[];

  const profileCandidates: MatchCandidate[] = profileRows
    .map((row) => {
      const id = String(row.uid || row.id || "");
      if (!id) return null;
      if (!isProfileAvailable(row, now, excludeUids, pendingUids, busyUids)) return null;
      return {
        tipo: "perfil" as const,
        id,
        pais: String(row.pais || ""),
        provincia: String(row.provincia || ""),
        idioma: String(row.idioma || "es"),
      };
    })
    .filter(Boolean) as MatchCandidate[];

  const eligible = [...profileCandidates, ...anonCandidates];
  if (eligible.length === 0) return null;

  const preferred = eligible.filter((row) => {
    if (input.pais && row.pais && row.pais !== input.pais) return false;
    if (input.idioma && row.idioma && row.idioma !== input.idioma) return false;
    return true;
  });

  const pool = preferred.length > 0 ? preferred : eligible;
  return pool[Math.floor(Math.random() * pool.length)];
}

export async function countAvailableMatchTargets(
  input: {
    excludeAnonIds?: string[];
    excludeUids?: string[];
    now?: number;
  } = {},
) {
  const now = input.now ?? Date.now();
  const excludeAnonIds = new Set(input.excludeAnonIds || []);
  const excludeUids = new Set(input.excludeUids || []);
  const { pendingAnonIds, pendingUids } = await listPendingMatchTargets(now);
  const { busyAnonIds, busyUids } = await listBusyDirectChatParticipants(now);
  const { anonRows, profileRows } = await getMatchPoolRows(now);

  const anonCount = anonRows.filter((row) => {
    const id = String(row.anonId || row.id || "");
    if (!id || excludeAnonIds.has(id) || pendingAnonIds.has(id) || busyAnonIds.has(id)) {
      return false;
    }
    return isAnonAvailable(row, now);
  }).length;

  const profileCount = profileRows.filter((row) =>
    isProfileAvailable(row, now, excludeUids, pendingUids, busyUids),
  ).length;

  return anonCount + profileCount;
}
