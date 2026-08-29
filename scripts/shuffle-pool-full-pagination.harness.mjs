/**
 * SHUFFLE_POOL_FULL_PAGINATION — Firestore runQueryAll must use __name__ tie-breaker
 * so page-2 startAt (usernameLower + doc ref) matches orderBy field count.
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { installHarnessAlias, installHarnessWindow } from "./harness-alias.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
installHarnessWindow();
installHarnessAlias(root);

const pagination = await import(
  pathToFileURL(path.join(root, "src/lib/firestore/deterministicPagination.ts")).href
);
const restSrc = fs.readFileSync(path.join(root, "src/lib/firestore/rest.ts"), "utf8");
const shuffleRouteSrc = fs.readFileSync(path.join(root, "src/app/api/shuffle/route.ts"), "utf8");

const PROJECT_ID = "sayittome-app";
const COLLECTION = "usuarios";
const ORDER_FIELD = "usernameLower";
const PAGE_SIZE = 500;

function makeProfile(index) {
  const usernameLower = `user${String(index).padStart(4, "0")}`;
  return {
    id: `uid_${index}`,
    usernameLower,
    username: usernameLower,
  };
}

const allProfiles = Array.from({ length: 552 }, (_, index) => makeProfile(index + 1));
const page1Docs = allProfiles.slice(0, PAGE_SIZE);
const page2Docs = [page1Docs[PAGE_SIZE - 1], ...allProfiles.slice(PAGE_SIZE)];

const page1Body = pagination.buildPaginatedCollectionStructuredQuery({
  collectionId: COLLECTION,
  orderField: ORDER_FIELD,
  direction: "ASCENDING",
  pageSize: PAGE_SIZE,
  cursorDoc: null,
  projectId: PROJECT_ID,
});

assert.equal(page1Body.limit, PAGE_SIZE);
assert.equal(page1Body.orderBy.length, 2);
assert.equal(page1Body.orderBy[0].field.fieldPath, ORDER_FIELD);
assert.equal(page1Body.orderBy[1].field.fieldPath, pagination.FIRESTORE_DOCUMENT_NAME_FIELD);
assert.equal(page1Body.startAt, undefined, "page1 must not send startAt");

const cursorDoc = page1Docs[page1Docs.length - 1];
const page2Body = pagination.buildPaginatedCollectionStructuredQuery({
  collectionId: COLLECTION,
  orderField: ORDER_FIELD,
  direction: "ASCENDING",
  pageSize: PAGE_SIZE,
  cursorDoc,
  projectId: PROJECT_ID,
});

assert.equal(page2Body.orderBy.length, 2);
assert.ok(page2Body.startAt, "page2 must send startAt");
assert.equal(page2Body.startAt.values.length, 2, "startAt values must match orderBy fields");
assert.deepEqual(
  page2Body.startAt.values[0],
  { stringValue: cursorDoc.usernameLower },
  "page2 cursor usernameLower must match last page1 doc",
);
assert.equal(
  page2Body.startAt.values[1].referenceValue,
  pagination.buildDocumentReferenceValue(PROJECT_ID, COLLECTION, cursorDoc.id),
  "page2 cursor doc ref must match last page1 doc",
);

const filteredPage2 = pagination.buildPaginatedCollectionStructuredQuery({
  collectionId: COLLECTION,
  orderField: ORDER_FIELD,
  direction: "ASCENDING",
  pageSize: 300,
  cursorDoc,
  projectId: PROJECT_ID,
  where: {
    fieldFilter: {
      field: { fieldPath: "ownerUid" },
      op: "EQUAL",
      value: { stringValue: "owner_1" },
    },
  },
});
assert.equal(filteredPage2.orderBy.length, 2);
assert.equal(filteredPage2.startAt.values.length, 2);
assert.ok(filteredPage2.where, "filtered pagination keeps where clause");

const merged = [];
pagination.mergePaginatedQueryDocs(merged, page1Docs, false);
pagination.mergePaginatedQueryDocs(merged, page2Docs, true);

assert.equal(merged.length, 552, "552 profiles across pages without gap");
assert.equal(new Set(merged.map((row) => row.id)).size, 552, "no duplicate ids");
assert.equal(
  merged[499].id,
  page1Docs[499].id,
  "page boundary doc preserved once",
);
assert.equal(merged[500].id, allProfiles[500].id, "first doc after boundary present");

assert.match(restSrc, /runCollectionQueryAll[\s\S]*buildPaginatedCollectionStructuredQuery/);
assert.match(restSrc, /runFilteredCollectionQueryAll[\s\S]*buildPaginatedCollectionStructuredQuery/);
assert.doesNotMatch(
  restSrc,
  /runCollectionQueryAll[\s\S]*referenceValue: `projects/,
  "runCollectionQueryAll must not inline dual-value startAt",
);
assert.match(shuffleRouteSrc, /runCollectionQueryAll\(\s*[\r\n\s]*"usuarios"/);

console.log(
  JSON.stringify({
    gate: "SHUFFLE_POOL_FULL_PAGINATION",
    pass: true,
    page1: {
      orderByFields: page1Body.orderBy.map((row) => row.field.fieldPath),
      hasStartAt: false,
      limit: PAGE_SIZE,
    },
    page2: {
      orderByFields: page2Body.orderBy.map((row) => row.field.fieldPath),
      startAtValueKinds: ["usernameLower", "referenceValue"],
      cursorDocId: cursorDoc.id,
    },
    merged552: {
      total: merged.length,
      uniqueIds: new Set(merged.map((row) => row.id)).size,
    },
    note: "Fixes Firestore 400 on page2 when pool>500 (usernameLower + __name__ cursor)",
  }),
);
