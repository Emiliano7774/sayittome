"use client";

import { useEffect } from "react";

export default function AdminChatsError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("admin_chats_error", error);
  }, [error]);

  return (
    <main className="min-h-screen bg-black px-6 py-10 text-white">
      <p className="text-2xl font-black">No se pudo cargar la revisión de chats</p>
      <p className="mt-3 max-w-md text-sm font-bold text-white/45">
        {error.message || "Error inesperado en el panel admin."}
      </p>
      <div className="mt-6 flex flex-wrap gap-3">
        <button
          type="button"
          onClick={() => reset()}
          className="rounded-full border border-white/15 bg-[#111] px-5 py-2.5 text-sm font-bold"
        >
          Reintentar
        </button>
        <a
          href="/admin/moderation?tab=chats"
          className="rounded-full border border-violet-400/30 bg-violet-500/12 px-5 py-2.5 text-sm font-bold text-violet-100"
        >
          Volver a revisar chats
        </a>
      </div>
    </main>
  );
}
