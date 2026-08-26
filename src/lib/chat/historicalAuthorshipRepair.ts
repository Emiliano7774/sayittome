/**
 * Assisted historical authorship repair planner + OCC classifier.
 * Does not touch 107cae5 new-message persist/hydrate.
 * Writer is enabled; callers must send explicit selections. No auto-apply.
 */
import {
  isProfileAnonChatId,
  parseProfileAnonChatId,
  usernameHintFromAnonChatId,
} from "@/lib/chat/anonChatId";
import {
  profileReplyAuthorId,
  resolveMineFromCanonicalSender,
} from "@/lib/chat/authorshipGates";

/**
 * When true, apply/rollback stay denied unless the sealed preview is composed
 * exclusively of explicit operator marks (safe unfreeze). Never inferred/proposed.
 */
export const HISTORICAL_REPAIR_APPLY_FROZEN = true;
export const HISTORICAL_REPAIR_BATCH_LIMIT = 25;
export const OPERATOR_MARKS_ONLY_COMPOSITION = "operator_marks_only" as const;

export type RepairPerspective = "owner" | "visitor";
export type RepairAuthorRole = "profile" | "anon";
export type RepairRowStatus = "applied" | "noop" | "rejected";

export type ThreadIdentities = {
  chatId: string;
  chatKind: "profileAnon" | "legacy";
  threadAnonId: string;
  ownerProfileId: string;
  ownerUsernameSlug: string;
  ownerIdSource:
    | "username_lookup"
    | "chat_receptor"
    | "ambiguous_mismatch"
    | "missing";
};

export type PersistedAuthor = {
  fromUid: string;
  senderAuthUid: string;
  senderProfileId: string;
  senderRole: string;
  senderKind: string;
};

export type ProposedAuthor = {
  fromUid: string;
  senderAuthUid: string;
  senderProfileId: string;
  senderRole: RepairAuthorRole;
  senderKind: RepairAuthorRole;
};

export type OperatorMark = {
  messageId: string;
  authorRole: RepairAuthorRole;
  source: "operator";
  selectedAnonId?: string;
  collectionPath?: string;
};

export type ApplySelection = {
  messageId: string;
  desiredRole: RepairAuthorRole;
  expectedBeforeHash: string;
  updateTime: string;
  selectedAnonId?: string;
  collectionName?: "mensajes" | "messages";
  collectionPath?: string;
};

export type RepairMessageInput = {
  id: string;
  text?: string;
  createdAt?: string;
  createTime?: string;
  updateTime?: string;
  collectionName?: "mensajes" | "messages";
  collectionPath?: string;
  persisted: PersistedAuthor;
};

export function detectOwnerFieldConflicts(input: {
  ownerProfileIdFromUsername?: string;
  receptorUid?: string;
  anonOwnerUid?: string;
  targetUid?: string;
}) {
  const lookedUp = String(input.ownerProfileIdFromUsername || "").trim();
  const candidates = [
    String(input.receptorUid || "").trim(),
    String(input.anonOwnerUid || "").trim(),
    String(input.targetUid || "").trim(),
  ].filter(Boolean);
  const unique = [...new Set(candidates)];
  if (unique.length > 1) {
    return { ok: false as const, error: "owner_identity_ambiguous" };
  }
  if (lookedUp && unique.length === 1 && lookedUp !== unique[0]) {
    return { ok: false as const, error: "owner_identity_ambiguous" };
  }
  return { ok: true as const, error: "" };
}

export function resolveThreadIdentities(input: {
  chatId: string;
  ownerProfileIdFromUsername?: string;
  receptorUid?: string;
  anonOwnerUid?: string;
  targetUid?: string;
}): ThreadIdentities {
  const chatId = String(input.chatId || "").trim();
  const slug = usernameHintFromAnonChatId(chatId);
  const parsed = isProfileAnonChatId(chatId) ? parseProfileAnonChatId(chatId) : null;
  const threadAnonId =
    parsed && parsed.senderId.startsWith("anon_") ? parsed.senderId : "";
  const lookedUp = String(input.ownerProfileIdFromUsername || "").trim();
  const receptor = String(input.receptorUid || "").trim();
  const anonOwner = String(input.anonOwnerUid || "").trim();
  const targetUid = String(input.targetUid || "").trim();
  const conflict = detectOwnerFieldConflicts({
    ownerProfileIdFromUsername: lookedUp,
    receptorUid: receptor,
    anonOwnerUid: anonOwner,
    targetUid,
  });
  const docOwner = receptor || anonOwner || targetUid;

  let ownerProfileId = "";
  let ownerIdSource: ThreadIdentities["ownerIdSource"] = "missing";
  if (!conflict.ok) {
    ownerProfileId = lookedUp || docOwner;
    ownerIdSource = "ambiguous_mismatch";
  } else if (lookedUp) {
    ownerProfileId = lookedUp;
    ownerIdSource = "username_lookup";
  } else if (docOwner) {
    ownerProfileId = docOwner;
    ownerIdSource = "chat_receptor";
  }

  return {
    chatId,
    chatKind: isProfileAnonChatId(chatId) ? "profileAnon" : "legacy",
    threadAnonId,
    ownerProfileId,
    ownerUsernameSlug: slug,
    ownerIdSource,
  };
}

export function evaluateLiveIdentityOcc(input: {
  chatId: string;
  chatData: Record<string, unknown>;
  chatExists?: boolean;
  ownerProfile: { id: string; username?: string; usernameLower?: string } | null;
  ownerLookupUid?: string;
  expected: {
    ownerProfileId: string;
    ownerUsernameSlug: string;
    threadAnonId: string;
    ownerIdSource: string;
  };
}) {
  if (input.chatExists === false) {
    return { ok: false as const, error: "chat_doc_missing" };
  }
  if (!input.ownerProfile?.id) {
    return { ok: false as const, error: "owner_doc_missing" };
  }
  const lookupUid = String(input.ownerLookupUid || "").trim();
  if (String(input.expected.ownerUsernameSlug || "").trim()) {
    if (!lookupUid) {
      return { ok: false as const, error: "username_lookup_missing" };
    }
    if (lookupUid !== String(input.expected.ownerProfileId || "") || lookupUid !== input.ownerProfile.id) {
      return { ok: false as const, error: "identity_changed" };
    }
  }
  const live = resolveThreadIdentities({
    chatId: input.chatId,
    ownerProfileIdFromUsername: lookupUid || String(input.ownerProfile.id),
    receptorUid: String(input.chatData.receptorUid || ""),
    anonOwnerUid: String(input.chatData.anonOwnerUid || ""),
    targetUid: String(input.chatData.targetUid || ""),
  });
  const profileSlug = String(
    input.ownerProfile?.usernameLower || input.ownerProfile?.username || "",
  )
    .trim()
    .toLowerCase();
  const expectedSlug = String(input.expected.ownerUsernameSlug || "").trim().toLowerCase();
  if (expectedSlug && profileSlug && profileSlug !== expectedSlug) {
    return { ok: false as const, error: "identity_changed" };
  }
  if (live.ownerIdSource === "ambiguous_mismatch" || live.ownerProfileId !== input.expected.ownerProfileId) {
    return { ok: false as const, error: live.ownerIdSource === "ambiguous_mismatch" ? "owner_identity_ambiguous" : "identity_changed" };
  }
  if (live.threadAnonId !== input.expected.threadAnonId) {
    return { ok: false as const, error: "identity_changed" };
  }
  return { ok: true as const, error: "" };
}

export function evaluateThreadIdentity(identities: ThreadIdentities) {
  if (identities.chatKind !== "profileAnon") {
    return { ok: false as const, error: "chat_not_profile_anon" };
  }
  if (!identities.threadAnonId.startsWith("anon_")) {
    return { ok: false as const, error: "thread_anon_not_deterministic" };
  }
  if (identities.ownerIdSource === "ambiguous_mismatch") {
    return { ok: false as const, error: "owner_identity_ambiguous" };
  }
  if (identities.ownerIdSource !== "username_lookup" || !identities.ownerProfileId) {
    return { ok: false as const, error: "owner_identity_not_deterministic" };
  }
  return { ok: true as const, error: "" };
}

/** Convert operator "mío / de la otra persona" into an absolute author role. */
export function markFromPerspective(
  perspective: RepairPerspective,
  messageId: string,
  mine: boolean,
  extras?: { selectedAnonId?: string; collectionPath?: string },
): OperatorMark {
  const ownerIsAuthor =
    perspective === "owner" ? mine === true : mine === false;
  return {
    messageId: String(messageId || "").trim(),
    authorRole: ownerIsAuthor ? "profile" : "anon",
    source: "operator",
    selectedAnonId: extras?.selectedAnonId,
    collectionPath: extras?.collectionPath,
  };
}

export function anonRepairCandidates(
  identities: ThreadIdentities,
  persisted?: PersistedAuthor,
) {
  const out: string[] = [];
  const thread = String(identities.threadAnonId || "").trim();
  const evidence = String(persisted?.fromUid || "").trim();
  if (thread.startsWith("anon_")) out.push(thread);
  if (evidence.startsWith("anon_") && evidence !== thread) out.push(evidence);
  return out;
}

export function resolveAnonRepairFromUid(
  persisted?: PersistedAuthor,
  selectedAnonId?: string,
  identities?: ThreadIdentities,
) {
  const selected = String(selectedAnonId || "").trim();
  const evidence = String(persisted?.fromUid || "").trim();
  const candidates = identities
    ? anonRepairCandidates(identities, persisted)
    : [evidence].filter((id) => id.startsWith("anon_"));
  if (selected) {
    if (!selected.startsWith("anon_") || !candidates.includes(selected)) {
      return { ok: false as const, fromUid: "", error: "anon_id_not_in_evidence" };
    }
    return { ok: true as const, fromUid: selected, error: "" };
  }
  if (evidence.startsWith("anon_")) return { ok: true as const, fromUid: evidence, error: "" };
  return { ok: false as const, fromUid: "", error: "anon_identity_ambiguous" };
}

export function proposeCanonicalAuthor(
  identities: ThreadIdentities,
  authorRole: RepairAuthorRole,
  persisted?: PersistedAuthor,
  selectedAnonId?: string,
): { ok: true; author: ProposedAuthor } | { ok: false; error: string } {
  if (authorRole === "profile") {
    if (!identities.ownerProfileId) {
      return { ok: false, error: "owner_profile_id_missing" };
    }
    return {
      ok: true,
      author: {
        fromUid: profileReplyAuthorId(identities.ownerProfileId),
        senderAuthUid: identities.ownerProfileId,
        senderProfileId: identities.ownerProfileId,
        senderRole: "profile",
        senderKind: "profile",
      },
    };
  }

  const resolved = resolveAnonRepairFromUid(persisted, selectedAnonId, identities);
  if (!resolved.ok) return { ok: false, error: resolved.error };

  return {
    ok: true,
    author: {
      fromUid: resolved.fromUid,
      senderAuthUid: String(persisted?.senderAuthUid || "").trim(),
      senderProfileId: "",
      senderRole: "anon",
      senderKind: "anon",
    },
  };
}

export function persistedAuthorFromDoc(data: Record<string, unknown>): PersistedAuthor {
  return {
    fromUid: String(data.fromUid || data.ownerId || data.senderUid || "").trim(),
    senderAuthUid: String(data.senderAuthUid || "").trim(),
    senderProfileId: String(data.senderProfileId || data.profileUid || "").trim(),
    senderRole: String(data.senderRole || "").trim(),
    senderKind: String(data.senderKind || "").trim(),
  };
}

export function expectedBeforeHash(author: PersistedAuthor | ProposedAuthor) {
  return [
    "v1",
    author.fromUid || "",
    author.senderAuthUid || "",
    author.senderProfileId || "",
    author.senderRole || "",
    author.senderKind || "",
  ].join("|");
}

export function authorPatchFields(author: ProposedAuthor | PersistedAuthor) {
  return {
    fromUid: author.fromUid,
    ownerId: author.fromUid,
    senderAuthUid: author.senderAuthUid || "",
    senderProfileId: author.senderProfileId || "",
    senderRole: author.senderRole || "",
    senderKind: author.senderKind || author.senderRole || "",
    profileUid: author.senderRole === "profile" ? author.senderProfileId || "" : "",
  };
}

export function mineForPerspective(
  identities: ThreadIdentities,
  author: Pick<PersistedAuthor, "fromUid" | "senderAuthUid" | "senderRole">,
  perspective: RepairPerspective,
) {
  return resolveMineFromCanonicalSender({
    senderAuthUid: author.senderAuthUid,
    senderRole: author.senderRole,
    fromUid: author.fromUid,
    viewerUid: perspective === "owner" ? identities.ownerProfileId : "",
    isOwnerViewing: perspective === "owner",
    threadAnonId: identities.threadAnonId,
    identityReady: true,
  });
}

export function triplesEqual(
  a: PersistedAuthor | ProposedAuthor,
  b: ProposedAuthor | PersistedAuthor,
) {
  return expectedBeforeHash(a) === expectedBeforeHash(b);
}

export type RepairRowPreview = {
  messageId: string;
  messageIdShort: string;
  createdAt: string;
  updateTime: string;
  collectionName?: "mensajes" | "messages";
  collectionPath?: string;
  expectedBeforeHash: string;
  textPreview: string;
  selected: boolean;
  persisted: PersistedAuthor;
  proposed: ProposedAuthor | null;
  error: string;
  noop: boolean;
  before: { ownerMine: boolean; visitorMine: boolean };
  after: { ownerMine: boolean; visitorMine: boolean } | null;
  complementary: boolean;
};

export type RepairPlan = {
  applyAllowed: boolean;
  chatBlocked: boolean;
  blockReason: string;
  identities: ThreadIdentities;
  selectedCount: number;
  writeCount: number;
  noopCount: number;
  errorCount: number;
  complementaryFailures: number;
  rows: RepairRowPreview[];
  inbox: {
    lastMessageId: string;
    lastMessageSenderBefore: string;
    lastMessageSenderAfter: string;
  };
};

function shortId(id: string) {
  const raw = String(id || "").trim();
  return raw ? raw.slice(-8) : "";
}

function clipText(text: string) {
  const clean = String(text || "").replace(/\s+/g, " ").trim();
  if (!clean) return "";
  return clean.length <= 80 ? clean : `${clean.slice(0, 80)}…`;
}

export function buildRepairPlan(input: {
  identities: ThreadIdentities;
  messages: RepairMessageInput[];
  marks: OperatorMark[];
  includeText?: boolean;
  chat?: {
    latestMessageId?: string;
    lastMessageSender?: string;
    latestSenderKind?: string;
    latestSenderAnonSessionId?: string;
  };
}): RepairPlan {
  const identity = evaluateThreadIdentity(input.identities);
  const markByKey = new Map(
    input.marks
      .filter((mark) => mark.messageId && (mark.authorRole === "profile" || mark.authorRole === "anon"))
      .map((mark) => [
        String(mark.collectionPath || "").trim() || mark.messageId,
        mark,
      ]),
  );

  const rows: RepairRowPreview[] = input.messages.map((message) => {
    const persisted = message.persisted;
    const before = {
      ownerMine: mineForPerspective(input.identities, persisted, "owner"),
      visitorMine: mineForPerspective(input.identities, persisted, "visitor"),
    };
    const mark =
      markByKey.get(String(message.collectionPath || "").trim()) ||
      markByKey.get(message.id);
    const base = {
      messageId: message.id,
      messageIdShort: shortId(message.id),
      createdAt: String(message.createdAt || ""),
      updateTime: String(message.updateTime || ""),
      collectionName: message.collectionName,
      collectionPath: message.collectionPath,
      expectedBeforeHash: expectedBeforeHash(persisted),
      textPreview: input.includeText ? clipText(message.text || "") : "",
      persisted,
      before,
    };
    if (!mark) {
      return {
        ...base,
        selected: false,
        proposed: null,
        error: "",
        noop: true,
        after: null,
        complementary:
          before.ownerMine !== before.visitorMine ||
          (!before.ownerMine && !before.visitorMine),
      };
    }

    const proposedResult = proposeCanonicalAuthor(
      input.identities,
      mark.authorRole,
      persisted,
      mark.selectedAnonId,
    );
    if (!proposedResult.ok) {
      return {
        ...base,
        selected: true,
        proposed: null,
        error: proposedResult.error,
        noop: false,
        after: null,
        complementary: false,
      };
    }

    const after = {
      ownerMine: mineForPerspective(input.identities, proposedResult.author, "owner"),
      visitorMine: mineForPerspective(input.identities, proposedResult.author, "visitor"),
    };
    const complementary = after.ownerMine !== after.visitorMine;
    const noop = triplesEqual(persisted, proposedResult.author);

    return {
      ...base,
      selected: true,
      proposed: proposedResult.author,
      error: complementary ? "" : "not_complementary_both_perspectives",
      noop,
      after,
      complementary,
    };
  });

  const selected = rows.filter((row) => row.selected);
  const last = rows[rows.length - 1];
  const lastAfterAuthor = last?.proposed || last?.persisted;
  if (
    last &&
    last.selected &&
    last.noop &&
    !last.error &&
    input.chat &&
    String(input.chat.latestMessageId || "") === last.messageId
  ) {
    const kind = String(lastAfterAuthor?.senderKind || lastAfterAuthor?.senderRole || "");
    const fromUid = String(lastAfterAuthor?.fromUid || "");
    const wantAnon = kind === "anon" && fromUid.startsWith("anon_") ? fromUid : "";
    if (
      String(input.chat.lastMessageSender || "") !== fromUid ||
      String(input.chat.latestSenderKind || "") !== kind ||
      String(input.chat.latestSenderAnonSessionId || "") !== wantAnon
    ) {
      last.error = "summary_inconsistent";
    }
  }
  const writeCount = selected.filter((row) => row.proposed && !row.noop && !row.error).length;

  return {
    applyAllowed: identity.ok && writeCount > 0 && selected.every((row) => !row.error),
    chatBlocked: !identity.ok,
    blockReason: identity.error,
    identities: input.identities,
    selectedCount: selected.length,
    writeCount,
    noopCount: selected.filter((row) => row.noop && !row.error).length,
    errorCount: rows.filter((row) => row.error).length,
    complementaryFailures: selected.filter((row) => !row.complementary).length,
    rows,
    inbox: {
      lastMessageId: last?.messageId || "",
      lastMessageSenderBefore: last?.persisted.fromUid || "",
      lastMessageSenderAfter: lastAfterAuthor?.fromUid || "",
    },
  };
}

export type ClassifiedApplyRow = {
  messageId: string;
  status: RepairRowStatus;
  reason: string;
  before?: PersistedAuthor;
  after?: ProposedAuthor;
  updateTime?: string;
  collectionName?: "mensajes" | "messages";
  collectionPath?: string;
};

function resolveLiveMessage(
  live: RepairMessageInput[],
  selection: { messageId: string; collectionName?: string; collectionPath?: string },
) {
  const path = String(selection.collectionPath || "").trim();
  if (path) {
    const hit = live.find((row) => row.collectionPath === path);
    return hit ? { live: hit, error: "" } : { live: null, error: "message_missing" };
  }
  const name = String(selection.collectionName || "").trim();
  const matches = live.filter(
    (row) =>
      row.id === selection.messageId &&
      (!name || row.collectionName === name),
  );
  if (matches.length > 1) return { live: null, error: "ambiguous_collection" };
  if (matches.length === 0) return { live: null, error: "message_missing" };
  return { live: matches[0], error: "" };
}

export function classifyApplySelections(input: {
  identities: ThreadIdentities;
  live: RepairMessageInput[];
  selections: ApplySelection[];
  confirmWriteCount?: number;
  reason?: string;
}): {
  blocked: boolean;
  blockReason: string;
  applied: ClassifiedApplyRow[];
  noop: ClassifiedApplyRow[];
  rejected: ClassifiedApplyRow[];
} {
  const identity = evaluateThreadIdentity(input.identities);
  if (!identity.ok) {
    return {
      blocked: true,
      blockReason: identity.error,
      applied: [],
      noop: [],
      rejected: input.selections.map((selection) => ({
        messageId: selection.messageId,
        status: "rejected",
        reason: identity.error,
      })),
    };
  }

  const reason = String(input.reason || "").trim();
  if (reason.length < 8) {
    return {
      blocked: true,
      blockReason: "reason_required",
      applied: [],
      noop: [],
      rejected: input.selections.map((selection) => ({
        messageId: selection.messageId,
        status: "rejected",
        reason: "reason_required",
      })),
    };
  }

  const applied: ClassifiedApplyRow[] = [];
  const noop: ClassifiedApplyRow[] = [];
  const rejected: ClassifiedApplyRow[] = [];

  for (const selection of input.selections) {
    if (selection.desiredRole !== "profile" && selection.desiredRole !== "anon") {
      rejected.push({
        messageId: selection.messageId,
        status: "rejected",
        reason: "invalid_desired_role",
      });
      continue;
    }
    if (!selection.expectedBeforeHash || !selection.updateTime) {
      rejected.push({
        messageId: selection.messageId,
        status: "rejected",
        reason: "missing_occ_fields",
      });
      continue;
    }
    const resolved = resolveLiveMessage(input.live, selection);
    if (!resolved.live) {
      rejected.push({
        messageId: selection.messageId,
        status: "rejected",
        reason: resolved.error,
      });
      continue;
    }
    const live = resolved.live;
    const liveHash = expectedBeforeHash(live.persisted);
    if (liveHash !== selection.expectedBeforeHash) {
      rejected.push({
        messageId: selection.messageId,
        status: "rejected",
        reason: "stale_or_tampered_hash",
      });
      continue;
    }
    if (String(live.updateTime || "") !== selection.updateTime) {
      rejected.push({
        messageId: selection.messageId,
        status: "rejected",
        reason: "stale_update_time",
      });
      continue;
    }
    const proposed = proposeCanonicalAuthor(
      input.identities,
      selection.desiredRole,
      live.persisted,
      selection.selectedAnonId,
    );
    if (!proposed.ok) {
      rejected.push({
        messageId: selection.messageId,
        status: "rejected",
        reason: proposed.error,
      });
      continue;
    }
    const afterMine = {
      owner: mineForPerspective(input.identities, proposed.author, "owner"),
      visitor: mineForPerspective(input.identities, proposed.author, "visitor"),
    };
    if (afterMine.owner === afterMine.visitor) {
      rejected.push({
        messageId: selection.messageId,
        status: "rejected",
        reason: "not_complementary_both_perspectives",
      });
      continue;
    }
    if (triplesEqual(live.persisted, proposed.author)) {
      noop.push({
        messageId: selection.messageId,
        status: "noop",
        reason: "already_canonical",
        before: live.persisted,
        after: proposed.author,
        updateTime: live.updateTime,
        collectionName: live.collectionName,
        collectionPath: live.collectionPath,
      });
      continue;
    }
    applied.push({
      messageId: selection.messageId,
      status: "applied",
      reason: "ready",
      before: live.persisted,
      after: proposed.author,
      updateTime: live.updateTime,
      collectionName: live.collectionName,
      collectionPath: live.collectionPath,
    });
  }

  if (rejected.length > 0) {
    return {
      blocked: true,
      blockReason: "mixed_invalid_request",
      applied: [],
      noop: [],
      rejected: input.selections.map((selection) => ({
        messageId: selection.messageId,
        status: "rejected" as const,
        reason:
          rejected.find(
            (row) =>
              row.messageId === selection.messageId &&
              (!selection.collectionPath || row.collectionPath === selection.collectionPath),
          )?.reason || "mixed_invalid_request",
      })),
    };
  }

  if (applied.length > HISTORICAL_REPAIR_BATCH_LIMIT) {
    return {
      blocked: true,
      blockReason: "batch_limit",
      applied: [],
      noop,
      rejected: [
        ...rejected,
        ...applied.map((row) => ({
          ...row,
          status: "rejected" as const,
          reason: "batch_limit",
        })),
      ],
    };
  }

  if (
    input.confirmWriteCount !== undefined &&
    input.confirmWriteCount !== applied.length
  ) {
    return {
      blocked: true,
      blockReason: "confirm_write_count_mismatch",
      applied: [],
      noop,
      rejected: [
        ...rejected,
        ...applied.map((row) => ({
          ...row,
          status: "rejected" as const,
          reason: "confirm_write_count_mismatch",
        })),
      ],
    };
  }

  return { blocked: false, blockReason: "", applied, noop, rejected };
}

export function classifyRollbackRows(input: {
  backupRows: Array<{
    messageId: string;
    before: PersistedAuthor;
    after: ProposedAuthor;
    collectionName?: string;
    collectionPath?: string;
  }>;
  live: RepairMessageInput[];
}) {
  const restore: ClassifiedApplyRow[] = [];
  const noop: ClassifiedApplyRow[] = [];
  const rejected: ClassifiedApplyRow[] = [];

  for (const row of input.backupRows) {
    const resolved = resolveLiveMessage(input.live, row);
    const live = resolved.live;
    if (!live) {
      rejected.push({
        messageId: row.messageId,
        status: "rejected",
        reason: resolved.error || "message_missing",
      });
      continue;
    }
    const liveHash = expectedBeforeHash(live.persisted);
    if (liveHash === expectedBeforeHash(row.before)) {
      noop.push({
        messageId: row.messageId,
        status: "noop",
        reason: "already_before",
        before: row.before,
        after: row.after,
        updateTime: live.updateTime,
        collectionName: live.collectionName,
        collectionPath: live.collectionPath || row.collectionPath,
      });
      continue;
    }
    if (liveHash !== expectedBeforeHash(row.after)) {
      rejected.push({
        messageId: row.messageId,
        status: "rejected",
        reason: "current_not_applied_after",
        before: live.persisted,
      });
      continue;
    }
    restore.push({
      messageId: row.messageId,
      status: "applied",
      reason: "ready",
      before: row.before,
      after: row.after,
      updateTime: live.updateTime,
      collectionName: live.collectionName,
      collectionPath: live.collectionPath || row.collectionPath,
    });
  }

  return { restore, noop, rejected };
}

export function exportRepairPlanWithoutPii(plan: RepairPlan) {
  return {
    version: 2,
    kind: "historical-authorship-repair-plan",
    applyAllowed: plan.applyAllowed,
    chatBlocked: plan.chatBlocked,
    blockReason: plan.blockReason,
    chatKind: plan.identities.chatKind,
    ownerIdSource: plan.identities.ownerIdSource,
    ownerPresent: Boolean(plan.identities.ownerProfileId),
    selectedCount: plan.selectedCount,
    writeCount: plan.writeCount,
    noopCount: plan.noopCount,
    errorCount: plan.errorCount,
    complementaryFailures: plan.complementaryFailures,
    inbox: {
      lastFromShapeBefore: shapeOf(plan.inbox.lastMessageSenderBefore),
      lastFromShapeAfter: shapeOf(plan.inbox.lastMessageSenderAfter),
    },
    rows: plan.rows.map((row, rowIndex) => ({
      rowIndex,
      selected: row.selected,
      persistedShape: shapeOf(row.persisted.fromUid),
      persistedRole: row.persisted.senderRole || "",
      proposedRole: row.proposed?.senderRole || "",
      proposedShape: row.proposed ? shapeOf(row.proposed.fromUid) : "",
      updateTimePresent: Boolean(row.updateTime),
      noop: row.noop,
      error: row.error,
      before: row.before,
      after: row.after,
      complementary: row.complementary,
    })),
  };
}

export function shapeOf(fromUid: string) {
  const from = String(fromUid || "").trim();
  if (!from) return "empty";
  if (from.startsWith("profile_")) return "profile";
  if (from.startsWith("anon_")) return "anon";
  if (from.length >= 20 && !from.includes("_")) return "uid";
  return "other";
}
