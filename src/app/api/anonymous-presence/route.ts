import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const API_KEY = "AIzaSyBpQKCAwE-8Td3ZuaDqE3nvNwRGDGY8vdk";
const PROJECT_ID = "sayittome-app";
const DATABASE = "(default)";
const ACTIVE_FOR_MS = 45 * 1000;

function safeId(value: unknown) {
  const raw = String(value || "").trim();
  const cleaned = raw.replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 120);
  return cleaned || `anon_${Date.now().toString(36)}`;
}

function documentUrl(id: string) {
  return new URL(
    `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/${DATABASE}/documents/anonimos_activos/${encodeURIComponent(id)}`,
  );
}

async function patchAnonymousPresence(id: string) {
  const now = new Date();
  const expiresAt = new Date(now.getTime() + ACTIVE_FOR_MS);

  const url = documentUrl(id);
  url.searchParams.set("key", API_KEY);
  url.searchParams.append("updateMask.fieldPaths", "anonId");
  url.searchParams.append("updateMask.fieldPaths", "lastSeenAt");
  url.searchParams.append("updateMask.fieldPaths", "updatedAt");
  url.searchParams.append("updateMask.fieldPaths", "expiresAt");

  const res = await fetch(url.toString(), {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      fields: {
        anonId: { stringValue: id },
        lastSeenAt: { timestampValue: now.toISOString() },
        updatedAt: { timestampValue: now.toISOString() },
        expiresAt: { timestampValue: expiresAt.toISOString() },
      },
    }),
    cache: "no-store",
  });

  if (!res.ok) {
    throw new Error(`anonymous presence write failed ${res.status}`);
  }
}

async function deleteAnonymousPresence(id: string) {
  const url = documentUrl(id);
  url.searchParams.set("key", API_KEY);

  const res = await fetch(url.toString(), {
    method: "DELETE",
    cache: "no-store",
  });

  if (!res.ok && res.status !== 404) {
    throw new Error(`anonymous presence delete failed ${res.status}`);
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const anonId = safeId(body?.anonId);

    await patchAnonymousPresence(anonId);

    return NextResponse.json({ ok: true, anonId, ts: Date.now() });
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: e?.message || "unknown", ts: Date.now() },
      { status: 200 },
    );
  }
}

export async function DELETE(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const anonId = safeId(body?.anonId);

    await deleteAnonymousPresence(anonId);

    return NextResponse.json({ ok: true, anonId, ts: Date.now() });
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: e?.message || "unknown", ts: Date.now() },
      { status: 200 },
    );
  }
}
