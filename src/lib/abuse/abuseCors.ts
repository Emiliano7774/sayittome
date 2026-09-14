import { NextResponse } from "next/server";

import { allowedAbuseOrigin } from "@/lib/abuse/abuseCorsPolicy";

/**
 * CORS for abuse APIs called via direct Cloud Functions / Run origin
 * (NEXT_PUBLIC_ABUSE_API_BASE), not only same-origin Hosting.
 */
export function abuseCorsHeaders(req: Request): HeadersInit {
  const allow = allowedAbuseOrigin(String(req.headers.get("origin") || ""));
  return {
    "Access-Control-Allow-Origin": allow,
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Authorization, Content-Type",
    "Access-Control-Max-Age": "86400",
    Vary: "Origin",
  };
}

export function abuseCorsPreflight(req: Request): NextResponse {
  return new NextResponse(null, { status: 204, headers: abuseCorsHeaders(req) });
}

export function abuseJson(
  req: Request,
  body: unknown,
  init?: { status?: number },
): NextResponse {
  return NextResponse.json(body, {
    status: init?.status ?? 200,
    headers: abuseCorsHeaders(req),
  });
}
