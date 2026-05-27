import fs from "node:fs";
import path from "node:path";

import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

const VERSION_PATH = path.join(process.cwd(), "public", "app-version.json");
const APK_PATH = path.join(process.cwd(), "public", "downloads", "sayittome.apk");

function enrichFromApkFile(json: Record<string, unknown>) {
  if (!fs.existsSync(APK_PATH)) return json;

  const stat = fs.statSync(APK_PATH);
  const apkUpdatedAt = stat.mtime.toISOString();
  const releasedAt = String(json.releasedAt || "");
  const releasedMs = new Date(releasedAt).getTime();
  const apkMs = stat.mtimeMs;

  if (!Number.isNaN(apkMs) && (Number.isNaN(releasedMs) || apkMs > releasedMs)) {
    return {
      ...json,
      releasedAt: apkUpdatedAt,
      apkUpdatedAt,
      apkSizeBytes: stat.size,
    };
  }

  return {
    ...json,
    apkUpdatedAt: String(json.apkUpdatedAt || apkUpdatedAt),
    apkSizeBytes: Number(json.apkSizeBytes || stat.size),
  };
}

export async function GET() {
  try {
    const raw = fs.readFileSync(VERSION_PATH, "utf8");
    const json = enrichFromApkFile(JSON.parse(raw) as Record<string, unknown>);

    return NextResponse.json(json, {
      headers: {
        "Cache-Control": "no-store, max-age=0, must-revalidate",
        Pragma: "no-cache",
      },
    });
  } catch {
    return NextResponse.json(
      { ok: false, error: "Versión no publicada todavía." },
      { status: 404 },
    );
  }
}
