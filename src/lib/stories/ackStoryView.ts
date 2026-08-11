import { doc, runTransaction } from "firebase/firestore";

import { db } from "@/lib/firebase";
import {
  ackStoryViewWithRunner,
  executeAckStoryViewCallback,
  finalizeAckStoryViewQueue,
  type AckStoryViewResult,
  type AckTransactionLike,
} from "@/lib/stories/ackStoryViewCore";
import {
  enqueueStoryViewAck,
  listStoryViewAckQueue,
  planAckFailureRecovery,
  resetStoryViewAckQueueForTests,
  retainStoryViewAckQueueForViewer,
  schedulePartitionedAckFlush,
} from "@/lib/stories/storyViewAckQueue";

export type { AckStoryViewResult, AckTransactionLike };
export { executeAckStoryViewCallback, finalizeAckStoryViewQueue };

export function enqueueStoryViewAckRetry(storyId: string, viewerId: string) {
  return enqueueStoryViewAck(storyId, viewerId);
}

export function peekStoryViewAckRetriesForTests() {
  return listStoryViewAckQueue();
}

export function clearStoryViewAckRetriesForTests() {
  resetStoryViewAckQueueForTests();
}

export async function ackStoryView(
  storyId: string,
  viewerId: string,
  deps?: {
    runTransaction?: (
      database: unknown,
      callback: (tx: AckTransactionLike) => Promise<AckStoryViewResult>,
    ) => Promise<AckStoryViewResult>;
    storyRef?: unknown;
  },
) {
  const id = String(storyId || "").trim();
  const viewer = String(viewerId || "").trim();
  if (!id || !viewer) {
    return { wrote: false, incremented: false };
  }

  if (deps?.runTransaction) {
    return ackStoryViewWithRunner(id, viewer, deps.runTransaction, deps.storyRef);
  }

  const storyRef = doc(db, "historias", id);
  const result = await runTransaction(db, (tx) =>
    executeAckStoryViewCallback(tx as unknown as AckTransactionLike, {
      viewerId: viewer,
      storyRef,
    }),
  );
  finalizeAckStoryViewQueue(id, viewer);
  return result;
}

export async function flushStoryViewAckRetries(viewerId?: string) {
  return schedulePartitionedAckFlush(viewerId, ackStoryView);
}

export function scheduleStoryViewAckFlush(viewerId?: string) {
  return schedulePartitionedAckFlush(viewerId, ackStoryView);
}

export function isolateStoryViewAckQueue(viewerId: string) {
  return retainStoryViewAckQueueForViewer(viewerId);
}

export { planAckFailureRecovery };
