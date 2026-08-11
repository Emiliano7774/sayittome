import { dequeueStoryViewAck } from "@/lib/stories/storyViewAckQueue";
import {
  isRemoteStoryViewAcked,
  planStoryViewAckTransaction,
} from "@/lib/stories/storiesQueryGuard";

export type AckStoryViewResult = {
  wrote: boolean;
  incremented: boolean;
  missing?: boolean;
};

export type AckTransactionLike = {
  get: (ref: unknown) => Promise<{
    exists: () => boolean;
    data: () => {
      viewedBy?: Record<string, boolean>;
      viewedByAnon?: Record<string, boolean>;
      viewCount?: number;
    };
  }>;
  update: (ref: unknown, data: Record<string, unknown>) => void;
};

export async function executeAckStoryViewCallback(
  tx: AckTransactionLike,
  input: { viewerId: string; storyRef: unknown },
): Promise<AckStoryViewResult> {
  const snap = await tx.get(input.storyRef);
  if (!snap.exists()) {
    return { wrote: false, incremented: false, missing: true };
  }

  const data = snap.data() as {
    viewedBy?: Record<string, boolean>;
    viewedByAnon?: Record<string, boolean>;
    viewCount?: number;
  };
  const plan = planStoryViewAckTransaction({
    viewerId: input.viewerId,
    remoteViewed: isRemoteStoryViewAcked(data, input.viewerId),
  });
  if (!plan.apply) {
    return { wrote: false, incremented: false, missing: false };
  }

  const update: Record<string, unknown> = {
    [plan.viewedField]: true,
  };
  if (plan.increment) {
    update.viewCount = Number(data.viewCount || 0) + 1;
  }
  tx.update(input.storyRef, update);
  return { wrote: true, incremented: plan.increment, missing: false };
}

export function finalizeAckStoryViewQueue(storyId: string, viewerId: string) {
  return dequeueStoryViewAck(storyId, viewerId);
}

export async function ackStoryViewWithRunner(
  storyId: string,
  viewerId: string,
  runTransaction: (
    database: unknown,
    callback: (tx: AckTransactionLike) => Promise<AckStoryViewResult>,
  ) => Promise<AckStoryViewResult>,
  storyRef: unknown = { path: `historias/${storyId}` },
) {
  const id = String(storyId || "").trim();
  const viewer = String(viewerId || "").trim();
  if (!id || !viewer) {
    return { wrote: false, incremented: false };
  }
  const result = await runTransaction(null, (tx) =>
    executeAckStoryViewCallback(tx, { viewerId: viewer, storyRef }),
  );
  finalizeAckStoryViewQueue(id, viewer);
  return result;
}
