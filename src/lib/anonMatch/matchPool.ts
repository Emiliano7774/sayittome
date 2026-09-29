import { isPublicProfile } from "@/lib/profile/isPublicProfile";
import { isShuffleProfileOnline, ONLINE_WINDOW_MS } from "@/lib/presence";
import { listAnonMatchAdminDocs } from "@/lib/anonMatch/anonMatchAdminStore";
import { isVerifiedAnonMatchPresence } from "@/lib/anonMatch/anonymousPresenceIdentity";
import { isAnonMatchDoNotDisturbActive } from "@/lib/anonMatch/doNotDisturb";
import { ANON_MATCH_PRESENCE_FRESH_MS } from "@/lib/anonMatch/types";

export type MatchParticipantTipo = "perfil" | "anonimo";

export type MatchCandidate = {
  tipo: MatchParticipantTipo;
  id: string;
  pais?: string;
  provincia?: string;
  idioma?: string;
  /** Epoch ms of last presence heartbeat — used to prefer live anons. */
  lastSeenMs?: number;
};

type AnonPresenceRow = {
  id: string;
  anonId?: string;
  source?: string;
  authUid?: string;
  lastSeenAt?: string;
  updatedAt?: string;
  expiresAt?: string;
  doNotDisturbUntil?: string;
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
  anonMatchDoNotDisturbUntil?: string;
  pais?: string;
  provincia?: string;
  idioma?: string;
  banned?: boolean;
};

const MATCH_PROFILE_QUERY_LIMIT = 2_000;
const MATCH_ANON_QUERY_LIMIT = 1_000;
const MATCH_AUX_QUERY_LIMIT = 500;
/** Profiles can stay cached briefly; anon presence is always re-read (see getMatchPoolRows). */
export const MATCH_POOL_CACHE_MS = 2 * 60_000;

type PoolCache = {
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

export function invalidateAnonMatchAvailabilityCache() {
  poolCache = null;
  pendingTargetsCache = null;
  busyParticipantsCache = null;
}

function parseDate(value?: string | null) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function isAnonOnline(row: AnonPresenceRow, now = Date.now()) {
  const lastSeen = parseDate(row.lastSeenAt || row.updatedAt);
  if (!lastSeen) return false;
  // Match pool uses a tight freshness window so closed-tab ghosts do not
  // steal requests from people actually searching right now.
  if (now - lastSeen.getTime() > ANON_MATCH_PRESENCE_FRESH_MS) return false;
  const expiresAt = parseDate(row.expiresAt);
  if (expiresAt && expiresAt.getTime() <= now) return false;
  return true;
}

function isAnonAvailable(row: AnonPresenceRow, now = Date.now()) {
  if (!isVerifiedAnonMatchPresence(row)) return false;
  if (!isAnonOnline(row, now)) return false;
  if (isAnonMatchDoNotDisturbActive(row.doNotDisturbUntil, now)) return false;
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
  if (isAnonMatchDoNotDisturbActive(String(row.anonMatchDoNotDisturbUntil || ""), now)) {
    return false;
  }

  return isShuffleProfileOnline(
    { presenceAt: profilePresenceAt(row), lastActive: profilePresenceAt(row) },
    now,
    ONLINE_WINDOW_MS,
  );
}

async function getMatchPoolRows(now = Date.now()) {
  // Always re-read live anon presence. Filter source server-side so legacy
  // ghost docs cannot crowd out the MATCH_ANON_QUERY_LIMIT window.
  const anonRows = (await listAnonMatchAdminDocs("anonimos_activos", {
    limit: MATCH_ANON_QUERY_LIMIT,
    where: { field: "source", value: "anon_match_presence" },
  })) as AnonPresenceRow[];

  if (poolCache && now - poolCache.fetchedAt < MATCH_POOL_CACHE_MS) {
    return { anonRows, profileRows: poolCache.profileRows, fetchedAt: poolCache.fetchedAt };
  }

  const profileRows = (await listAnonMatchAdminDocs("usuarios", {
    limit: MATCH_PROFILE_QUERY_LIMIT,
  })) as ProfileRow[];

  poolCache = { profileRows, fetchedAt: now };
  return { anonRows, profileRows, fetchedAt: now };
}

/**
 * Prefer live anonymous presence over registered profiles so searching anons
 * receive the incoming match alert instead of only idle online profiles.
 *
 * Queue semantics (not pure random):
 * 1) Anons before profiles
 * 2) Never-tried ahead of recently contacted (recentOrder: oldest → newest)
 * 3) Among the same recency tier, freshest heartbeat first
 * 4) Deterministic pick of the best candidate (no random among top-3)
 */
export function selectMatchCandidateFromPool(
  eligible: MatchCandidate[],
  preferred: MatchCandidate[],
  now = Date.now(),
  recentOrder: string[] = [],
): MatchCandidate | null {
  const pool = preferred.length > 0 ? preferred : eligible;
  if (pool.length === 0) return null;

  const rankOf = (id: string) => {
    const index = recentOrder.indexOf(id);
    return index === -1 ? -1 : index;
  };

  const compare = (a: MatchCandidate, b: MatchCandidate) => {
    const rankA = rankOf(a.id);
    const rankB = rankOf(b.id);
    if (rankA !== rankB) return rankA - rankB;
    return Number(b.lastSeenMs || 0) - Number(a.lastSeenMs || 0);
  };

  const anonPool = pool.filter((row) => row.tipo === "anonimo");
  const freshAnonPool = anonPool.filter((row) => {
    const seen = Number(row.lastSeenMs || 0);
    return seen > 0 && now - seen <= ANON_MATCH_PRESENCE_FRESH_MS;
  });
  const anonPickFrom =
    freshAnonPool.length > 0 ? freshAnonPool : anonPool.length > 0 ? anonPool : null;

  if (anonPickFrom) {
    const sorted = [...anonPickFrom].sort(compare);
    return sorted[0] || null;
  }

  const sortedProfiles = [...pool].sort(compare);
  return sortedProfiles[0] || null;
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

  const rows = await listAnonMatchAdminDocs("solicitudes_chat_anonimo", {
    limit: MATCH_AUX_QUERY_LIMIT,
    where: { field: "estado", value: "pendiente" },
  });
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

  const rows = await listAnonMatchAdminDocs("chats_anonimos", {
    limit: MATCH_AUX_QUERY_LIMIT,
    where: { field: "estado", value: "activo" },
  });
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
  /** Oldest → newest contacted ids; never-tried stay ahead of this queue. */
  recentTargetIds?: string[];
  pais?: string;
  idioma?: string;
  now?: number;
}): Promise<MatchCandidate | null> {
  const now = input.now ?? Date.now();
  const excludeAnonIds = new Set(input.excludeAnonIds || []);
  const excludeUids = new Set(input.excludeUids || []);
  const recentOrder = (input.recentTargetIds || [])
    .map((id) => String(id || "").trim())
    .filter(Boolean);
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
      const lastSeen = parseDate(row.lastSeenAt || row.updatedAt);
      return {
        tipo: "anonimo" as const,
        id,
        pais: String(row.pais || ""),
        provincia: String(row.provincia || ""),
        idioma: String(row.idioma || "es"),
        lastSeenMs: lastSeen ? lastSeen.getTime() : 0,
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

  return selectMatchCandidateFromPool(eligible, preferred, now, recentOrder);
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

/**
 * Freshest available anon (DND/busy/pending/excludes already applied).
 * Used so a searching peer can retarget when someone new enters without pressing Connect.
 */
export async function findFreshestAvailableAnonTarget(input: {
  excludeAnonIds?: string[];
  excludeUids?: string[];
  /** Only count presence heartbeats at/after this epoch ms (new entrants). */
  seenAfterMs?: number;
  now?: number;
}): Promise<{ id: string; lastSeenMs: number } | null> {
  const now = input.now ?? Date.now();
  const seenAfterMs = Number(input.seenAfterMs || 0);
  const excludeAnonIds = new Set(input.excludeAnonIds || []);
  const excludeUids = new Set(input.excludeUids || []);
  const { pendingAnonIds } = await listPendingMatchTargets(now);
  const { busyAnonIds } = await listBusyDirectChatParticipants(now);
  const { anonRows } = await getMatchPoolRows(now);

  let best: { id: string; lastSeenMs: number } | null = null;
  for (const row of anonRows) {
    const id = String(row.anonId || row.id || "").trim();
    if (!id || excludeAnonIds.has(id) || pendingAnonIds.has(id) || busyAnonIds.has(id)) {
      continue;
    }
    if (!isAnonAvailable(row, now)) continue;
    const lastSeen = parseDate(row.lastSeenAt || row.updatedAt);
    const lastSeenMs = lastSeen ? lastSeen.getTime() : 0;
    if (seenAfterMs > 0 && lastSeenMs < seenAfterMs) continue;
    if (!best || lastSeenMs > best.lastSeenMs) {
      best = { id, lastSeenMs };
    }
  }

  void excludeUids;
  return best;
}
