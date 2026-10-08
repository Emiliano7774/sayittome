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

// Push and Firestore can report the same arrival concurrently, or from several
// open tabs. Serialize display and dedupe by message id, never by message text.
let displayQueue = Promise.resolve();
const displayedMessages = new Set();

function displayChatNotification(title, options) {
  const job = displayQueue.then(async () => {
    const data = options.data || {};
    const key = data.chatId && data.messageId
      ? `${data.chatId}:${data.messageId}` : "";
    if (key && displayedMessages.has(key)) return;
    if (key && typeof self.registration.getNotifications === "function") {
      const existing = await self.registration.getNotifications({ tag: options.tag })
        .catch(() => []);
      if (existing.some((item) => item.data?.messageId === data.messageId &&
        item.data?.chatId === data.chatId)) return;
    }
    await self.registration.showNotification(title, {
      ...options,
      silent: false,
      renotify: Boolean(options.tag),
    });
    // Only consume the id after successful presentation; failed delivery retries.
    if (key) {
      displayedMessages.add(key);
      if (displayedMessages.size > 600) {
        displayedMessages.delete(displayedMessages.values().next().value);
      }
    }
  });
  displayQueue = job.catch(() => undefined);
  return job;
}

self.addEventListener("message", (event) => {
  if (event.data?.type !== "sayittome:show-chat-notification") return;
  const port = event.ports?.[0];
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

  event.waitUntil(
    displayChatNotification(title || "SayItToMe", {
      body,
      tag,
      icon: "/icons/Icon-192.png",
      badge: "/icons/Icon-192.png",
      data: { chatId, messageId, href, type: String(data.type || "") },
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const data = event.notification.data || {};
  const chatId = String(data.chatId || "").trim();
  const messageId = String(data.messageId || "").trim();
  const href = String(data.href || "").trim();
  let url = href.startsWith("/") ? href : "/chats";
  if (chatId) {
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
