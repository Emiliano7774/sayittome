type CoverFields = {
  videoPortada?: string;
  coverVideo?: string;
  fotoPortada?: string;
  coverPhoto?: string;
  portada?: string;
  heroPhoto?: string;
};

export function resolveProfileCoverVideo(profile?: CoverFields | null) {
  return String(profile?.videoPortada || profile?.coverVideo || "").trim();
}

export function resolveProfileCoverPhoto(profile?: CoverFields | null) {
  return String(
    profile?.fotoPortada || profile?.coverPhoto || profile?.portada || profile?.heroPhoto || "",
  ).trim();
}
