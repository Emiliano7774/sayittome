export const FIRESTORE_DOCUMENT_NAME_FIELD = "__name__";

export type OrderDirection = "ASCENDING" | "DESCENDING";

export function buildOrderCursorFieldValue(
  doc: Record<string, unknown>,
  orderField: string,
) {
  const raw = doc[orderField];
  if (typeof raw === "boolean") return { booleanValue: raw };
  if (typeof raw === "number") {
    return Number.isInteger(raw)
      ? { integerValue: String(raw) }
      : { doubleValue: raw };
  }
  return { stringValue: String(raw ?? "") };
}

export function buildDocumentReferenceValue(
  projectId: string,
  collectionId: string,
  docId: string,
) {
  return `projects/${projectId}/databases/(default)/documents/${collectionId}/${encodeURIComponent(String(docId || ""))}`;
}

export function buildDeterministicOrderBy(
  orderField: string,
  direction: OrderDirection = "DESCENDING",
) {
  return [
    { field: { fieldPath: orderField }, direction },
    { field: { fieldPath: FIRESTORE_DOCUMENT_NAME_FIELD }, direction },
  ];
}

export function buildDeterministicStartAt(
  cursorDoc: Record<string, unknown>,
  orderField: string,
  collectionId: string,
  projectId: string,
) {
  return {
    values: [
      buildOrderCursorFieldValue(cursorDoc, orderField),
      {
        referenceValue: buildDocumentReferenceValue(
          projectId,
          collectionId,
          String(cursorDoc.id || ""),
        ),
      },
    ],
    before: false,
  };
}

/** Skip cursor doc on subsequent pages — Firestore startAt is inclusive. */
export function mergePaginatedQueryDocs(
  accumulated: Record<string, unknown>[],
  pageDocs: Record<string, unknown>[],
  hadCursor: boolean,
) {
  const startIndex = hadCursor ? 1 : 0;
  for (let i = startIndex; i < pageDocs.length; i += 1) {
    accumulated.push(pageDocs[i]);
  }
}

export function buildPaginatedCollectionStructuredQuery(input: {
  collectionId: string;
  orderField: string;
  direction?: OrderDirection;
  pageSize: number;
  cursorDoc?: Record<string, unknown> | null;
  projectId: string;
  where?: Record<string, unknown>;
}) {
  const structuredQuery: Record<string, unknown> = {
    from: [{ collectionId: input.collectionId }],
    limit: input.pageSize,
    orderBy: buildDeterministicOrderBy(input.orderField, input.direction ?? "DESCENDING"),
  };

  if (input.where) {
    structuredQuery.where = input.where;
  }

  if (input.cursorDoc) {
    structuredQuery.startAt = buildDeterministicStartAt(
      input.cursorDoc,
      input.orderField,
      input.collectionId,
      input.projectId,
    );
  }

  return structuredQuery;
}
