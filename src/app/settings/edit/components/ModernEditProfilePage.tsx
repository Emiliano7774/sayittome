"use client";

import { useEffect, useRef, useState } from "react";
import { onAuthStateChanged, type User } from "firebase/auth";
import { deleteField, arrayUnion, doc, getDoc, setDoc, serverTimestamp } from "firebase/firestore";
import { ArrowLeft, ChevronDown } from "lucide-react";
import { useRouter } from "next/navigation";

import ModernEditMediaSheet, {
  type EditMediaItem,
} from "@/components/modern/ModernEditMediaSheet";
import ModernProfileEditPreview from "@/components/modern/ModernProfileEditPreview";
import OwnerRoleplayNotice from "@/components/profile/OwnerRoleplayNotice";
import RoleplayAppealFlagButton from "@/components/profile/RoleplayAppealFlagButton";
import { auth, db } from "@/lib/firebase";
import { guessMediaFileKind, isMediaFile } from "@/lib/media/fileKind";
import { isVideoMediaUrl } from "@/lib/media/mediaUrl";
import {
  profileUploadErrorKey,
  uploadFileToStorage,
} from "@/lib/media/uploadFileToStorage";
import { persistProfileMediaScan } from "@/lib/moderation/persistMediaScan";
import { scanUploadFile } from "@/lib/moderation/scanMedia";
import {
  resolveProfileCoverPhoto,
  resolveProfileCoverVideo,
} from "@/lib/profile/resolveProfileCover";
import { ARGENTINA_PROVINCIAS } from "@/lib/profile/provincias";
import {
  normalizeProfileMediaSources,
  type ProfileMediaSource,
} from "@/lib/profile/mediaSource";
import { useT } from "@/contexts/LocaleContext";
import { previousUsernameToRemember } from "@/lib/profile/usernameHistory";
import { isUsernameAvailable, isValidUsername, normalizeUsername } from "@/lib/profile/username";

type MediaSheetMode = "cover" | "principal" | "gallery";

export default function ModernEditProfilePage() {
  const router = useRouter();
  const t = useT();
  const galleryInputRef = useRef<HTMLInputElement | null>(null);
  const cameraInputRef = useRef<HTMLInputElement | null>(null);
  const pendingUploadSourceRef = useRef<ProfileMediaSource>("gallery");

  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [username, setUsername] = useState("");
  const [savedUsername, setSavedUsername] = useState("");
  const [bio, setBio] = useState("");
  const [provincia, setProvincia] = useState("");
  const [mostrarProvincia, setMostrarProvincia] = useState(false);
  const [mostrarUltimaVez, setMostrarUltimaVez] = useState(true);
  const [intereses, setIntereses] = useState("");
  const [media, setMedia] = useState<EditMediaItem[]>([]);
  const [principalIndex, setPrincipalIndex] = useState(-1);
  const [fotoPrincipalUrl, setFotoPrincipalUrl] = useState("");
  const [fotoPortada, setFotoPortada] = useState("");
  const [videoPortada, setVideoPortada] = useState("");
  const [uploading, setUploading] = useState(false);
  const [uploadText, setUploadText] = useState("");
  const [uploadError, setUploadError] = useState("");
  const [saveError, setSaveError] = useState("");
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [sheetMode, setSheetMode] = useState<MediaSheetMode>("gallery");
  const [moderationTag, setModerationTag] = useState("");

  useEffect(() => {
    document.body.classList.add("sayittome-profile-edit-open");
    return () => {
      document.body.classList.remove("sayittome-profile-edit-open");
    };
  }, []);

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
      setSavedUsername(String(data.username || data.nombre || ""));
      setBio(String(data.bio || data.descripcion || ""));
      setProvincia(String(data.provincia || ""));
      setMostrarProvincia(data.mostrarProvincia === true);
      setMostrarUltimaVez(data.mostrarUltimaVez !== false);
      setIntereses(Array.isArray(data.intereses) ? data.intereses.join(", ") : String(data.intereses || ""));
      setModerationTag(String(data.moderationTag || ""));

      const mediaSources = normalizeProfileMediaSources(data.fotoMediaSources);
      const withSource = (url: string, type: "image" | "video") => ({
        url,
        type,
        source: mediaSources[url],
      });

      const fotos = Array.isArray(data.fotos)
        ? data.fotos.map((url: string) => withSource(url, "image"))
        : [];
      const videos = Array.isArray(data.videos)
        ? data.videos.map((url: string) => withSource(url, "video"))
        : [];
      const loaded = [...fotos, ...videos];

      if (loaded.length === 0 && data.fotoPrincipal) {
        const principalUrl = String(data.fotoPrincipal);
        loaded.push(
          withSource(
            principalUrl,
            principalUrl.toLowerCase().match(/\.(mp4|mov|webm|mkv|3gp|m4v)(\?|$)/)
              ? "video"
              : "image",
          ),
        );
      }

      const coverPhoto = resolveProfileCoverPhoto(data);
      const coverVideo = resolveProfileCoverVideo(data);
      const mergedMedia = [...loaded];

      for (const url of [coverPhoto, coverVideo]) {
        if (!url || mergedMedia.some((item) => item.url === url)) continue;
        mergedMedia.unshift(withSource(url, isVideoMediaUrl(url) ? "video" : "image"));
      }

      const nextMedia = mergedMedia.slice(0, 100);
      setMedia(nextMedia);

      const principalUrl = String(data.fotoPrincipal || "");
      const principalIdx = principalUrl
        ? nextMedia.findIndex((item) => item.url === principalUrl)
        : -1;
      setFotoPrincipalUrl(principalUrl);
      setPrincipalIndex(principalIdx);

      setFotoPortada(coverPhoto);
      setVideoPortada(coverVideo);
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
    folder: "avatar" | "cover" | "cover-video" | "gallery",
    source: ProfileMediaSource,
  ): Promise<EditMediaItem | null> {
    if (!user) return null;

    const kind = guessMediaFileKind(file);
    if (!kind) throw new Error("unsupported_media_type");

    const ext = file.name.split(".").pop() || (kind === "video" ? "mp4" : "jpg");
    const prefix =
      folder === "avatar"
        ? "avatar"
        : folder === "cover"
          ? "cover"
          : folder === "cover-video"
            ? "cover_video"
            : "gallery";
    const path = `usuarios/${user.uid}/fotos/${prefix}_${Date.now()}_${Math.random().toString(36).slice(2)}.${ext}`;

    const url = await uploadFileToStorage({
      path,
      file,
      kind,
      requireRegisteredUser: true,
    });
    scheduleProfileMediaScan(user.uid, url, file);
    return { url, type: kind, path, source };
  }

  function openSheet(mode: MediaSheetMode) {
    setSheetMode(mode);
    setSheetOpen(true);
  }

  function setCover(item: EditMediaItem, closeSheet = true) {
    if (item.type === "video") {
      setVideoPortada(item.url);
      setFotoPortada("");
    } else {
      setFotoPortada(item.url);
      setVideoPortada("");
    }
    if (closeSheet) setSheetOpen(false);
  }

  function setPrincipal(index: number, closeSheet = true) {
    const item = media[index];
    if (!item) return;

    setFotoPrincipalUrl(item.url);
    setPrincipalIndex(index);
    if (closeSheet) setSheetOpen(false);
  }

  function pickNextPrincipalUrl(nextMedia: EditMediaItem[], removedUrl: string) {
    const coverUrls = new Set(
      [fotoPortada, videoPortada].filter(Boolean),
    );
    const candidate = nextMedia.find(
      (item) => item.url !== removedUrl && !coverUrls.has(item.url) && item.type === "image",
    );
    return candidate?.url || nextMedia.find((item) => item.url !== removedUrl && !coverUrls.has(item.url))?.url || "";
  }

  function applyCover(item: EditMediaItem, closeSheet = true) {
    setCover(item, closeSheet);
  }

  async function uploadFiles(
    files: FileList | null,
    target: MediaSheetMode = "gallery",
    source: ProfileMediaSource = "gallery",
  ) {
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

    const uploaded: EditMediaItem[] = [];

    try {
      for (let i = 0; i < batch.length; i++) {
        const file = batch[i];
        const kind = guessMediaFileKind(file);
        if (!kind) continue;

        setUploadText(t("edit_uploading", { current: String(i + 1), total: String(batch.length) }));

        const folder =
          target === "principal"
            ? "avatar"
            : target === "cover"
              ? kind === "video"
                ? "cover-video"
                : "cover"
              : "gallery";

        const item = await uploadSingleFile(file, folder, source);
        if (item) uploaded.push(item);
      }

      if (uploaded.length === 0) {
        setUploadError(t("edit_upload_fail"));
        return;
      }

      setMedia((prev) => {
        const next = [...prev];
        for (const item of uploaded) {
          if (!next.some((entry) => entry.url === item.url)) {
            next.push(item);
          }
        }
        const trimmed = next.slice(0, 100);
        const firstUploadedIndex = trimmed.findIndex((item) => item.url === uploaded[0]?.url);

        if (target === "principal" && firstUploadedIndex >= 0) {
          setPrincipalIndex(firstUploadedIndex);
          setFotoPrincipalUrl(uploaded[0]?.url || "");
        }

        return trimmed;
      });

      if (target === "cover" && uploaded[0]) {
        setCover(uploaded[0], false);
      }
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
    const removed = media[index];
    const nextMedia = media.filter((_, i) => i !== index);
    setMedia(nextMedia);

    if (removed?.url === fotoPrincipalUrl) {
      const nextPrincipalUrl = pickNextPrincipalUrl(nextMedia, removed.url);
      setFotoPrincipalUrl(nextPrincipalUrl);
      setPrincipalIndex(
        nextPrincipalUrl ? nextMedia.findIndex((item) => item.url === nextPrincipalUrl) : -1,
      );
    } else if (principalIndex === index) {
      setPrincipalIndex(-1);
    } else if (principalIndex > index) {
      setPrincipalIndex((prev) => (prev > 0 ? prev - 1 : -1));
    }

    if (removed?.url === fotoPortada) setFotoPortada("");
    if (removed?.url === videoPortada) setVideoPortada("");
  }

  async function saveProfile() {
    if (!user) return;

    setSaving(true);
    setSaveError("");

    const cleanUsername = normalizeUsername(username);
    if (!isValidUsername(cleanUsername)) {
      setSaveError(t("setup_username_invalid"));
      setSaving(false);
      return;
    }

    const available = await isUsernameAvailable(cleanUsername, user.uid);
    if (!available) {
      setSaveError(t("setup_username_taken"));
      setSaving(false);
      return;
    }

    const rememberedPrevious = previousUsernameToRemember(savedUsername, cleanUsername);

    const fotos = media.filter((m) => m.type === "image").map((m) => m.url);
    const videos = media.filter((m) => m.type === "video").map((m) => m.url);

    if (fotoPortada && !fotos.includes(fotoPortada)) {
      fotos.unshift(fotoPortada);
    }
    if (videoPortada && !videos.includes(videoPortada)) {
      videos.unshift(videoPortada);
    }
    const interesesArray = intereses.split(",").map((x) => x.trim()).filter(Boolean);
    const fotoMediaSources = media.reduce<Record<string, ProfileMediaSource>>((acc, item) => {
      if (item.source) acc[item.url] = item.source;
      return acc;
    }, {});

    try {
      await setDoc(
        doc(db, "usuarios", user.uid),
        {
          uid: user.uid,
          email: user.email || "",
          username: cleanUsername,
          usernameLower: cleanUsername.toLowerCase(),
          nombre: cleanUsername,
          bio: bio.trim(),
          descripcion: bio.trim(),
          provincia,
          mostrarProvincia,
          mostrarUltimaVez,
          intereses: interesesArray,
          fotos,
          videos,
          fotoMediaSources,
          fotoPrincipal: fotoPrincipalUrl,
          ...(rememberedPrevious
            ? { previousUsernames: arrayUnion(rememberedPrevious) }
            : {}),
          ...(fotoPortada
            ? { fotoPortada, coverPhoto: fotoPortada, portada: fotoPortada }
            : { fotoPortada: deleteField(), coverPhoto: deleteField(), portada: deleteField() }),
          ...(videoPortada
            ? { videoPortada, coverVideo: videoPortada }
            : { videoPortada: deleteField(), coverVideo: deleteField() }),
          perfilCompleto: Boolean(cleanUsername && (fotoPrincipalUrl || fotoPortada || videoPortada)),
          profileSetupComplete: true,
          updatedAt: serverTimestamp(),
        },
        { merge: true },
      );

      router.push("/settings?cover=updated");
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
    <main className="min-h-screen bg-black text-white px-4 py-6 pb-28">
      <div className="fixed inset-0 pointer-events-none bg-[radial-gradient(circle_at_50%_0%,rgba(139,92,246,.16),transparent_35%)]" />

      <section className="relative z-10 mx-auto max-w-3xl">
        <div className="mb-6 flex items-center justify-between gap-3">
          <button
            type="button"
            onClick={() => router.back()}
            className="flex h-14 w-14 items-center justify-center rounded-full border border-white/20"
          >
            <ArrowLeft size={24} />
          </button>

          <button
            type="button"
            onClick={saveProfile}
            disabled={saving}
            className="rounded-full border border-violet-400 px-7 py-3 font-black text-lg shadow-[0_0_28px_rgba(139,92,246,.28)] disabled:opacity-50"
          >
            {saving ? t("setup_saving") : t("edit_save")}
          </button>
        </div>

        {saveError ? <p className="mb-4 text-sm font-semibold text-red-400">{saveError}</p> : null}
        {uploadError ? <p className="mb-4 text-sm font-semibold text-red-400">{uploadError}</p> : null}

        {moderationTag === "roleplay" && user.uid ? (
          <OwnerRoleplayNotice tag={moderationTag} className="mb-4" />
        ) : null}

        <div className="relative">
          {moderationTag === "roleplay" && user.uid ? (
            <div className="pointer-events-auto absolute left-4 top-4 z-30">
              <RoleplayAppealFlagButton
                uid={user.uid}
                username={username || savedUsername || "usuario"}
                minimal
              />
            </div>
          ) : null}

          <ModernProfileEditPreview
            username={username}
            bio={bio}
            provincia={provincia}
            mostrarProvincia={mostrarProvincia}
            fotoPrincipal={fotoPrincipalUrl}
            fotoPortada={fotoPortada}
            videoPortada={videoPortada}
            onUsernameChange={setUsername}
            onBioChange={setBio}
            onCoverClick={() => openSheet("cover")}
            onAvatarClick={() => openSheet("principal")}
          />
        </div>

        {uploading ? (
          <p className="mt-4 text-center text-sm font-bold text-violet-300">{uploadText}</p>
        ) : null}

        <div className="mt-8 overflow-hidden rounded-[1.75rem] border border-white/10 bg-zinc-950/80">
          <button
            type="button"
            onClick={() => setSettingsOpen((prev) => !prev)}
            className="flex w-full items-center justify-between px-5 py-4 text-left"
          >
            <span className="text-lg font-black">{t("edit_settings_section")}</span>
            <ChevronDown
              size={20}
              className={`transition ${settingsOpen ? "rotate-180" : ""}`}
            />
          </button>

          {settingsOpen ? (
            <div className="space-y-6 border-t border-white/10 px-5 py-5">
              <label className="block">
                <span className="text-sm font-black text-white/70">{t("province_label")}</span>
                <select
                  value={provincia}
                  onChange={(e) => setProvincia(e.target.value)}
                  className="mt-3 w-full rounded-[1.25rem] border border-white/10 bg-black px-4 py-4 text-base outline-none focus:border-violet-400"
                >
                  <option value="">{t("edit_select")}</option>
                  {ARGENTINA_PROVINCIAS.map((p) => (
                    <option key={p} value={p}>
                      {p}
                    </option>
                  ))}
                </select>

                <div className="mt-3 flex items-center justify-between gap-3 rounded-[1.25rem] border border-white/10 bg-black px-4 py-3">
                  <p className="text-sm text-zinc-400">{t("edit_province_hint_short")}</p>
                  <button
                    type="button"
                    onClick={() => setMostrarProvincia((prev) => !prev)}
                    className={`shrink-0 rounded-full px-4 py-2 text-sm font-black ${
                      mostrarProvincia ? "bg-violet-500 text-white" : "bg-white/10 text-white/45"
                    }`}
                  >
                    {mostrarProvincia ? t("province_visible") : t("province_hidden")}
                  </button>
                </div>
              </label>

              <label className="block">
                <span className="text-sm font-black text-white/70">{t("last_seen_privacy_label")}</span>
                <div className="mt-3 flex items-center justify-between gap-3 rounded-[1.25rem] border border-white/10 bg-black px-4 py-3">
                  <p className="text-sm text-zinc-400">{t("last_seen_privacy_hint")}</p>
                  <button
                    type="button"
                    onClick={() => setMostrarUltimaVez((prev) => !prev)}
                    className={`shrink-0 rounded-full px-4 py-2 text-sm font-black ${
                      mostrarUltimaVez ? "bg-violet-500 text-white" : "bg-white/10 text-white/45"
                    }`}
                  >
                    {mostrarUltimaVez ? t("last_seen_visible") : t("last_seen_hidden")}
                  </button>
                </div>
              </label>

              <label className="block">
                <span className="text-sm font-black text-white/70">{t("edit_interests")}</span>
                <input
                  value={intereses}
                  onChange={(e) => setIntereses(e.target.value)}
                  placeholder={t("edit_interests_placeholder")}
                  className="mt-3 w-full rounded-[1.25rem] border border-white/10 bg-black px-4 py-4 text-base outline-none focus:border-violet-400"
                />
              </label>
            </div>
          ) : null}
        </div>
      </section>

      <input
        ref={galleryInputRef}
        type="file"
        accept="image/*,video/*"
        multiple
        className="hidden"
        onChange={(e) => {
          void uploadFiles(e.target.files, sheetMode, pendingUploadSourceRef.current);
          e.target.value = "";
        }}
      />
      <input
        ref={cameraInputRef}
        type="file"
        accept="image/*,video/*"
        capture="environment"
        className="hidden"
        onChange={(e) => {
          void uploadFiles(e.target.files, sheetMode, "camera");
          e.target.value = "";
        }}
      />

      <ModernEditMediaSheet
        open={sheetOpen}
        mode={sheetMode}
        media={media}
        principalPhoto={fotoPrincipalUrl}
        coverPhoto={fotoPortada}
        coverVideo={videoPortada}
        uploading={uploading}
        uploadText={uploadText}
        onClose={() => setSheetOpen(false)}
        onUploadCamera={() => cameraInputRef.current?.click()}
        onUploadGallery={() => {
          pendingUploadSourceRef.current = "gallery";
          galleryInputRef.current?.click();
        }}
        onSelectCover={applyCover}
        onSelectPrincipal={(index, closeSheet = false) => {
          setPrincipal(index, closeSheet);
        }}
        onMove={move}
        onRemove={remove}
      />
    </main>
  );
}
