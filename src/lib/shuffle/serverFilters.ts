import { isPublicShuffleOnline } from "@/lib/profile/lastSeenVisibility";
import { isShuffleProfileOnline, ONLINE_WINDOW_MS } from "@/lib/presence";
import { inferCountryCodeFromSubdivision, normalizeGeoValue, resolveProfileCountryCode } from "@/lib/geo/countries";
import {
  geoAudienceIncludes,
  normalizeGeoAudience,
  parseGeoAudience,
  readStoredGeoAudience,
  serializeGeoAudience,
  type GeoTarget,
} from "@/lib/geo/audience";
import {
  discoveryAudience,
  normalizeDiscoveryValue,
  sexToStorage,
  shuffleFiltersHasAny,
  visibilityAudience,
  type ShuffleFilters,
  type ShuffleGenderFilter,
} from "@/lib/shuffle/filters";

export type ShuffleFilterProfile = {
  pais?: string;
  provincia?: string;
  visibilidadPaises?: string[];
  visibilidadProvincias?: string[];
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
  mostrarUltimaVez?: boolean;
  /** Live anonymous session. Always counts as online while it is in the pool. */
  shuffleVisitor?: boolean;
  historiasActivasCount?: number;
  hasActiveStories?: boolean;
};

export function parseShuffleFiltersFromSearchParams(params: URLSearchParams): ShuffleFilters {
  const interesesRaw = String(params.get("intereses") || "").trim();
  const intereses = interesesRaw
    ? interesesRaw.split("|").map((item) => item.trim()).filter(Boolean)
    : [];

  // `pais` / `provincia` keep older clients working until their cache refreshes.
  const discovery = parseGeoAudience(
    params.get("verPaises") || params.get("pais") || "",
    params.get("verProvincias") || params.get("provincia") || "",
  );
  const visibility = parseGeoAudience(
    params.get("aparecerPaises") || "",
    params.get("aparecerProvincias") || "",
  );

  return {
    verPaises: discovery.paises,
    verProvincias: discovery.provincias,
    aparecerPaises: visibility.paises,
    aparecerProvincias: visibility.provincias,
    sexo: (String(params.get("sexo") || "todos").trim() as ShuffleGenderFilter) || "todos",
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
  const discovery = serializeGeoAudience(discoveryAudience(filters));
  const visibility = serializeGeoAudience(visibilityAudience(filters));
  if (discovery.paises) params.set("verPaises", discovery.paises);
  if (discovery.provincias) params.set("verProvincias", discovery.provincias);
  if (visibility.paises) params.set("aparecerPaises", visibility.paises);
  if (visibility.provincias) params.set("aparecerProvincias", visibility.provincias);
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
  if (profile.shuffleVisitor === true) return true;
  return isPublicShuffleOnline(profile, (p) =>
    isShuffleProfileOnline(p, now, ONLINE_WINDOW_MS),
  );
}

export function profileMatchesShuffleServerFilters(
  profile: ShuffleFilterProfile,
  filters: ShuffleFilters,
  now = Date.now(),
) {
  if (!shuffleFiltersHasAny(filters)) return true;

  // Live anonymous sessions are presence cards, not demographics. Solo-online
  // (and mixed feeds) must keep them even when country/sex/age filters are on.
  // Photo/stories filters still exclude them — they have neither.
  if (profile.shuffleVisitor === true) {
    if (filters.soloConFoto || filters.soloConHistorias) return false;
    if (filters.soloOnline) return isProfileOnline(profile, now);
    return true;
  }

  if (!geoAudienceIncludes(discoveryAudience(filters), profile)) return false;

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

/**
 * "Quiénes pueden verme": a profile that narrowed its audience only shows up for
 * viewers inside it. An empty audience (every profile today) accepts everyone.
 */
export function profileIsVisibleToViewer(
  profile: ShuffleFilterProfile,
  viewer: GeoTarget | null | undefined,
) {
  const audience = normalizeGeoAudience({
    paises: profile.visibilidadPaises,
    provincias: profile.visibilidadProvincias,
  });
  if (audience.paises.length === 0) return true;
  if (!viewer) return false;
  return geoAudienceIncludes(audience, viewer);
}

export function parseViewerGeoTarget(params: URLSearchParams, headerCountry?: string | null): GeoTarget {
  const pais = String(params.get("viewerPais") || headerCountry || "").trim().toUpperCase();
  const provincia = String(params.get("viewerProvincia") || "").trim();
  return { pais, provincia };
}

export { inferCountryCodeFromSubdivision, resolveProfileCountryCode, readStoredGeoAudience };
