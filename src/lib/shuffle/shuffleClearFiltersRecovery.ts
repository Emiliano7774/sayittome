/** After Limpiar, fetch a fresh pool when the filtered active pool cannot deal a window. */
export function needsPoolFetchAfterClearFilters(input: {
  visibleSlotCount: number;
  activePoolLength: number;
}) {
  return input.visibleSlotCount === 0 && input.activePoolLength === 0;
}
