/** One worker queue owns page and push display, including several open tabs. */
const workerCapabilities = new WeakMap<ServiceWorker, Promise<boolean>>();

function workerSupportsChatDisplay(worker: ServiceWorker): Promise<boolean> {
  const existing = workerCapabilities.get(worker);
  if (existing) return existing;
  const pending = new Promise<boolean>((resolve) => {
    const channel = new MessageChannel();
    let settled = false;
    const finish = (supported: boolean) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      channel.port1.close();
      channel.port2.close();
      resolve(supported);
    };
    // A probe has no display side effect. A late old-worker response therefore
    // cannot race the direct fallback and show a second notification.
    // A sleeping worker can need longer than this to boot, so a timeout is not
    // an answer: forget it and probe again on the next delivery.
    const timer = setTimeout(() => {
      if (workerCapabilities.get(worker) === pending) workerCapabilities.delete(worker);
      finish(false);
    }, 350);
    channel.port1.onmessage = (event) => finish(event.data?.chatDisplay === 1);
    try {
      worker.postMessage({ type: "sayittome:notification-capabilities" }, [channel.port2]);
    } catch {
      finish(false);
    }
  });
  workerCapabilities.set(worker, pending);
  return pending;
}

export async function deliverWebChatNotification(
  registration: ServiceWorkerRegistration,
  title: string,
  options: NotificationOptions,
): Promise<"shown" | "pending"> {
  const worker = registration.active;
  if (worker && typeof MessageChannel !== "undefined" && await workerSupportsChatDisplay(worker)) {
    const result = await new Promise<"shown" | "pending" | "failed">((resolve) => {
      const channel = new MessageChannel();
      let settled = false;
      const finish = (value: "shown" | "pending" | "failed") => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        channel.port1.close();
        channel.port2.close();
        resolve(value);
      };
      // Once posted, the worker may still display after this deadline. Never
      // start another display path merely because its acknowledgement is late.
      const timer = setTimeout(() => finish("pending"), 5000);
      channel.port1.onmessage = (event) => finish(event.data?.ok === true ? "shown" : "failed");
      try {
        worker.postMessage({ type: "sayittome:show-chat-notification", title, options }, [channel.port2]);
      } catch {
        finish("failed");
      }
    });
    if (result !== "failed") return result;
  }
  // The direct path bypasses the worker queue; with renotify the same message
  // would alert twice once the push already displayed it.
  if (await isMessageAlreadyDisplayed(registration, options)) return "shown";
  await registration.showNotification(title, options);
  return "shown";
}

async function isMessageAlreadyDisplayed(
  registration: ServiceWorkerRegistration,
  options: NotificationOptions,
): Promise<boolean> {
  const data = (options.data || {}) as { chatId?: unknown; messageId?: unknown };
  const chatId = String(data.chatId || "");
  const messageId = String(data.messageId || "");
  if (!chatId || !messageId || !options.tag || typeof registration.getNotifications !== "function") {
    return false;
  }
  try {
    const existing = await registration.getNotifications({ tag: options.tag });
    return existing.some((item) =>
      item.data?.chatId === chatId && item.data?.messageId === messageId);
  } catch {
    return false;
  }
}

/** Never wait forever on an interrupted worker installation. */
export async function waitForWebNotificationWorker(
  registration: ServiceWorkerRegistration,
): Promise<ServiceWorkerRegistration | null> {
  if (registration.active) return registration;
  const worker = registration.installing || registration.waiting;
  if (!worker) return null;
  await new Promise<void>((resolve) => {
    let settled = false;
    const finish = () => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      worker.removeEventListener("statechange", onState);
      resolve();
    };
    const onState = () => {
      if (worker.state === "activated" || worker.state === "redundant") finish();
    };
    const timer = setTimeout(finish, 5000);
    worker.addEventListener("statechange", onState);
    onState();
  });
  return registration.active ? registration : null;
}
