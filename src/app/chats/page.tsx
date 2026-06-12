"use client";

import dynamic from "next/dynamic";

const ChatsPageClient = dynamic(() => import("./ChatsPageClient"), {
  ssr: false,
  loading: () => (
    <main className="flex min-h-screen items-center justify-center bg-black text-white/35">
      <p className="text-sm font-bold">Cargando chats...</p>
    </main>
  ),
});

export default function ChatsPage() {
  return <ChatsPageClient />;
}
