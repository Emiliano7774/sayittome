/**
 * Assisted historical authorship repair planner.
 * Does not touch 107cae5 new-message persist/hydrate.
 * APPLY is frozen until ChatGPT audit — no Firestore writes from this module.
 */
import {
  isProfileAnonChatId,
  parseProfileAnonChatId,
  usernameHintFromAnonChatId,
} from "@/lib/chat/anonChatId";
import { resolveMineFromCanonicalSender } from "@/lib/chat/canonicalSender";
import { profileReplyAuthorId } from "@/lib/chat/profileAnonMessageAuthor";

export const HISTORICAL_REPAIR_APPLY_FROZEN = true;
export const HISTORICAL_REPAIR_FREEZE_REASON =
  "APPLY_FROZEN_PENDING_CHATGPT_AUDIT";

export class HistoricalRepairFrozenError extends Error {
  readonly code = HISTORICAL_REPAIR_FREEZE_REASON;
  constructor() {
    super(HISTORICAL_REPAIR_FREEZE_REASON);
    this.name = "HistoricalRepairFrozenError";
  }
}

export function assertHistoricalRepairApplyAllowed() {
  if (HISTORICAL_REPAIR_APPLY_FROZEN) {
    throw new HistoricalRepairFrozenError();
  }
}

export type RepairPerspective = "owner" | "visitor";
export type RepairAuthorRole = "profile" | "anon";

export type ThreadIdentities = {
  chatId: string;
  chatKind: "profileAnon" | "legacy";
  threadAnonId: string;
  ownerProfileId: string;
  ownerUsernameSlug: string;
  ownerIdSource: "username_lookup" | "chat_receptor" | "missing";
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

export type RepairMessageInput = {
  id: string;
  text?: string;
  createdAt?: string;
  persisted: PersistedAuthor;
};

export function assertApplyAllowed() {
  assertHistoricalRepairApplyAllowed();
}

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

  let ownerProfileId = "";
  let ownerIdSource: ThreadIdentities["ownerIdSource"] = "missing";
  if (lookedUp) {
    ownerProfileId = lookedUp;
    ownerIdSource = "username_lookup";
  } else if (receptor) {
    ownerProfileId = receptor;
    ownerIdSource = "chat_receptor";
  } else if (anonOwner) {
    ownerProfileId = anonOwner;
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

function triplesEqual(a: PersistedAuthor | ProposedAuthor, b: ProposedAuthor) {
  return (
    a.fromUid === b.fromUid &&
    a.senderAuthUid === b.senderAuthUid &&
    a.senderProfileId === b.senderProfileId &&
    a.senderRole === b.senderRole &&
    (a.senderKind || "") === b.senderKind
  );
}

export type RepairRowPreview = {
  messageId: string;
  messageIdShort: string;
  createdAt: string;
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
  frozen: true;
  applyAllowed: false;
  freezeReason: typeof HISTORICAL_REPAIR_FREEZE_REASON;
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
    if (!mark) {
      return {
        messageId: message.id,
        messageIdShort: shortId(message.id),
        createdAt: String(message.createdAt || ""),
        textPreview: input.includeText ? clipText(message.text || "") : "",
        selected: false,
        persisted,
        proposed: null,
        error: "",
        noop: true,
        before,
        after: null,
        complementary: before.ownerMine !== before.visitorMine || (!before.ownerMine && !before.visitorMine),
      };
    }

    const proposedResult = proposeCanonicalAuthor(input.identities, mark.authorRole);
    if (!proposedResult.ok) {
      return {
        messageId: message.id,
        messageIdShort: shortId(message.id),
        createdAt: String(message.createdAt || ""),
        textPreview: input.includeText ? clipText(message.text || "") : "",
        selected: true,
        persisted,
        proposed: null,
        error: proposedResult.error,
        noop: false,
        before,
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
      messageId: message.id,
      messageIdShort: shortId(message.id),
      createdAt: String(message.createdAt || ""),
      textPreview: input.includeText ? clipText(message.text || "") : "",
      selected: true,
      persisted,
      proposed: proposedResult.author,
      error: complementary ? "" : "not_complementary_both_perspectives",
      noop,
      before,
      after,
      complementary,
    };
  });

  const selected = rows.filter((row) => row.selected);
  const last = rows[rows.length - 1];
  const lastAfterAuthor = last?.proposed || last?.persisted;

  return {
    frozen: true,
    applyAllowed: false,
    freezeReason: HISTORICAL_REPAIR_FREEZE_REASON,
    identities: input.identities,
    selectedCount: selected.length,
    writeCount: selected.filter((row) => row.proposed && !row.noop && !row.error).length,
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

export function exportRepairPlanWithoutPii(plan: RepairPlan) {
  return {
    version: 1,
    kind: "historical-authorship-repair-dry-run",
    frozen: plan.frozen,
    applyAllowed: plan.applyAllowed,
    freezeReason: plan.freezeReason,
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
      noop: row.noop,
      error: row.error,
      before: row.before,
      after: row.after,
      complementary: row.complementary,
    })),
  };
}

export function buildBackupSnapshot(plan: RepairPlan) {
  return {
    version: 1,
    kind: "historical-authorship-repair-backup",
    createdAt: new Date().toISOString(),
    chatId: plan.identities.chatId,
    rows: plan.rows
      .filter((row) => row.selected && row.proposed && !row.noop && !row.error)
      .map((row) => ({
        messageId: row.messageId,
        before: row.persisted,
        after: row.proposed,
      })),
  };
}

export function buildRollbackPatches(backup: ReturnType<typeof buildBackupSnapshot>) {
  return backup.rows.map((row) => ({
    messageId: row.messageId,
    restore: row.before,
  }));
}

export function shapeOf(fromUid: string) {
  const from = String(fromUid || "").trim();
  if (!from) return "empty";
  if (from.startsWith("profile_")) return "profile";
  if (from.startsWith("anon_")) return "anon";
  if (from.length >= 20 && !from.includes("_")) return "uid";
  return "other";
}
