"use client";

import { useEffect } from "react";

const RECOVERY_KEY = "sayittome:route-recovery";

function isRecoverableRouteError(message: string) {
  return /ChunkLoadError|Loading chunk|Failed to fetch dynamically imported module|Route did not complete|Failed to load server action|text\/x-component/i.test(
    message,
  );
}

function recoveryAttempts() {
  if (typeof window === "undefined") return 0;
  return Number(sessionStorage.getItem(RECOVERY_KEY) || "0");
}

function markRecoveryAttempt() {
  sessionStorage.setItem(RECOVERY_KEY, String(recoveryAttempts() + 1));
}

export default function RouteRecoveryBootstrap() {
  useEffect(() => {
    function maybeRecover(message: string) {
      if (!isRecoverableRouteError(message)) return;
      if (recoveryAttempts() >= 2) return;
      markRecoveryAttempt();
      const url = new URL(window.location.href);
      url.searchParams.set("_recover", String(Date.now()));
      window.location.replace(url.toString());
    }

    const onError = (event: ErrorEvent) => {
      maybeRecover(String(event.message || ""));
    };

    const onUnhandledRejection = (event: PromiseRejectionEvent) => {
      const reason = event.reason as { message?: string; name?: string } | string;
      const message =
        typeof reason === "string"
          ? reason
          : String(reason?.message || reason?.name || "");
      maybeRecover(message);
    };

    window.addEventListener("error", onError);
    window.addEventListener("unhandledrejection", onUnhandledRejection);

    return () => {
      window.removeEventListener("error", onError);
      window.removeEventListener("unhandledrejection", onUnhandledRejection);
    };
  }, []);

  return null;
}
