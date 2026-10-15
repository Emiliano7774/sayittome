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
const ARRIVAL_RECENT_MS = 2 * 60 * 1000;

function displayChatNotification(title, options) {
  const job = displayQueue.then(async () => {
    const data = options.data || {};
    const key = data.chatId && data.messageId ? `${data.chatId}:${data.messageId}` : "";
    const arrivalKey = (data.type === "anon_arrival" || data.type === "profile_arrival")
      ? String(options.tag || "") : "";
    if (key && displayedMessages.has(key)) return;
    if (arrivalKey) {
      const now = Date.now();
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

  const osNotice = (async () => {
    // A visible app tab already shows the anonymous arrival toast from Firestore.
    // Background/closed web still receives exactly one OS notification.
    if (data.type === "anon_arrival") {
      const clients = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
      if (clients.some((client) => client.visibilityState === "visible")) return;
    }
    await displayChatNotification(title || "SayItToMe", {
      body,
      tag,
      icon: "/icons/Icon-192.png",
      badge: "/icons/Icon-192.png",
      data: { chatId, messageId, href, type: String(data.type || ""), inboxKind: String(data.inboxKind || "") },
    });
  })();
  // A custom worker does not automatically forward FCM data-only pushes to
  // Firebase Messaging onMessage. Deliver the authenticated payload to visible
  // app pages too, where the recipient is checked before any in-page banner.
  // OS push remains active for minimized/closed tabs.
  const foreground = data.type === "chat_message" && chatId && messageId
    ? self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clients) => {
        for (const client of clients) {
          if (client.visibilityState !== "visible") continue;
          try {
            client.postMessage({ type: "sayittome:web-foreground-push", data });
          } catch {
            // Keep native OS notification even if a page cannot receive relay.
          }
        }
      })
    : Promise.resolve();
  event.waitUntil(Promise.all([osNotice, foreground]));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const data = event.notification.data || {};
  const chatId = String(data.chatId || "").trim();
  const messageId = String(data.messageId || "").trim();
  const href = String(data.href || "").trim();
  let url = href.startsWith("/") ? href : "/chats";
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
          if (typeof client.navigate === "function") {
            try {
              await client.navigate(url);
              return;
            } catch {
              // Fall through to postMessage / openWindow.
            }
          }
          try {
            client.postMessage({
              type: "sayittome:chat-notification-open",
              url,
              chatId,
              messageId,
              inboxKind: String(data.inboxKind || ""),
            });
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
