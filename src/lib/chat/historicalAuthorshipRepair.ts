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
import { resolveMineFromCanonicalSender } from "@/lib/chat/canonicalSender";
import { profileReplyAuthorId } from "@/lib/chat/profileAnonMessageAuthor";

export const HISTORICAL_REPAIR_APPLY_FROZEN = false;
export const HISTORICAL_REPAIR_BATCH_LIMIT = 25;

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
};

export type ApplySelection = {
  messageId: string;
  desiredRole: RepairAuthorRole;
  expectedBeforeHash: string;
  updateTime: string;
};

export type RepairMessageInput = {
  id: string;
  text?: string;
  createdAt?: string;
  updateTime?: string;
  persisted: PersistedAuthor;
};

export function resolveThreadIdentities(input: {
  chatId: string;
  ownerProfileIdFromUsername?: string;
  receptorUid?: string;
  anonOwnerUid?: string;
}): ThreadIdentities {
  const chatId = String(input.chatId || "").trim();
  const slug = usernameHintFromAnonChatId(chatId);
  const parsed = isProfileAnonChatId(chatId) ? parseProfileAnonChatId(chatId) : null;
  const threadAnonId =
    parsed && parsed.senderId.startsWith("anon_") ? parsed.senderId : "";
  const lookedUp = String(input.ownerProfileIdFromUsername || "").trim();
  const receptor = String(input.receptorUid || "").trim();
  const anonOwner = String(input.anonOwnerUid || "").trim();
  const docOwner = receptor || anonOwner;

  let ownerProfileId = "";
  let ownerIdSource: ThreadIdentities["ownerIdSource"] = "missing";
  if (lookedUp && docOwner && lookedUp !== docOwner) {
    ownerProfileId = lookedUp;
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
): OperatorMark {
  const ownerIsAuthor =
    perspective === "owner" ? mine === true : mine === false;
  return {
    messageId: String(messageId || "").trim(),
    authorRole: ownerIsAuthor ? "profile" : "anon",
    source: "operator",
  };
}

export function proposeCanonicalAuthor(
  identities: ThreadIdentities,
  authorRole: RepairAuthorRole,
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

  if (!identities.threadAnonId.startsWith("anon_")) {
    return { ok: false, error: "thread_anon_missing" };
  }

  return {
    ok: true,
    author: {
      fromUid: identities.threadAnonId,
      senderAuthUid: "",
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
}): RepairPlan {
  const identity = evaluateThreadIdentity(input.identities);
  const markById = new Map(
    input.marks
      .filter((mark) => mark.messageId && (mark.authorRole === "profile" || mark.authorRole === "anon"))
      .map((mark) => [mark.messageId, mark]),
  );

  const rows: RepairRowPreview[] = input.messages.map((message) => {
    const persisted = message.persisted;
    const before = {
      ownerMine: mineForPerspective(input.identities, persisted, "owner"),
      visitorMine: mineForPerspective(input.identities, persisted, "visitor"),
    };
    const mark = markById.get(message.id);
    const base = {
      messageId: message.id,
      messageIdShort: shortId(message.id),
      createdAt: String(message.createdAt || ""),
      updateTime: String(message.updateTime || ""),
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

    const proposedResult = proposeCanonicalAuthor(input.identities, mark.authorRole);
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
};

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

  const liveById = new Map(input.live.map((row) => [row.id, row]));
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
    const live = liveById.get(selection.messageId);
    if (!live) {
      rejected.push({
        messageId: selection.messageId,
        status: "rejected",
        reason: "message_missing",
      });
      continue;
    }
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
    const proposed = proposeCanonicalAuthor(input.identities, selection.desiredRole);
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
    });
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
  backupRows: Array<{ messageId: string; before: PersistedAuthor; after: ProposedAuthor }>;
  live: RepairMessageInput[];
}) {
  const liveById = new Map(input.live.map((row) => [row.id, row]));
  const restore: ClassifiedApplyRow[] = [];
  const noop: ClassifiedApplyRow[] = [];
  const rejected: ClassifiedApplyRow[] = [];

  for (const row of input.backupRows) {
    const live = liveById.get(row.messageId);
    if (!live) {
      rejected.push({ messageId: row.messageId, status: "rejected", reason: "message_missing" });
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
    chatIdSuffix: shortId(plan.identities.chatId),
    threadAnonSuffix: shortId(plan.identities.threadAnonId),
    ownerIdSource: plan.identities.ownerIdSource,
    ownerPresent: Boolean(plan.identities.ownerProfileId),
    selectedCount: plan.selectedCount,
    writeCount: plan.writeCount,
    noopCount: plan.noopCount,
    errorCount: plan.errorCount,
    complementaryFailures: plan.complementaryFailures,
    inbox: {
      lastMessageSuffix: shortId(plan.inbox.lastMessageId),
      lastFromShapeBefore: shapeOf(plan.inbox.lastMessageSenderBefore),
      lastFromShapeAfter: shapeOf(plan.inbox.lastMessageSenderAfter),
    },
    rows: plan.rows.map((row) => ({
      messageIdShort: row.messageIdShort,
      selected: row.selected,
      persistedShape: shapeOf(row.persisted.fromUid),
      persistedRole: row.persisted.senderRole || "",
      proposedRole: row.proposed?.senderRole || "",
      proposedShape: row.proposed ? shapeOf(row.proposed.fromUid) : "",
      expectedBeforeHash: row.expectedBeforeHash,
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
