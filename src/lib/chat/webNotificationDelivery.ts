/** Use the same serialized worker path for live-page and background push alerts. */
export async function deliverWebChatNotification(
  registration: ServiceWorkerRegistration,
  title: string,
  options: NotificationOptions,
) {
  const worker = registration.active;
  if (worker && typeof MessageChannel !== "undefined") {
    const handled = await new Promise<boolean>((resolve) => {
      const channel = new MessageChannel();
      const finish = (ok: boolean) => {
        clearTimeout(timer);
        channel.port1.close();
        channel.port2.close();
        resolve(ok);
      };
      // Old workers do not implement this protocol. Keep upgrades compatible.
      const timer = setTimeout(() => finish(false), 5000);
      channel.port1.onmessage = (event) => finish(event.data?.ok === true);
      try {
        worker.postMessage(
          { type: "sayittome:show-chat-notification", title, options },
          [channel.port2],
        );
      } catch {
        finish(false);
      }
    });
    if (handled) return;
  }
  await registration.showNotification(title, options);
}
