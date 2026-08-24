/**
 * VIEW_ONCE_PRESEAL
 * Bomb messages must birth without client-readable mediaUrl; only claim returns media.
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const policy = await import(
  pathToFileURL(path.join(root, "src/lib/media/viewOncePolicy.ts")).href
);

const birth = policy.buildViewOncePublicBirthFields({ viewOnceLimit: 3 });
assert.equal(birth.viewOnce, true);
assert.equal(birth.viewOnceLimit, 3);
assert.equal(birth.viewOnceSealed, false);
assert.equal(birth.viewOnceOpenedCount, 0);
assert.ok(!("mediaUrl" in birth));

assert.equal(
  policy.assertNoClientReadableViewOnceMedia({
    viewOnce: true,
    mediaUrl: undefined,
  }),
  true,
);
assert.equal(
  policy.assertNoClientReadableViewOnceMedia({
    viewOnce: true,
    mediaUrl: "https://cdn.example/leak.jpg",
  }),
  false,
);
assert.equal(
  policy.assertNoClientReadableViewOnceMedia({
    viewOnce: false,
    mediaUrl: "https://cdn.example/ok.jpg",
  }),
  true,
);

const redacted = policy.redactViewOnceMediaUrl({
  viewOnce: true,
  mine: true,
  mediaUrl: "https://cdn.example/leak.jpg",
});
assert.equal(redacted.mediaUrl, undefined);

const persistSrc = fs.readFileSync(
  path.join(root, "src/lib/chat/persistAnonMessage.ts"),
  "utf8",
);
assert.match(persistSrc, /mediaUrl && !viewOnce/);
assert.match(persistSrc, /buildViewOncePublicBirthFields/);
assert.match(persistSrc, /commitViewOnceSecret/);
assert.doesNotMatch(
  persistSrc,
  /\.\.\.\(mediaUrl \? \{ mediaUrl \} : \{\}\)/,
);

const claimClient = fs.readFileSync(
  path.join(root, "src/lib/media/viewOnceClaim.ts"),
  "utf8",
);
assert.match(claimClient, /COMMIT_VIEW_ONCE_SECRET/);
assert.match(claimClient, /commitViewOnceSecret/);

const fnSrc = fs.readFileSync(path.join(root, "functions/src/index.ts"), "utf8");
assert.match(fnSrc, /commitViewOnceSecret/);
assert.match(fnSrc, /handleCommitViewOnceSecret/);

const claimFn = fs.readFileSync(
  path.join(root, "functions/src/viewOnceClaim.ts"),
  "utf8",
);
assert.match(claimFn, /handleCommitViewOnceSecret/);
assert.match(claimFn, /viewOnceSealed \? "" : asId\(message\.mediaUrl\)/);
assert.match(claimFn, /mediaUrl: FieldValue\.delete\(\)/);

const authorSrc = fs.readFileSync(
  path.join(root, "src/lib/chat/profileAnonMessageAuthor.ts"),
  "utf8",
);
assert.match(authorSrc, /data\.viewOnce === true \? undefined : mediaUrl/);

console.log(JSON.stringify({ gate: "VIEW_ONCE_PRESEAL", pass: true }, null, 2));
