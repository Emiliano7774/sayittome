/**
 * Authoritative admin chats feed — server-side full scan of chats/{id} metadata.
 * Never returns message bodies/subcollections/media. Admin discovery only.
 */
import {
  discoveryOwnerUids,
  extractParticipantUids,
  normalizeModerationChatRow,
  serializeModerationChatForApi,
  timestampMs,
} from "@/lib/moderation/chatHistory";
import type { ModerationChatRow } from "@/lib/moderation/types";

const PAGE_SIZE = 400;

function rowFromAdminDoc(id: string, data: Record<string, unknown>) {
  return { id, ...data };
}

function toMillis(value: unknown) {
  if (!value) return 0;
  if (typeof value === "object" && value && typeof (value as { toMillis?: () => number }).toMillis === "function") {
    return (value as { toMillis: () => number }).toMillis();
  }
  if (typeof value === "object" && value && typeof (value as { _seconds?: number })._seconds === "number") {
    return Number((value as { _seconds: number })._seconds) * 1000;
  }
  return timestampMs(value);
}

async function resolveUsernamesForUids(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  db: any,
  uids: string[],
) {
  const map: Record<string, string> = {};
  const pending = [...new Set(uids.filter(Boolean))];
  const chunkSize = 40;
  for (let i = 0; i < pending.length; i += chunkSize) {
    const chunk = pending.slice(i, i + chunkSize);
    await Promise.all(
      chunk.map(async (uid) => {
        try {
          const snap = await db.collection("usuarios").doc(uid).get();
          if (!snap.exists) return;
          const data = snap.data() as { username?: string; nombre?: string };
          const username = String(data.username || data.nombre || "").trim();
          if (username && !username.startsWith("anon_")) map[uid] = username;
        } catch {
          // ignore unresolved uid
        }
      }),
    );
  }
  return map;
}

async function scanAllChatDocs() {
  const { getRepairAdminDb } = await import("@/lib/chat/historicalAuthorshipRepairAdmin");
  const db = getRepairAdminDb();
  const all: Record<string, unknown>[] = [];

  // Unordered pagination on document ID. Do NOT orderBy updatedAt: Firestore
  // omits docs missing that field, which silently under-counts discovery.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let cursor: any = null;
  for (;;) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let q: any = db.collection("chats").orderBy("__name__").limit(PAGE_SIZE);
    if (cursor) q = q.startAfter(cursor);
    const snap = await q.get();
    if (!snap || snap.empty) break;
    for (const docSnap of snap.docs) {
      all.push(rowFromAdminDoc(docSnap.id, docSnap.data()));
    }
    cursor = snap.docs[snap.docs.length - 1];
    if (snap.size < PAGE_SIZE) break;
  }

  return { db, rows: all };
}

export type AdminChatsFeedResult = {
  ok: true;
  generatedAt: string;
  scanned: number;
  total: number;
  chats: ReturnType<typeof serializeModerationChatForApi>[];
  uidToUsername: Record<string, string>;
};

/**
 * Full chats collection metadata for admin discovery.
 * Does not filter by admin UID/email/initiator.
 *
 * UID→username resolution is minimized:
 * - never resolve initiatorUid (not an owner; unused for discovery)
 * - skip receptor/target UIDs when the chat already has owner usernames
 * - resolve participant UIDs mainly for legacy/generic chats missing names
 */
export async function buildAuthoritativeAdminChatsFeed(): Promise<AdminChatsFeedResult> {
  const { db, rows } = await scanAllChatDocs();
  const uidSet = new Set<string>();

  for (const row of rows) {
    const targetName = String(row.targetUsername || "").trim();
    const receptorName = String(row.receptorUsername || "").trim();
    const hasOwnerUsername = Boolean(targetName || receptorName);
    const isProfileAnon =
      String(row.id || "").includes("__anon_to__") ||
      row.anon === true ||
      row.senderIsAnonymous === true;

    // Owner UIDs only when username is missing (legacy / incomplete docs).
    if (!hasOwnerUsername) {
      for (const uid of discoveryOwnerUids(row)) {
        if (uid && !uid.startsWith("anon_") && !uid.startsWith("profile_")) {
          uidSet.add(uid);
        }
      }
    } else {
      // Named profile-anon chats: names are enough. Still resolve owner UIDs
      // only when the corresponding username field is blank on that side.
      if (!targetName) {
        const uid = String(row.targetUid || "").trim();
        if (uid && !uid.startsWith("anon_") && !uid.startsWith("profile_")) uidSet.add(uid);
      }
      if (!receptorName) {
        const uid = String(row.receptorUid || "").trim();
        if (uid && !uid.startsWith("anon_") && !uid.startsWith("profile_")) uidSet.add(uid);
      }
    }

    // Participants: legacy/generic without names, or non-anon chats that may
    // list a second real participant only in participantes[].
    const needsParticipantResolve = !hasOwnerUsername || !isProfileAnon;
    if (needsParticipantResolve) {
      for (const uid of extractParticipantUids(row)) {
        uidSet.add(uid);
      }
    }
    // Never add initiatorUid — not an owner and unused for feed discovery.
  }

  const uidToUsername = await resolveUsernamesForUids(db, [...uidSet]);

  const chats = rows
    .map((row) => normalizeModerationChatRow(row))
    .sort(
      (a, b) =>
        (toMillis(b.updatedAt) || toMillis(b.createdAt)) -
        (toMillis(a.updatedAt) || toMillis(a.createdAt)),
    )
    .map((chat) => serializeModerationChatForApi(chat));

  return {
    ok: true,
    generatedAt: new Date().toISOString(),
    scanned: rows.length,
    total: chats.length,
    chats,
    uidToUsername,
  };
}

/** Pure helper for repair scripts: latest activity per resolvable profile. */
export function planModerationProfileRepairFromChats(
  rows: Record<string, unknown>[],
  uidToUsername: Record<string, string>,
) {
  type Acc = {
    username: string;
    uid?: string;
    lastModerationActivityMs: number;
    lastMessagePreview: string;
    lastChatId: string;
  };
  const byKey = new Map<string, Acc>();
  const unresolved: Array<{ chatId: string; reason: string }> = [];

  function touch(username: string, chat: Record<string, unknown>, uid?: string) {
    const clean = String(username || "").trim();
    if (!clean || clean.startsWith("anon_")) return;
    const key = clean
      .toLowerCase()
      .replace(/[^a-z0-9_-]+/gi, "_")
      .slice(0, 80);
    if (!key) return;
    const activityMs =
      toMillis(chat.updatedAt) || toMillis(chat.createdAt) || Number(chat.updatedAtMs || 0) || 0;
    const preview = String(chat.lastMessage || "").trim() || "Actividad histórica";
    const chatId = String(chat.id || "");
    const existing = byKey.get(key);
    if (!existing) {
      byKey.set(key, {
        username: clean,
        uid: uid || undefined,
        lastModerationActivityMs: activityMs,
        lastMessagePreview: preview,
        lastChatId: chatId,
      });
      return;
    }
    if (uid && !existing.uid) existing.uid = uid;
    if (activityMs >= existing.lastModerationActivityMs) {
      existing.lastModerationActivityMs = activityMs;
      existing.lastMessagePreview = preview;
      existing.lastChatId = chatId;
    }
  }

  for (const row of rows) {
    const chatId = String(row.id || "");
    let touched = false;
    for (const name of [row.targetUsername, row.receptorUsername]) {
      const clean = String(name || "").trim();
      if (!clean) continue;
      touch(clean, row, String(row.receptorUid || row.targetUid || "") || undefined);
      touched = true;
    }
    for (const uid of discoveryOwnerUids(row)) {
      const username = uidToUsername[uid];
      if (username) {
        touch(username, row, uid);
        touched = true;
      }
    }
    if (!touched) {
      unresolved.push({
        chatId,
        reason: "no_resolvable_owner_username",
      });
    }
  }

  return {
    profiles: [...byKey.entries()].map(([usernameKey, value]) => ({
      usernameKey,
      ...value,
    })),
    unresolved,
  };
}

export function moderationChatRowsFromFeedApi(
  chats: ReturnType<typeof serializeModerationChatForApi>[],
): ModerationChatRow[] {
  return chats.map((row) => normalizeModerationChatRow(row as unknown as Record<string, unknown>));
}
