import {
  ANON_INBOX_QUERY_KEYS,
  UID_INBOX_QUERY_KEYS,
  areInboxQuerySnapshotsComplete,
} from "@/lib/chat/inboxPeerTitle";

export type InboxQueryFamilies = {
  uid?: boolean;
  anon?: boolean;
};

export type InboxQueryCohortState = {
  generation: number;
  cohortKey: string;
  receivedKeys: string[];
  synced: boolean;
};

export type InboxQueryCohortRotateResult = InboxQueryCohortState & {
  ignored: false;
  mapsToClear: string[];
  uidChanged: boolean;
};

export type InboxQueryCohortSnapshotResult = InboxQueryCohortState & {
  ignored: boolean;
  mapsToClear: [];
  uidChanged: false;
};

export function createInboxQueryCohortState(): InboxQueryCohortState {
  return {
    generation: 0,
    cohortKey: "",
    receivedKeys: [],
    synced: false,
  };
}

export function inboxQueryCohortKey(input: {
  uid?: string;
  anonId?: string;
  uidFamily?: boolean;
  anonFamily?: boolean;
}) {
  const uidFamily = Boolean(input.uidFamily);
  const anonFamily = Boolean(input.anonFamily);
  const uid = uidFamily ? String(input.uid || "").trim() : "";
  const anonId = anonFamily ? String(input.anonId || "").trim() : "";
  return `u:${uid}|a:${anonId}|f:${uidFamily ? "1" : "0"}${anonFamily ? "1" : "0"}`;
}

export function parseInboxQueryCohortKey(key: string) {
  const raw = String(key || "");
  const uid = /(?:^|\|)u:([^|]*)/.exec(raw)?.[1] || "";
  const anonId = /(?:^|\|)a:([^|]*)/.exec(raw)?.[1] || "";
  const fam = /(?:^|\|)f:([01])([01])/.exec(raw);
  return {
    uid,
    anonId,
    uidFamily: fam?.[1] === "1",
    anonFamily: fam?.[2] === "1",
  };
}

export function mapsClearedForInboxCohortChange(prevKey: string, nextKey: string) {
  if (!prevKey || prevKey === nextKey) return [] as string[];
  const prev = parseInboxQueryCohortKey(prevKey);
  const next = parseInboxQueryCohortKey(nextKey);
  const keys: string[] = [];
  if (prev.uid !== next.uid || prev.uidFamily !== next.uidFamily) {
    keys.push(...UID_INBOX_QUERY_KEYS);
  }
  if (prev.anonId !== next.anonId || prev.anonFamily !== next.anonFamily) {
    keys.push(...ANON_INBOX_QUERY_KEYS);
  }
  return keys;
}

export function reduceInboxQueryCohort(
  state: InboxQueryCohortState,
  event:
    | { type: "rotate"; key: string }
    | {
        type: "snapshot";
        generation: number;
        queryKey: string;
        families: InboxQueryFamilies;
      },
): InboxQueryCohortRotateResult | InboxQueryCohortSnapshotResult {
  if (event.type === "rotate") {
    if (event.key === state.cohortKey) {
      return {
        ...state,
        ignored: false,
        mapsToClear: [],
        uidChanged: false,
      };
    }
    const prev = parseInboxQueryCohortKey(state.cohortKey);
    const next = parseInboxQueryCohortKey(event.key);
    return {
      generation: state.generation + 1,
      cohortKey: event.key,
      receivedKeys: [],
      synced: false,
      ignored: false,
      mapsToClear: mapsClearedForInboxCohortChange(state.cohortKey, event.key),
      uidChanged: Boolean(prev.uid) && prev.uid !== next.uid,
    };
  }

  if (event.generation !== state.generation) {
    return {
      ...state,
      ignored: true,
      mapsToClear: [],
      uidChanged: false,
    };
  }

  const receivedKeys = state.receivedKeys.includes(event.queryKey)
    ? state.receivedKeys
    : [...state.receivedKeys, event.queryKey];

  return {
    generation: state.generation,
    cohortKey: state.cohortKey,
    receivedKeys,
    synced: areInboxQuerySnapshotsComplete(receivedKeys, event.families),
    ignored: false,
    mapsToClear: [],
    uidChanged: false,
  };
}
