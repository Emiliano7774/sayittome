import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

import { VERIFIED_QUERY_PARAM, VERIFIED_QUERY_VALUE } from "@/lib/profile/verifiedLink";

/** Public verified profile entry: `/@username` → `/u/username?verified=1`. */
export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const match = pathname.match(/^\/@([^/]+)\/?$/);
  if (!match) return NextResponse.next();

  const raw = decodeURIComponent(match[1] || "");
  const slug = raw.startsWith("@") ? raw.slice(1) : raw;
  if (!slug) return NextResponse.next();

  const dest = request.nextUrl.clone();
  dest.pathname = `/u/${encodeURIComponent(slug)}`;
  dest.searchParams.set(VERIFIED_QUERY_PARAM, VERIFIED_QUERY_VALUE);
  return NextResponse.redirect(dest);
}

export const config = {
  matcher: ["/@:username", "/@:username/"],
};
