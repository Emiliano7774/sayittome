"use client";

import { useEffect } from "react";

export default function AppError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("app_route_error", error);
  }, [error]);

  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-6 bg-black px-6 text-center text-white">
      <div className="text-5xl font-black text-white/80" aria-hidden>
        !
      </div>
      <div>
        <h1 className="text-2xl font-black">No se pudo cargar la página</h1>
        <p className="mt-3 text-sm font-semibold text-white/45">
          Recargá para intentar de nuevo, o volvé atrás.
        </p>
      </div>
      <div className="flex w-full max-w-xs flex-col gap-3">
        <button
          type="button"
          onClick={() => window.location.reload()}
          className="rounded-full bg-white px-6 py-3 text-base font-black text-black"
        >
          Recargar
        </button>
        <button
          type="button"
          onClick={() => {
            if (window.history.length > 1) {
              window.history.back();
              return;
            }
            reset();
          }}
          className="rounded-full border border-white/20 px-6 py-3 text-base font-black text-white"
        >
          Volver
        </button>
      </div>
    </main>
  );
}
