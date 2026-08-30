import { countRestorableWarmFeedSlots } from "@/lib/shuffle/shufflePresentation";
import { getVisibleShuffleProfiles } from "@/lib/shuffle/shuffleSlotsStore";
import {
  finalizeStuckWarmShuffleHandoffForReshuffle,
} from "@/lib/navigation/shuffleKeepAlive";
import {
  isShuffleRevealDeferred,
  isShuffleSurfacePresented,
} from "@/lib/navigation/shuffleHandoffState";
import { isShuffleHandoffPreparing } from "@/lib/shuffle/shuffleWarmVisual";

function normalizePath(pathname: string) {
  return String(pathname || "/").split("?")[0].split("#")[0] || "/";
}

/** Warm Chats→Shuffle can land on /shuffle with slots visible while defer/preparing latch stays armed. */
export function needsShuffleHandoffFinalizeForReshuffle(pathname: string) {
  if (normalizePath(pathname) !== "/shuffle") return false;
  const restorable = Math.max(
    countRestorableWarmFeedSlots(),
    getVisibleShuffleProfiles().length,
  );
  if (restorable < 3) return false;
  return (
    isShuffleRevealDeferred() ||
    isShuffleHandoffPreparing() ||
    !isShuffleSurfacePresented()
  );
}

/** Run the canonical warm handoff settle path before Cambiar perfiles or post-handoff pool sync. */
export function finalizeShuffleWarmHandoffForReshuffle() {
  return finalizeStuckWarmShuffleHandoffForReshuffle();
}
