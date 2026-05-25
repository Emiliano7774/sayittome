"use client";

import Link from "next/link";
import { useParams } from "next/navigation";

export default function StoryPage() {
  const params = useParams<{ username: string }>();

  const username = String(params.username || "usuario");

  return (
    <main className="flex min-h-screen items-center justify-center bg-black text-white">

      <div className="relative h-screen w-full bg-black">

        <div className="absolute left-0 right-0 top-0 z-40 flex items-center justify-between px-6 py-6">
          <Link href="/shuffle" className="text-5xl">
            ×
          </Link>

          <button
            onClick={() => {
              window.location.href = `/u/${username}`;
            }}
            className="flex items-center gap-3"
          >
            <div className="h-14 w-14 rounded-full bg-zinc-700" />

            <span className="text-3xl font-semibold">
              {username}
            </span>
          </button>

          <div className="w-10" />
        </div>

        <div className="flex h-full items-center justify-center">
          <div className="text-center">
            <div className="mb-8 text-8xl">🟣</div>

            <p className="text-5xl font-bold">
              Historia de {username}
            </p>
          </div>
        </div>
      </div>
    </main>
  );
}
