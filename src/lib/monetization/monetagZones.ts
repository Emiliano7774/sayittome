export const MONETAG_IN_PAGE_PUSH = {
  zoneId: "11011024",
  src: "https://nap5k.com/tag.min.js",
} as const;

export const MONETAG_VIGNETTE_BANNER = {
  zoneId: "11011520",
  src: "https://n6wxm.com/vignette.min.js",
} as const;

/** In-feed shuffle native banner (web). Uses the historical In-Page Push zone. */
export const MONETAG_SHUFFLE_INLINE = {
  zoneId: MONETAG_IN_PAGE_PUSH.zoneId,
  src: MONETAG_IN_PAGE_PUSH.src,
} as const;
