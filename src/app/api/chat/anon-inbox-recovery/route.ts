import { verifyFirebaseIdTokenAllowingAnonymous } from "@/lib/admin/verifyAdminRequest";
import { loadFirebaseAdminFirestore } from "@/lib/admin/firebaseAdminNative";
import {
  ABUSE_ANON_ALIAS_COLLECTION,
  ABUSE_CHAT_LEASE_COLLECTION,
} from "@/lib/abuse/profileAnonAbuseBlock";
import { getRepairAdminDb } from "@/lib/chat/historicalAuthorshipRepairAdmin";
import {
  previewFromMessageData,
  shellCreatedAtMs,
  shouldIncludeRecoveredChat,
} from "@/lib/chat/inboxShellGuard";

export const dynamic = "force-dynamic";

function noStoreJson(body: unknown, status = 200) {
  return Response.json(body, {
    status,
    headers: {
      "Cache-Control": "private, no-store, max-age=0, must-revalidate",
      Pragma: "no-cache",
    },
  });
}

function safeTimestamp(value: unknown) {
  if (!value || typeof value !== "object") return null;
  const row = value as { toMillis?: () => number; seconds?: number; _seconds?: number };
  if (typeof row.toMillis === "function") {
    try {
      const ms = Number(row.toMillis()) || 0;
      return ms > 0
        ? { seconds: Math.floor(ms / 1000), nanoseconds: (ms % 1000) * 1_000_000 }
        : null;
    } catch {
      return null;
    }
  }
  const seconds = Number(row.seconds ?? row._seconds ?? 0);
  return seconds > 0 ? { seconds, nanoseconds: 0 } : null;
}
export async function GET(req: Request) {
  let principal;
  try {
    principal = await verifyFirebaseIdTokenAllowingAnonymous(req);
  } catch (error) {
    const status = Number((error as { status?: number })?.status || 401);
    return noStoreJson({ ok: false, error: "unauthorized" }, status === 403 ? 403 : 401);
  }

  try {
    const db = getRepairAdminDb();
    // Current chats are recovered through private leases. Legacy chats that
    // predate leases are recovered only when this Firebase principal is
    // directly attested by initiatorUid/anon alias. Same-anon expansion is
    // allowed only when no conflicting principal is present.
    const [leases, aliases, legacyInitiated] = await Promise.all([
      db
        .collection(ABUSE_CHAT_LEASE_COLLECTION)
        .where("visitorAuthUid", "==", principal.uid)
        .get(),
      db
        .collection(ABUSE_ANON_ALIAS_COLLECTION)
        .where("visitorAuthUid", "==", principal.uid)
        .get(),
      db.collection("chats").where("initiatorUid", "==", principal.uid).get(),
    ]);

    type RecoverySnapshot = { id: string; data: () => Record<string, unknown> };
    const snapshotById = new Map<string, RecoverySnapshot>();
    const authorizedAnonIds = new Set<string>();
    const leaseChatIds = new Set<string>();

    for (const chat of legacyInitiated.docs) {
      snapshotById.set(chat.id, {
        id: chat.id,
        data: () => (chat.data() || {}) as Record<string, unknown>,
      });
      const data = chat.data() || {};
      const anonId = String(data.anonSessionId || chat.id.split("__anon_to__")[0] || "").trim();
      if (anonId.startsWith("anon_")) authorizedAnonIds.add(anonId);
    }

    for (const lease of leases.docs) {
      const data = (lease.data() || {}) as Record<string, unknown>;
      if (String(data.visitorAuthUid || "").trim() !== principal.uid) continue;
      const chatId = String(data.chatId || lease.id || "").trim();
      if (chatId) leaseChatIds.add(chatId);
      const anonId = String(data.blockedAnonId || chatId.split("__anon_to__")[0] || "").trim();
      if (anonId.startsWith("anon_")) authorizedAnonIds.add(anonId);
    }

    for (const alias of aliases.docs) {
      const data = (alias.data() || {}) as Record<string, unknown>;
      if (String(data.visitorAuthUid || "").trim() !== principal.uid) continue;
      const anonId = String(data.blockedAnonId || alias.id || "").trim();
      if (anonId.startsWith("anon_")) authorizedAnonIds.add(anonId);
    }

    if (leaseChatIds.size > 0) {
      const leaseRefs = [...leaseChatIds].map((chatId) => db.collection("chats").doc(chatId));
      for (const snap of await db.getAll(...leaseRefs)) {
        if (!snap.exists) continue;
        snapshotById.set(snap.id, {
          id: snap.id,
          data: () => (snap.data() || {}) as Record<string, unknown>,
        });
      }
    }

    for (const anonId of authorizedAnonIds) {
      const prefix = `${anonId}__anon_to__`;
      const family = await db
        .collection("chats")
        .where(loadFirebaseAdminFirestore().FieldPath.documentId(), ">=", prefix)
        .where(loadFirebaseAdminFirestore().FieldPath.documentId(), "<", `${prefix}\uf8ff`)
        .get();
      if (family.empty) continue;

      const aliasSnap = await db.collection(ABUSE_ANON_ALIAS_COLLECTION).doc(anonId).get();
      const aliasUid = String((aliasSnap.data() || {}).visitorAuthUid || "").trim();
      let conflict = Boolean(aliasUid && aliasUid !== principal.uid);

      const familyLeaseSnaps = await db.getAll(
        ...family.docs.map((chat: { id: string }) =>
          db.collection(ABUSE_CHAT_LEASE_COLLECTION).doc(chat.id),
        ),
      );
      for (const leaseSnap of familyLeaseSnaps) {
        const bound = String((leaseSnap.data() || {}).visitorAuthUid || "").trim();
        if (bound && bound !== principal.uid) conflict = true;
      }
      for (const chat of family.docs) {
        const initiatedBy = String((chat.data() || {}).initiatorUid || "").trim();
        if (initiatedBy && initiatedBy !== principal.uid) conflict = true;
      }
      if (conflict) continue;

      for (const chat of family.docs) {
        snapshotById.set(chat.id, {
          id: chat.id,
          data: () => (chat.data() || {}) as Record<string, unknown>,
        });
      }
    }

    const nowMs = Date.now();
    const chats = [...snapshotById.values()]
      .map((snap: RecoverySnapshot) => {
        const data = snap.data() || {};
        const participants = Array.isArray(data.participantes)
          ? data.participantes.map((v: unknown) => String(v || "")).filter(Boolean).slice(0, 8)
          : [];
        return {
          id: snap.id,
          canonicalChatId: String(data.canonicalChatId || snap.id),
          targetUsername: String(data.targetUsername || ""),
          receptorUsername: String(data.receptorUsername || ""),
          targetUid: String(data.targetUid || ""),
          receptorUid: String(data.receptorUid || ""),
          anonOwnerUid: String(data.anonOwnerUid || ""),
          anonSessionId: String(data.anonSessionId || ""),
          participantes: participants,
          targetPhoto: String(data.targetPhoto || ""),
          lastMessage: String(data.lastMessage || ""),
          lastMessageSender: String(data.lastMessageSender || ""),
          latestMessageId: String(data.latestMessageId || ""),
          latestSenderKind: String(data.latestSenderKind || ""),
          latestSenderAnonSessionId: String(data.latestSenderAnonSessionId || ""),
          readBy: data.readBy && typeof data.readBy === "object" ? data.readBy : undefined,
          unreadCounts:
            data.unreadCounts && typeof data.unreadCounts === "object"
              ? data.unreadCounts
              : undefined,
          updatedAt: safeTimestamp(data.updatedAt),
          lastMessageAt: safeTimestamp(data.lastMessageAt),
          createdAtMs: shellCreatedAtMs(data),
        };
      });

    // Only shells missing a summary pay for one latest-message read. A committed
    // message with a blank chat summary must still come back as a visible row.
    const EMPTY_PREVIEW_HYDRATE_CAP = 20;
    let hydrations = 0;
    await Promise.all(
      chats.map(async (chat) => {
        if (String(chat.lastMessage || "").trim()) return;
        if (hydrations >= EMPTY_PREVIEW_HYDRATE_CAP) return;
        hydrations += 1;
        try {
          const latest = await db
            .collection("chats")
            .doc(chat.id)
            .collection("mensajes")
            .orderBy("createdAt", "desc")
            .limit(1)
            .get();
          const message = latest.docs[0];
          if (!message) return;
          const preview = previewFromMessageData(
            (message.data() || {}) as Record<string, unknown>,
            message.id,
          );
          chat.lastMessage = preview.lastMessage;
          chat.lastMessageSender = preview.lastMessageSender;
          chat.latestMessageId = preview.latestMessageId;
          chat.latestSenderKind = preview.latestSenderKind;
          const stamped = safeTimestamp(preview.createdAt);
          if (stamped) {
            chat.updatedAt = chat.updatedAt || stamped;
            chat.lastMessageAt = stamped;
          }
        } catch (error) {
          console.error("anon inbox recovery preview", chat.id, error);
        }
      }),
    );

    const visibleChats = chats.filter((chat) =>
      shouldIncludeRecoveredChat({
        lastMessage: chat.lastMessage,
        createdAtMs: chat.createdAtMs,
        nowMs,
      }),
    );

    return noStoreJson({ ok: true, chats: visibleChats });
  } catch (error) {
    console.error("anon inbox recovery", error);
    return noStoreJson({ ok: false, error: "recovery_failed" }, 503);
  }
}
