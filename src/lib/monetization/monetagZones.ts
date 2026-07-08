export const MONETAG_VIGNETTE_SRC = "https://n6wxm.com/vignette.min.js" as const;

export const MONETAG_VIGNETTE_ZONES = [
  {
    zoneId: "11011520",
    src: MONETAG_VIGNETTE_SRC,
    scriptId: "monetag-vignette-11011520",
    integration: "next-script",
  },
  {
    zoneId: "11255233",
    src: MONETAG_VIGNETTE_SRC,
    scriptId: "monetag-vignette-11255233",
    integration: "official-iife",
  },
  {
    zoneId: "11255234",
    src: MONETAG_VIGNETTE_SRC,
    scriptId: "monetag-vignette-11255234",
    integration: "official-iife",
  },
] as const;

export type MonetagVignetteZoneId = (typeof MONETAG_VIGNETTE_ZONES)[number]["zoneId"];

export const MONETAG_PUSH_ZONE = {
  zoneId: "11255229",
  src: "https://5gvci.com/act/files/tag.min.js?z=11255229",
  scriptId: "monetag-push-11255229",
} as const;

/** @deprecated Use MONETAG_VIGNETTE_ZONES[0] — kept for imports that reference the first zone. */
export const MONETAG_VIGNETTE_BANNER = MONETAG_VIGNETTE_ZONES[0];

export function officialVignetteIife(zoneId: MonetagVignetteZoneId) {
  return `(function(s){s.dataset.zone='${zoneId}',s.src='${MONETAG_VIGNETTE_SRC}'})([document.documentElement, document.body].filter(Boolean).pop().appendChild(document.createElement('script')))`;
}
