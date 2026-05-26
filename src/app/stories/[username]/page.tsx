"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";

import StoryViewer from "@/components/stories/StoryViewer";
import { fetchActiveStoriesGrouped } from "@/lib/stories/fetchStories";
import type { StoryItem } from "@/lib/stories/types";
import { auth } from "@/lib/firebase";
import { onAuthStateChanged } from "firebase/auth";

export default function StoryUserPage() {
  const params = useParams<{ username: string }>();
  const param = String(params.username || "");

  const [stories, setStories] = useState<StoryItem[]>([]);
  const [ownerUsername, setOwnerUsername] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    const unsub = onAuthStateChanged(auth, async (user) => {
      try {
        const groups = await fetchActiveStoriesGrouped(user?.uid || "");
        const group =
          groups.find((g) => g.ownerUid === param) ||
          groups.find(
            (g) =>
              g.ownerUsername.toLowerCase() === param.toLowerCase(),
          );

        if (!cancelled && group) {
          setStories(group.stories);
          setOwnerUsername(group.ownerUsername);
        }
      } catch (e) {
        console.error(e);
      } finally {
        if (!cancelled) setLoading(false);
      }
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

  return <StoryViewer stories={stories} ownerUsername={ownerUsername} />;
}
