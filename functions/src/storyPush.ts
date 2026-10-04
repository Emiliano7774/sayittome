import { type MulticastMessage } from "firebase-admin/messaging";
import { logger } from "firebase-functions";

import { db, ensureAdminApp, messaging } from "./adminApp";
import {
  STORY_NOTIF_CHANNEL_ID,
  STORY_NOTIF_COLOR,
  STORY_NOTIF_GLOBAL_DOC,
  normalizeStoryNotifPrefs,
  pairAllowsStoryNotif,
  type StoryNotifChannel,
  type StoryNotifPrefs,
} from "./storyNotificationPolicy";

const MAX_TOKENS_PER_USER = 20;

function asId(value: unknown) {
  return String(value || "").trim();
}

async function loadPrefs(uid: string, docId: string): Promise<StoryNotifPrefs> {
  const snap = await db().collection("usuarios").doc(uid).collection("story_notif_prefs").doc(docId).get();
  return normalizeStoryNotifPrefs(snap.data() || {});
}

export async function storyPairAllows(
  channel: StoryNotifChannel,
  actorUid: string,
  peerUid: string,
) {
  const actor = asId(actorUid);
  const peer = asId(peerUid);
  if (!actor || !peer || actor === peer) return false;
  const [selfGlobal, peerGlobal, selfPair, peerPair] = await Promise.all([
    loadPrefs(actor, STORY_NOTIF_GLOBAL_DOC),
    loadPrefs(peer, STORY_NOTIF_GLOBAL_DOC),
    loadPrefs(actor, peer),
    loadPrefs(peer, actor),
  ]);
  return pairAllowsStoryNotif(channel, selfGlobal, peerGlobal, selfPair, peerPair);
}

async function loadTokensForUid(uid: string) {
  const snap = await db()
    .collection("usuarios")
    .doc(uid)
    .collection("fcmTokens")
    .where("enabled", "==", true)
    .limit(MAX_TOKENS_PER_USER)
    .get();
  const out: Array<{ id: string; token: string }> = [];
  for (const docSnap of snap.docs) {
    const token = asId(docSnap.data().token);
    if (token) out.push({ id: docSnap.id, token });
  }
  return out;
}

async function deleteInvalidToken(uid: string, docId: string) {
  await db().collection("usuarios").doc(uid).collection("fcmTokens").doc(docId).delete();
}

export async function sendStoryPush(input: {
  recipientUid: string;
  title: string;
  body: string;
  href: string;
  type: "story_like" | "story_upload";
  tag: string;
}) {
  const recipientUid = asId(input.recipientUid);
  const href = asId(input.href);
  if (!recipientUid || !href) return { sent: 0, failed: 0 };
  const tokens = await loadTokensForUid(recipientUid);
  if (tokens.length === 0) return { sent: 0, failed: 0 };

  ensureAdminApp();
  const multicast: MulticastMessage = {
    tokens: tokens.map((row) => row.token),
    notification: {
      title: String(input.title || "").slice(0, 80),
      body: String(input.body || "").slice(0, 180),
    },
    data: {
      type: input.type,
      href,
      recipientUid,
      tag: input.tag,
      channelId: STORY_NOTIF_CHANNEL_ID,
      title: String(input.title || "").slice(0, 80),
      body: String(input.body || "").slice(0, 180),
    },
    android: {
      priority: "high",
      notification: {
        channelId: STORY_NOTIF_CHANNEL_ID,
        color: STORY_NOTIF_COLOR,
        icon: "ic_stat_notify",
        tag: input.tag,
      },
    },
  };

  const response = await messaging().sendEachForMulticast(multicast);
  response.responses.forEach((result, index) => {
    if (result.success) return;
    const code = result.error?.code || "";
    if (
      code.includes("registration-token-not-registered") ||
      code.includes("invalid-registration-token") ||
      code.includes("invalid-argument")
    ) {
      const row = tokens[index];
      if (row) void deleteInvalidToken(recipientUid, row.id);
    }
  });
  logger.info("story push", {
    type: input.type,
    recipientUid,
    sent: response.successCount,
    failed: response.failureCount,
  });
  return { sent: response.successCount, failed: response.failureCount };
}
