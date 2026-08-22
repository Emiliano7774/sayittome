export function resolveProfileOptionsMenuPortalRoot(
  doc: Pick<Document, "body"> | null | undefined,
) {
  return doc?.body ?? null;
}
