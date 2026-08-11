export type StoryDeepLinkViewerSession = {
  authReady: boolean;
  lastViewer: string;
  generation: number;
};

export function createStoryDeepLinkViewerSession(): StoryDeepLinkViewerSession {
  return {
    authReady: false,
    lastViewer: "",
    generation: 0,
  };
}

/** Ignore the pre-readiness null user that would resolve to "". */
export function shouldIgnorePreReadyAuthNull(authReady: boolean, user: unknown) {
  return !authReady && user == null;
}

export function markStoryDeepLinkAuthReady(session: StoryDeepLinkViewerSession) {
  session.authReady = true;
  return session;
}

export function shouldRefreshStoryViewer(nextViewerId: string, lastViewerId: string) {
  const next = String(nextViewerId || "").trim();
  if (!next) return false;
  return next !== String(lastViewerId || "").trim();
}

export type StoryDeepLinkViewerPlan =
  | { action: "wait"; closeLoading: false }
  | { action: "keep_loading"; closeLoading: false }
  | { action: "seed"; viewerId: string; generation: number; closeLoading: false }
  | {
      action: "refresh";
      viewerId: string;
      generation: number;
      closeLoading: false;
    };

export function planStoryDeepLinkViewer(
  session: StoryDeepLinkViewerSession,
  nextViewerId: string,
): StoryDeepLinkViewerPlan {
  if (!session.authReady) {
    return { action: "wait", closeLoading: false };
  }

  const next = String(nextViewerId || "").trim();
  if (!next) {
    return { action: "keep_loading", closeLoading: false };
  }

  if (!shouldRefreshStoryViewer(next, session.lastViewer)) {
    return {
      action: "seed",
      viewerId: next,
      generation: session.generation,
      closeLoading: false,
    };
  }

  session.lastViewer = next;
  session.generation += 1;
  return {
    action: "refresh",
    viewerId: next,
    generation: session.generation,
    closeLoading: false,
  };
}

export function shouldCloseStoryDeepLinkLoading(input: {
  authReady: boolean;
  viewerId: string;
  requestGeneration: number;
  settledGeneration: number;
  hasGroup: boolean;
}) {
  if (!input.authReady || !String(input.viewerId || "").trim()) return false;
  if (input.hasGroup) return true;
  return input.settledGeneration === input.requestGeneration && input.requestGeneration > 0;
}
