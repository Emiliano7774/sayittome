"use client";

import { Suspense, useEffect, useState } from "react";
import { useParams, useSearchParams } from "next/navigation";
import { onAuthStateChanged } from "firebase/auth";

import StoryViewer from "@/components/stories/StoryViewer";
import { auth } from "@/lib/firebase";
import { peekNativeNavPath } from "@/lib/navigation/nativeNavStack";
import {
  peekStoryReturnTo,
  stashStoryReturnTo,
} from "@/lib/navigation/storyReturnNav";
import { resolveStoryViewerId, resolveStoryViewerIdReady } from "@/lib/stories/anonStories";
import { hasStoriesEverHydrated } from "@/hooks/useStoriesReady";
import { shouldSuppressRouteLoadingShell } from "@/lib/navigation/instantNavPolicy";
import { preloadStoryGroup } from "@/lib/stories/preload";
import {
  getCachedStoryGroups,
  getStoryGroup,
  refreshStoriesIndex,
  subscribeStoriesIndex,
} from "@/lib/stories/storiesIndexStore";
import {
  createStoryDeepLinkViewerSession,
  markStoryDeepLinkAuthReady,
  planStoryDeepLinkViewer,
  shouldCloseStoryDeepLinkLoading,
  shouldIgnorePreReadyAuthNull,
} from "@/lib/stories/storyDeepLinkSession";
import type { StoryItem } from "@/lib/stories/types";

function StoryUserPageInner() {
  const params = useParams<{ username: string }>();
  const searchParams = useSearchParams();
  const param = String(params.username || "");
  const initialStoryId = String(
    searchParams.get("story") || searchParams.get("storyId") || "",
  ).trim();

  const cachedOnOpen = getStoryGroup(param, param);
  const [stories, setStories] = useState<StoryItem[]>(() => cachedOnOpen?.stories || []);
  const [ownerUsername, setOwnerUsername] = useState(() => cachedOnOpen?.ownerUsername || "");
  const [loading, setLoading] = useState(() => !cachedOnOpen || cachedOnOpen.stories.length === 0);
  const [appliedParam, setAppliedParam] = useState(param);
  if (appliedParam !== param) {
    setAppliedParam(param);
    const group = getStoryGroup(param, param);
    setStories(group?.stories || []);
    setOwnerUsername(group?.ownerUsername || "");
    setLoading(!group || group.stories.length === 0);
  }

  useEffect(() => {
    if (peekStoryReturnTo()) return;

    const previous = peekNativeNavPath(`/stories/${encodeURIComponent(param)}`);
    if (previous) {
      stashStoryReturnTo(previous);
      return;
    }
    stashStoryReturnTo("/stories");
  }, [param]);

  useEffect(() => {
    let cancelled = false;
    const session = createStoryDeepLinkViewerSession();

    const applyGroup = (viewerHint = session.lastViewer) => {
      if (cancelled) return null;
      if (viewerHint) {
        getCachedStoryGroups(viewerHint);
      }
      const group = getStoryGroup(param, param);
      if (group) {
        setStories(group.stories);
        setOwnerUsername(group.ownerUsername);
        preloadStoryGroup(group, 3);
      }
      return group;
    };

    const maybeCloseLoading = (
      viewerId: string,
      requestGeneration: number,
      settledGeneration: number,
      hasGroup: boolean,
    ) => {
      if (
        shouldCloseStoryDeepLinkLoading({
          authReady: session.authReady,
          viewerId,
          requestGeneration,
          settledGeneration,
          hasGroup,
        })
      ) {
        setLoading(false);
      }
    };

    const runPlan = (nextViewerId: string) => {
      const plan = planStoryDeepLinkViewer(session, nextViewerId);
      if (plan.action === "wait" || plan.action === "keep_loading") return;

      const group = applyGroup(plan.viewerId);
      maybeCloseLoading(plan.viewerId, plan.generation, 0, Boolean(group));

      if (plan.action === "seed") return;

      const gen = plan.generation;
      void refreshStoriesIndex(plan.viewerId).then(() => {
        if (cancelled || gen !== session.generation) return;
        const nextGroup = applyGroup(plan.viewerId);
        maybeCloseLoading(plan.viewerId, gen, session.generation, Boolean(nextGroup));
      });
    };

    const unsubIndex = subscribeStoriesIndex(() => {
      const group = applyGroup();
      maybeCloseLoading(session.lastViewer, session.generation, session.generation, Boolean(group));
    });

    void resolveStoryViewerIdReady().then((viewerId) => {
      if (cancelled) return;
      markStoryDeepLinkAuthReady(session);
      runPlan(viewerId);
    });

    const unsubAuth = onAuthStateChanged(auth, (user) => {
      if (shouldIgnorePreReadyAuthNull(session.authReady, user)) return;
      runPlan(resolveStoryViewerId(user));
    });

    return () => {
      cancelled = true;
      unsubIndex();
      unsubAuth();
    };
  }, [param]);

  const cachedOnRender = getStoryGroup(param, param);
  const displayStories =
    cachedOnRender && cachedOnRender.stories.length > 0 ? cachedOnRender.stories : stories;
  const displayOwnerUsername =
    cachedOnRender?.ownerUsername || ownerUsername;

  const showOpenLoading = !shouldSuppressRouteLoadingShell({
    hasCachedContent: displayStories.length > 0,
    hasEverHydrated: hasStoriesEverHydrated(),
    networkLoading: loading,
  });

  if (showOpenLoading) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-black text-white">
        <p className="text-2xl font-black text-white/40">Abriendo historia...</p>
      </main>
    );
  }

  if (displayStories.length === 0) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-black text-white">
        <p className="text-2xl font-black text-white/40">Historia no disponible.</p>
      </main>
    );
  }

  return (
    <StoryViewer
      stories={displayStories}
      ownerUsername={displayOwnerUsername}
      ownerUid={displayStories[0]?.ownerUid}
      initialStoryId={initialStoryId || undefined}
    />
  );
}

export default function StoryUserPage() {
  return (
    <Suspense fallback={null}>
      <StoryUserPageInner />
    </Suspense>
  );
}
