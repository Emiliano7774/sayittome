"use client";

import BottomNav from "@/components/navigation/BottomNav";

export default function StoriesPage() {
  return (
    <main className="min-h-screen bg-black px-5 py-8 text-white">

      <h1 className="mb-10 text-7xl font-black tracking-[-0.08em]">
        Historias
      </h1>

      <div className="flex min-h-[55vh] items-center justify-center">

        <p className="text-4xl text-zinc-500">
          No hay historias todavía.
        </p>
      </div>

      
    </main>
  );
}

