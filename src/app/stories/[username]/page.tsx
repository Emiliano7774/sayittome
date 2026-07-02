"use client";

import { Suspense, useEffect, useState } from "react";
import { useParams, useSearchParams } from "next/navigation";
import { onAuthStateChanged } from "firebase/auth";

import StoryViewer from "@/components/stories/StoryViewer";
import { auth } from "@/lib/firebase";
import { resolveStoryViewerId } from "@/lib/stories/anonStories";
import { preloadStoryGroup } from "@/lib/stories/preload";
import {
  getStoryGroup,
  refreshStoriesIndex,
} from "@/lib/stories/storiesIndexStore";
import type { StoryItem } from "@/lib/stories/types";

function StoryUserPageInner() {
  const params = useParams<{ username: string }>();
  const searchParams = useSearchParams();
  const param = String(params.username || "");
  const initialStoryId = String(
    searchParams.get("story") || searchParams.get("storyId") || "",
  ).trim();

  const [stories, setStories] = useState<StoryItem[]>(() => {
    const group = getStoryGroup(param, param);
    return group?.stories || [];
  });
  const [ownerUsername, setOwnerUsername] = useState(() => {
    const group = getStoryGroup(param, param);
    return group?.ownerUsername || "";
  });
  const [loading, setLoading] = useState(() => {
    const group = getStoryGroup(param, param);
    return !group || group.stories.length === 0;
  });

  useEffect(() => {
    let cancelled = false;

    const cached = getStoryGroup(param, param);
    if (cached) {
      setStories(cached.stories);
      setOwnerUsername(cached.ownerUsername);
      preloadStoryGroup(cached, 3);
      setLoading(false);
    }

    const unsub = onAuthStateChanged(auth, (user) => {
      const viewerId = resolveStoryViewerId(user);
      void refreshStoriesIndex(viewerId).then(() => {
        if (cancelled) return;

        const group = getStoryGroup(param, param);
        if (group) {
          setStories(group.stories);
          setOwnerUsername(group.ownerUsername);
          preloadStoryGroup(group, 3);
        }
        setLoading(false);
      });
    });

    return () => {
      cancelled = true;
      unsub();
    };
  }, [param]);

  if (loading) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-black text-white">
        <p className="text-2xl font-black text-white/40">Abriendo historia...</p>
      </main>
    );
  }

  if (stories.length === 0) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-black text-white">
        <p className="text-2xl font-black text-white/40">Historia no disponible.</p>
      </main>
    );
  }

  return (
    <StoryViewer
      stories={stories}
      ownerUsername={ownerUsername}
      ownerUid={stories[0]?.ownerUid}
      initialStoryId={initialStoryId || undefined}
    />
  );
}

export default function StoryUserPage() {
  return (
    <Suspense
      fallback={
        <main className="flex min-h-screen items-center justify-center bg-black text-white">
          <p className="text-2xl font-black text-white/40">Abriendo historia...</p>
        </main>
      }
    >
      <StoryUserPageInner />
    </Suspense>
  );
}
