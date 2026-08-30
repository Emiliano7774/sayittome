/** Which primary Shuffle body to paint after presentation gates settle. */
export type ShuffleSurfaceMode = "loading" | "filters-empty" | "feed" | "empty";

/**
 * Shared Classic/Modern content mode.
 * Filters that wipe the live window must beat warm/hydrated `showShuffleFeed`,
 * otherwise both UIs skip ShuffleFiltersEmptyState (privacy note included).
 */
export function deriveShuffleSurfaceMode(input: {
  showShuffleLoading: boolean;
  showShuffleFeed: boolean;
  poolSize: number;
  filteredVisibleCount: number;
  hasActiveDiscovery: boolean;
}): ShuffleSurfaceMode {
  if (input.showShuffleLoading) return "loading";
  if (
    input.poolSize > 0 &&
    input.filteredVisibleCount === 0 &&
    input.hasActiveDiscovery
  ) {
    return "filters-empty";
  }
  if (input.showShuffleFeed) return "feed";
  return "empty";
}
