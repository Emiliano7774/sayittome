import { NextResponse } from "next/server";

import { BUILD_SHA } from "@/lib/perf/buildMarker";

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json(
    {
      sha: BUILD_SHA,
      builtAt: process.env.NEXT_PUBLIC_BUILD_AT || "",
    },
    {
      headers: {
        "Cache-Control": "no-store, max-age=0, must-revalidate",
        Pragma: "no-cache",
      },
    },
  );
}
