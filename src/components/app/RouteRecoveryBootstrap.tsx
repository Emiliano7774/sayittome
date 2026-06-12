"use client";

import { useEffect } from "react";

const RECOVERY_KEY = "sayittome:route-recovery";

function isRecoverableRouteError(message: string) {
  return /ChunkLoadError|Loading chunk|Failed to fetch dynamically imported module|Route did not complete|Failed to load server action|text\/x-component/i.test(
    message,
  );
}

export default function RouteRecoveryBootstrap() {
  useEffect(() => {
    function maybeRecover(message: string) {
      if (!isRecoverableRouteError(message)) return;
      if (sessionStorage.getItem(RECOVERY_KEY) === "1") return;
      sessionStorage.setItem(RECOVERY_KEY, "1");
      window.location.reload();
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
