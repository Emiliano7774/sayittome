/**
 * Exportable authorship incident capture. No message text, names, or full UIDs.
 * Enable with ?qaDebug=1 or localStorage sayittome_qa_debug=1
 */
import { BUILD_SHA } from "@/lib/perf/buildMarker";
import { isProfileAnonChatId, parseProfileAnonChatId } from "@/lib/chat/anonChatId";
import { isRealDeviceQaDebugEnabled } from "@/lib/qa/realDeviceQaDebug";

const STORAGE_KEY = "sayittome:authorship-incident:v1";
const MAX_ROWS = 40;

export type AuthorshipIncidentRow = {
  messageId: string;
  path: string;
  fromShape: "profile" | "anon" | "uid" | "empty" | "other";
  fromUidSuffix: string;
  senderAuthPresent: boolean;
  senderProfilePresent: boolean;
  senderRole: string;
  senderKind: string;
  fromMatchesThreadAnon: boolean;
  fromMatchesViewerProfile: boolean;
  isMine: boolean;
  mineReason: string;
  source: "cache" | "server" | "optimistic" | "unknown";
};

export type AuthorshipIncidentReport = {
  t: number;
  buildSha: string;
  host: string;
  hrefPath: string;
  renderer: "ProfileAnonChat" | "LegacyChat";
  chatKind: "profileAnon" | "legacy";
  chatIdRedacted: string;
  collection: string;
  authReady: boolean;
  authAnonymous: boolean;
  authUidPresent: boolean;
  viewerSlugPresent: boolean;
  profileUidPresent: boolean;
  identityReady: boolean;
  isOwnerViewing: boolean;
  participantsShapes: string[];
  rows: AuthorshipIncidentRow[];
};

function shapeOf(value: string): AuthorshipIncidentRow["fromShape"] {
  const from = String(value || "").trim();
  if (!from) return "empty";
  if (from.startsWith("profile_")) return "profile";
  if (from.startsWith("anon_")) return "anon";
  if (from.length >= 20 && !from.includes("_")) return "uid";
  return "other";
}

function suffixOf(value: string) {
  const raw = String(value || "").trim();
  if (!raw) return "";
  return raw.slice(-8);
}

export function redactChatId(chatId: string) {
  const id = String(chatId || "").trim();
  if (!isProfileAnonChatId(id)) {
    return id ? `legacy:${suffixOf(id)}` : "";
  }
  const parsed = parseProfileAnonChatId(id);
  const visitor = parsed.senderId.startsWith("anon_")
    ? `anon_${suffixOf(parsed.senderId)}`
    : `id_${suffixOf(parsed.senderId)}`;
  return `${visitor}__anon_to__<redacted>`;
}

export function explainMineDecision(input: {
  from: string;
  senderAuthUid?: string;
  senderRole?: string;
  senderKind?: string;
  ownerUid?: string;
  isOwnerViewing: boolean;
  identityReady: boolean;
  threadAnonId: string;
}): string {
  const from = String(input.from || "").trim();
  const authUid = String(input.ownerUid || "").trim();
  const senderAuth = String(input.senderAuthUid || "").trim();
  if (authUid && senderAuth && senderAuth === authUid) return "senderAuthUid==viewer";
  if (authUid && (from === authUid || from === `profile_${authUid}`)) {
    return "fromUid_owns_viewer_profile";
  }
  if (input.isOwnerViewing) {
    if (from.startsWith("profile_") || input.senderRole === "profile" || input.senderKind === "profile") {
      return "ownerViewing_profile_shaped";
    }
    return "ownerViewing_not_profile_shaped";
  }
  if (from.startsWith("profile_") || input.senderRole === "profile") {
    return "visitor_sees_profile_as_peer";
  }
  if (!input.identityReady) return "identity_not_ready_no_visitor_fallback";
  if (input.threadAnonId && from === input.threadAnonId) return "threadAnon_match";
  return "default_not_mine";
}

export function recordAuthorshipIncident(report: Omit<AuthorshipIncidentReport, "t" | "buildSha" | "host">) {
  if (typeof window === "undefined") return;
  if (!isRealDeviceQaDebugEnabled()) return;

  const full: AuthorshipIncidentReport = {
    ...report,
    t: Date.now(),
    buildSha: BUILD_SHA,
    host: window.location.host,
  };

  try {
    const prev = JSON.parse(window.localStorage.getItem(STORAGE_KEY) || "{}") as {
      reports?: AuthorshipIncidentReport[];
    };
    const reports = [...(prev.reports || []), full].slice(-6);
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ reports }));
    console.info("[qaDebug:authorship-incident]", full);
  } catch {
    // ignore
  }
}

export function readAuthorshipIncidentReports(): AuthorshipIncidentReport[] {
  if (typeof window === "undefined") return [];
  try {
    const prev = JSON.parse(window.localStorage.getItem(STORAGE_KEY) || "{}") as {
      reports?: AuthorshipIncidentReport[];
    };
    return Array.isArray(prev.reports) ? prev.reports : [];
  } catch {
    return [];
  }
}

export function buildAuthorshipIncidentRow(input: {
  chatId: string;
  messageId: string;
  fromUid?: string;
  senderAuthUid?: string;
  senderProfileId?: string;
  senderRole?: string;
  senderKind?: string;
  isMine: boolean;
  mineReason: string;
  threadAnonId?: string;
  viewerUid?: string;
  source?: AuthorshipIncidentRow["source"];
}): AuthorshipIncidentRow {
  const from = String(input.fromUid || "").trim();
  return {
    messageId: String(input.messageId || "").slice(0, 24),
    path: `chats/${redactChatId(input.chatId)}/mensajes/${String(input.messageId || "").slice(0, 24)}`,
    fromShape: shapeOf(from),
    fromUidSuffix: suffixOf(from),
    senderAuthPresent: Boolean(String(input.senderAuthUid || "").trim()),
    senderProfilePresent: Boolean(String(input.senderProfileId || "").trim()),
    senderRole: String(input.senderRole || ""),
    senderKind: String(input.senderKind || ""),
    fromMatchesThreadAnon: Boolean(input.threadAnonId && from === input.threadAnonId),
    fromMatchesViewerProfile: Boolean(
      input.viewerUid && (from === input.viewerUid || from === `profile_${input.viewerUid}`),
    ),
    isMine: input.isMine === true,
    mineReason: input.mineReason,
    source: input.source || "unknown",
  };
}
