import { isShuffleProfileOnline, ONLINE_WINDOW_MS } from "@/lib/presence";
import { inferCountryCodeFromSubdivision, normalizeGeoValue, resolveProfileCountryCode } from "@/lib/geo/countries";
import {
  normalizeDiscoveryValue,
  sexToStorage,
  shuffleFiltersHasAny,
  type ShuffleFilters,
  type ShuffleGenderFilter,
} from "@/lib/shuffle/filters";

export type ShuffleFilterProfile = {
  pais?: string;
  provincia?: string;
  ciudad?: string;
  sexo?: string;
  edad?: number;
  photo?: string;
  fotos?: string[];
  intereses?: string[];
  etiquetas?: string[];
  presenceAt?: string;
  lastActive?: string;
  online?: boolean;
  showOnline?: boolean;
  historiasActivasCount?: number;
  hasActiveStories?: boolean;
};

export function parseShuffleFiltersFromSearchParams(params: URLSearchParams): ShuffleFilters {
  const interesesRaw = String(params.get("intereses") || "").trim();
  const intereses = interesesRaw
    ? interesesRaw.split("|").map((item) => item.trim()).filter(Boolean)
    : [];

  return {
    pais: String(params.get("pais") || "").trim().toUpperCase(),
    sexo: (String(params.get("sexo") || "todos").trim() as ShuffleGenderFilter) || "todos",
    provincia: String(params.get("provincia") || "").trim(),
    ciudad: String(params.get("ciudad") || "").trim(),
    edadMin: Number(params.get("edadMin") || 0) || 0,
    edadMax: Number(params.get("edadMax") || 0) || 0,
    soloOnline: params.get("soloOnline") === "1",
    soloConFoto: params.get("soloConFoto") === "1",
    soloConHistorias: params.get("soloConHistorias") === "1",
    intereses,
  };
}

export function appendShuffleFiltersToSearchParams(
  params: URLSearchParams,
  filters: ShuffleFilters,
) {
  if (filters.pais) params.set("pais", filters.pais);
  if (filters.provincia) params.set("provincia", filters.provincia);
  if (filters.ciudad) params.set("ciudad", filters.ciudad);
  if (filters.sexo !== "todos") params.set("sexo", filters.sexo);
  if (filters.edadMin > 0) params.set("edadMin", String(filters.edadMin));
  if (filters.edadMax > 0) params.set("edadMax", String(filters.edadMax));
  if (filters.soloOnline) params.set("soloOnline", "1");
  if (filters.soloConFoto) params.set("soloConFoto", "1");
  if (filters.soloConHistorias) params.set("soloConHistorias", "1");
  if (filters.intereses.length > 0) params.set("intereses", filters.intereses.join("|"));
}

function interestKeys(values: string[] | undefined) {
  return new Set((values || []).map(normalizeDiscoveryValue).filter(Boolean));
}

function isProfileOnline(profile: ShuffleFilterProfile, now = Date.now()) {
  return isShuffleProfileOnline(profile, now, ONLINE_WINDOW_MS);
}

export function profileMatchesShuffleServerFilters(
  profile: ShuffleFilterProfile,
  filters: ShuffleFilters,
  now = Date.now(),
) {
  if (!shuffleFiltersHasAny(filters)) return true;

  if (filters.pais) {
    const profileCountry = resolveProfileCountryCode(profile);
    if (profileCountry !== filters.pais) return false;
  }

  if (filters.provincia) {
    const wanted = normalizeGeoValue(filters.provincia);
    const profileSubdivision = normalizeGeoValue(profile.provincia || "");
    if (profileSubdivision !== wanted) return false;
  }

  if (filters.ciudad) {
    const wanted = normalizeDiscoveryValue(filters.ciudad);
    const ciudad = normalizeDiscoveryValue(profile.ciudad || "");
    if (!ciudad.includes(wanted)) return false;
  }

  if (filters.soloOnline && !isProfileOnline(profile, now)) return false;

  if (filters.soloConFoto) {
    const photo = String(profile.photo || "").trim();
    const gallery = profile.fotos || [];
    if (!photo && gallery.length === 0) return false;
  }

  if (filters.soloConHistorias) {
    const count = Number(profile.historiasActivasCount || 0);
    const hasFlag = profile.hasActiveStories === true;
    if (!hasFlag && count <= 0) return false;
  }

  if (filters.sexo !== "todos") {
    const sexo = sexToStorage(profile.sexo || "");
    if (sexo !== filters.sexo) return false;
  }

  const edad = Number(profile.edad || 0);
  if (filters.edadMin > 0 && (edad <= 0 || edad < filters.edadMin)) return false;
  if (filters.edadMax > 0 && (edad <= 0 || edad > filters.edadMax)) return false;

  if (filters.intereses.length > 0) {
    const profileInterests = new Set([
      ...interestKeys(profile.intereses),
      ...interestKeys(profile.etiquetas),
    ]);
    const selected = filters.intereses.map(normalizeDiscoveryValue).filter(Boolean);
    if (!selected.some((item) => profileInterests.has(item))) return false;
  }

  return true;
}

export { inferCountryCodeFromSubdivision, resolveProfileCountryCode };
