import fs from "node:fs";
import path from "node:path";

import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

const APK_FILENAME = "sayittome.apk";

export async function GET() {
  const apkPath = path.join(process.cwd(), "public", "downloads", APK_FILENAME);

  if (!fs.existsSync(apkPath)) {
    return NextResponse.json(
      {
        ok: false,
        error:
          "La APK todavía no está publicada en el servidor. Ejecutá npm run copy:apk después del build de Flutter.",
      },
      { status: 404 },
    );
  }

  const file = fs.readFileSync(apkPath);

  return new NextResponse(file, {
    status: 200,
    headers: {
      "Content-Type": "application/vnd.android.package-archive",
      "Content-Disposition": `attachment; filename="${APK_FILENAME}"`,
      "Content-Length": String(file.length),
      "Cache-Control": "public, max-age=300",
    },
  });
}
