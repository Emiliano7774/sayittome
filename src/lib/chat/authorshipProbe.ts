/**
 * Temporary sanitized authorship probe for Android kill/reopen QA.
 * Survives process death via localStorage. No names/text/uids in full.
 * Enable: localStorage sayittome_qa_debug=1 or ?qaDebug=1
 */
import { BUILD_SHA } from "@/lib/perf/buildMarker";
import { isProfileAnonChatId } from "@/lib/chat/anonChatId";
import { isRealDeviceQaDebugEnabled } from "@/lib/qa/realDeviceQaDebug";

const STORAGE_KEY = "sayittome:authorship-probe:v1";
const MAX_ROWS = 24;

export type AuthorshipProbeRow = {
  id: string;
  fromShape: "profile" | "anon" | "uid" | "empty" | "other";
  senderKind: string;
  mine: boolean;
};

export type AuthorshipProbeSnapshot = {
  t: number;
  phase: string;
  buildSha: string;
  host: string;
  hrefPath: string;
  renderer: "ProfileAnonChat" | "LegacyChat";
  authPresent: boolean;
  authAnonymous: boolean;
  viewerSlugPresent: boolean;
  profileUidPresent: boolean;
  isOwnerViewing: boolean;
  identityReady?: boolean;
  authReady?: boolean;
  chatKind: "profileAnon" | "legacy";
  fromCache: boolean | null;
  rows: AuthorshipProbeRow[];
};

function fromShape(fromUid: string): AuthorshipProbeRow["fromShape"] {
  const from = String(fromUid || "").trim();
  if (!from) return "empty";
  if (from.startsWith("profile_")) return "profile";
  if (from.startsWith("anon_")) return "anon";
  if (from.length >= 20 && !from.includes("_")) return "uid";
  return "other";
}

export function recordAuthorshipProbe(input: {
  phase: string;
  renderer: AuthorshipProbeSnapshot["renderer"];
  chatId: string;
  authUid: string;
  authAnonymous: boolean;
  viewerSlug: string;
  profileUid: string;
  isOwnerViewing: boolean;
  identityReady?: boolean;
  authReady?: boolean;
  fromCache?: boolean | null;
  messages: Array<{
    id?: string;
    fromUid?: string;
    senderKind?: string;
    mine?: boolean;
  }>;
}) {
  if (typeof window === "undefined") return;
  if (!isRealDeviceQaDebugEnabled()) return;

  const snap: AuthorshipProbeSnapshot = {
    t: Date.now(),
    phase: input.phase,
    buildSha: BUILD_SHA,
    host: window.location.host,
    hrefPath: window.location.pathname.split("?")[0],
    renderer: input.renderer,
    authPresent: Boolean(input.authUid),
    authAnonymous: input.authAnonymous === true,
    viewerSlugPresent: Boolean(input.viewerSlug),
    profileUidPresent: Boolean(input.profileUid),
    isOwnerViewing: input.isOwnerViewing === true,
    identityReady: input.identityReady === true,
    authReady: input.authReady === true,
    chatKind: isProfileAnonChatId(input.chatId) ? "profileAnon" : "legacy",
    fromCache: input.fromCache ?? null,
    rows: input.messages.slice(-MAX_ROWS).map((message) => ({
      id: String(message.id || "").slice(0, 20),
      fromShape: fromShape(String(message.fromUid || "")),
      senderKind: String(message.senderKind || ""),
      mine: message.mine === true,
    })),
  };

  try {
    const prev = JSON.parse(window.localStorage.getItem(STORAGE_KEY) || "{}") as {
      snapshots?: AuthorshipProbeSnapshot[];
    };
    const snapshots = [...(prev.snapshots || []), snap].slice(-8);
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ snapshots }));
    console.info("[qaDebug:authorship]", snap);
  } catch {
    // ignore
  }
}
