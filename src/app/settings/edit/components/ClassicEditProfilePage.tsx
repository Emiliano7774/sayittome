"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  Camera,
  ChevronLeft,
  ChevronRight,
  Film,
  Flame,
  Heart,
  ImagePlus,
  MessageCircle,
  Star,
  Trash2,
  UserPlus,
} from "lucide-react";
import { onAuthStateChanged } from "firebase/auth";
import { doc, getDoc, serverTimestamp, setDoc } from "firebase/firestore";
import { auth, db } from "@/lib/firebase";
import { guessMediaFileKind, isMediaFile } from "@/lib/media/fileKind";
import {
  profileUploadErrorKey,
  uploadFileToStorage,
} from "@/lib/media/uploadFileToStorage";
import { ARGENTINA_PROVINCIAS } from "@/lib/profile/provincias";
import { useT } from "@/contexts/LocaleContext";

type BadgeKey = "superMessages" | "likes" | "conversations" | "followers";

type MediaItem = {
  url: string;
  type: "image" | "video";
  path?: string;
};

const badgeItems: Array<{
  key: BadgeKey;
  label: string;
  icon: React.ReactNode;
  color: string;
}> = [
  {
    key: "superMessages",
    label: "super messages",
    icon: <Flame size={38} fill="white" />,
    color: "bg-orange-500",
  },
  {
    key: "likes",
    label: "me gusta",
    icon: <Heart size={38} fill="white" />,
    color: "bg-pink-500",
  },
  {
    key: "conversations",
    label: "conv.",
    icon: <MessageCircle size={38} fill="white" />,
    color: "bg-green-500",
  },
  {
    key: "followers",
    label: "seguidores",
    icon: <UserPlus size={38} />,
    color: "bg-purple-500",
  },
];

export default function ClassicEditProfilePage() {
  const router = useRouter();
  const t = useT();
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const [uid, setUid] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [username, setUsername] = useState("");
  const [bio, setBio] = useState("");
  const [tags, setTags] = useState("");
  const [provincia, setProvincia] = useState("");
  const [mostrarProvincia, setMostrarProvincia] = useState(true);
  const [createdAtLabel, setCreatedAtLabel] = useState("");

  const [media, setMedia] = useState<MediaItem[]>([]);
  const [principalIndex, setPrincipalIndex] = useState(0);
  const [uploading, setUploading] = useState(false);
  const [uploadText, setUploadText] = useState("");
  const [uploadError, setUploadError] = useState("");
  const [saveError, setSaveError] = useState("");

  const [visibleBadges, setVisibleBadges] = useState<Record<BadgeKey, boolean>>({
    superMessages: true,
    likes: true,
    conversations: true,
    followers: true,
  });

  const fotoPrincipal =
    media[principalIndex]?.type === "image"
      ? media[principalIndex].url
      : media.find((item) => item.type === "image")?.url || "";

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (user) => {
      if (!user) {
        router.replace("/login");
        return;
      }

      setUid(user.uid);

      const snap = await getDoc(doc(db, "usuarios", user.uid));
      const data = snap.exists() ? snap.data() : {};

      setUsername(String(data.username || data.nombre || ""));
      setBio(String(data.bio || data.descripcion || ""));
      setProvincia(String(data.provincia || ""));
      setMostrarProvincia(data.mostrarProvincia !== false);

      const createdAtValue = data.createdAt?.toDate ? data.createdAt.toDate() : null;
      setCreatedAtLabel(
        createdAtValue
          ? createdAtValue.toLocaleDateString("es-AR", {
              day: "2-digit",
              month: "long",
              year: "numeric",
            })
          : ""
      );
      setTags(
        Array.isArray(data.etiquetas)
          ? data.etiquetas.join(", ")
          : Array.isArray(data.intereses)
            ? data.intereses.join(", ")
            : ""
      );

      const fotos = Array.isArray(data.fotos)
        ? data.fotos.map((url: string) => ({ url, type: "image" as const }))
        : [];

      const videos = Array.isArray(data.videos)
        ? data.videos.map((url: string) => ({ url, type: "video" as const }))
        : [];

      const loadedMedia = [...fotos, ...videos];

      if (loadedMedia.length === 0 && data.fotoPrincipal) {
        loadedMedia.push({
          url: String(data.fotoPrincipal),
          type: "image",
        });
      }

      setMedia(loadedMedia.slice(0, 100));
      setPrincipalIndex(0);

      setVisibleBadges({
        superMessages: data.mostrarSuperMessages !== false,
        likes: data.mostrarLikes !== false,
        conversations: data.mostrarConversaciones !== false,
        followers: data.mostrarSeguidores !== false,
      });

      setLoading(false);
    });

    return () => unsub();
  }, [router]);

  function toggleBadge(key: BadgeKey) {
    setVisibleBadges((prev) => ({
      ...prev,
      [key]: !prev[key],
    }));
  }

  async function uploadFiles(files: FileList | null) {
    if (!uid || !files?.length) return;

    const selected = Array.from(files).filter(isMediaFile);

    const freeSlots = Math.max(0, 100 - media.length);
    const batch = selected.slice(0, freeSlots);

    if (!batch.length) {
      setUploadError(t("edit_upload_fail"));
      return;
    }

    setUploading(true);
    setUploadError("");

    const uploaded: MediaItem[] = [];

    try {
      for (let i = 0; i < batch.length; i++) {
        const file = batch[i];
        const kind = guessMediaFileKind(file);
        if (!kind) continue;

        const ext = file.name.split(".").pop() || (kind === "video" ? "mp4" : "jpg");
        const path = `usuarios/${uid}/fotos/${Date.now()}_${Math.random()
          .toString(36)
          .slice(2)}.${ext}`;

        setUploadText(t("edit_uploading", { current: String(i + 1), total: String(batch.length) }));

        const url = await uploadFileToStorage({
          path,
          file,
          kind,
          requireRegisteredUser: true,
        });
        uploaded.push({
          url,
          type: kind,
          path,
        });
      }

      setMedia((prev) => [...prev, ...uploaded].slice(0, 100));
    } catch (error) {
      console.error(error);
      setUploadError(t(profileUploadErrorKey(error)));
    } finally {
      setUploading(false);
      setUploadText("");
    }
  }

  function moveMedia(index: number, direction: -1 | 1) {
    const target = index + direction;

    if (target < 0 || target >= media.length) return;

    setMedia((prev) => {
      const copy = [...prev];
      const temp = copy[index];
      copy[index] = copy[target];
      copy[target] = temp;
      return copy;
    });

    if (principalIndex === index) {
      setPrincipalIndex(target);
    } else if (principalIndex === target) {
      setPrincipalIndex(index);
    }
  }

  function removeMedia(index: number) {
    setMedia((prev) => prev.filter((_, i) => i !== index));

    if (principalIndex === index) {
      setPrincipalIndex(0);
    } else if (principalIndex > index) {
      setPrincipalIndex((prev) => Math.max(0, prev - 1));
    }
  }

  async function saveProfile() {
    if (!uid) return;

    setSaving(true);
    setSaveError("");

    const tagArray = tags
      .split(",")
      .map((x) => x.trim())
      .filter(Boolean);

    const fotos = media.filter((item) => item.type === "image").map((item) => item.url);
    const videos = media.filter((item) => item.type === "video").map((item) => item.url);

    try {
      await setDoc(
        doc(db, "usuarios", uid),
        {
          username: username.trim(),
          usernameLower: username.trim().toLowerCase(),
          nombre: username.trim(),
          bio: bio.trim(),
          descripcion: bio.trim(),
          etiquetas: tagArray,
          intereses: tagArray,
          provincia,
          mostrarProvincia,
          fotos,
          videos,
          fotoPrincipal,
          mostrarSuperMessages: visibleBadges.superMessages,
          mostrarLikes: visibleBadges.likes,
          mostrarConversaciones: visibleBadges.conversations,
          mostrarSeguidores: visibleBadges.followers,
          perfilCompleto: Boolean(username.trim() && fotoPrincipal),
          updatedAt: serverTimestamp(),
        },
        { merge: true },
      );

      router.push("/settings");
    } catch (error) {
      console.error(error);
      setSaveError("No se pudo guardar tu perfil. Probá de nuevo.");
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <main className="min-h-screen bg-black text-white flex items-center justify-center">
        <p className="text-2xl font-black">Cargando perfil...</p>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-black text-white px-5 sm:px-8 lg:px-12 py-6 pb-28">
      <section className="w-full max-w-[1480px] mx-auto">
        <div className="flex items-center justify-between mb-10">
          <button
            onClick={() => router.push("/settings")}
            className="w-12 h-12 rounded-full border border-white/40 flex items-center justify-center"
          >
            <ArrowLeft size={25} />
          </button>

          <button
            onClick={saveProfile}
            disabled={saving}
            className="px-8 h-12 rounded-full bg-white text-black font-black disabled:opacity-50"
          >
            {saving ? "Guardando..." : "Guardar"}
          </button>
        </div>

        {saveError ? (
          <p className="mb-6 text-sm font-semibold text-red-400">{saveError}</p>
        ) : null}

        <div className="grid grid-cols-1 xl:grid-cols-[minmax(420px,520px)_1fr] gap-10 xl:gap-16 items-start">
          <aside className="w-full">
            <div className="border-b border-white/18 pb-8 mb-8">
              <p className="text-white/55 text-sm font-black uppercase tracking-wide mb-5">
                Fotos y videos
              </p>

              <div className="flex flex-col sm:flex-row xl:flex-col gap-6">
                <div className="w-full sm:w-[260px] xl:w-full aspect-square rounded-[34px] border-2 border-white/25 bg-zinc-950 overflow-hidden flex items-center justify-center">
                  {fotoPrincipal ? (
                    <img
                      src={fotoPrincipal}
                      className="w-full h-full object-cover"
                      alt="Foto principal"
                    />
                  ) : (
                    <div className="w-28 h-28 rounded-full bg-gradient-to-br from-white via-slate-300 to-slate-600 shadow-[0_0_40px_rgba(255,255,255,.16)]" />
                  )}
                </div>

                <div className="flex-1">
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="w-full min-h-14 rounded-2xl bg-violet-500 text-white font-black text-xl flex items-center justify-center gap-3"
                  >
                    <ImagePlus size={25} />
                    Subir fotos/videos
                  </button>

                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*,video/*"
                    multiple
                    className="hidden"
                    onChange={(e) => uploadFiles(e.target.files)}
                  />

                  <p className="text-white/45 mt-4 text-lg">
                    {media.length}/100 archivos. Podés subir fotos y videos.
                  </p>

                  {uploading && (
                    <p className="text-violet-300 mt-3 font-black">
                      {uploadText}
                    </p>
                  )}

                  {uploadError ? (
                    <p className="mt-3 text-sm font-semibold text-red-400">{uploadError}</p>
                  ) : null}

                  <p className="text-white/35 mt-3 leading-relaxed">
                    Tocá la estrella para elegir la foto principal. Usá las flechas para mover el orden.
                  </p>
                </div>
              </div>
            </div>

            <div className="border-y border-white/18 py-7 mb-8">
              <div className="flex items-center justify-between gap-5 text-center mb-5">
                <p className="text-white/55 text-sm font-black uppercase tracking-wide">
                  Insignias
                </p>
                <p className="text-white/55 text-sm font-black uppercase tracking-wide">
                  Toca para activar o desactivar
                </p>
              </div>

              <div className="grid grid-cols-4 gap-4">
                {badgeItems.map((item) => {
                  const active = visibleBadges[item.key];

                  return (
                    <button
                      key={item.key}
                      onClick={() => toggleBadge(item.key)}
                      className={`flex flex-col items-center transition ${
                        active ? "opacity-100" : "opacity-25 grayscale"
                      }`}
                    >
                      <div
                        className={`w-16 h-16 sm:w-20 sm:h-20 rounded-full ${item.color} flex items-center justify-center shadow-[0_0_28px_rgba(255,255,255,.10)]`}
                      >
                        {item.icon}
                      </div>

                      <p className="mt-3 text-xl font-black">0</p>
                      <p className="text-white/55 font-bold text-xs sm:text-base leading-tight">
                        {item.label}
                      </p>
                    </button>
                  );
                })}
              </div>
            </div>
          </aside>

          <section className="w-full">
            <div className="border-b border-white/18 pb-8 mb-8">
              <label className="block">
                <p className="text-white/55 text-sm font-black uppercase tracking-wide mb-4">
                  Username
                </p>

                <input
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder="Tu username"
                  className="w-full bg-transparent border-b border-white/70 py-3 text-2xl outline-none text-white placeholder:text-white/35"
                />
              </label>
            </div>

            <div className="border-b border-white/18 pb-8 mb-8">
              <label className="block">
                

                <textarea
                  value={bio}
                  onChange={(e) => setBio(e.target.value.slice(0, 300))}
                  placeholder="EscribÃ­ tu biografÃ­a..."
                  className="w-full min-h-[140px] bg-transparent border-b border-white/70 py-3 text-2xl outline-none text-white placeholder:text-white/35 resize-none"
                />

                <p className="text-right text-white/55 mt-2 font-bold">
                  {bio.length}/300
                </p>

                {createdAtLabel && (
                  <p className="mt-5 text-right text-white/35 text-lg italic">
                    Perfil creado el {createdAtLabel}
                  </p>
                )}
              </label>
            </div>

            <div className="border-b border-white/18 pb-8 mb-8">
              <p className="text-white/55 text-sm font-black uppercase tracking-wide mb-4">
                Voz
              </p>

              <button
                type="button"
                className="mx-auto flex h-16 w-full max-w-[420px] items-center justify-center rounded-xl bg-green-500/80 text-white text-2xl font-bold"
              >
                Grabar voz
              </button>

              <p className="text-white/35 mt-3 text-center">
                Lo conectamos después con grabación real.
              </p>
            </div>

            <div className="border-b border-white/18 pb-8 mb-8">
              <label className="block">
                <p className="text-white/55 text-sm font-black uppercase tracking-wide mb-4">
                  Etiquetas
                </p>

                <input
                  value={tags}
                  onChange={(e) => setTags(e.target.value)}
                  placeholder="Añadir etiquetas"
                  className="w-full bg-transparent border-b border-white/70 py-3 text-2xl outline-none text-white placeholder:text-white/35"
                />

                <p className="text-white/35 mt-2">
                  Separalas con coma. Ejemplo: música, gym, series
                </p>
              </label>
            </div>

            <div className="border-b border-white/18 pb-8 mb-8">
              <label className="block">
                <p className="text-white/55 text-sm font-black uppercase tracking-wide mb-4">
                  Provincia
                </p>

                <select
                  value={provincia}
                  onChange={(e) => setProvincia(e.target.value)}
                  className="w-full bg-black border-b border-white/70 py-3 text-2xl outline-none text-white"
                >
                  <option value="">Seleccionar provincia</option>
                  {ARGENTINA_PROVINCIAS.map((p) => (
                    <option key={p} value={p}>
                      {p}
                    </option>
                  ))}
                </select>

                <div className="mt-5 flex items-center justify-between gap-4">
                  <p className="text-white/35">
                    Se usa igual para conectarte con gente cercana.
                  </p>

                  <button
                    type="button"
                    onClick={() => setMostrarProvincia((prev) => !prev)}
                    className={`px-5 py-3 rounded-full font-black ${
                      mostrarProvincia
                        ? "bg-white text-black"
                        : "bg-white/10 text-white/45"
                    }`}
                  >
                    {mostrarProvincia ? "Visible" : "Oculta"}
                  </button>
                </div>
              </label>
            </div>
          </section>
        </div>

        <div className="mt-8 border-t border-white/18 pt-8">
          <div className="flex items-end justify-between gap-5 mb-5">
            <div>
              <p className="text-white/55 text-sm font-black uppercase tracking-wide">
                Mosaico
              </p>
              <h2 className="text-4xl sm:text-5xl font-black">
                Fotos y videos
              </h2>
            </div>

            <p className="text-white/45 font-bold">
              {media.length}/100
            </p>
          </div>

          {media.length === 0 ? (
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="w-full min-h-[220px] border border-dashed border-white/25 rounded-[28px] text-white/45 text-2xl font-black flex items-center justify-center"
            >
              SubÃ­ fotos o videos para ver el mosaico
            </button>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 2xl:grid-cols-7 gap-4">
              {media.map((item, index) => (
                <div
                  key={`${item.url}-${index}`}
                  className="relative aspect-square rounded-[22px] overflow-hidden bg-zinc-950 border border-white/10"
                >
                  {item.type === "image" ? (
                    <img
                      src={item.url}
                      className="w-full h-full object-cover"
                      alt={`Media ${index + 1}`}
                    />
                  ) : (
                    <video
                      src={item.url}
                      className="w-full h-full object-cover"
                      muted
                      playsInline
                    />
                  )}

                  <div className="absolute top-2 left-2 px-2 py-1 rounded-full bg-black/70 text-xs font-black flex items-center gap-1">
                    {item.type === "image" ? <Camera size={13} /> : <Film size={13} />}
                    {index + 1}
                  </div>

                  <div className="absolute inset-x-0 bottom-0 p-2 bg-gradient-to-t from-black via-black/70 to-transparent flex justify-between gap-1">
                    <button
                      type="button"
                      onClick={() => moveMedia(index, -1)}
                      className="w-9 h-9 rounded-full bg-white/15 flex items-center justify-center disabled:opacity-25"
                      disabled={index === 0}
                    >
                      <ChevronLeft size={17} />
                    </button>

                    <button
                      type="button"
                      onClick={() => setPrincipalIndex(index)}
                      className={`w-9 h-9 rounded-full flex items-center justify-center ${
                        principalIndex === index ? "bg-violet-500" : "bg-white/15"
                      }`}
                    >
                      <Star size={17} fill={principalIndex === index ? "white" : "none"} />
                    </button>

                    <button
                      type="button"
                      onClick={() => removeMedia(index)}
                      className="w-9 h-9 rounded-full bg-red-500/80 flex items-center justify-center"
                    >
                      <Trash2 size={17} />
                    </button>

                    <button
                      type="button"
                      onClick={() => moveMedia(index, 1)}
                      className="w-9 h-9 rounded-full bg-white/15 flex items-center justify-center disabled:opacity-25"
                      disabled={index === media.length - 1}
                    >
                      <ChevronRight size={17} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </section>
    </main>
  );
}





