/* Chat OS banners — nested scope only. Page must identify this SW by scriptURL
 * (Monetag scope `/` also matches getRegistration("/chat-notify/")). */
self.addEventListener("install", (event) => {
  event.waitUntil(self.skipWaiting());
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

function pushData(payload) {
  if (!payload || typeof payload !== "object") return {};
  const nested = payload.data;
  return nested && typeof nested === "object" ? nested : payload;
}

// The same message can arrive through Firestore, FCM, or another open tab.
// Serialize those paths; new message ids in the same chat must re-alert.
let displayQueue = Promise.resolve();
const displayedMessages = new Set();
const displayedArrivals = new Map();
const recentlyDisplayedPrincipals = new Map();
// A Firestore foreground fallback and an FCM push for the SAME entrance may
// have different transport tags. Coalesce them briefly without suppressing
// a genuine return 60 seconds later.
const PRINCIPAL_TRANSPORT_DEDUPE_MS = 10_000;
function arrivalPrincipal(data) {
  if (data.type === "anon_arrival") {
    const anonId = String(data.anonId || "").trim();
    return anonId ? "anon:" + anonId : "";
  }
  if (data.type === "profile_arrival") {
    const username = String(data.username || "").trim().toLowerCase();
    return username ? "profile:" + username : "";
  }
  return "";
}
// Browser tabs announce their current Firebase UID to avoid notifying the
// originating device about its own public entrance. Kept in SW memory only.
const arrivalViewers = new Map();
const ARRIVAL_RECENT_MS = 2 * 60 * 1000;

// An anonymous chat session lives in one tab. Its message push can wait in the
// push service (TTL) while that tab ends the session; a queued push for an
// ended alias must not surface afterwards. Pages report start/end with the
// same leave signal as anonymous presence; the state survives worker restarts.
const ANON_SESSION_CACHE = "sayittome-chat-notify-state-v1";
const ANON_SESSION_KEY = "/chat-notify/__anon-direct-sessions";
const PUSH_TELEMETRY_KEY = "/chat-notify/__push-telemetry";
const PUSH_TELEMETRY_MAX = 16;

async function appendPushTelemetry(entry) {
  try {
    if (typeof caches === "undefined" || typeof Response === "undefined") return;
    const cache = await caches.open(ANON_SESSION_CACHE);
    const stored = await cache.match(PUSH_TELEMETRY_KEY);
    const rows = stored ? await stored.json() : [];
    const next = [...(Array.isArray(rows) ? rows : []), { ...entry, t: Date.now() }].slice(-PUSH_TELEMETRY_MAX);
    await cache.put(PUSH_TELEMETRY_KEY, new Response(JSON.stringify(next)));
    const clients = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    for (const client of clients) {
      try {
        client.postMessage({ type: "sayittome:web-push-sw-telemetry", entries: next });
      } catch {
        // Page may be gone; cache keeps the trail for the next open.
      }
    }
  } catch {
    // Telemetry must never block delivery.
  }
}
// Longer than the anonymous message push TTL.
const ANON_SESSION_KEEP_MS = 60 * 60 * 1000;
let anonSessionsLoad = null;
let anonSessionsWrite = Promise.resolve();

function loadAnonSessions() {
  if (!anonSessionsLoad) {
    anonSessionsLoad = (async () => {
      const sessions = new Map();
      try {
        if (typeof caches === "undefined") return sessions;
        const stored = await (await caches.open(ANON_SESSION_CACHE)).match(ANON_SESSION_KEY);
        const rows = stored ? await stored.json() : [];
        for (const row of Array.isArray(rows) ? rows : []) {
          const [alias, entry] = Array.isArray(row) ? row : [];
          if (typeof alias === "string" && entry && Number.isFinite(entry.at)) sessions.set(alias, entry);
        }
      } catch {
        // Memory-only state; the push TTL still bounds a queued message.
      }
      return sessions;
    })();
  }
  return anonSessionsLoad;
}

async function noteAnonSession(alias, state) {
  const sessions = await loadAnonSessions();
  const now = Date.now();
  for (const [key, entry] of sessions) {
    if (now - entry.at > ANON_SESSION_KEEP_MS) sessions.delete(key);
  }
  sessions.delete(alias);
  sessions.set(alias, { state, at: now });
  while (sessions.size > 50) sessions.delete(sessions.keys().next().value);
  anonSessionsWrite = anonSessionsWrite.then(async () => {
    if (typeof caches === "undefined" || typeof Response === "undefined") return;
    const cache = await caches.open(ANON_SESSION_CACHE);
    await cache.put(ANON_SESSION_KEY, new Response(JSON.stringify([...sessions])));
  }).catch(() => undefined);
  await anonSessionsWrite;
}

async function anonDirectSessionEnded(alias) {
  if (!alias) return false;
  const entry = (await loadAnonSessions()).get(alias);
  return Boolean(entry && entry.state === "ended" && Date.now() - entry.at <= ANON_SESSION_KEEP_MS);
}

function displayChatNotification(title, options) {
  const job = displayQueue.then(async () => {
    const data = options.data || {};
    const key = data.chatId && data.messageId ? `${data.chatId}:${data.messageId}` : "";
    const arrivalKey = (data.type === "anon_arrival" || data.type === "profile_arrival")
      ? String(options.tag || "") : "";
    if (key && displayedMessages.has(key)) return;
    const principal = arrivalPrincipal(data);
    const transport = String(options.tag || "").startsWith("stm-web-arrival-")
      ? "firestore" : "fcm";
    const now = Date.now();
    for (const [prior, state] of recentlyDisplayedPrincipals) {
      if (state.expires <= now) recentlyDisplayedPrincipals.delete(prior);
    }
    const previousPrincipal = principal ? recentlyDisplayedPrincipals.get(principal) : null;
    // Only coalesce two DIFFERENT delivery transports. Two new FCM event IDs
    // represent distinct arrivals and must not be swallowed by this guard.
    if (previousPrincipal && previousPrincipal.expires > now &&
        previousPrincipal.transport !== transport) return;
    if (arrivalKey) {
      for (const [prior, expires] of displayedArrivals) {
        if (expires <= now) displayedArrivals.delete(prior);
      }
      if ((displayedArrivals.get(arrivalKey) || 0) > now) return;
    }
    if (key && typeof self.registration.getNotifications === "function") {
      const existing = await self.registration.getNotifications({ tag: options.tag }).catch(() => []);
      if (existing.some((item) => item.data?.messageId === data.messageId && item.data?.chatId === data.chatId)) return;
    }
    let previouslyShownArrival = false;
    if (arrivalKey && typeof self.registration.getNotifications === "function") {
      const existing = await self.registration.getNotifications({ tag: arrivalKey }).catch(() => []);
      const matches = existing.filter((item) => item.data?.type === data.type);
      // A stable per-person tag must NOT block a genuine return 15 minutes
      // later. Only a recently displayed OS notice is a duplicate.
      if (matches.some((item) =>
        Number.isFinite(item.timestamp) && Date.now() - item.timestamp >= 0 &&
        Date.now() - item.timestamp < ARRIVAL_RECENT_MS)) return;
      previouslyShownArrival = matches.some((item) =>
        Number.isFinite(item.timestamp) && Date.now() - item.timestamp >= ARRIVAL_RECENT_MS);
    }
    await self.registration.showNotification(title, {
      ...options,
      silent: false,
      // Only an older genuine return may re-alert with the same OS tag.
      renotify: arrivalKey ? previouslyShownArrival : Boolean(options.tag),
    });
    if (principal) {
      recentlyDisplayedPrincipals.set(principal, {
        transport, expires: Date.now() + PRINCIPAL_TRANSPORT_DEDUPE_MS,
      });
      if (recentlyDisplayedPrincipals.size > 600) recentlyDisplayedPrincipals.delete(recentlyDisplayedPrincipals.keys().next().value);
    }
    if (arrivalKey) {
      displayedArrivals.set(arrivalKey, Date.now() + ARRIVAL_RECENT_MS);
      if (displayedArrivals.size > 600) displayedArrivals.delete(displayedArrivals.keys().next().value);
    }
    if (key) {
      displayedMessages.add(key);
      if (displayedMessages.size > 600) displayedMessages.delete(displayedMessages.values().next().value);
    }
  });
  displayQueue = job.catch(() => undefined);
  return job;
}

self.addEventListener("message", (event) => {
  if (event.data?.type === "sayittome:arrival-viewer") {
    const clientId = String(event.source?.id || "");
    const uid = String(event.data.uid || "").slice(0, 128);
    if (clientId) {
      if (uid) arrivalViewers.set(clientId, uid);
      else arrivalViewers.delete(clientId);
    }
    return;
  }
  if (event.data?.type === "sayittome:anon-direct-session") {
    const alias = String(event.data.anonId || "").trim().slice(0, 128);
    if (alias) {
      const state = event.data.state === "ended" ? "ended" : "active";
      event.waitUntil(noteAnonSession(alias, state).catch(() => undefined));
    }
    return;
  }
  const port = event.ports?.[0];
  if (event.data?.type === "sayittome:notification-capabilities") {
    port?.postMessage({ chatDisplay: 1 });
    return;
  }
  if (event.data?.type !== "sayittome:show-chat-notification") return;
  event.waitUntil(
    displayChatNotification(String(event.data.title || "SayItToMe"), event.data.options || {})
      .then(() => port?.postMessage({ ok: true }))
      .catch(() => port?.postMessage({ ok: false })),
  );
});

self.addEventListener("push", (event) => {
  let payload = {};
  try {
    payload = event.data ? event.data.json() : {};
  } catch {
    payload = { data: { body: event.data ? event.data.text() : "" } };
  }
  const data = pushData(payload);
  const receivedTelemetry = appendPushTelemetry({
    kind: "push_received",
    type: String(data.type || ""),
    inbox: String(data.inboxKind || ""),
  });
  const notification =
    payload.notification && typeof payload.notification === "object"
      ? payload.notification
      : {};
  const title = String(data.title || notification.title || "SayItToMe").trim();
  const body = String(data.body || notification.body || "Tenés una novedad").trim();
  const chatId = String(data.chatId || "").trim();
  const messageId = String(data.messageId || "").trim();
  const href = String(data.href || "").trim();
  const tag = String(
    chatId ? `sayittome-chat-${chatId}` : data.tag || data.type || "sayittome",
  ).trim();
  const recipientAnonId = data.inboxKind === "anon_direct"
    ? String(data.recipientAnonId || "").trim() : "";
  const anonSessionEnded = recipientAnonId
    ? anonDirectSessionEnded(recipientAnonId).catch(() => false)
    : Promise.resolve(false);

  const osNotice = (async () => {
    if (await anonSessionEnded) {
      void appendPushTelemetry({ kind: "display_skip", reason: "anon_session_ended", type: String(data.type || ""), inbox: String(data.inboxKind || "") });
      return;
    }
    // A tab can be technically "visible" while another desktop window covers
    // it. Never suppress all anonymous OS notifications for that reason.
    // Skip only the actual originator, when a current same-origin tab identified
    // that Firebase user. This also applies to registered first/re-entrances.
    if (data.type === "anon_arrival" || data.type === "profile_arrival") {
      const clients = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
      const activeIds = new Set(clients.map(client => client.id));
      for (const id of arrivalViewers.keys()) {
        if (!activeIds.has(id)) arrivalViewers.delete(id);
      }
      const originUid = String(data.originUid || "");
      if (originUid && clients.some(client => arrivalViewers.get(client.id) === originUid)) {
        void appendPushTelemetry({ kind: "display_skip", reason: "origin_viewer", type: String(data.type || "") });
        return;
      }
    }
    try {
    await displayChatNotification(title || "SayItToMe", {
      body,
      tag,
      icon: "/icons/Icon-192.png",
      badge: "/icons/Icon-192.png",
      data: { chatId, messageId, href, type: String(data.type || ""),
        anonId: String(data.anonId || ""), username: String(data.username || ""),
        eventId: String(data.eventId || ""), inboxKind: String(data.inboxKind || "") },
    });
    void appendPushTelemetry({ kind: "display_ok", type: String(data.type || ""), ok: true, inbox: String(data.inboxKind || "") });
    } catch (error) {
      void appendPushTelemetry({
        kind: "display_fail",
        type: String(data.type || ""),
        ok: false,
        reason: String(error && error.message ? error.message : "show_failed").slice(0, 80),
      });
      throw error;
    }
  })();
  // A custom worker does not automatically forward FCM data-only pushes to
  // Firebase Messaging onMessage. Deliver the authenticated payload to visible
  // app pages too, where the recipient is checked before any in-page banner.
  // OS push remains active for minimized/closed tabs.
  const geoArrival = data.type === "profile_arrival" && data.geoTargeted === "1";
  const foreground = ((data.type === "chat_message" && chatId && messageId) || geoArrival)
    ? anonSessionEnded.then((ended) => ended ? [] :
      self.clients.matchAll({ type: "window", includeUncontrolled: true })).then((clients) => {
        for (const client of clients) {
          if (client.visibilityState !== "visible") continue;
          try {
            client.postMessage({ type: geoArrival ? "sayittome:geo-profile-arrival-push" : "sayittome:web-foreground-push", data });
          } catch {
            // Keep native OS notification even if a page cannot receive relay.
          }
        }
      })
    : Promise.resolve();
  // Include local diagnostic persistence in the push lifetime. Android may
  // terminate the worker immediately after the OS display promise settles.
  event.waitUntil(Promise.all([osNotice, foreground, receivedTelemetry]));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const data = event.notification.data || {};
  const chatId = String(data.chatId || "").trim();
  const messageId = String(data.messageId || "").trim();
  const href = String(data.href || "").trim();
  let url = href.startsWith("/") ? href : "/chats";
  // Old FCM arrival pushes may still contain /?anonArrival=... from before
  // this release. Bypass HomeSessionRestore, which redirects / to Shuffle
  // before the targeted anonymous chat has a chance to open.
  if (data.type === "anon_arrival") {
    const alias = String(data.anonId || "").trim();
    const legacyAlias = href.startsWith("/?anonArrival=")
      ? new URL(href, self.location.origin).searchParams.get("anonArrival") || "" : "";
    const target = /^anon_[a-z0-9_]{6,80}$/i.test(alias) ? alias : legacyAlias;
    if (/^anon_[a-z0-9_]{6,80}$/i.test(target)) {
      url = "/arrival?anonArrival=" + encodeURIComponent(target);
    }
  }
  if (chatId && data.type !== "anon_direct_message" && data.inboxKind !== "anon_direct") {
    const params = new URLSearchParams({ from: "push" });
    if (messageId) params.set("mid", messageId);
    url = `/chat/${encodeURIComponent(chatId)}?${params.toString()}`;
  }

  event.waitUntil(
    (async () => {
      const all = await self.clients.matchAll({
        type: "window",
        includeUncontrolled: true,
      });
      for (const client of all) {
        if (typeof client.focus === "function") {
          await client.focus();
          const payload = {
            type: "sayittome:chat-notification-open",
            url,
            chatId,
            messageId,
            inboxKind: String(data.inboxKind || ""),
          };
          // A hydrated tab can open this chat with Next's router without
          // tearing down Firebase Auth, the inbox and its realtime listeners.
          // Require an acknowledgment: if the page is suspended or not ready,
          // preserve the original client.navigate fallback for cold starts.
          if (chatId && data.type !== "anon_direct_message" && data.inboxKind !== "anon_direct") {
            try {
              const handled = await new Promise((resolve) => {
                const channel = new MessageChannel();
                const timer = setTimeout(() => resolve(false), 350);
                channel.port1.onmessage = (reply) => {
                  clearTimeout(timer);
                  resolve(reply.data?.handled === true);
                };
                client.postMessage(payload, [channel.port2]);
              });
              if (handled) return;
            } catch {
              // A worker without a live page listener must navigate normally.
            }
          }
          if (typeof client.navigate === "function") {
            try {
              await client.navigate(url);
              return;
            } catch {
              // Fall through to postMessage / openWindow.
            }
          }
          try {
            client.postMessage(payload);
          } catch {
            // ignore
          }
          return;
        }
      }
      if (self.clients.openWindow) {
        await self.clients.openWindow(url);
      }
    })(),
  );
});
