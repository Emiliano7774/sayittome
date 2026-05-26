import { NextRequest, NextResponse } from "next/server";

import { resolveSuggestedLocale } from "@/lib/i18n/countryLocale";

export async function GET(request: NextRequest) {
  const countryCode =
    request.headers.get("cf-ipcountry") ||
    request.headers.get("x-vercel-ip-country") ||
    request.headers.get("x-country-code");

  const acceptLanguage = request.headers.get("accept-language");

  const suggestedLocale = resolveSuggestedLocale({
    countryCode,
    acceptLanguage,
  });

  return NextResponse.json({
    suggestedLocale,
    countryCode: countryCode?.toUpperCase() || null,
  });
}
