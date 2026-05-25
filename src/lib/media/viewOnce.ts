const opened =
  new Set<string>();

export function canOpenViewOnce(
  id: string,
) {
  return !opened.has(id);
}

export function markOpened(
  id: string,
) {
  opened.add(id);
}
