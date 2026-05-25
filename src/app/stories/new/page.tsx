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

import { auth, db, storage } from "@/lib/firebase";

type PreviewData = {
  url: string;
  type: "image" | "video";
};

export default function NewStoryPage() {
  const router = useRouter();

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
    const user = auth.currentUser;

    if (!user) {
      router.push("/login");
      return;
    }

    if (!texto.trim() && !file) {
      alert("EscribÃ­ algo o elegÃ­ una imagen/video.");
      return;
    }

    try {
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
          alert("Solo podÃ©s subir imÃ¡genes o videos.");
          setUploading(false);
          return;
        }

        const maxSize = isVideo ? 120 * 1024 * 1024 : 20 * 1024 * 1024;

        if (file.size > maxSize) {
          alert(isVideo ? "El video es demasiado pesado." : "La imagen es demasiado pesada.");
          setUploading(false);
          return;
        }

        const safeName = file.name.replace(/[^\w.\-]+/g, "_");

        const path =
          "historias/" +
          user.uid +
          "/" +
          Date.now() +
          "-" +
          safeName;

        const storageRef = ref(storage, path);

        const uploadTask = uploadBytesResumable(storageRef, file, {
          contentType: file.type,
        });

        mediaUrl = await new Promise<string>((resolve, reject) => {
          uploadTask.on(
            "state_changed",
            (snapshot) => {
              const progress = Math.round(
                (snapshot.bytesTransferred / snapshot.totalBytes) * 100
              );

              setUploadProgress(progress);
            },
            reject,
            async () => {
              try {
                const url = await getDownloadURL(uploadTask.snapshot.ref);
                resolve(url);
              } catch (e) {
                reject(e);
              }
            }
          );
        });

        mediaType = isVideo ? "video" : "image";
        mediaName = file.name;
        mediaSize = file.size;
      }

      const now = new Date();
      const expires = new Date(now.getTime() + 24 * 60 * 60 * 1000);

      await addDoc(collection(db, "historias"), {
        ownerUid: user.uid,
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
      });

      router.push("/shuffle");
    } catch (e) {
      console.error(e);
      alert("No se pudo subir la historia.");
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
          â† Volver
        </button>

        <div className="rounded-[2rem] border border-white/10 bg-zinc-950 p-6 shadow-2xl shadow-fuchsia-950/30">
          <p className="text-xs uppercase tracking-[0.4em] text-fuchsia-300">
            SAYITTOME
          </p>

          <h1 className="mt-3 text-4xl font-black">Nueva historia</h1>

          <p className="mt-3 text-sm text-zinc-500">
            Se publicarÃ¡ por 24 horas.
          </p>

          {preview && (
            <div className="mt-6 overflow-hidden rounded-[2rem] border border-white/10 bg-black">
              {preview.type === "image" ? (
                <img
                  src={preview.url}
                  alt="Preview historia"
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
            placeholder="EscribÃ­ algo para tu historia..."
            className="mt-6 h-40 w-full resize-none rounded-3xl border border-white/10 bg-black p-5 text-sm outline-none focus:border-fuchsia-500"
          />

          <label className="mt-5 flex cursor-pointer flex-col items-center justify-center rounded-3xl border border-dashed border-white/15 bg-black p-8 text-center transition hover:border-fuchsia-500">
            <span className="text-sm font-black">
              {file ? file.name : "Elegir foto o video"}
            </span>

            <span className="mt-2 text-xs text-zinc-500">
              Imagen o video desde tu dispositivo
            </span>

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
                <span>Subiendo historia</span>
                <span>{uploadProgress}%</span>
              </div>

              <div className="h-2 overflow-hidden rounded-full bg-white/10">
                <div
                  className="h-full bg-fuchsia-500 transition-all"
                  style={{ width: uploadProgress + "%" }}
                />
              </div>
            </div>
          )}

          <button
            onClick={publishStory}
            disabled={uploading}
            className="mt-6 w-full rounded-full bg-white px-6 py-4 text-sm font-black text-black transition hover:scale-[1.01] disabled:opacity-50"
          >
            {uploading ? "Subiendo..." : "Publicar historia"}
          </button>
        </div>
      </section>
    </main>
  );
}
