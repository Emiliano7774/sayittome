export const STORY_DISMISS_VIEWPORT_RATIO = 0.22;
export const STORY_DISMISS_MIN_THRESHOLD_PX = 96;
export const STORY_DISMISS_MAX_THRESHOLD_PX = 180;
export const STORY_DISMISS_FLICK_MIN_DISTANCE_PX = 52;
export const STORY_DISMISS_FLICK_VELOCITY_PX_MS = 0.72;

export function storyDismissThresholdPx(viewportHeight: number) {
  const height = Math.max(1, Number(viewportHeight) || 0);
  return Math.min(
    STORY_DISMISS_MAX_THRESHOLD_PX,
    Math.max(STORY_DISMISS_MIN_THRESHOLD_PX, height * STORY_DISMISS_VIEWPORT_RATIO),
  );
}

export function shouldDismissStoryGesture(input: {
  deltaY: number;
  elapsedMs: number;
  viewportHeight: number;
}) {
  const distance = Math.max(0, Number(input.deltaY) || 0);
  if (distance <= 0) return false;

  const threshold = storyDismissThresholdPx(input.viewportHeight);
  if (distance >= threshold) return true;

  const elapsed = Math.max(1, Number(input.elapsedMs) || 0);
  const velocity = distance / elapsed;
  return (
    distance >= STORY_DISMISS_FLICK_MIN_DISTANCE_PX &&
    velocity >= STORY_DISMISS_FLICK_VELOCITY_PX_MS
  );
}
