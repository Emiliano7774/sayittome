"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { collection, limit, onSnapshot, orderBy, query } from "firebase/firestore";
import { useEffect, useState } from "react";
import { ExternalLink } from "lucide-react";

import { useAdminApi } from "@/components/admin/AdminShell";
import { useT } from "@/contexts/LocaleContext";
import { db } from "@/lib/firebase";
import { storyRequiresBlur } from "@/lib/moderation/blur";
import { getStoriesPath, getStoryViewerPath } from "@/lib/stories/openStories";

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

function resolveStoryOwnerKey(story: StoryRow) {
  return String(story.ownerUid || story.ownerUsername || "").trim();
}

export default function AdminStoriesPanel() {
  const admin = useAdminApi();
  const router = useRouter();
  const t = useT();
  const [stories, setStories] = useState<StoryRow[]>([]);
  const [lookup, setLookup] = useState("");

  useEffect(() => {
    const q = query(collection(db, "historias"), orderBy("createdAt", "desc"), limit(80));

    const unsub = onSnapshot(q, (snap) => {
      setStories(
        snap.docs.map((row) => ({ id: row.id, ...(row.data() as Omit<StoryRow, "id">) })),
      );
    });

    return () => unsub();
  }, []);

  function openStoriesDirect() {
    const key = lookup.trim().replace(/^@/, "");
    if (!key) return;

    const path = getStoriesPath(key, key);
    if (!path) return;
    router.push(path);
  }

  return (
    <div className="space-y-5">
      <div className="rounded-3xl border border-white/10 bg-[#0b0b0b] p-4">
        <p className="text-sm font-black text-white/80">{t("admin_stories_open_label")}</p>
        <div className="mt-3 flex flex-col gap-2 sm:flex-row">
          <input
            value={lookup}
            onChange={(event) => setLookup(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") openStoriesDirect();
            }}
            placeholder={t("admin_stories_open_placeholder")}
            className="min-w-0 flex-1 rounded-2xl border border-white/10 bg-black px-4 py-3 text-sm font-semibold text-white outline-none placeholder:text-white/30"
          />
          <button
            type="button"
            onClick={openStoriesDirect}
            className="inline-flex items-center justify-center gap-2 rounded-2xl bg-violet-500/20 px-5 py-3 text-sm font-black text-violet-100"
          >
            <ExternalLink size={16} />
            {t("admin_stories_open_button")}
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-3">
        {stories.map((story) => {
          const media = story.mediaUrl || story.imageUrl || "";
          const blurred = storyRequiresBlur(story);
          const ownerKey = resolveStoryOwnerKey(story);
          const viewerPath = ownerKey ? getStoryViewerPath(ownerKey, story.id) : null;

          return (
            <div
              key={story.id}
              className="overflow-hidden rounded-3xl border border-white/10 bg-[#0b0b0b]"
            >
              {viewerPath ? (
                <Link href={viewerPath} className="relative block aspect-[9/16] bg-black">
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
                      vistas {story.views || 0} · likes {story.likes || 0} · reports{" "}
                      {story.reports || 0}
                    </p>
                  </div>
                </Link>
              ) : (
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
                      vistas {story.views || 0} · likes {story.likes || 0} · reports{" "}
                      {story.reports || 0}
                    </p>
                  </div>
                </div>
              )}

              <div className="flex flex-wrap gap-2 p-4">
                {viewerPath ? (
                  <Link
                    href={viewerPath}
                    className="inline-flex items-center gap-1.5 rounded-xl border border-violet-400/30 bg-violet-500/15 px-4 py-2 text-sm font-black text-violet-100"
                  >
                    <ExternalLink size={14} />
                    {t("admin_stories_view_story")}
                  </Link>
                ) : null}
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
    </div>
  );
}
