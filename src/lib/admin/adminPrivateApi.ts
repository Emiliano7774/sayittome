import { NextResponse } from "next/server";

const ALLOWED_ORIGINS = new Set([
  "https://sayittome-app.web.app",
  "https://sayittome-app.firebaseapp.com",
  "http://localhost:3000",
  "http://127.0.0.1:3000",
  "http://localhost:3010",
  "http://127.0.0.1:3010",
]);

const ALLOWED_REQUEST_HEADERS =
  "Authorization, Content-Type, X-Forwarded-For, Forwarded, X-Real-IP";

export function adminPrivateCorsHeaders(req: Request): HeadersInit {
  const origin = String(req.headers.get("origin") || "").trim();
  const allow = ALLOWED_ORIGINS.has(origin) ? origin : "";
  const headers: Record<string, string> = {
    "Cache-Control": "private, no-store, max-age=0",
    Vary: "Origin",
  };
  if (allow) {
    headers["Access-Control-Allow-Origin"] = allow;
    headers["Access-Control-Allow-Methods"] = "GET, POST, OPTIONS";
    headers["Access-Control-Allow-Headers"] = ALLOWED_REQUEST_HEADERS;
    headers["Access-Control-Max-Age"] = "86400";
  }
  return headers;
}

export function adminPrivatePreflight(req: Request) {
  return new NextResponse(null, { status: 204, headers: adminPrivateCorsHeaders(req) });
}

export function adminPrivateJson(req: Request, body: unknown, status = 200) {
  return NextResponse.json(body, {
    status,
    headers: adminPrivateCorsHeaders(req),
  });
}
