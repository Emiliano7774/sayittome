const CLASSIC_ANON_PALETTE = [
  "#1a4b7c",
  "#6d28d9",
  "#92680a",
  "#0f766e",
  "#9f1239",
  "#4338ca",
  "#b45309",
  "#047857",
] as const;

export function hashAnonPaletteIndex(key: string, size = CLASSIC_ANON_PALETTE.length) {
  const raw = String(key || "anon").trim().toLowerCase();
  let hash = 0;

  for (let i = 0; i < raw.length; i += 1) {
    hash = (hash * 31 + raw.charCodeAt(i)) >>> 0;
  }

  return hash % size;
}

export function classicAnonAvatarColor(key: string) {
  return CLASSIC_ANON_PALETTE[hashAnonPaletteIndex(key, CLASSIC_ANON_PALETTE.length)];
}
