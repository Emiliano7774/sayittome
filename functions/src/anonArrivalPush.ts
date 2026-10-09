import { createHash } from "crypto";
import { onDocumentWritten } from "firebase-functions/v2/firestore";
import { HttpsError, onCall } from "firebase-functions/v2/https";
import { logger } from "firebase-functions";
import { db, messaging } from "./adminApp";

const TOPIC = "anon-presence-optin-v1";
const GLOBAL_PUSH_GAP_MS = 120_000;
const ALIAS = /^anon_[a-z0-9_]{6,80}$/i;

/** Explicit opt-in, one existing registered token at a time; never enumerate users. */
export const setAnonArrivalPush = onCall({ region:"us-central1" }, async (request) => {
  const uid = String(request.auth?.uid || "").trim();
  if (!uid) throw new HttpsError("unauthenticated","Auth required");
  const token = String(request.data?.token || "").trim();
  const enabled = request.data?.enabled === true;
  if (token.length < 20 || token.length > 5000) throw new HttpsError("invalid-argument","Invalid token");
  const tokenId = createHash("sha256").update(token).digest("hex").slice(0,40);
  const doc = await db().collection("usuarios").doc(uid).collection("fcmTokens").doc(tokenId).get();
  if (!doc.exists || doc.data()?.token !== token || doc.data()?.enabled !== true) {
    throw new HttpsError("permission-denied","Token not registered for this user");
  }
  try {
    const result = enabled
      ? await messaging().subscribeToTopic([token],TOPIC)
      : await messaging().unsubscribeFromTopic([token],TOPIC);
    if (result.failureCount > 0 || result.successCount !== 1) {
      throw new Error("fcm_topic_token_rejected");
    }
  } catch (error) {
    logger.warn("anon-arrival topic update failed", {uid, error:String(error)});
    throw new HttpsError("unavailable","Topic update unavailable");
  }
  return {ok:true,enabled};
});

/** Only one trigger per true entrance: the fixed document is NOT touched by heartbeats. */
export const onAnonArrivalAnnounced = onDocumentWritten({
  document:"anon_arrival_announcements/latest", region:"us-central1", retry:false
}, async (event) => {
  const before = event.data?.before.data() || {};
  const after = event.data?.after.data() || {};
  const anonId = String(after.anonId || "").trim();
  const enteredAt = String(after.enteredAt || "").trim();
  if (!ALIAS.test(anonId) || after.audience !== "public" || !enteredAt ||
      (before.anonId === anonId && before.enteredAt === enteredAt)) return;
  const entered = Date.parse(enteredAt);
  const now = Date.now();
  if (!Number.isFinite(entered) || entered > now + 30000 || now-entered > 90000) return;

  // A global shared gate caps fan-out and prevents notification storms/cost.
  const gate = db().collection("system").doc("anon_arrival_push_gate");
  const granted = await db().runTransaction(async (tx) => {
    const snap = await tx.get(gate);
    const previous = Number(snap.data()?.lastPushAtMs || 0);
    if (now - previous < GLOBAL_PUSH_GAP_MS) return false;
    tx.set(gate,{lastPushAtMs:now,lastAnonId:anonId},{merge:true});
    return true;
  });
  if (!granted) return;
  let hash=2166136261;
  for (const ch of anonId) hash=Math.imul(hash ^ ch.charCodeAt(0),16777619);
  const shortId=(hash>>>0).toString(36).toUpperCase().padStart(7,"0").slice(-7);
  const href = "/shuffle?anonArrival="+encodeURIComponent(anonId);
  try {
    await messaging().send({
      topic:TOPIC,
      notification:{title:"Un anónimo acaba de entrar",body:"Anónimo "+shortId+" está en SayItToMe. Tocá para hablar."},
      data:{type:"anon_arrival",anonId,href,title:"Un anónimo acaba de entrar",body:"Anónimo "+shortId+" está en la app",tag:"sayittome-anon-arrival"},
      android:{priority:"normal",ttl:60000,notification:{channelId:"chat-messages-v2",tag:"sayittome-anon-arrival"}},
      webpush:{headers:{TTL:"60"}},
    });
  } catch (error) { logger.warn("anon arrival push failed", {error:String(error)}); }
});