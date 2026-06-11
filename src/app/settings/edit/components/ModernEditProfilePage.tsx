"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { onAuthStateChanged, type User } from "firebase/auth";
import { doc, getDoc, setDoc, serverTimestamp } from "firebase/firestore";
import { ArrowLeft, Camera, Film, GripVertical, ImagePlus, Star, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";

import ProfileMediaSurface from "@/components/profile/ProfileMediaSurface";
import { auth, db } from "@/lib/firebase";
import { guessMediaFileKind, isMediaFile } from "@/lib/media/fileKind";
import {
  profileUploadErrorKey,
  uploadFileToStorage,
} from "@/lib/media/uploadFileToStorage";
import { persistProfileMediaScan } from "@/lib/moderation/persistMediaScan";
import { scanUploadFile } from "@/lib/moderation/scanMedia";
import { ARGENTINA_PROVINCIAS } from "@/lib/profile/provincias";
import { useT } from "@/contexts/LocaleContext";

type MediaItem = {
  url: string;
  type: "image" | "video";
  path?: string;
};

export default function ModernEditProfilePage() {
  const router = useRouter();
  const t = useT();
  const inputRef = useRef<HTMLInputElement | null>(null);

  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [username, setUsername] = useState("");
  const [bio, setBio] = useState("");
  const [provincia, setProvincia] = useState("");
  const [mostrarProvincia, setMostrarProvincia] = useState(false);
  const [mostrarUltimaVez, setMostrarUltimaVez] = useState(true);
  const [intereses, setIntereses] = useState("");
  const [media, setMedia] = useState<MediaItem[]>([]);
  const [principalIndex, setPrincipalIndex] = useState(0);
  const [fotoPortada, setFotoPortada] = useState("");
  const [videoPortada, setVideoPortada] = useState("");
  const [uploading, setUploading] = useState(false);
  const [uploadText, setUploadText] = useState("");
  const [uploadError, setUploadError] = useState("");
  const [saveError, setSaveError] = useState("");
  const avatarInputRef = useRef<HTMLInputElement | null>(null);
  const coverInputRef = useRef<HTMLInputElement | null>(null);
  const coverVideoInputRef = useRef<HTMLInputElement | null>(null);

  const fotoPrincipal = useMemo(() => {
    const principal = media[principalIndex];
    if (principal?.url) return principal.url;
    return (
      media.find((item) => item.type === "image")?.url ||
      media.find((item) => item.type === "video")?.url ||
      ""
    );
  }, [media, principalIndex]);

  useEffect(() => {
    return onAuthStateChanged(auth, async (u) => {
      setUser(u);
      if (!u) {
        setLoading(false);
        return;
      }

      const snap = await getDoc(doc(db, "usuarios", u.uid));
      const data = snap.exists() ? snap.data() : {};

      setUsername(String(data.username || data.nombre || ""));
      setBio(String(data.bio || data.descripcion || ""));
      setProvincia(String(data.provincia || ""));
      setMostrarProvincia(data.mostrarProvincia === true);
      setMostrarUltimaVez(data.mostrarUltimaVez !== false);
      setIntereses(Array.isArray(data.intereses) ? data.intereses.join(", ") : String(data.intereses || ""));

      const fotos = Array.isArray(data.fotos) ? data.fotos.map((url: string) => ({ url, type: "image" as const })) : [];
      const videos = Array.isArray(data.videos) ? data.videos.map((url: string) => ({ url, type: "video" as const })) : [];
      const loaded = [...fotos, ...videos];

      if (loaded.length === 0 && data.fotoPrincipal) {
        const principalUrl = String(data.fotoPrincipal);
        loaded.push({
          url: principalUrl,
          type: principalUrl.toLowerCase().match(/\.(mp4|mov|webm|mkv|3gp|m4v)(\?|$)/)
            ? "video"
            : "image",
        });
      }

      setMedia(loaded.slice(0, 100));
      setPrincipalIndex(0);
      setFotoPortada(String(data.fotoPortada || data.coverPhoto || data.portada || ""));
      setVideoPortada(String(data.videoPortada || data.coverVideo || ""));
      setLoading(false);
    });
  }, []);

  function scheduleProfileMediaScan(uid: string, url: string, file: File) {
    void (async () => {
      try {
        const scan = await scanUploadFile(file);
        await persistProfileMediaScan(uid, url, scan);
      } catch (error) {
        console.error("profile_media_scan_failed", error);
      }
    })();
  }

  async function uploadSingleFile(
    file: File,
    folder: "avatar" | "cover" | "cover-video",
  ): Promise<string> {
    if (!user) return "";

    const kind = guessMediaFileKind(file);
    if (!kind) throw new Error("unsupported_media_type");

    const ext = file.name.split(".").pop() || (kind === "video" ? "mp4" : "jpg");
    const prefix =
      folder === "avatar" ? "avatar" : folder === "cover" ? "cover" : "cover_video";
    const path = `usuarios/${user.uid}/fotos/${prefix}_${Date.now()}_${Math.random().toString(36).slice(2)}.${ext}`;

    const url = await uploadFileToStorage({
      path,
      file,
      kind,
      requireRegisteredUser: true,
    });
    scheduleProfileMediaScan(user.uid, url, file);
    return url;
  }

  async function uploadFiles(files: FileList | null) {
    if (!user || !files?.length) return;

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

        setUploadText(t("edit_uploading", { current: String(i + 1), total: String(batch.length) }));

        const ext = file.name.split(".").pop() || (kind === "video" ? "mp4" : "jpg");
        const path = `usuarios/${user.uid}/fotos/${Date.now()}_${Math.random().toString(36).slice(2)}.${ext}`;
        const url = await uploadFileToStorage({
          path,
          file,
          kind,
          requireRegisteredUser: true,
        });
        scheduleProfileMediaScan(user.uid, url, file);
        uploaded.push({ url, type: kind, path });
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

  function move(index: number, direction: -1 | 1) {
    const target = index + direction;
    if (target < 0 || target >= media.length) return;

    setMedia((prev) => {
      const copy = [...prev];
      const temp = copy[index];
      copy[index] = copy[target];
      copy[target] = temp;
      return copy;
    });

    if (principalIndex === index) setPrincipalIndex(target);
    else if (principalIndex === target) setPrincipalIndex(index);
  }

  function remove(index: number) {
    setMedia((prev) => prev.filter((_, i) => i !== index));
    if (principalIndex >= index) setPrincipalIndex(Math.max(0, principalIndex - 1));
  }

  async function saveProfile() {
    if (!user) return;

    setSaving(true);
    setSaveError("");

    const fotos = media.filter((m) => m.type === "image").map((m) => m.url);
    const videos = media.filter((m) => m.type === "video").map((m) => m.url);
    const interesesArray = intereses.split(",").map((x) => x.trim()).filter(Boolean);

    try {
      await setDoc(
        doc(db, "usuarios", user.uid),
        {
          uid: user.uid,
          email: user.email || "",
          username: username.trim(),
          usernameLower: username.trim().toLowerCase(),
          nombre: username.trim(),
          bio: bio.trim(),
          descripcion: bio.trim(),
          provincia,
          mostrarProvincia,
          mostrarUltimaVez,
          intereses: interesesArray,
          fotos,
          videos,
          fotoPrincipal,
          fotoPortada: fotoPortada || null,
          coverPhoto: fotoPortada || null,
          portada: fotoPortada || null,
          videoPortada: videoPortada || null,
          coverVideo: videoPortada || null,
          perfilCompleto: Boolean(username.trim() && fotoPrincipal),
          updatedAt: serverTimestamp(),
        },
        { merge: true },
      );

      router.push("/settings");
    } catch (error) {
      console.error(error);
      setSaveError(t("setup_save_fail"));
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return <main className="min-h-screen bg-black text-white p-8 text-3xl font-black">{t("common_loading")}</main>;
  }

  if (!user) {
    return <main className="min-h-screen bg-black text-white p-8 text-3xl font-black">{t("edit_not_logged")}</main>;
  }

  return (
    <main className="min-h-screen bg-black text-white px-6 py-7 pb-28">
      <div className="fixed inset-0 pointer-events-none bg-[radial-gradient(circle_at_50%_0%,rgba(139,92,246,.20),transparent_35%)]" />

      <section className="relative z-10 max-w-6xl mx-auto">
        <div className="flex items-center justify-between mb-10">
          <button onClick={() => router.back()} className="w-16 h-16 rounded-full border border-white/70 flex items-center justify-center">
            <ArrowLeft size={30} />
          </button>

          <button
            onClick={saveProfile}
            disabled={saving}
            className="px-9 h-16 rounded-full border border-violet-400 text-white font-black text-2xl shadow-[0_0_35px_rgba(139,92,246,.35)] disabled:opacity-50"
          >
            {saving ? t("setup_saving") : t("edit_save")}
          </button>
        </div>

        {saveError ? (
          <p className="mb-6 text-sm font-semibold text-red-400">{saveError}</p>
        ) : null}

        <div className="grid grid-cols-1 lg:grid-cols-[360px_1fr] gap-10">
          <div>
            <div className="w-64 h-64 rounded-[44px] border-4 border-violet-400/80 bg-zinc-950 overflow-hidden shadow-[0_0_55px_rgba(139,92,246,.35)] flex items-center justify-center">
              {fotoPrincipal ? (
                <ProfileMediaSurface
                  url={fotoPrincipal}
                  imageClassName="w-full h-full object-cover"
                  videoClassName="w-full h-full object-cover"
                />
              ) : (
                <div className="w-28 h-28 rounded-full bg-gradient-to-br from-white via-slate-300 to-slate-600 shadow-[inset_0_8px_20px_rgba(255,255,255,.35),0_0_35px_rgba(255,255,255,.18)]" />
              )}
            </div>

            <div className="mt-6 flex flex-col gap-3 w-64">
              <button
                type="button"
                onClick={() => avatarInputRef.current?.click()}
                className="h-14 rounded-full bg-violet-500 font-black flex items-center justify-center gap-2"
              >
                <Camera size={18} /> {t("edit_profile_photo")}
              </button>
              <button
                type="button"
                onClick={() => coverInputRef.current?.click()}
                className="h-14 rounded-full border border-violet-400 font-black flex items-center justify-center gap-2"
              >
                <ImagePlus size={18} /> {t("edit_cover_photo")}
              </button>
              <button
                type="button"
                onClick={() => coverVideoInputRef.current?.click()}
                className="h-14 rounded-full border border-white/20 font-black flex items-center justify-center gap-2"
              >
                <Film size={18} /> {t("edit_cover_video")}
              </button>
              <button
                type="button"
                onClick={() => inputRef.current?.click()}
                className="h-14 rounded-full border border-white/15 font-black flex items-center justify-center gap-2"
              >
                <ImagePlus size={18} /> {t("edit_gallery")}
              </button>
            </div>

            <input
              ref={avatarInputRef}
              type="file"
              accept="image/*,video/*"
              className="hidden"
              onChange={async (e) => {
                const file = e.target.files?.[0];
                if (!file) return;
                setUploading(true);
                setUploadError("");
                try {
                  const url = await uploadSingleFile(file, "avatar");
                  if (url) {
                    const kind = guessMediaFileKind(file) || "image";
                    const item = { url, type: kind as "image" | "video" };
                    setMedia((prev) => [item, ...prev].slice(0, 100));
                    setPrincipalIndex(0);
                  }
                } catch (error) {
                  console.error(error);
                  setUploadError(t(profileUploadErrorKey(error)));
                } finally {
                  setUploading(false);
                  e.target.value = "";
                }
              }}
            />
            <input
              ref={coverInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={async (e) => {
                const file = e.target.files?.[0];
                if (!file) return;
                setUploading(true);
                setUploadError("");
                try {
                  const url = await uploadSingleFile(file, "cover");
                  if (url) setFotoPortada(url);
                } catch (error) {
                  console.error(error);
                  setUploadError(t(profileUploadErrorKey(error)));
                } finally {
                  setUploading(false);
                  e.target.value = "";
                }
              }}
            />
            <input
              ref={coverVideoInputRef}
              type="file"
              accept="video/*"
              className="hidden"
              onChange={async (e) => {
                const file = e.target.files?.[0];
                if (!file) return;
                setUploading(true);
                setUploadError("");
                try {
                  const url = await uploadSingleFile(file, "cover-video");
                  if (url) setVideoPortada(url);
                } catch (error) {
                  console.error(error);
                  setUploadError(t(profileUploadErrorKey(error)));
                } finally {
                  setUploading(false);
                  e.target.value = "";
                }
              }}
            />
            <input
              ref={inputRef}
              type="file"
              accept="image/*,video/*"
              multiple
              className="hidden"
              onChange={(e) => uploadFiles(e.target.files)}
            />

            {fotoPortada ? (
              <p className="mt-3 text-sm font-bold text-violet-300">{t("edit_cover_loaded")}</p>
            ) : null}
            {videoPortada ? (
              <p className="text-sm font-bold text-violet-300">{t("edit_cover_video_loaded")}</p>
            ) : null}

            <p className="mt-4 text-white/55 text-lg">
              {t("edit_files_count", { count: String(media.length) })}
            </p>

            {uploading && <p className="mt-3 text-violet-300 font-bold">{uploadText}</p>}
            {uploadError ? <p className="mt-3 text-sm font-semibold text-red-400">{uploadError}</p> : null}
          </div>

          <div className="space-y-8">
            <label className="block">
              <span className="text-4xl font-black">{t("setup_username")}</span>
              <input
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder={t("setup_username_placeholder")}
                className="mt-4 w-full rounded-[28px] bg-zinc-950 border border-white/10 px-7 py-6 text-3xl font-black outline-none focus:border-violet-400"
              />
            </label>

            <label className="block">
              <span className="text-4xl font-black">{t("edit_bio_label")}</span>
              <textarea
                value={bio}
                onChange={(e) => setBio(e.target.value)}
                placeholder={t("edit_bio_placeholder")}
                className="mt-4 w-full min-h-44 rounded-[28px] bg-zinc-950 border border-white/10 px-7 py-6 text-2xl outline-none focus:border-violet-400 resize-none"
              />
            </label>

            <label className="block">
              <span className="text-4xl font-black">{t("province_label")}</span>
              <select
                value={provincia}
                onChange={(e) => setProvincia(e.target.value)}
                className="mt-4 w-full rounded-[28px] bg-zinc-950 border border-white/10 px-7 py-6 text-2xl outline-none focus:border-violet-400"
              >
                <option value="">{t("edit_select")}</option>
                {ARGENTINA_PROVINCIAS.map((p) => <option key={p} value={p}>{p}</option>)}
              </select>

              <div className="mt-4 flex items-center justify-between gap-4 rounded-[28px] border border-white/10 bg-zinc-950 px-7 py-5">
                <p className="text-lg text-zinc-400">
                  {t("edit_province_hint_short")}
                </p>
                <button
                  type="button"
                  onClick={() => setMostrarProvincia((prev) => !prev)}
                  className={`shrink-0 rounded-full px-5 py-3 font-black ${
                    mostrarProvincia ? "bg-violet-500 text-white" : "bg-white/10 text-white/45"
                  }`}
                >
                  {mostrarProvincia ? t("province_visible") : t("province_hidden")}
                </button>
              </div>
            </label>

            <label className="block">
              <span className="text-4xl font-black">{t("last_seen_privacy_label")}</span>
              <div className="mt-4 flex items-center justify-between gap-4 rounded-[28px] border border-white/10 bg-zinc-950 px-7 py-5">
                <p className="text-lg text-zinc-400">{t("last_seen_privacy_hint")}</p>
                <button
                  type="button"
                  onClick={() => setMostrarUltimaVez((prev) => !prev)}
                  className={`shrink-0 rounded-full px-5 py-3 font-black ${
                    mostrarUltimaVez ? "bg-violet-500 text-white" : "bg-white/10 text-white/45"
                  }`}
                >
                  {mostrarUltimaVez ? t("last_seen_visible") : t("last_seen_hidden")}
                </button>
              </div>
            </label>

            <label className="block">
              <span className="text-4xl font-black">{t("edit_interests")}</span>
              <input
                value={intereses}
                onChange={(e) => setIntereses(e.target.value)}
                placeholder={t("edit_interests_placeholder")}
                className="mt-4 w-full rounded-[28px] bg-zinc-950 border border-white/10 px-7 py-6 text-2xl outline-none focus:border-violet-400"
              />
            </label>
          </div>
        </div>

        <div className="mt-14">
          <h2 className="text-5xl font-black mb-6">{t("edit_mosaic_title")}</h2>

          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-5">
            {media.map((item, index) => (
              <div key={`${item.url}-${index}`} className="relative rounded-[28px] overflow-hidden bg-zinc-950 border border-white/10 aspect-square group">
                {item.type === "image" ? (
                  <img src={item.url} className="w-full h-full object-cover" />
                ) : (
                  <video src={item.url} className="w-full h-full object-cover" muted playsInline />
                )}

                <div className="absolute inset-x-0 bottom-0 p-3 bg-gradient-to-t from-black via-black/60 to-transparent flex items-center justify-between gap-2">
                  <button onClick={() => move(index, -1)} className="w-10 h-10 rounded-full bg-white/15 flex items-center justify-center">
                    <GripVertical size={18} />
                  </button>

                  <button onClick={() => setPrincipalIndex(index)} className={`w-10 h-10 rounded-full flex items-center justify-center ${principalIndex === index ? "bg-violet-500" : "bg-white/15"}`}>
                    <Star size={18} fill={principalIndex === index ? "white" : "none"} />
                  </button>

                  <button onClick={() => remove(index)} className="w-10 h-10 rounded-full bg-red-500/80 flex items-center justify-center">
                    <Trash2 size={18} />
                  </button>
                </div>

                <div className="absolute top-3 left-3 px-3 py-1 rounded-full bg-black/70 text-xs font-black flex items-center gap-1">
                  {item.type === "image" ? <Camera size={14} /> : <Film size={14} />}
                  {index + 1}
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>
    </main>
  );
}

