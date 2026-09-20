import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const source = fs.readFileSync(
  path.join(root, "src/app/api/roleplay-appeal/history/route.ts"),
  "utf8",
);
const nextConfig = fs.readFileSync(path.join(root, "next.config.ts"), "utf8");

assert.match(source, /verifyFirebaseIdToken\(req\)/, "history must authenticate the caller");
assert.match(source, /getRepairAdminDb\(\)/, "history must use the server Admin SDK");
assert.match(
  source,
  /\.where\("uid", "==", verified\.uid\)/,
  "history must stay scoped to the authenticated uid",
);
assert.doesNotMatch(
  source,
  /runFilteredCollectionQueryAll/,
  "history must not fall back to an unauthenticated Firestore REST query",
);
assert.match(source, /private, no-store/, "private history responses must not be cached");
assert.match(source, /dateIso\(row\.createdAt/, "Admin Timestamp values must be serialized");
assert.match(
  nextConfig,
  /source: "\/api\/roleplay-appeal\/history"[\s\S]*private, no-store/,
  "the global public cache header must not override private claim history",
);

console.log("claim history authenticated read harness: PASS");
