/**
 * Seed controlled story entities for @navbench navigation benchmarks.
 *
 * Creates/updates:
 * - @navbench (primary group, 4 image stories)
 * - @benchstory (secondary group, 3 image stories)
 *
 * Uses public placeholder images (picsum.photos) — no private/real user content.
 *
 * Usage: node scripts/bench-seed-stories.mjs
 */

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";

const envLocalPath = path.join(process.cwd(), ".env.local");
const projectId = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || "sayittome-app";

const PRIMARY_USERNAME = "navbench";
const SECONDARY_USERNAME = "benchstory";

const args = process.argv.slice(2);
const forceReseed = args.includes("--force");
const mediaBase = args.includes("--media-base")
  ? args[args.indexOf("--media-base") + 1]
  : process.env.BENCH_MEDIA_BASE || "http://localhost:3002";

const BENCH_IMAGE_URLS = [1, 2, 3, 4, 5, 6, 7].map(
  (n) => `${mediaBase.replace(/\/$/, "")}/bench/story-${n}.png`,
);

loadEnvLocal();

function loadEnvLocal() {
  if (!fs.existsSync(envLocalPath)) return;
  const raw = fs.readFileSync(envLocalPath, "utf8");
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const idx = trimmed.indexOf("=");
    if (idx < 0) continue;
    const key = trimmed.slice(0, idx).trim();
    let value = trimmed.slice(idx + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (!process.env[key]) process.env[key] = value;
  }
}

function readFirebaseCliAccessToken() {
  try {
    const configPath = path.join(os.homedir(), ".config", "configstore", "firebase-tools.json");
    const config = JSON.parse(fs.readFileSync(configPath, "utf8"));
    const token = config?.tokens?.access_token;
    const expiresAt = Number(config?.tokens?.expires_at || 0);
    if (token && expiresAt > Date.now()) return token;
  } catch {
    // ignore
  }
  return null;
}

function isoTimestamp(ms) {
  return new Date(ms).toISOString();
}

function storyFields({
  ownerUid,
  ownerUsername,
  mediaUrl,
  createdAtMs,
  expiresAtMs,
  texto,
}) {
  return {
    ownerUid: { stringValue: ownerUid },
    ownerUsername: { stringValue: ownerUsername },
    ownerPhoto: { stringValue: "" },
    texto: { stringValue: texto },
    mediaUrl: { stringValue: mediaUrl },
    mediaType: { stringValue: "image" },
    mediaSource: { stringValue: "gallery" },
    createdAt: { timestampValue: isoTimestamp(createdAtMs) },
    expiresAt: { timestampValue: isoTimestamp(expiresAtMs) },
    active: { booleanValue: true },
    likeCount: { integerValue: "0" },
    viewCount: { integerValue: "0" },
    likedBy: { mapValue: { fields: {} } },
    viewedBy: { mapValue: { fields: {} } },
  };
}

async function lookupUserByEmail(email, accessToken) {
  const res = await fetch(
    `https://identitytoolkit.googleapis.com/v1/projects/${projectId}/accounts:lookup`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ email: [email] }),
    },
  );
  if (!res.ok) return null;
  const data = await res.json();
  return data?.users?.[0]?.localId || null;
}

async function ensureBenchUser(email, password, username, displayName, accessToken) {
  let localId = await lookupUserByEmail(email, accessToken);

  if (!localId) {
    const createRes = await fetch(
      `https://identitytoolkit.googleapis.com/v1/projects/${projectId}/accounts`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          email,
          password,
          emailVerified: true,
          displayName,
        }),
      },
    );
    if (!createRes.ok) {
      throw new Error(`create user failed ${createRes.status} ${await createRes.text()}`);
    }
    const created = await createRes.json();
    localId = created.localId;
    console.log(`bench-seed-stories: created auth user @${username}`);
  } else {
    const updateRes = await fetch(
      `https://identitytoolkit.googleapis.com/v1/projects/${projectId}/accounts:update`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          localId,
          emailVerified: true,
          password,
          displayName,
        }),
      },
    );
    if (!updateRes.ok) {
      throw new Error(`update user failed ${updateRes.status} ${await updateRes.text()}`);
    }
    console.log(`bench-seed-stories: updated auth user @${username}`);
  }

  await upsertProfile(localId, email, username, accessToken);
  return localId;
}

async function upsertProfile(uid, email, username, accessToken) {
  const docUrl = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/usuarios/${encodeURIComponent(uid)}`;
  const fields = {
    uid: { stringValue: uid },
    email: { stringValue: email },
    username: { stringValue: username },
    usernameLower: { stringValue: username },
    nombre: { stringValue: username },
    bio: { stringValue: "Navigation benchmark story seed" },
    descripcion: { stringValue: "Navigation benchmark story seed" },
    pais: { stringValue: "AR" },
    provincia: { stringValue: "Buenos Aires" },
    mostrarProvincia: { booleanValue: false },
    profileSetupComplete: { booleanValue: true },
    perfilCompleto: { booleanValue: true },
    historias: { integerValue: "4" },
    historiasCount: { integerValue: "4" },
  };

  const patchUrl = new URL(docUrl);
  Object.keys(fields).forEach((key) => patchUrl.searchParams.append("updateMask.fieldPaths", key));

  const res = await fetch(patchUrl.toString(), {
    method: "PATCH",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ fields }),
  });

  if (!res.ok) {
    throw new Error(`profile patch failed ${res.status} ${await res.text()}`);
  }
  console.log(`bench-seed-stories: profile @${username} ready (${uid})`);
}

async function queryStoriesForOwner(ownerUid, accessToken) {
  const queryUrl = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents:runQuery`;
  const res = await fetch(queryUrl, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      structuredQuery: {
        from: [{ collectionId: "historias" }],
        where: {
          fieldFilter: {
            field: { fieldPath: "ownerUid" },
            op: "EQUAL",
            value: { stringValue: ownerUid },
          },
        },
        limit: 20,
      },
    }),
  });

  if (!res.ok) return [];
  const rows = await res.json();
  return rows.filter((row) => row.document).map((row) => row.document);
}

async function createStoryDoc(fields, accessToken) {
  const storyId = crypto.randomBytes(10).toString("hex");
  const url = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/historias?documentId=${storyId}`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ fields }),
  });
  if (!res.ok) {
    throw new Error(`story create failed ${res.status} ${await res.text()}`);
  }
  return storyId;
}

async function deactivateStory(docName, accessToken) {
  const patchUrl = new URL(`https://firestore.googleapis.com/v1/${docName}`);
  patchUrl.searchParams.append("updateMask.fieldPaths", "active");
  const res = await fetch(patchUrl.toString(), {
    method: "PATCH",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ fields: { active: { booleanValue: false } } }),
  });
  if (!res.ok) {
    console.warn(`bench-seed-stories: deactivate failed ${res.status} for ${docName}`);
  }
}

async function seedOwnerStories(ownerUid, ownerUsername, storySpecs, accessToken) {
  const existing = await queryStoriesForOwner(ownerUid, accessToken);
  const activeBench = existing.filter((doc) => doc.fields?.active?.booleanValue !== false);

  if (!forceReseed && activeBench.length >= storySpecs.length) {
    console.log(`bench-seed-stories: @${ownerUsername} already has ${activeBench.length} active stories`);
    return activeBench.length;
  }

  for (const doc of activeBench) {
    await deactivateStory(doc.name, accessToken);
  }

  for (const spec of storySpecs) {
    const fields = storyFields({
      ownerUid,
      ownerUsername,
      mediaUrl: spec.mediaUrl,
      createdAtMs: spec.createdAtMs,
      expiresAtMs: spec.expiresAtMs,
      texto: spec.texto,
    });
    const id = await createStoryDoc(fields, accessToken);
    console.log(`bench-seed-stories: @${ownerUsername} story ${id} (${spec.mediaUrl})`);
  }

  return storySpecs.length;
}

async function main() {
  const accessToken = readFirebaseCliAccessToken();
  if (!accessToken) {
    throw new Error("bench-seed-stories: Firebase CLI token missing — run `firebase login`");
  }

  const benchEmail = process.env.BENCH_EMAIL || `navbench+${projectId}@example.com`;
  const benchPassword = process.env.BENCH_PASSWORD || crypto.randomBytes(24).toString("base64url");
  const auxEmail = process.env.BENCH_STORY_EMAIL || `benchstory+${projectId}@example.com`;
  const auxPassword = process.env.BENCH_STORY_PASSWORD || crypto.randomBytes(24).toString("base64url");

  const now = Date.now();
  const expiresAtMs = now + 48 * 60 * 60 * 1000;

  const primaryUid = await ensureBenchUser(
    benchEmail,
    benchPassword,
    PRIMARY_USERNAME,
    PRIMARY_USERNAME,
    accessToken,
  );

  const secondaryUid = await ensureBenchUser(
    auxEmail,
    auxPassword,
    SECONDARY_USERNAME,
    SECONDARY_USERNAME,
    accessToken,
  );

  const primarySpecs = BENCH_IMAGE_URLS.slice(0, 4).map((mediaUrl, index) => ({
    mediaUrl,
    createdAtMs: now - index * 60_000,
    expiresAtMs,
    texto: `bench primary story ${index + 1}`,
  }));

  const secondarySpecs = BENCH_IMAGE_URLS.slice(4, 7).map((mediaUrl, index) => ({
    mediaUrl,
    createdAtMs: now - 10 * 60_000 - index * 60_000,
    expiresAtMs,
    texto: `bench secondary story ${index + 1}`,
  }));

  const primaryCount = await seedOwnerStories(primaryUid, PRIMARY_USERNAME, primarySpecs, accessToken);
  const secondaryCount = await seedOwnerStories(secondaryUid, SECONDARY_USERNAME, secondarySpecs, accessToken);

  console.log(
    JSON.stringify(
      {
        ok: true,
        primary: { username: PRIMARY_USERNAME, uid: primaryUid, stories: primaryCount },
        secondary: { username: SECONDARY_USERNAME, uid: secondaryUid, stories: secondaryCount },
      },
      null,
      2,
    ),
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
