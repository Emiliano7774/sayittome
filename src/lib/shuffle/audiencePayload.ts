import {
  discoveryAudience,
  loadStoredShuffleFilters,
  visibilityAudience,
} from "@/lib/shuffle/filters";

/** "A quiénes quiero ver", as sent to the match API. */
export function readDiscoveryPayload() {
  const audience = discoveryAudience(loadStoredShuffleFilters());
  return { verPaises: audience.paises, verProvincias: audience.provincias };
}

/** "Quiénes pueden verme", as published with presence / stored on the profile. */
export function readVisibilityPayload() {
  const audience = visibilityAudience(loadStoredShuffleFilters());
  return {
    visibilidadPaises: audience.paises,
    visibilidadProvincias: audience.provincias,
  };
}
