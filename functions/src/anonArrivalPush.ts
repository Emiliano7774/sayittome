import { createHash } from "crypto";
import { onDocumentCreated, onDocumentWritten } from "firebase-functions/v2/firestore";
import { HttpsError, onCall } from "firebase-functions/v2/https";
import { logger } from "firebase-functions";
import { db, messaging } from "./adminApp";
import { mayAnnounceRegisteredReturn } from "./profileArrivalPolicy";
import { activeAdminPresencePool, chooseAdminPresenceTarget, excludeAdministratorRows } from "./adminPresencePool";

// Retain the existing topic so devices which opted in before this release keep working.
const OWNER_ADMIN_EMAIL = "emilianomaturano@gmail.com";
function isVerifiedOwnerAdmin(auth: {uid?: string; token?: Record<string, unknown>} | undefined) {
  return Boolean(
    auth?.uid && auth?.token?.email_verified === true &&
    String(auth?.token?.email || "").trim().toLowerCase() === OWNER_ADMIN_EMAIL
  );
}

/** Server-only gate. Public usuarios documents must not reveal private admin preferences. */
export const adminArrivalGhostControl = onCall({ region: "us-central1" }, async (request) => {
  if (!isVerifiedOwnerAdmin(request.auth)) {
    throw new HttpsError("permission-denied", "Verified administrator required");
  }
  const gate = db().collection("arrivalPushGates").doc("profile_" + request.auth!.uid);
  if (request.data?.action === "get") {
    const doc = await gate.get();
    return {enabled: doc.data()?.adminGhostArrivalEnabled === true};
  }
  if (request.data?.action !== "set" || typeof request.data?.enabled !== "boolean") {
    throw new HttpsError("invalid-argument", "Invalid ghost mode request");
  }
  await gate.set({adminGhostArrivalEnabled: request.data.enabled}, {merge:true});
  return {enabled: request.data.enabled};
});
const TOPIC = "anon-presence-optin-v1";
const ANON_PUSH_DEDUPE_MS = 60_000;
const ALIAS = /^anon_[a-z0-9_]{6,80}$/i;

const SUPPORTED_COUNTRIES = new Set(
  "AR US IT DE ES MX BR CO CL PE UY PY FR GB CA PT VE EC BO CR PA DO AU".split(" ")
);
const geoCountry = (value: unknown) => {
  const code = String(value || "").trim().toUpperCase();
  return SUPPORTED_COUNTRIES.has(code) ? code : "";
};
const geoProvinceKey = (value: unknown) => String(value || "").trim()
  .normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
const countryTopic = (code: string) => "stm-arrival-country-" + code.toLowerCase();
const provinceTopic = (code: string, province: string) =>
  countryTopic(code) + "-p" + createHash("sha256").update(geoProvinceKey(province)).digest("hex").slice(0,12);
function targetGeoTopics(data: Record<string, unknown>) {
  const countries = [...new Set((Array.isArray(data.visibilidadPaises) ? data.visibilidadPaises : [])
    .map(geoCountry).filter(Boolean))];
  // Never broaden malformed or unknown country restrictions to a global push.
  const restricted = Array.isArray(data.visibilidadPaises) && data.visibilidadPaises.length > 0 ||
    Array.isArray(data.visibilidadProvincias) && data.visibilidadProvincias.length > 0;
  if (!restricted) return {restricted:false,topics:[] as string[]};
  const provinces = Array.isArray(data.visibilidadProvincias) ? data.visibilidadProvincias : [];
  if (countries.length === 1 && provinces.length) {
    return {restricted:true, topics:[...new Set(provinces.filter(x=>String(x||"").trim())
      .map(province=>provinceTopic(countries[0], String(province))))]};
  }
  return {restricted:true,topics:countries.map(countryTopic)};
}
function targetConditions(topics: string[]) {
  // FCM allows at most five topics per condition.
  const list:string[] = [];
  for (let i=0;i<topics.length;i+=5) {
    list.push(topics.slice(i,i+5).map(topic=>"'"+topic+"' in topics").join(" || "));
  }
  return list;
}
async function authorizedGeoTopics(uid: string, anonymous: boolean) {
  const user = await db().collection("usuarios").doc(uid).get();
  let row = user.data() || {};
  if (anonymous && !geoCountry(row.pais)) {
    const found = await db().collection("anonimos_activos")
      .where("authUid","==",uid).limit(1).get();
    row = found.docs[0]?.data() || row;
  }
  const code=geoCountry(row.pais);
  if (!code) return [] as string[];
  const topics=[countryTopic(code)];
  if (String(row.provincia||"").trim()) topics.push(provinceTopic(code,String(row.provincia)));
  return topics;
}


function stableShortId(alias: string) {
  let hash = 2166136261;
  for (const ch of alias) hash = Math.imul(hash ^ ch.charCodeAt(0), 16777619);
  return (hash >>> 0).toString(36).toUpperCase().padStart(7,"0").slice(-7);
}
function noticeTag(principal: string) {
  // Stable per event: dedupe retries of the same arrival but retain later
  // legitimate entrances rather than replacing their OS notifications.
  return "stm-arrival-" + createHash("sha256").update(principal).digest("hex").slice(0,16);
}
async function broadcast(input: {type: "anon_arrival" | "profile_arrival"; title: string; body: string; href: string; tag: string; eventId?: string; anonId?: string; username?: string; source?: "manual_admin"; originUid?: string; condition?: string}) {
  const push = {
    ...(input.condition ? {condition:input.condition} : {topic:TOPIC}),
    notification: {title: input.title, body: input.body},
    data: {
      type: input.type, title: input.title, body: input.body,
      href: input.href, tag: input.tag,
      ...(input.eventId ? {eventId:input.eventId} : {}),
      ...(input.anonId ? {anonId:input.anonId} : {}),
      ...(input.username ? {username:input.username} : {}),
      ...(input.source ? {source:input.source} : {}),
      ...(input.originUid ? {originUid:input.originUid} : {}),
      ...(input.condition ? {geoTargeted:"1"} : {}),
    },
    android: {
      // Prompt delivery while Android is idle; stale arrivals expire after two minutes.
      priority: "high" as const, ttl: 120_000,
      notification: {channelId:"chat-messages-v2", tag: input.tag, color:"#7C3AED", icon:"ic_stat_notify"},
    },
    webpush: {headers:{TTL:"120"}},
  };
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const messageId = await messaging().send(push);
      logger.info("arrival_fcm_accepted", {
        kind:input.type, eventTag:input.tag, attempts:attempt, fcmMessageId:messageId,
      });
      return messageId;
    } catch (error) {
      const code = String((error as {code?:string})?.code || "");
      const temporary = /server-unavailable|internal-error|unknown-error|unavailable/.test(code);
      logger.warn("arrival_fcm_attempt_failed", {
        kind:input.type,eventTag:input.tag,attempt,code:code||"unknown",
      });
      if (!temporary || attempt === 3) throw error;
      await new Promise(resolve => setTimeout(resolve, attempt * 300));
    }
  }
  throw new Error("arrival_fcm_unreachable");
}

/** Enable arrival notifications on a registered FCM installation after OS permission. */
export const setAnonArrivalPush = onCall({region:"us-central1"}, async (request) => {
  const uid = String(request.auth?.uid || "").trim();
  if (!uid) throw new HttpsError("unauthenticated","Auth required");
  const token = String(request.data?.token || "").trim();
  const enabled = request.data?.enabled === true;
  // Anonymous sessions are always opted in at the application level.
  // Browser/Android OS permission can still be denied or revoked by the user.
  if (request.auth?.token?.firebase?.sign_in_provider === "anonymous" && !enabled) {
    throw new HttpsError("permission-denied", "Anonymous connection alerts cannot be disabled");
  }
  if (token.length < 20 || token.length > 5000) throw new HttpsError("invalid-argument","Invalid token");
  const tokenId = createHash("sha256").update(token).digest("hex").slice(0,40);
  const doc = await db().collection("usuarios").doc(uid).collection("fcmTokens").doc(tokenId).get();
  if (!doc.exists || doc.data()?.token !== token || doc.data()?.enabled !== true) {
    throw new HttpsError("permission-denied","Token not registered for this user");
  }
  try {
    const previous = Array.isArray(doc.data()?.arrivalGeoTopics)
      ? (doc.data()?.arrivalGeoTopics as unknown[]).map(String) : [];
    const desired = enabled ? await authorizedGeoTopics(uid,
      request.auth?.token?.firebase?.sign_in_provider === "anonymous") : [];
    // Unsubscribe stale regions FIRST. A moved user must never retain access
    // to arrivals meant for their old geographic audience.
    for (const topic of [...new Set(previous)].filter(t=>t!==TOPIC && !desired.includes(t))) {
      const result=await messaging().unsubscribeFromTopic([token],topic);
      if (result.failureCount || result.successCount!==1) throw new Error("geo_topic_unsubscribe_failed");
    }
    const globalResult = enabled
      ? await messaging().subscribeToTopic([token],TOPIC)
      : await messaging().unsubscribeFromTopic([token],TOPIC);
    if (globalResult.failureCount > 0 || globalResult.successCount !== 1) throw new Error("fcm_topic_token_rejected");
    for (const topic of desired.filter(t=>!previous.includes(t))) {
      const result=await messaging().subscribeToTopic([token],topic);
      if (result.failureCount || result.successCount!==1) throw new Error("geo_topic_subscribe_failed");
    }
    await doc.ref.set({arrivalGeoTopics:desired},{merge:true});
  } catch (error) {
    logger.warn("arrival topic update failed", {uid,error:String(error)});
    throw new HttpsError("unavailable","Topic update unavailable");
  }
  return {ok:true,enabled};
});

/** Legacy listener remains for compatible clients during rollout. New
 * entrances never write the contended latest document. */
export const onAnonArrivalAnnounced = onDocumentWritten({
  document:"anon_arrival_announcements/latest", region:"us-central1", retry:false,
}, async (event) => {
  const before = event.data?.before.data() || {};
  const after = event.data?.after.data() || {};
  if (before.anonId === after.anonId && before.enteredAt === after.enteredAt) return;
  await dispatchAnonArrival(after);
});

/** Every event gets a separate Firestore document and its own trigger. */
export const onAnonArrivalEventCreated = onDocumentCreated({
  document:"connection_arrival_events/{eventId}", region:"us-central1", retry:false,
}, async (event) => {
  await dispatchAnonArrival(event.data?.data() || {});
});

async function dispatchAnonArrival(after: Record<string, unknown>) {
  const anonId = String(after.anonId || "").trim();
  const enteredAt = String(after.enteredAt || "").trim();
  if (!ALIAS.test(anonId) || after.audience !== "public" || !enteredAt) return;
  const entered = Date.parse(enteredAt);
  const now = Date.now();
  if (!Number.isFinite(entered) || entered > now+30000 || now-entered > 5*60_000) return;
  // The route writes anonymous presence with a non-transactional heartbeat.
  // Concurrent first-entry requests can both publish *different* enteredAt
  // timestamps. Serialize the notification itself with a durable person gate.
  // This also dedupes rotated aliases attached to the same anonymous auth UID.
  const accepted = await db().runTransaction(async (tx) => {
    const presenceRef = db().collection("anonimos_activos").doc(anonId);
    const presence = await tx.get(presenceRef);
    const identity = String(presence.data()?.authUid || "").trim() || anonId;
    const gateId = "anon_" + createHash("sha256").update(identity).digest("hex").slice(0,40);
    const gateRef = db().collection("arrivalPushGates").doc(gateId);
    const gate = await tx.get(gateRef);
    const lastPush = Number(gate.data()?.lastPushedAtMs || 0);
    const currentMs = Date.now();
    // A legitimate entrance remains an entrance if the visitor closes immediately.
    if (!presence.exists) return null;
    // Use the entrance clock rather than delayed FCM processing time:
    // 500 real returns separated by >=60s must remain valid.
    const priorEntryMs = Date.parse(String(gate.data()?.lastEntry || ""));
    if (Number.isFinite(priorEntryMs)) {
      if (entered <= priorEntryMs || entered-priorEntryMs < ANON_PUSH_DEDUPE_MS) return null;
    } else if (lastPush > 0 && currentMs-lastPush < ANON_PUSH_DEDUPE_MS) {
      return null;
    }
    const observed = Date.parse(String(presence.data()?.lastSeenAt || ""));
    if (!Number.isFinite(observed) || observed<entered-30_000 || observed>currentMs+30_000) return null;
    tx.set(gateRef, {lastPushedAtMs:currentMs,lastEntry:enteredAt}, {merge:true});
    return identity;
  });
  if (!accepted) return;
  const label = stableShortId(anonId);
  try {
    await broadcast({
      type:"anon_arrival", anonId, originUid:accepted,
      title: "🌙 Nueva conexión en SayItToMe",
      body: "Anónimo-" + label + " se acaba de conectar. Tocá para hablarle.",
      href: "/?anonArrival=" + encodeURIComponent(anonId),
      eventId: "anon:" + createHash("sha256").update(accepted + "|" + enteredAt).digest("hex").slice(0,32),
      tag: noticeTag("anon:" + accepted + ":" + enteredAt),
    });
  } catch (error) {
    logger.warn("anon arrival push failed",{error:String(error)});
    // A rejected FCM send must not permanently consume this entrance gate.
    const gateId = "anon_" + createHash("sha256").update(accepted).digest("hex").slice(0,40);
    await db().runTransaction(async tx => {
      const ref = db().collection("arrivalPushGates").doc(gateId);
      const current = await tx.get(ref);
      if (current.data()?.lastEntry === enteredAt) {
        tx.set(ref, {lastPushedAtMs:0}, {merge:true});
      }
    }).catch(err => logger.warn("anon arrival gate recovery failed",{error:String(err)}));
  }
}

/** Registered-profile pilot: one arrival on initial entrance and again only
 * after >=1 minute without foreground presence. The client calls this BEFORE
 * its first foreground heartbeat, so Firestore still contains the previous
 * departure time. Hidden tabs never invoke it. No anonymous behavior changes.
 * A single Firestore transaction serializes concurrent tabs/device entrances. */
export const announceProfileArrival = onCall({region:"us-central1"}, async (request) => {
  const uid = String(request.auth?.uid || "").trim();
  if (!uid || request.auth?.token?.firebase?.sign_in_provider === "anonymous") {
    throw new HttpsError("unauthenticated","Registered profile required");
  }
  // The owner may opt out through adminArrivalGhostControl; no hard block.
  const now = Date.now();
  const profileRef = db().collection("usuarios").doc(uid);
  const gate = db().collection("arrivalPushGates").doc("profile_"+uid);
  // Keep the event and its deduplication gate in the SAME atomic commit.
  // A transient event-write failure must not make an eligible user disappear
  // from the foreground stream while consuming their 60-second allowance.
  const eventId = createHash("sha256").update("profile|" + uid + "|" + now).digest("hex").slice(0,40);
  const arrivalRef = db().collection("connection_arrival_events").doc(eventId);
  const outcome = await db().runTransaction(async (tx) => {
    // Read everything before writing, so competing tabs cannot both announce.
    const user = await tx.get(profileRef);
    const previous = await tx.get(gate);
    const profile = user.data() || {};
    // Admin-only opt-out. Never trust a caller-provided email or a regular user's flag.
    const adminGhost = isVerifiedOwnerAdmin(request.auth)
      && previous.data()?.adminGhostArrivalEnabled === true;
    if (adminGhost) return {announced:false as const,reason:"admin_ghost_enabled"};
    const username = String(profile.username || "").trim();
    if (!user.exists || !/^[\p{L}\p{N}_.-]{2,40}$/u.test(username) ||
        profile.banned === true) {
      return {announced:false as const,reason:"not_public_or_offline"};
    }
    const lastForeground = profile.lastForegroundAt;
    const foregroundMs = typeof lastForeground?.toMillis === "function"
      ? lastForeground.toMillis()
      : Date.parse(String(lastForeground || ""));
    const lastAnnounced = Number(previous.data()?.lastMs || 0);
    if (!mayAnnounceRegisteredReturn({
      nowMs: now,
      lastForegroundMs: Number.isFinite(foregroundMs) ? foregroundMs : 0,
      lastAnnouncementMs: lastAnnounced,
      clientAwaySinceMs: Number(request.data?.awaySinceMs || 0),
    })) {
      return {announced:false as const,reason:"duplicate_session"};
    }
    // Old clients that reload with stale presence still hit this durable gate;
    // the new client also refreshes lastForegroundAt on every foreground beat.
    const targeting=targetGeoTopics(profile);
    if (targeting.restricted && targeting.topics.length===0) {
      return {announced:false as const,reason:"unresolvable_geo_scope"};
    }
    tx.set(gate,{lastMs:now},{merge:true});
    // Geo-restricted usernames must never enter the globally readable event
    // collection. Only country/province topic subscribers may receive them.
    if (!targeting.restricted) {
      tx.create(arrivalRef, {
        type:"profile_arrival", username, originUid:uid,
        enteredAt:new Date(now).toISOString(), enteredAtMs:now, audience:"public",
        expiresAt:new Date(now + 60*60_000),
      });
    }
    return {announced:true as const,username,topics:targeting.topics};
  });
  if (!outcome.announced) return {ok:true,...outcome};
  try {
    const base={
      type:"profile_arrival" as const, username:outcome.username, originUid:uid,
      title:"🌙 Nueva conexión en SayItToMe",
      body:"@"+outcome.username+" se acaba de conectar. Tocá para hablarle.",
      href:"/u/"+encodeURIComponent(outcome.username),
      eventId:"profile:" + uid + ":" + now,
      tag:noticeTag("profile:" + uid + ":" + now),
    };
    const conditions=targetConditions(outcome.topics);
    if (conditions.length===0) await broadcast(base);
    else for (const condition of conditions) await broadcast({...base,condition});
    return {ok:true,announced:true};
  } catch(error) {
    logger.warn("profile arrival push failed",{uid,error:String(error)});
    await db().runTransaction(async tx => {
      const current = await tx.get(gate);
      if (Number(current.data()?.lastMs || 0) === now) {
        tx.set(gate,{lastMs:0},{merge:true});
      }
    }).catch(err => logger.warn("profile arrival gate recovery failed",{uid,error:String(err)}));
    return {ok:false,announced:false};
  }
});

/** Owner-only prompt drawn from currently active public profiles and anonymous
 * visitors. Does not claim that a prior user has just entered the app.
 * Kept under its original callable name for backwards-compatible clients. */
export const adminSendAvailableAnonAlert = onCall({region:"us-central1"}, async (request) => {
  if (!isVerifiedOwnerAdmin(request.auth)) {
    throw new HttpsError("permission-denied", "Verified administrator required");
  }
  const preview = request.data?.preview === true;
  if (!preview && request.data?.confirm !== true) {
    throw new HttpsError("invalid-argument", "Explicit confirmation required");
  }
  const now = Date.now();
  // Sorted by freshness (not document ID): a stale anonymous card must not
  // hide currently active users from the first N results.
  const [anonymousSnap, recentActiveSnap, recentSeenSnap] = await Promise.all([
    db().collection("anonimos_activos").orderBy("lastSeenAt","desc").limit(120).get(),
    // Mirror Shuffles source of truth; include legacy clients without lastForegroundAt.
    db().collection("usuarios").orderBy("lastActiveAt","desc").limit(160).get(),
    db().collection("usuarios").orderBy("lastSeenAt","desc").limit(160).get(),
  ]);
  const ownerUid = request.auth!.uid;
  const anonymousRows = excludeAdministratorRows(
    anonymousSnap.docs.map(row => ({id:row.id,data:row.data()})),
    ownerUid,OWNER_ADMIN_EMAIL,
  );
  const registeredRows = excludeAdministratorRows(
    Array.from(new Map([...recentActiveSnap.docs,...recentSeenSnap.docs]
      .map(row => [row.id,{id:row.id,data:row.data()}] as const)).values()),
    ownerUid,OWNER_ADMIN_EMAIL,
  );
  const pool = activeAdminPresencePool(anonymousRows,registeredRows,now);
  const counts = {anonymousCount:pool.anonymous.length,profileCount:pool.profiles.length};
  if (preview) return {ok:true,preview:true,...counts};
  if (!pool.anonymous.length && !pool.profiles.length) {
    return {ok:false,reason:"no_public_online_users",...counts};
  }

  const gate = db().collection("arrivalPushGates").doc("admin_available_anon_broadcast");
  const selection = await db().runTransaction(async tx => {
    const prior = await tx.get(gate);
    const data = prior.data() || {};
    const lastMs = Number(data.lastMs || 0);
    if (lastMs > 0 && now - lastMs < 15_000) {
      return {target:null,reason:"cooldown_15_seconds"};
    }
    const type = data.lastTargetType === "anonymous" || data.lastTargetType === "profile"
      ? data.lastTargetType as "anonymous" | "profile" : "";
    const target = chooseAdminPresenceTarget(pool,type,String(data.lastTargetId || ""));
    if (!target) return {target:null,reason:"no_public_online_users"};
    tx.set(gate,{
      lastMs:now,lastTargetId:target.id,lastTargetType:target.type,
      adminUid:request.auth!.uid,
    },{merge:true});
    return {target,reason:""};
  });
  if (!selection.target) return {ok:false,reason:selection.reason,...counts};

  const selected = selection.target;
  const label = selected.type === "anonymous"
    ? "Anónimo-" + stableShortId(selected.id) : "@" + selected.username;
  const href = selected.type === "anonymous"
    ? "/?anonArrival=" + encodeURIComponent(selected.id)
    : "/u/" + encodeURIComponent(selected.username);
  try {
    const fcmMessageId = await broadcast({
      type:selected.type === "anonymous" ? "anon_arrival" : "profile_arrival",
      ...(selected.type === "anonymous" ? {anonId:selected.id} : {username:selected.username}),
      title:"Actividad en SayItToMe",
      body:label + (now - selected.lastSeenMs <= 180_000
        ? " está en línea. Tocá para conversar."
        : " estuvo activo recientemente. Tocá para conversar."),
      href,tag:noticeTag("admin-active:" + selected.type + ":" + selected.id + ":" + now),
      source:"manual_admin",
    });
    logger.info("admin active user alert published",{targetType:selected.type,topicAccepted:true});
    return {ok:true,publishedToFcm:true,fcmMessageId,targetType:selected.type,targetLabel:label,...counts};
  } catch(error) {
    logger.error("admin active user alert failed",{error:String(error)});
    // Failed sends must not silently consume the full one-hour allowance.
    await db().runTransaction(async tx => {
      const current = await tx.get(gate);
      if (Number(current.data()?.lastMs || 0) === now) {
        tx.set(gate,{lastMs:0},{merge:true});
      }
    }).catch(err => logger.warn("manual arrival gate recovery failed",{error:String(err)}));
    return {ok:false,reason:"broadcast_failed",...counts};
  }
});
