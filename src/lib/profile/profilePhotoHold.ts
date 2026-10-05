/** Hold the modern profile photo this long to open the gallery instead of the story. */
export const PROFILE_PHOTO_HOLD_MS = 3000;

export function profilePhotoHoldOpensGallery(elapsedMs: number) {
  return Number(elapsedMs) >= PROFILE_PHOTO_HOLD_MS;
}
