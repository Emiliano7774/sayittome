import { formatProfileCreatedAtLabel } from "@/lib/profile/resolveProfileCreatedAt";

type ProfileLike = {
  createdAtLabel?: string;
  originalCreatedAt?: unknown;
  createdAt?: unknown;
  fechaCreacion?: unknown;
  fechaRegistro?: unknown;
  registrationDate?: unknown;
  _firestoreCreateTime?: unknown;
};

/** Public signature line — never confused with last-seen / presence. */
export function resolvePublicProfileCreatedLabel(
  profile?: ProfileLike | null,
  localeTag = "es-AR",
) {
  if (!profile) return "";

  const explicit = String(profile.createdAtLabel || "").trim();
  if (explicit) return explicit;

  return formatProfileCreatedAtLabel(profile as Record<string, unknown>, localeTag);
}
