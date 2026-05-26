import { isRecentlyActive } from "@/lib/presence";
import { profilePhotoRequiresBlur } from "@/lib/moderation/blur";
import type { ShuffleProfile } from "@/lib/shuffle/types";

export function normalizeShuffleProfiles(raw: unknown): ShuffleProfile[] {
  if (!Array.isArray(raw)) return [];

  return raw
    .map((item: any, index: number) => {
      const presenceAt = item?.presenceAt ? String(item.presenceAt) : undefined;
      const lastActive = item?.lastActive ? String(item.lastActive) : undefined;
      const online = item?.online === true;
      const adminBlurProfilePhoto = item?.adminBlurProfilePhoto === true;
      const adminBlurFotosPerfil = item?.adminBlurFotosPerfil === true;

      return {
        uid: String(item?.uid || item?.id || item?.username || `profile-${index}`),
        username: String(item?.username || "usuario"),
        bio: String(item?.bio || "Sin descripcion."),
        photo: String(item?.photo || item?.fotoPrincipal || item?.photoURL || ""),
        coverPhoto: String(
          item?.coverPhoto || item?.fotoPortada || item?.portada || item?.heroPhoto || "",
        ),
        coverVideo: String(item?.coverVideo || item?.videoPortada || ""),
        lastActive,
        presenceAt,
        online,
        adminBlurProfilePhoto,
        adminBlurFotosPerfil,
        showOnline:
          typeof item?.showOnline === "boolean"
            ? item.showOnline
            : isRecentlyActive(presenceAt, online),
        blurPhoto: profilePhotoRequiresBlur({
          adminBlurProfilePhoto,
          adminBlurFotosPerfil,
        }),
      };
    })
    .filter((p) => p.username && p.username !== "undefined");
}
