import {
  emptyGeoAudience,
  geoAudienceHasAny,
  normalizeGeoAudience,
  type GeoAudience,
} from "@/lib/geo/audience";
import { profileMatchesShuffleServerFilters } from "@/lib/shuffle/serverFilters";
import type { ShuffleProfile } from "@/lib/shuffle/types";

export type ShuffleGenderFilter = "todos" | "hombre" | "mujer" | "otro";

export type ShuffleFilters = {
  /** A quiénes quiero ver: países cuyos perfiles entran en mi feed. Vacío = todos. */
  verPaises: string[];
  verProvincias: string[];
  /** Quiénes pueden verme: países desde donde me pueden encontrar. Vacío = todos. */
  aparecerPaises: string[];
  aparecerProvincias: string[];
  sexo: ShuffleGenderFilter;
  ciudad: string;
  edadMin: number;
  edadMax: number;
  soloOnline: boolean;
  soloConFoto: boolean;
  soloConHistorias: boolean;
  intereses: string[];
};

/** Los países cuyos perfiles quiero ver en el feed. */
export function discoveryAudience(filters: ShuffleFilters): GeoAudience {
  return normalizeGeoAudience({
    paises: filters.verPaises,
    provincias: filters.verProvincias,
  });
}

/** Los países desde donde acepto que me encuentren. */
export function visibilityAudience(filters: ShuffleFilters): GeoAudience {
  return normalizeGeoAudience({
    paises: filters.aparecerPaises,
    provincias: filters.aparecerProvincias,
  });
}

export function withDiscoveryAudience(
  filters: ShuffleFilters,
  audience: GeoAudience,
): ShuffleFilters {
  const next = normalizeGeoAudience(audience);
  return { ...filters, verPaises: next.paises, verProvincias: next.provincias };
}

export function hasDiscoveryCountryFilter(filters: ShuffleFilters) {
  return discoveryAudience(filters).paises.length > 0;
}

export function stripDiscoveryCountry(filters: ShuffleFilters): ShuffleFilters {
  return withDiscoveryAudience(filters, emptyGeoAudience());
}

export function withVisibilityAudience(
  filters: ShuffleFilters,
  audience: GeoAudience,
): ShuffleFilters {
  const next = normalizeGeoAudience(audience);
  return { ...filters, aparecerPaises: next.paises, aparecerProvincias: next.provincias };
}

export const SHUFFLE_FILTERS_STORAGE_KEY = "sayittome_shuffle_filters_v1";

export const SHUFFLE_INTEREST_OPTIONS = [
  "Música",
  "Gaming",
  "Anime",
  "Gym",
  "Fiesta",
  "Amistad",
  "Charlar",
  "Estudio",
  "Arte",
  "Series",
  "Películas",
  "Fútbol",
  "Tecnología",
  "Viajes",
  "Memes",
  "Drill",
] as const;

export const SHUFFLE_GENDER_OPTIONS: Array<{
  value: ShuffleGenderFilter;
  labelKey: "shuffle_gender_all" | "shuffle_gender_male" | "shuffle_gender_female" | "shuffle_gender_other";
}> = [
  { value: "todos", labelKey: "shuffle_gender_all" },
  { value: "hombre", labelKey: "shuffle_gender_male" },
  { value: "mujer", labelKey: "shuffle_gender_female" },
  { value: "otro", labelKey: "shuffle_gender_other" },
];

export function defaultShuffleFilters(): ShuffleFilters {
  return {
    verPaises: [],
    verProvincias: [],
    aparecerPaises: [],
    aparecerProvincias: [],
    sexo: "todos",
    ciudad: "",
    edadMin: 0,
    edadMax: 0,
    soloOnline: false,
    soloConFoto: false,
    soloConHistorias: false,
    intereses: [],
  };
}

export function normalizeDiscoveryValue(value: string) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ");
}

export function sexToStorage(value: string): ShuffleGenderFilter {
  const normalized = normalizeDiscoveryValue(value);
  if (normalized === "hombre" || normalized === "hombres") return "hombre";
  if (normalized === "mujer" || normalized === "mujeres") return "mujer";
  if (normalized === "otro" || normalized === "otros") return "otro";
  return "todos";
}

export function parseOptionalAge(value: string) {
  const parsed = Number.parseInt(String(value || "").trim(), 10);
  if (!Number.isFinite(parsed)) return 0;
  if (parsed < 13 || parsed > 99) return 0;
  return parsed;
}

export function normalizeInterests(values: string[]) {
  const seen = new Set<string>();
  const result: string[] = [];

  for (const raw of values) {
    const clean = raw.trim();
    if (!clean) continue;
    const key = normalizeDiscoveryValue(clean);
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(clean);
  }

  return result;
}

/**
 * Only discovery narrows the feed. "Quiénes pueden verme" changes what others
 * see, so it must never make my own pool look filtered.
 */
export function shuffleFiltersHasAny(filters: ShuffleFilters) {
  return (
    geoAudienceHasAny(discoveryAudience(filters)) ||
    filters.sexo !== "todos" ||
    !!filters.ciudad.trim() ||
    filters.edadMin > 0 ||
    filters.edadMax > 0 ||
    filters.soloOnline ||
    filters.soloConFoto ||
    filters.soloConHistorias ||
    filters.intereses.length > 0
  );
}

export function shuffleFiltersActiveCount(filters: ShuffleFilters) {
  const discovery = discoveryAudience(filters);
  let count = 0;
  if (discovery.paises.length > 0) count += 1;
  if (filters.sexo !== "todos") count += 1;
  if (discovery.provincias.length > 0) count += 1;
  if (geoAudienceHasAny(visibilityAudience(filters))) count += 1;
  if (filters.ciudad.trim()) count += 1;
  if (filters.edadMin > 0 || filters.edadMax > 0) count += 1;
  if (filters.soloOnline) count += 1;
  if (filters.soloConFoto) count += 1;
  if (filters.soloConHistorias) count += 1;
  if (filters.intereses.length > 0) count += 1;
  return count;
}

type SummaryLabels = {
  country: string;
  visibility?: string;
  countryName?: (code: string) => string;
  gender: Record<ShuffleGenderFilter, string>;
  online: string;
  withPhoto: string;
  withStories: string;
  ageRange: (min: number, max: number) => string;
  ageMin: (min: number) => string;
  ageMax: (max: number) => string;
};

export function shuffleFiltersSummary(
  filters: ShuffleFilters,
  labels: SummaryLabels,
) {
  const discovery = discoveryAudience(filters);
  const visibility = visibilityAudience(filters);

  if (!shuffleFiltersHasAny(filters) && !geoAudienceHasAny(visibility)) return "";

  const parts: string[] = [];
  const countryNames = (codes: string[]) =>
    codes.map((code) => labels.countryName?.(code) || code).join(", ");

  if (discovery.paises.length > 0) {
    parts.push(`${labels.country}: ${countryNames(discovery.paises)}`);
  }
  if (visibility.paises.length > 0 && labels.visibility) {
    parts.push(`${labels.visibility}: ${countryNames(visibility.paises)}`);
  }
  if (filters.sexo !== "todos") parts.push(labels.gender[filters.sexo]);
  if (filters.edadMin > 0 || filters.edadMax > 0) {
    if (filters.edadMin > 0 && filters.edadMax > 0) {
      parts.push(labels.ageRange(filters.edadMin, filters.edadMax));
    } else if (filters.edadMin > 0) {
      parts.push(labels.ageMin(filters.edadMin));
    } else {
      parts.push(labels.ageMax(filters.edadMax));
    }
  }
  if (discovery.provincias.length > 0) parts.push(discovery.provincias.join(", "));
  if (filters.ciudad.trim()) parts.push(filters.ciudad.trim());
  if (filters.soloOnline) parts.push(labels.online);
  if (filters.soloConFoto) parts.push(labels.withPhoto);
  if (filters.soloConHistorias) parts.push(labels.withStories);
  if (filters.intereses.length > 0) {
    parts.push(filters.intereses.slice(0, 2).join(", "));
  }

  return parts.join(" · ");
}

function interestKeysFromProfile(profile: ShuffleProfile) {
  const raw = [...(profile.intereses || []), ...(profile.etiquetas || [])];
  return raw.map(normalizeDiscoveryValue).filter(Boolean);
}

export function profileMatchesShuffleFilters(
  profile: ShuffleProfile,
  filters: ShuffleFilters,
  options?: {
    storyOwnerUids?: Set<string>;
    now?: number;
  },
) {
  if (!shuffleFiltersHasAny(filters)) return true;

  const baseMatch = profileMatchesShuffleServerFilters(
    {
      pais: profile.pais,
      provincia: profile.provincia,
      ciudad: profile.ciudad,
      sexo: profile.sexo,
      edad: profile.edad,
      photo: profile.photo,
      fotos: profile.fotos,
      intereses: profile.intereses,
      etiquetas: profile.etiquetas,
      presenceAt: profile.presenceAt,
      lastActive: profile.lastActive,
      online: profile.online,
      showOnline: profile.showOnline,
      mostrarUltimaVez: profile.mostrarUltimaVez,
      shuffleVisitor: profile.shuffleVisitor === true,
      historiasActivasCount: profile.historiasActivasCount,
      hasActiveStories: profile.hasActiveStories,
    },
    filters,
    options?.now,
  );

  if (!baseMatch) return false;

  if (filters.soloConHistorias) {
    const inStoryIndex = options?.storyOwnerUids?.has(profile.uid) === true;
    const count = Number(profile.historiasActivasCount || 0);
    const hasFlag = profile.hasActiveStories === true;
    if (!hasFlag && count <= 0 && !inStoryIndex) return false;
  }

  return true;
}

export function profileMatchesShuffleSearch(profile: ShuffleProfile, query: string) {
  const q = query.trim().toLowerCase();
  if (!q) return true;

  const username = String(profile.username || "").toLowerCase();
  if (username.startsWith(q) || username.includes(q)) return true;

  const haystack = [
    profile.username,
    profile.bio,
    profile.provincia,
    profile.ciudad,
    ...(profile.intereses || []),
    ...(profile.searchKeywords || []),
  ]
    .join(" ")
    .toLowerCase();

  const tokens = q.split(/\s+/).filter(Boolean);
  if (tokens.length > 1) {
    return tokens.every((token) => haystack.includes(token));
  }

  return haystack.includes(q);
}

/** Filters saved before country selection became a list. */
type LegacySingleCountryFilters = {
  pais?: string;
  provincia?: string;
};

export function migrateDiscoveryAudience(
  parsed: Partial<ShuffleFilters> & LegacySingleCountryFilters,
): GeoAudience {
  const hasNew =
    Array.isArray(parsed.verPaises) || Array.isArray(parsed.verProvincias);
  if (hasNew) {
    return normalizeGeoAudience({
      paises: parsed.verPaises,
      provincias: parsed.verProvincias,
    });
  }

  return normalizeGeoAudience({
    paises: parsed.pais ? [parsed.pais] : [],
    provincias: parsed.provincia ? [parsed.provincia] : [],
  });
}

export function loadStoredShuffleFilters(): ShuffleFilters {
  if (typeof window === "undefined") return defaultShuffleFilters();

  try {
    const raw = localStorage.getItem(SHUFFLE_FILTERS_STORAGE_KEY);
    if (!raw) return defaultShuffleFilters();
    const parsed = JSON.parse(raw) as Partial<ShuffleFilters> & LegacySingleCountryFilters;
    const discovery = migrateDiscoveryAudience(parsed);
    const visibility = normalizeGeoAudience({
      paises: parsed.aparecerPaises,
      provincias: parsed.aparecerProvincias,
    });
    return {
      ...defaultShuffleFilters(),
      ...parsed,
      verPaises: discovery.paises,
      verProvincias: discovery.provincias,
      aparecerPaises: visibility.paises,
      aparecerProvincias: visibility.provincias,
      sexo: sexToStorage(String(parsed.sexo || "todos")),
      intereses: normalizeInterests(Array.isArray(parsed.intereses) ? parsed.intereses : []),
      edadMin: Number(parsed.edadMin || 0) || 0,
      edadMax: Number(parsed.edadMax || 0) || 0,
      soloOnline: parsed.soloOnline === true,
      soloConFoto: parsed.soloConFoto === true,
      soloConHistorias: parsed.soloConHistorias === true,
    };
  } catch {
    return defaultShuffleFilters();
  }
}

export function saveStoredShuffleFilters(filters: ShuffleFilters) {
  if (typeof window === "undefined") return;

  try {
    const discovery = discoveryAudience(filters);
    const visibility = visibilityAudience(filters);
    localStorage.setItem(
      SHUFFLE_FILTERS_STORAGE_KEY,
      JSON.stringify({
        ...filters,
        verPaises: discovery.paises,
        verProvincias: discovery.provincias,
        aparecerPaises: visibility.paises,
        aparecerProvincias: visibility.provincias,
        intereses: normalizeInterests(filters.intereses),
      }),
    );
  } catch {}
}
