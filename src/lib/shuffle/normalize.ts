import { isLastSeenPublic } from "@/lib/profile/lastSeenVisibility";
import { isActiveWithinWindow } from "@/lib/presence";
import { galleryRequiresBlur } from "@/lib/moderation/blur";
import { normalizeUsername } from "@/lib/profile/username";
import { dedupeShuffleProfiles, resolveUsernameLower } from "@/lib/shuffle/dedupeProfiles";
import type { ShuffleProfile } from "@/lib/shuffle/types";

export function normalizeShuffleProfiles(raw: unknown): ShuffleProfile[] {
  if (!Array.isArray(raw)) return [];

  const mapped = raw
    .map((item: any, index: number) => {
      const presenceAt = item?.presenceAt ? String(item.presenceAt) : undefined;
      const lastActive = item?.lastActive ? String(item.lastActive) : undefined;
      const online = item?.online === true;
      const mostrarUltimaVez = item?.mostrarUltimaVez !== false;
      const adminBlurProfilePhoto = item?.adminBlurProfilePhoto === true;
      const adminBlurFotosPerfil = item?.adminBlurFotosPerfil === true;
      const adminBlurGallery = item?.adminBlurGallery === true;
      const intereses = Array.isArray(item?.intereses)
        ? item.intereses.map(String)
        : [];
      const etiquetas = Array.isArray(item?.etiquetas)
        ? item.etiquetas.map(String)
        : [];
      const fotos = Array.isArray(item?.fotos) ? item.fotos.map(String) : [];
      const searchKeywords = Array.isArray(item?.searchKeywords)
        ? item.searchKeywords.map(String)
        : [];

      return {
        uid: String(item?.uid || item?.id || item?.username || `profile-${index}`),
        username:
          normalizeUsername(String(item?.username || item?.usernameLower || "usuario")) ||
          "usuario",
        usernameLower: resolveUsernameLower({
          username: String(item?.username || ""),
          usernameLower: String(item?.usernameLower || ""),
        }),
        email: String(item?.email || ""),
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
        adminBlurGallery,
        provincia: String(item?.provincia || ""),
        ciudad: String(item?.ciudad || ""),
        pais: String(item?.pais || ""),
        sexo: String(item?.sexo || ""),
        edad: Number(item?.edad || 0) || 0,
        intereses,
        etiquetas,
        fotos,
        searchKeywords,
        historiasActivasCount: Number(
          item?.historiasActivasCount ??
            item?.activeStoriesCount ??
            item?.storiesCount ??
            item?.historias ??
            0,
        ),
        hasActiveStories:
          item?.hasActiveStories === true || item?.tieneHistoriasActivas === true,
        mostrarUltimaVez,
        showOnline: mostrarUltimaVez
          ? typeof item?.showOnline === "boolean"
            ? item.showOnline
            : isActiveWithinWindow(presenceAt, lastActive)
          : false,
        blurPhoto: galleryRequiresBlur({
          adminBlurProfilePhoto,
          adminBlurFotosPerfil,
          adminBlurGallery,
        }),
        shuffleFeatured: item?.shuffleFeatured === true,
      };
    })
    .filter((p) => p.username && p.username !== "undefined");

  return dedupeShuffleProfiles(mapped);
}
