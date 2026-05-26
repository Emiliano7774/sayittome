import type { AppLocale } from "@/lib/i18n/types";
import { DEFAULT_LOCALE } from "@/lib/i18n/types";

/** Country ISO code → primary app locale by spoken language. */
const COUNTRY_TO_LOCALE: Record<string, AppLocale> = {
  AR: "es",
  BO: "es",
  CL: "es",
  CO: "es",
  CR: "es",
  CU: "es",
  DO: "es",
  EC: "es",
  ES: "es",
  GQ: "es",
  GT: "es",
  HN: "es",
  MX: "es",
  NI: "es",
  PA: "es",
  PE: "es",
  PR: "es",
  PY: "es",
  SV: "es",
  UY: "es",
  VE: "es",

  IT: "it",
  SM: "it",
  VA: "it",

  DE: "de",
  AT: "de",
  LI: "de",

  US: "en",
  GB: "en",
  AU: "en",
  CA: "en",
  IE: "en",
  NZ: "en",
  ZA: "en",
  IN: "en",
  SG: "en",
  PH: "en",
  NG: "en",
  KE: "en",
  JM: "en",
  TT: "en",
  BS: "en",
  BB: "en",
  BZ: "en",
  GH: "en",
  PK: "en",
  MT: "en",

  CH: "de",
  LU: "de",
  BE: "de",
};

export function localeFromCountry(countryCode: string | null | undefined): AppLocale | null {
  if (!countryCode) return null;
  const code = countryCode.trim().toUpperCase();
  return COUNTRY_TO_LOCALE[code] || null;
}

export function localeFromAcceptLanguage(header: string | null | undefined): AppLocale | null {
  if (!header) return null;

  const parts = header
    .split(",")
    .map((chunk) => chunk.trim().split(";")[0]?.toLowerCase())
    .filter(Boolean);

  for (const tag of parts) {
    const base = tag.split("-")[0];
    if (base === "es" || base === "en" || base === "it" || base === "de") {
      return base;
    }
  }

  return null;
}

export function resolveSuggestedLocale(input: {
  countryCode?: string | null;
  acceptLanguage?: string | null;
}): AppLocale {
  return (
    localeFromCountry(input.countryCode) ||
    localeFromAcceptLanguage(input.acceptLanguage) ||
    DEFAULT_LOCALE
  );
}
