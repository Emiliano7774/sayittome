/**
 * Lightweight audit for shuffle dedupe + batch anti-repeat behavior.
 * Run: node scripts/audit-shuffle-dedupe.mjs
 */

function canonicalShuffleUsername(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[._-]+$/g, "");
}

function normalizeShufflePhotoKey(photo) {
  const raw = String(photo || "").trim().toLowerCase();
  if (!raw) return "";
  const withoutQuery = raw.split("?")[0]?.split("#")[0] || "";
  try {
    const url = new URL(withoutQuery);
    const path = url.pathname.replace(/\/+$/, "");
    return path.length > 8 ? path : withoutQuery;
  } catch {
    return withoutQuery;
  }
}

function shuffleProfileBatchExcludeKeys(profile) {
  const keys = [];
  const uid = String(profile.uid || "").trim();
  const authUid = String(profile.authUid || "").trim();
  const email = String(profile.email || "").trim().toLowerCase();
  if (uid) keys.push(`id:${uid}`);
  if (authUid && authUid !== uid) keys.push(`auth:${authUid}`);
  if (email.includes("@")) keys.push(`e:${email}`);
  return keys;
}

function shuffleProfileDedupeKeys(profile) {
  const keys = new Set();
  const username = canonicalShuffleUsername(profile.username);
  const uid = String(profile.uid || "").trim();
  const authUid = String(profile.authUid || profile.uid || "").trim();
  const email = String(profile.email || "").trim().toLowerCase();
  const photo = normalizeShufflePhotoKey(profile.photo);

  if (username) {
    keys.add(`u:${username}`);
    keys.add(`ul:${username}`);
  }
  if (authUid) keys.add(`auth:${authUid}`);
  if (uid) keys.add(`id:${uid}`);
  if (email.includes("@")) keys.add(`e:${email}`);
  if (photo && photo.length >= 12 && !photo.includes("placeholder")) {
    keys.add(`p:${photo}`);
  }
  return [...keys];
}

function dedupeShuffleProfiles(profiles) {
  const canonicalByKey = new Map();
  const merged = new Map();

  for (const profile of profiles) {
    const keys = shuffleProfileDedupeKeys(profile);
    if (keys.length === 0) continue;
    const existingCanonical = keys.map((key) => canonicalByKey.get(key)).find(Boolean);
    const canonicalKey = existingCanonical || keys[0];
    merged.set(canonicalKey, profile);
    for (const key of keys) canonicalByKey.set(key, canonicalKey);
  }

  return [...merged.values()];
}

function pickWindow(pool, excludeKeys, size = 5, strictExclude = true) {
  const order = [...pool.keys()].sort(() => Math.random() - 0.5);
  const used = new Set();
  const picked = [];

  function tryPick(ignoreExclude) {
    for (const idx of order) {
      if (picked.length >= size) break;
      const profile = pool[idx];
      const keys = shuffleProfileDedupeKeys(profile);
      if (keys.some((key) => used.has(key))) continue;
      if (
        !ignoreExclude &&
        excludeKeys.size > 0 &&
        (shuffleProfileBatchExcludeKeys(profile).some((key) => excludeKeys.has(key)) ||
          keys.some((key) => excludeKeys.has(key)))
      ) {
        continue;
      }
      for (const key of keys) used.add(key);
      picked.push(profile);
    }
  }

  tryPick(false);
  if (picked.length < size && strictExclude) {
    tryPick(true);
  }

  return picked;
}

function simulateShuffleClicks(poolSize, clicks = 10, windowSize = 5) {
  const pool = Array.from({ length: poolSize }, (_, i) => ({
    uid: `doc-${i}`,
    authUid: i % 7 === 0 ? `auth-shared-${i % 3}` : `auth-${i}`,
    username: `user${i}`,
    email: i % 11 === 0 ? "shared@test.com" : `user${i}@test.com`,
    photo:
      i % 5 === 0
        ? "https://cdn.example.com/users/shared-photo.jpg"
        : `https://cdn.example.com/users/${i}/photo.jpg`,
  }));

  const deduped = dedupeShuffleProfiles(pool);
  const batchQueue = [];
  let failures = 0;

  for (let click = 0; click < clicks; click++) {
    const exclude = new Set();
    for (const batch of batchQueue) {
      for (const key of batch) exclude.add(key);
    }

    const attempts = [
      { strictExclude: true, reset: false },
      { strictExclude: false, reset: false },
      { strictExclude: false, reset: true },
    ];

    let visible = [];
    for (let i = 0; i < attempts.length; i++) {
      const attempt = attempts[i];
      if (attempt.reset) {
        batchQueue.length = 0;
        exclude.clear();
      }
      visible = pickWindow(deduped, exclude, windowSize, attempt.strictExclude);
      if (visible.length > 0) break;
    }

    if (visible.length === 0) failures += 1;

    const batchKeys = new Set();
    for (const profile of visible) {
      for (const key of shuffleProfileBatchExcludeKeys(profile)) batchKeys.add(key);
    }
    batchQueue.push(batchKeys);
    while (batchQueue.length > 5) batchQueue.shift();
  }

  return { poolSize, dedupedCount: deduped.length, failures, clicks };
}

function auditDuplicateMerge() {
  const dupes = dedupeShuffleProfiles([
    { uid: "doc-a", authUid: "firebase-1", username: "maria", photo: "https://cdn.example.com/u/1.jpg" },
    { uid: "doc-b", authUid: "firebase-1", username: "maria2", photo: "https://cdn.example.com/u/1.jpg" },
    { uid: "doc-c", authUid: "doc-c", username: "john", photo: "https://cdn.example.com/u/2.jpg" },
  ]);

  return {
    mergedDuplicatesByAuthAndPhoto: dupes.length === 2,
    dedupedCount: dupes.length,
  };
}

function auditBatchKeysNotFuzzy() {
  const a = shuffleProfileBatchExcludeKeys({ uid: "doc-1", authUid: "doc-1", username: "john" });
  const b = shuffleProfileDedupeKeys({ uid: "doc-2", authUid: "doc-2", username: "john", photo: "https://cdn.example.com/u/1.jpg" });
  const overlap = a.some((key) => b.includes(key));
  return { batchKeysSkipUsernameCollision: !overlap, batchKeys: a };
}

const duplicateAudit = auditDuplicateMerge();
const batchAudit = auditBatchKeysNotFuzzy();
const shuffleAuditSmall = simulateShuffleClicks(12, 8, 5);
const shuffleAuditLarge = simulateShuffleClicks(120, 20, 35);

const results = [
  ["Duplicate merge (auth + photo)", duplicateAudit.mergedDuplicatesByAuthAndPhoto],
  ["Batch keys ignore username-only overlap", batchAudit.batchKeysSkipUsernameCollision],
  ["Small pool: no empty shuffle windows", shuffleAuditSmall.failures === 0],
  ["Large pool: no empty shuffle windows", shuffleAuditLarge.failures === 0],
];

let failed = 0;
console.log("Shuffle dedupe audit\n");
for (const [name, ok] of results) {
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}`);
  if (!ok) failed += 1;
}

console.log("\nDetails:", {
  duplicateAudit,
  batchAudit,
  shuffleAuditSmall,
  shuffleAuditLarge,
});

process.exit(failed > 0 ? 1 : 0);
