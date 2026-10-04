import {
  getCountryByCode,
  normalizeGeoValue,
  resolveCountryCode,
  resolveProfileCountryCode,
} from "@/lib/geo/countries";

/**
 * A geographic audience: which countries (and optionally which subdivisions of a
 * single country) are in scope. An empty list means "everywhere".
 *
 * The same shape describes both directions:
 * - discovery: the countries whose people I want to see
 * - visibility: the countries whose people are allowed to see me
 */
export type GeoAudience = {
  paises: string[];
  provincias: string[];
};

export type GeoTarget = {
  pais?: string;
  provincia?: string;
};

export function emptyGeoAudience(): GeoAudience {
  return { paises: [], provincias: [] };
}

function uniqueStrings(values: unknown, transform: (value: string) => string) {
  const list = Array.isArray(values) ? values : [];
  const seen = new Set<string>();
  const out: string[] = [];

  for (const raw of list) {
    const value = transform(String(raw ?? ""));
    if (!value || seen.has(value)) continue;
    seen.add(value);
    out.push(value);
  }

  return out;
}

/**
 * Subdivisions only make sense under a single country: with several countries
 * selected, a province name is ambiguous, so the list is dropped.
 */
export function normalizeGeoAudience(input: Partial<GeoAudience> | null | undefined): GeoAudience {
  const paises = uniqueStrings(input?.paises, (value) => {
    const code = resolveCountryCode(value);
    return getCountryByCode(code) ? code : "";
  });

  if (paises.length !== 1) return { paises, provincias: [] };

  const allowed = new Set(
    (getCountryByCode(paises[0])?.subdivisions || []).map(normalizeGeoValue),
  );
  const provincias = uniqueStrings(input?.provincias, (value) => {
    const trimmed = value.trim();
    return allowed.has(normalizeGeoValue(trimmed)) ? trimmed : "";
  });

  return { paises, provincias };
}

export function geoAudienceHasAny(audience: GeoAudience) {
  return audience.paises.length > 0 || audience.provincias.length > 0;
}

export function geoAudienceEquals(a: GeoAudience, b: GeoAudience) {
  return (
    a.paises.length === b.paises.length &&
    a.provincias.length === b.provincias.length &&
    a.paises.every((value, index) => value === b.paises[index]) &&
    a.provincias.every((value, index) => value === b.provincias[index])
  );
}

/**
 * True when `target` falls inside `audience`. An empty audience accepts everyone,
 * which keeps every existing user visible until they narrow it down themselves.
 */
export function geoAudienceIncludes(audience: GeoAudience, target: GeoTarget) {
  if (audience.paises.length === 0) return true;

  const country = resolveProfileCountryCode(target);
  if (!country || !audience.paises.includes(country)) return false;

  if (audience.provincias.length === 0) return true;

  const subdivision = normalizeGeoValue(String(target.provincia || ""));
  if (!subdivision) return false;

  return audience.provincias.some((value) => normalizeGeoValue(value) === subdivision);
}

export function serializeGeoAudience(audience: GeoAudience) {
  return {
    paises: audience.paises.join("|"),
    provincias: audience.provincias.join("|"),
  };
}

export function parseGeoAudience(paises: string, provincias: string): GeoAudience {
  return normalizeGeoAudience({
    paises: String(paises || "").split("|").filter(Boolean),
    provincias: String(provincias || "").split("|").filter(Boolean),
  });
}

/** Reads the audience stored on a profile / presence document. */
export function readStoredGeoAudience(
  row: Record<string, unknown> | null | undefined,
  prefix: "visibilidad" | "descubrimiento",
): GeoAudience {
  if (!row) return emptyGeoAudience();
  return normalizeGeoAudience({
    paises: row[`${prefix}Paises`] as string[],
    provincias: row[`${prefix}Provincias`] as string[],
  });
}
