import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const source = fs.readFileSync(path.join(root, "src/lib/boost/service.ts"), "utf8");
const start = source.indexOf("export async function getActiveBoostProfiles");
const end = source.indexOf("export function invalidateActiveBoostCache", start);
const body = source.slice(start, end);

assert.match(body, /getRepairAdminDb\(\)/, "private boost state must use Admin SDK");
assert.match(body, /\.collection\("shuffle_boosts"\)/, "boost collection must be queried server-side");
assert.doesNotMatch(body, /runCollectionQuery\(/, "boost read must not use public REST");
assert.match(
  body,
  /catch \(error\)[\s\S]*const active = rows\.filter/,
  "a boost read failure must degrade to an unfeatured Shuffle instead of failing the pool",
);
assert.match(source, /toMillis\?: \(\) => number/, "Admin Timestamp expirations must stay active");

console.log("shuffle boost server read harness: PASS");
