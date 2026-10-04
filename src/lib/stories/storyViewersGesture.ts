export const STORY_VIEWERS_SWIPE_UP_PX = 18;
export const STORY_VIEWERS_SWIPE_DOWN_PX = 10;
export const STORY_VIEWERS_SWIPE_AXIS_RATIO = 1;
export const STORY_VIEWERS_FLICK_PX = 8;
export const STORY_VIEWERS_FLICK_VELOCITY = 0.22;

export function shouldOpenStoryViewersGesture(input: {
  deltaUp: number;
  absX: number;
}) {
  const deltaUp = Math.max(0, Number(input.deltaUp) || 0);
  const absX = Math.max(0, Number(input.absX) || 0);
  return deltaUp >= STORY_VIEWERS_SWIPE_UP_PX && deltaUp > absX * STORY_VIEWERS_SWIPE_AXIS_RATIO;
}

export function shouldCloseStoryViewersGesture(input: {
  deltaDown: number;
  absX: number;
  elapsedMs: number;
  scrollTop?: number;
}) {
  const deltaDown = Math.max(0, Number(input.deltaDown) || 0);
  const absX = Math.max(0, Number(input.absX) || 0);
  const scrollTop = Math.max(0, Number(input.scrollTop || 0));
  if (scrollTop > 2) return false;
  if (deltaDown <= absX * STORY_VIEWERS_SWIPE_AXIS_RATIO) return false;
  if (deltaDown >= STORY_VIEWERS_SWIPE_DOWN_PX) return true;
  const elapsed = Math.max(1, Number(input.elapsedMs) || 0);
  return (
    deltaDown >= STORY_VIEWERS_FLICK_PX && deltaDown / elapsed >= STORY_VIEWERS_FLICK_VELOCITY
  );
}
