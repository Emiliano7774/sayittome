import { profileMatchesShuffleServerFilters } from "@/lib/shuffle/serverFilters";
import type { ShuffleProfile } from "@/lib/shuffle/types";

export type ShuffleGenderFilter = "todos" | "hombre" | "mujer" | "otro";

export type ShuffleFilters = {
  pais: string;
  sexo: ShuffleGenderFilter;
  provincia: string;
  ciudad: string;
  edadMin: number;
  edadMax: number;
  soloOnline: boolean;
  soloConFoto: boolean;
  soloConHistorias: boolean;
  intereses: string[];
};

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
    pais: "",
    sexo: "todos",
    provincia: "",
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

export function shuffleFiltersHasAny(filters: ShuffleFilters) {
  return (
    !!filters.pais.trim() ||
    filters.sexo !== "todos" ||
    !!filters.provincia.trim() ||
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
  let count = 0;
  if (filters.pais.trim()) count += 1;
  if (filters.sexo !== "todos") count += 1;
  if (filters.provincia.trim()) count += 1;
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
  if (!shuffleFiltersHasAny(filters)) return "";

  const parts: string[] = [];

  if (filters.pais.trim()) parts.push(`${labels.country}: ${labels.countryName?.(filters.pais) || filters.pais}`);
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
  if (filters.provincia.trim()) parts.push(filters.provincia.trim());
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

  return haystack.includes(q);
}

export function loadStoredShuffleFilters(): ShuffleFilters {
  if (typeof window === "undefined") return defaultShuffleFilters();

  try {
    const raw = localStorage.getItem(SHUFFLE_FILTERS_STORAGE_KEY);
    if (!raw) return defaultShuffleFilters();
    const parsed = JSON.parse(raw) as Partial<ShuffleFilters>;
    return {
      ...defaultShuffleFilters(),
      ...parsed,
      pais: String(parsed.pais || "").trim().toUpperCase(),
      sexo: sexToStorage(String(parsed.sexo || "todos")),
      intereses: normalizeInterests(Array.isArray(parsed.intereses) ? parsed.intereses : []),
      edadMin: Number(parsed.edadMin || 0) || 0,
      edadMax: Number(parsed.edadMax || 0) || 0,
    };
  } catch {
    return defaultShuffleFilters();
  }
}

export function saveStoredShuffleFilters(filters: ShuffleFilters) {
  if (typeof window === "undefined") return;

  try {
    localStorage.setItem(
      SHUFFLE_FILTERS_STORAGE_KEY,
      JSON.stringify({
        ...filters,
        intereses: normalizeInterests(filters.intereses),
      }),
    );
  } catch {}
}
