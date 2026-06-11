"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { Camera, ImageIcon } from "lucide-react";

import {
  addDoc,
  collection,
  serverTimestamp,
  Timestamp,
} from "firebase/firestore";

import StoryLiveCamera from "@/components/stories/StoryLiveCamera";
import StoryMediaSourceBadge from "@/components/stories/StoryMediaSourceBadge";
import { useUxMode } from "@/contexts/UxModeContext";
import { useT } from "@/contexts/LocaleContext";
import { auth, db } from "@/lib/firebase";
import { guessMediaFileKind } from "@/lib/media/fileKind";
import {
  formatStorageUploadError,
  uploadFileToStorage,
} from "@/lib/media/uploadFileToStorage";
import { resolveStoryAuthor } from "@/lib/stories/anonStories";
import type { StoryMediaSource } from "@/lib/stories/types";
import { firestoreScanFields, scanUploadFile } from "@/lib/moderation/scanMedia";

type PreviewData = {
  url: string;
  type: "image" | "video";
};

export default function NewStoryPage() {
  const router = useRouter();
  const t = useT();
  const { uxMode } = useUxMode();
  const modern = uxMode === "modern";
  const galleryInputRef = useRef<HTMLInputElement>(null);

  const [texto, setTexto] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [mediaSource, setMediaSource] = useState<StoryMediaSource | null>(null);
  const [cameraOpen, setCameraOpen] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);

  const preview = useMemo<PreviewData | null>(() => {
    if (!file) return null;

    const kind = guessMediaFileKind(file);
    if (!kind) return null;

    return {
      url: URL.createObjectURL(file),
      type: kind,
    };
  }, [file]);

  useEffect(() => {
    return () => {
      if (preview?.url) {
        URL.revokeObjectURL(preview.url);
      }
    };
  }, [preview?.url]);

  function clearMedia() {
    setFile(null);
    setMediaSource(null);
    setUploadProgress(0);
    if (galleryInputRef.current) galleryInputRef.current.value = "";
  }

  function handleGalleryPick(selected: File | null) {
    if (!selected) return;

    const kind = guessMediaFileKind(selected);
    if (!kind) {
      window.alert(t("story_new_alert_type"));
      return;
    }

    setFile(selected);
    setMediaSource("gallery");
    setUploadProgress(0);
  }

  function handleCameraCapture(captured: File, kind: "image" | "video") {
    setFile(captured);
    setMediaSource("camera");
    setCameraOpen(false);
    setUploadProgress(0);
  }

  const publishStory = async () => {
    if (!texto.trim() && !file) {
      window.alert(t("story_new_alert_empty"));
      return;
    }

    try {
      await auth.authStateReady();
      const author = await resolveStoryAuthor(auth.currentUser);
      setUploading(true);
      setUploadProgress(0);

      let mediaUrl = "";
      let mediaType = "text";
      let mediaName = "";
      let mediaSize = 0;
      let storedMediaSource: StoryMediaSource | null = null;

      if (file) {
        const kind = guessMediaFileKind(file);

        if (!kind) {
          window.alert(t("story_new_alert_type"));
          setUploading(false);
          return;
        }

        const isVideo = kind === "video";
        const maxSize = isVideo ? 120 * 1024 * 1024 : 20 * 1024 * 1024;

        if (file.size > maxSize) {
          window.alert(t("story_new_alert_size"));
          setUploading(false);
          return;
        }

        const safeName = file.name.replace(/[^\w.\-]+/g, "_");
        const storageFolder = author.isAnonymousStory
          ? `historias/anon/${author.anonSessionId}`
          : `historias/${author.ownerUid}`;

        const path = `${storageFolder}/${Date.now()}-${safeName}`;

        mediaUrl = await uploadFileToStorage({
          path,
          file,
          kind,
          onProgress: setUploadProgress,
          allowAnonymousAuth: author.isAnonymousStory,
          requireRegisteredUser: !author.isAnonymousStory,
        });

        mediaType = kind;
        mediaName = file.name;
        mediaSize = file.size;
        storedMediaSource = mediaSource;
      }

      const now = new Date();
      const expires = new Date(now.getTime() + 24 * 60 * 60 * 1000);
      let scanFields = {};

      if (file) {
        try {
          scanFields = firestoreScanFields(await scanUploadFile(file));
        } catch (scanError) {
          console.error("story_scan_failed", scanError);
        }
      }

      await addDoc(collection(db, "historias"), {
        ownerUid: author.ownerUid,
        ownerUsername: author.ownerUsername,
        ownerPhoto: author.ownerPhoto,
        isAnonymousStory: author.isAnonymousStory,
        anonSessionId: author.anonSessionId,
        texto: texto.trim(),
        mediaUrl,
        mediaType,
        mediaSource: storedMediaSource,
        mediaName,
        mediaSize,
        createdAt: serverTimestamp(),
        expiresAt: Timestamp.fromDate(expires),
        likeCount: 0,
        viewCount: 0,
        likedBy: {},
        viewedBy: {},
        active: true,
        ...scanFields,
      });

      router.push("/stories");
    } catch (error) {
      console.error(error);
      if ((error as Error)?.message === "profile_username_missing") {
        window.alert(t("story_new_profile_username_required"));
      } else {
        const code = formatStorageUploadError(error);
        if (code === "auth_required") {
          window.alert(t("story_new_auth_required"));
        } else if (code === "anon_auth_disabled") {
          window.alert(t("story_new_anon_auth_disabled"));
        } else if (code === "storage_unauthorized") {
          window.alert(t("story_new_storage_unauthorized"));
        } else {
          window.alert(t("story_new_alert_fail"));
        }
      }
    }

    setUploading(false);
  };

  const accentClass = modern ? "text-violet-300" : "text-fuchsia-300";
  const shellClass = modern
    ? "rounded-[2rem] border border-white/10 bg-[#0c0c0c] shadow-[0_0_60px_rgba(124,58,237,0.12)]"
    : "rounded-[2rem] border border-white/10 bg-zinc-950 shadow-2xl shadow-fuchsia-950/30";
  const primaryBtnClass = modern
    ? "bg-violet-600 text-white"
    : "bg-white text-black";

  return (
    <main className="min-h-screen bg-black px-4 py-8 text-white">
      <StoryLiveCamera
        open={cameraOpen}
        onClose={() => setCameraOpen(false)}
        onCapture={handleCameraCapture}
      />

      <section className="mx-auto max-w-2xl">
        <button
          onClick={() => router.back()}
          className={`mb-6 text-sm font-bold ${accentClass}`}
        >
          ← {t("common_back")}
        </button>

        <div className={`${shellClass} p-6`}>
          <p className={`text-xs uppercase tracking-[0.4em] ${accentClass}`}>
            SAYITTOME
          </p>

          <h1 className="mt-3 text-4xl font-black">{t("story_new_title")}</h1>
          <p className="mt-3 text-sm text-zinc-500">{t("story_new_expires")}</p>

          {preview && (
            <div className="relative mt-6 overflow-hidden rounded-[2rem] border border-white/10 bg-black">
              {preview.type === "image" ? (
                <img
                  src={preview.url}
                  alt={t("story_new_preview_alt")}
                  className="max-h-[520px] w-full object-cover"
                />
              ) : (
                <video
                  src={preview.url}
                  controls
                  className="max-h-[520px] w-full object-cover"
                />
              )}

              {mediaSource ? (
                <div className="absolute bottom-4 left-1/2 -translate-x-1/2">
                  <StoryMediaSourceBadge source={mediaSource} mediaType={preview.type} />
                </div>
              ) : null}
            </div>
          )}

          <textarea
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
            placeholder={t("story_new_placeholder")}
            className="mt-6 h-40 w-full resize-none rounded-3xl border border-white/10 bg-black p-5 text-sm outline-none focus:border-fuchsia-500"
          />

          {!file ? (
            <div className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-2">
              <button
                type="button"
                disabled={uploading}
                onClick={() => setCameraOpen(true)}
                className="flex flex-col items-center justify-center rounded-3xl border border-white/12 bg-black px-5 py-8 text-center transition hover:border-fuchsia-500/60 disabled:opacity-50"
              >
                <Camera size={28} className="text-white/70" />
                <span className="mt-3 text-sm font-black">{t("story_new_source_camera")}</span>
                <span className="mt-2 text-xs text-zinc-500">{t("story_new_source_camera_hint")}</span>
              </button>

              <button
                type="button"
                disabled={uploading}
                onClick={() => galleryInputRef.current?.click()}
                className="flex flex-col items-center justify-center rounded-3xl border border-dashed border-white/15 bg-black px-5 py-8 text-center transition hover:border-fuchsia-500/60 disabled:opacity-50"
              >
                <ImageIcon size={28} className="text-white/70" />
                <span className="mt-3 text-sm font-black">{t("story_new_source_gallery")}</span>
                <span className="mt-2 text-xs text-zinc-500">{t("story_new_source_gallery_hint")}</span>
              </button>

              <input
                ref={galleryInputRef}
                type="file"
                accept="image/*,video/*"
                className="hidden"
                disabled={uploading}
                onChange={(e) => {
                  handleGalleryPick(e.target.files?.[0] || null);
                }}
              />
            </div>
          ) : (
            <div className="mt-5 flex flex-wrap items-center gap-3">
              <button
                type="button"
                disabled={uploading}
                onClick={clearMedia}
                className="rounded-full border border-white/15 px-4 py-2 text-xs font-black text-white/70"
              >
                {t("story_new_change_media")}
              </button>
            </div>
          )}

          {uploading && (
            <div className="mt-5 rounded-3xl border border-white/10 bg-black p-4">
              <div className="mb-2 flex items-center justify-between text-xs font-black text-zinc-400">
                <span>{t("story_new_uploading")}</span>
                <span>{uploadProgress}%</span>
              </div>

              <div className="h-2 overflow-hidden rounded-full bg-white/10">
                <div
                  className={`h-full transition-all ${modern ? "bg-violet-500" : "bg-fuchsia-500"}`}
                  style={{ width: `${uploadProgress}%` }}
                />
              </div>
            </div>
          )}

          <button
            onClick={publishStory}
            disabled={uploading}
            className={`mt-6 w-full rounded-full px-6 py-4 text-sm font-black transition hover:scale-[1.01] disabled:opacity-50 ${primaryBtnClass}`}
          >
            {uploading ? t("story_new_uploading_btn") : t("story_new_publish")}
          </button>
        </div>
      </section>
    </main>
  );
}
