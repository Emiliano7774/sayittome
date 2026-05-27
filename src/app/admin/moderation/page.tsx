"use client";

import { collection, limit, onSnapshot, orderBy, query } from "firebase/firestore";
import Link from "next/link";
import { useEffect, useState } from "react";

import AdminShell, { useAdminApi } from "@/components/admin/AdminShell";
import AdminRegistrationsPanel from "@/components/admin/AdminRegistrationsPanel";
import { db } from "@/lib/firebase";
import { storyRequiresBlur } from "@/lib/moderation/blur";

type StoryRow = {
  id: string;
  ownerUsername?: string;
  ownerUid?: string;
  mediaUrl?: string;
  imageUrl?: string;
  views?: number;
  likes?: number;
  reports?: number;
  moderationRequiresBlur?: boolean;
  adminForceBlur?: boolean;
};

export default function AdminModerationPage() {
  const admin = useAdminApi();
  const [stories, setStories] = useState<StoryRow[]>([]);

  useEffect(() => {
    const q = query(collection(db, "historias"), orderBy("createdAt", "desc"), limit(80));

    const unsub = onSnapshot(q, (snap) => {
      setStories(
        snap.docs.map((row) => ({ id: row.id, ...(row.data() as Omit<StoryRow, "id">) })),
      );
    });

    return () => unsub();
  }, []);

  return (
    <AdminShell title="Moderación historias">
      <AdminRegistrationsPanel adminEmail={admin.email} />
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
        {stories.map((story) => {
          const media = story.mediaUrl || story.imageUrl || "";
          const blurred = storyRequiresBlur(story);

          return (
            <div
              key={story.id}
              className="rounded-3xl border border-white/10 overflow-hidden bg-[#0b0b0b]"
            >
              <div className="aspect-[9/16] relative bg-black">
                {media ? (
                  <img
                    src={media}
                    alt=""
                    className={[
                      "absolute inset-0 w-full h-full object-cover",
                      blurred ? "blur-2xl scale-110 opacity-60" : "",
                    ].join(" ")}
                  />
                ) : null}
                <div className="absolute inset-0 bg-gradient-to-t from-black via-transparent to-black/20" />
                <div className="absolute bottom-4 left-4 right-4">
                  <p className="font-black text-lg">{story.ownerUsername || story.ownerUid}</p>
                  <p className="text-white/55 text-sm font-bold">
                    vistas {story.views || 0} · likes {story.likes || 0} · reports {story.reports || 0}
                  </p>
                </div>
              </div>

              <div className="p-4 flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => admin.postAction({ action: "blur_story", storyId: story.id })}
                  className="rounded-xl bg-violet-500/20 px-4 py-2 font-black text-sm"
                >
                  Blur
                </button>
                <button
                  type="button"
                  onClick={() => admin.postAction({ action: "unblur_story", storyId: story.id })}
                  className="rounded-xl bg-white/10 px-4 py-2 font-black text-sm"
                >
                  Unblur
                </button>
                <button
                  type="button"
                  onClick={() => admin.postAction({ action: "delete_story", storyId: story.id })}
                  className="rounded-xl bg-red-500/20 px-4 py-2 font-black text-sm"
                >
                  Delete
                </button>
                {story.ownerUsername ? (
                  <Link
                    href={`/u/${encodeURIComponent(story.ownerUsername)}`}
                    className="rounded-xl border border-white/15 px-4 py-2 font-black text-sm"
                  >
                    Perfil
                  </Link>
                ) : null}
              </div>
            </div>
          );
        })}
      </div>
    </AdminShell>
  );
}
