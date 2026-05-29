"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

import {
  addDoc,
  collection,
  serverTimestamp,
  Timestamp,
} from "firebase/firestore";

import {
  getDownloadURL,
  ref,
  uploadBytesResumable,
} from "firebase/storage";

import { useT } from "@/contexts/LocaleContext";
import { auth, db, storage } from "@/lib/firebase";
import { resolveStoryAuthor } from "@/lib/stories/anonStories";
import { firestoreScanFields, scanUploadFile } from "@/lib/moderation/scanMedia";

type PreviewData = {
  url: string;
  type: "image" | "video";
};

export default function NewStoryPage() {
  const router = useRouter();
  const t = useT();

  const [texto, setTexto] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);

  const preview = useMemo<PreviewData | null>(() => {
    if (!file) return null;

    const type = file.type.startsWith("video/") ? "video" : "image";

    return {
      url: URL.createObjectURL(file),
      type,
    };
  }, [file]);

  useEffect(() => {
    return () => {
      if (preview?.url) {
        URL.revokeObjectURL(preview.url);
      }
    };
  }, [preview?.url]);

  const publishStory = async () => {
    if (!texto.trim() && !file) {
      window.alert(t("story_new_alert_empty"));
      return;
    }

    try {
      const author = await resolveStoryAuthor(auth.currentUser);
      setUploading(true);
      setUploadProgress(0);

      let mediaUrl = "";
      let mediaType = "text";
      let mediaName = "";
      let mediaSize = 0;

      if (file) {
        const isImage = file.type.startsWith("image/");
        const isVideo = file.type.startsWith("video/");

        if (!isImage && !isVideo) {
          window.alert(t("story_new_alert_type"));
          setUploading(false);
          return;
        }

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
        const storageRef = ref(storage, path);

        const uploadTask = uploadBytesResumable(storageRef, file, {
          contentType: file.type,
        });

        mediaUrl = await new Promise<string>((resolve, reject) => {
          uploadTask.on(
            "state_changed",
            (snapshot) => {
              const progress = Math.round(
                (snapshot.bytesTransferred / snapshot.totalBytes) * 100,
              );

              setUploadProgress(progress);
            },
            reject,
            async () => {
              try {
                const url = await getDownloadURL(uploadTask.snapshot.ref);
                resolve(url);
              } catch (error) {
                reject(error);
              }
            },
          );
        });

        mediaType = isVideo ? "video" : "image";
        mediaName = file.name;
        mediaSize = file.size;
      }

      const now = new Date();
      const expires = new Date(now.getTime() + 24 * 60 * 60 * 1000);
      const scanFields =
        file != null
          ? firestoreScanFields(await scanUploadFile(file))
          : {};

      await addDoc(collection(db, "historias"), {
        ownerUid: author.ownerUid,
        ownerUsername: author.ownerUsername,
        ownerPhoto: author.ownerPhoto,
        isAnonymousStory: author.isAnonymousStory,
        anonSessionId: author.anonSessionId,
        texto: texto.trim(),
        mediaUrl,
        mediaType,
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
        window.alert(t("story_new_alert_fail"));
      }
    }

    setUploading(false);
  };

  return (
    <main className="min-h-screen bg-black px-4 py-8 text-white">
      <section className="mx-auto max-w-2xl">
        <button
          onClick={() => router.back()}
          className="mb-6 text-sm font-bold text-fuchsia-300"
        >
          ← {t("common_back")}
        </button>

        <div className="rounded-[2rem] border border-white/10 bg-zinc-950 p-6 shadow-2xl shadow-fuchsia-950/30">
          <p className="text-xs uppercase tracking-[0.4em] text-fuchsia-300">
            SAYITTOME
          </p>

          <h1 className="mt-3 text-4xl font-black">{t("story_new_title")}</h1>

          <p className="mt-3 text-sm text-zinc-500">{t("story_new_expires")}</p>

          {preview && (
            <div className="mt-6 overflow-hidden rounded-[2rem] border border-white/10 bg-black">
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
            </div>
          )}

          <textarea
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
            placeholder={t("story_new_placeholder")}
            className="mt-6 h-40 w-full resize-none rounded-3xl border border-white/10 bg-black p-5 text-sm outline-none focus:border-fuchsia-500"
          />

          <label className="mt-5 flex cursor-pointer flex-col items-center justify-center rounded-3xl border border-dashed border-white/15 bg-black p-8 text-center transition hover:border-fuchsia-500">
            <span className="text-sm font-black">
              {file ? file.name : t("story_new_pick_media")}
            </span>

            <span className="mt-2 text-xs text-zinc-500">{t("story_new_pick_hint")}</span>

            <input
              type="file"
              accept="image/*,video/*"
              className="hidden"
              disabled={uploading}
              onChange={(e) => {
                const selected = e.target.files?.[0] || null;
                setFile(selected);
                setUploadProgress(0);
              }}
            />
          </label>

          {uploading && (
            <div className="mt-5 rounded-3xl border border-white/10 bg-black p-4">
              <div className="mb-2 flex items-center justify-between text-xs font-black text-zinc-400">
                <span>{t("story_new_uploading")}</span>
                <span>{uploadProgress}%</span>
              </div>

              <div className="h-2 overflow-hidden rounded-full bg-white/10">
                <div
                  className="h-full bg-fuchsia-500 transition-all"
                  style={{ width: `${uploadProgress}%` }}
                />
              </div>
            </div>
          )}

          <button
            onClick={publishStory}
            disabled={uploading}
            className="mt-6 w-full rounded-full bg-white px-6 py-4 text-sm font-black text-black transition hover:scale-[1.01] disabled:opacity-50"
          >
            {uploading ? t("story_new_uploading_btn") : t("story_new_publish")}
          </button>
        </div>
      </section>
    </main>
  );
}
