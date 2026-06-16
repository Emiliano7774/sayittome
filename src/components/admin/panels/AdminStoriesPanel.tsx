"use client";

import Link from "next/link";
import { collection, limit, onSnapshot, orderBy, query } from "firebase/firestore";
import { useEffect, useState } from "react";

import { useAdminApi } from "@/components/admin/AdminShell";
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

export default function AdminStoriesPanel() {
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
    <div className="grid grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-3">
      {stories.map((story) => {
        const media = story.mediaUrl || story.imageUrl || "";
        const blurred = storyRequiresBlur(story);

        return (
          <div
            key={story.id}
            className="overflow-hidden rounded-3xl border border-white/10 bg-[#0b0b0b]"
          >
            <div className="relative aspect-[9/16] bg-black">
              {media ? (
                <img
                  src={media}
                  alt=""
                  className={[
                    "absolute inset-0 h-full w-full object-cover",
                    blurred ? "scale-110 opacity-60 blur-2xl" : "",
                  ].join(" ")}
                />
              ) : null}
              <div className="absolute inset-0 bg-gradient-to-t from-black via-transparent to-black/20" />
              <div className="absolute bottom-4 left-4 right-4">
                <p className="text-lg font-black">{story.ownerUsername || story.ownerUid}</p>
                <p className="text-sm font-bold text-white/55">
                  vistas {story.views || 0} · likes {story.likes || 0} · reports {story.reports || 0}
                </p>
              </div>
            </div>

            <div className="flex flex-wrap gap-2 p-4">
              <button
                type="button"
                onClick={() => admin.postAction({ action: "blur_story", storyId: story.id })}
                className="rounded-xl bg-violet-500/20 px-4 py-2 text-sm font-black"
              >
                Blur
              </button>
              <button
                type="button"
                onClick={() => admin.postAction({ action: "unblur_story", storyId: story.id })}
                className="rounded-xl bg-white/10 px-4 py-2 text-sm font-black"
              >
                Unblur
              </button>
              <button
                type="button"
                onClick={() => admin.postAction({ action: "delete_story", storyId: story.id })}
                className="rounded-xl bg-red-500/20 px-4 py-2 text-sm font-black"
              >
                Delete
              </button>
              {story.ownerUsername ? (
                <Link
                  href={`/u/${encodeURIComponent(story.ownerUsername)}`}
                  className="rounded-xl border border-white/15 px-4 py-2 text-sm font-black"
                >
                  Perfil
                </Link>
              ) : null}
            </div>
          </div>
        );
      })}
    </div>
  );
}
