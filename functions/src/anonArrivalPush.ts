import { createHash } from "crypto";
import { onDocumentWritten } from "firebase-functions/v2/firestore";
import { HttpsError, onCall } from "firebase-functions/v2/https";
import { logger } from "firebase-functions";
import { db, messaging } from "./adminApp";

// Retain the existing topic so devices which opted in before this release keep working.
const TOPIC = "anon-presence-optin-v1";
const ALIAS = /^anon_[a-z0-9_]{6,80}$/i;
const PROFILE_COOLDOWN_MS = 10 * 60_000;

function stableShortId(alias: string) {
  let hash = 2166136261;
  for (const ch of alias) hash = Math.imul(hash ^ ch.charCodeAt(0), 16777619);
  return (hash >>> 0).toString(36).toUpperCase().padStart(7,"0").slice(-7);
}
function noticeTag(value: string, stamp: string) {
  return "stm-arrival-" + createHash("sha256").update(value + ":" + stamp).digest("hex").slice(0,16);
}
async function broadcast(input: {type: "anon_arrival" | "profile_arrival"; title: string; body: string; href: string; tag: string; anonId?: string; username?: string}) {
  await messaging().send({
    topic: TOPIC,
    notification: {title: input.title, body: input.body},
    data: {
      type: input.type, title: input.title, body: input.body,
      href: input.href, tag: input.tag,
      ...(input.anonId ? {anonId:input.anonId} : {}),
      ...(input.username ? {username:input.username} : {}),
    },
    android: {
      priority: "normal", ttl: 120_000,
      notification: {channelId:"chat-messages-v2", tag: input.tag, color:"#7C3AED", icon:"ic_stat_notify"},
    },
    webpush: {headers:{TTL:"120"}},
  });
}

/** Enable arrival notifications on a registered FCM installation after OS permission. */
export const setAnonArrivalPush = onCall({region:"us-central1"}, async (request) => {
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
    if (result.failureCount > 0 || result.successCount !== 1) throw new Error("fcm_topic_token_rejected");
  } catch (error) {
    logger.warn("arrival topic update failed", {uid,error:String(error)});
    throw new HttpsError("unavailable","Topic update unavailable");
  }
  return {ok:true,enabled};
});

/** This document is written only on real anonymous entrances, never heartbeats. */
export const onAnonArrivalAnnounced = onDocumentWritten({
  document:"anon_arrival_announcements/latest", region:"us-central1", retry:false,
}, async (event) => {
  const before = event.data?.before.data() || {};
  const after = event.data?.after.data() || {};
  const anonId = String(after.anonId || "").trim();
  const enteredAt = String(after.enteredAt || "").trim();
  if (!ALIAS.test(anonId) || after.audience !== "public" || !enteredAt ||
    (before.anonId === anonId && before.enteredAt === enteredAt)) return;
  const entered = Date.parse(enteredAt);
  const now = Date.now();
  if (!Number.isFinite(entered) || entered > now+30000 || now-entered > 90000) return;
  const label = stableShortId(anonId);
  try {
    await broadcast({
      type:"anon_arrival", anonId,
      title: "🌙 Nueva conexión en SayItToMe",
      body: "Anónimo-" + label + " se acaba de conectar. Tocá para hablarle.",
      href: "/?anonArrival=" + encodeURIComponent(anonId),
      tag: noticeTag(anonId,enteredAt),
    });
  } catch (error) { logger.warn("anon arrival push failed",{error:String(error)}); }
});

/** Called once when a registered profile establishes presence. Never on heartbeat.
 * Server verifies current online status and public presence, then rate-limits by
 * profile to suppress duplicate tabs, refreshes, reconnect loops and abuse. */
export const announceProfileArrival = onCall({region:"us-central1"}, async (request) => {
  const uid = String(request.auth?.uid || "").trim();
  if (!uid) throw new HttpsError("unauthenticated","Auth required");
  const user = await db().collection("usuarios").doc(uid).get();
  const profile = user.data() || {};
  const username = String(profile.username || "").trim();
  const seen = profile.presenceUpdatedAt || profile.lastSeenAt;
  const presenceMs = typeof seen?.toMillis === "function" ? seen.toMillis() : Date.parse(String(seen || ""));
  const now = Date.now();
  if (!/^[\p{L}\p{N}_.-]{2,40}$/u.test(username) ||
      profile.online !== true || profile.mostrarUltimaVez === false ||
      (Array.isArray(profile.visibilidadPaises) && profile.visibilidadPaises.length > 0) ||
      (Array.isArray(profile.visibilidadProvincias) && profile.visibilidadProvincias.length > 0) ||
      !Number.isFinite(presenceMs) || now-presenceMs > 120_000 || presenceMs>now+30_000) {
    return {ok:true,announced:false,reason:"not_public_or_offline"};
  }
  const gate=db().collection("arrivalPushGates").doc("profile_"+uid);
  const shouldSend=await db().runTransaction(async(tx)=>{
    const previous=await tx.get(gate);
    const last=Number(previous.data()?.lastMs || 0);
    if (now-last < PROFILE_COOLDOWN_MS) return false;
    tx.set(gate,{lastMs:now},{merge:true});
    return true;
  });
  if (!shouldSend) return {ok:true,announced:false,reason:"duplicate_session"};
  try {
    await broadcast({
      type:"profile_arrival",username,
      title:"🌙 Nueva conexión en SayItToMe",
      body:"@"+username+" se acaba de conectar. Tocá para hablarle.",
      href:"/u/"+encodeURIComponent(username),
      tag:noticeTag(uid,String(now)),
    });
    return {ok:true,announced:true};
  } catch(error) {
    logger.warn("profile arrival push failed",{uid,error:String(error)});
    return {ok:false,announced:false};
  }
});
