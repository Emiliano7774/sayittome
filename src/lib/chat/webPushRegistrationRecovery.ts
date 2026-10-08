/** Bounded retries; focus/online can recover again without requiring a reload. */
export function startWebPushRegistrationRecovery(input: {
  events: Pick<Window, "addEventListener" | "removeEventListener">;
  visibility: Pick<Document, "addEventListener" | "removeEventListener" | "hidden">;
  ready: () => boolean;
  registered: () => boolean;
  register: () => Promise<unknown>;
}) {
  let disposed = false;
  let inFlight = false;
  let failures = 0;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const retryDelays = [5000, 30000, 120000];

  const attempt = async () => {
    if (disposed || inFlight || !input.ready() || input.registered()) return;
    clearTimeout(timer);
    inFlight = true;
    try {
      await input.register();
    } catch {
      // The next attempt can recover from a transient network/SDK failure.
    } finally {
      inFlight = false;
      if (!disposed && input.ready() && !input.registered() && failures < retryDelays.length) {
        timer = setTimeout(() => void attempt(), retryDelays[failures++]);
      }
    }
  };
  const resume = () => {
    if (input.visibility.hidden) return;
    failures = 0;
    void attempt();
  };
  input.events.addEventListener("focus", resume);
  input.events.addEventListener("online", resume);
  input.visibility.addEventListener("visibilitychange", resume);
  void attempt();
  return () => {
    disposed = true;
    clearTimeout(timer);
    input.events.removeEventListener("focus", resume);
    input.events.removeEventListener("online", resume);
    input.visibility.removeEventListener("visibilitychange", resume);
  };
}
