"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import {
  collection,
  doc,
  limit,
  onSnapshot,
  orderBy,
  query,
  updateDoc,
} from "firebase/firestore";

import { auth, db } from "@/lib/firebase";

const ADMIN_EMAIL = "emilianomaturano@gmail.com";

type StoryData = {
  id: string;
  ownerUid?: string;
  mediaType?: string;
  texto?: string;
  mediaUrl?: string;
  likeCount?: number;
  viewCount?: number;
  active?: boolean;
};

export default function AdminStoriesPage() {
  const [allowed, setAllowed] = useState(false);
  const [stories, setStories] = useState<StoryData[]>([]);

  useEffect(() => {
    const email = auth.currentUser?.email || "";
    setAllowed(email.toLowerCase() === ADMIN_EMAIL.toLowerCase());
  }, []);

  useEffect(() => {
    if (!allowed) return;

    const q = query(
      collection(db, "historias"),
      orderBy("createdAt", "desc"),
      limit(100)
    );

    const unsub = onSnapshot(q, (snapshot) => {
      const docs: StoryData[] = [];

      snapshot.forEach((docu) => {
        docs.push({
          id: docu.id,
          ...(docu.data() as any),
        });
      });

      setStories(docs);
    });

    return () => unsub();
  }, [allowed]);

  const disableStory = async (storyId: string) => {
    const ok = confirm("Â¿Marcar esta historia como inactiva?");
    if (!ok) return;

    await updateDoc(doc(db, "historias", storyId), {
      active: false,
      adminDisabled: true,
      adminDisabledAt: new Date(),
    });
  };

  if (!allowed) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-black text-white">
        Acceso denegado.
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-black px-4 py-8 text-white">
      <section className="mx-auto max-w-6xl">
        <div className="mb-8 flex items-center justify-between">
          <div>
            <p className="text-xs uppercase tracking-[0.4em] text-fuchsia-300">
              ADMIN
            </p>

            <h1 className="mt-2 text-5xl font-black">Historias</h1>
          </div>

          <Link
            href="/admin"
            className="rounded-full border border-white/10 bg-zinc-950 px-5 py-3 text-sm font-black"
          >
            Volver
          </Link>
        </div>

        <div className="space-y-4">
          {stories.map((story) => (
            <div
              key={story.id}
              className="rounded-[2rem] border border-white/10 bg-zinc-950 p-5"
            >
              <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                <div className="min-w-0">
                  <p className="text-xs font-black uppercase tracking-[0.25em] text-zinc-500">
                    {story.mediaType || "text"} Â· {story.active === false ? "Inactiva" : "Activa"}
                  </p>

                  <h2 className="mt-2 truncate text-xl font-black">
                    {story.texto || story.mediaUrl || "Historia multimedia"}
                  </h2>

                  <p className="mt-2 text-sm text-zinc-500">
                    Owner: {story.ownerUid || "sin owner"} Â· {story.viewCount || 0} vistas Â· {story.likeCount || 0} likes
                  </p>
                </div>

                <div className="flex flex-wrap gap-3">
                  {story.ownerUid && (
                    <Link
                      href={"/stories/" + story.ownerUid}
                      className="rounded-full bg-white px-5 py-3 text-sm font-black text-black"
                    >
                      Abrir
                    </Link>
                  )}

                  <button
                    onClick={() => disableStory(story.id)}
                    className="rounded-full border border-red-400/30 bg-red-500/10 px-5 py-3 text-sm font-black text-red-200"
                  >
                    Desactivar
                  </button>
                </div>
              </div>
            </div>
          ))}

          {stories.length === 0 && (
            <div className="rounded-[2rem] border border-dashed border-white/10 p-10 text-center text-zinc-500">
              No hay historias.
            </div>
          )}
        </div>
      </section>
    </main>
  );
}
