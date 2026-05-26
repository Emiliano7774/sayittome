"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { getApps, initializeApp } from "firebase/app";
import { getAuth, onAuthStateChanged, User } from "firebase/auth";
import { doc, getDoc, getFirestore, setDoc, serverTimestamp } from "firebase/firestore";
import { getDownloadURL, getStorage, ref, uploadBytesResumable } from "firebase/storage";
import { ArrowLeft, Camera, Film, GripVertical, ImagePlus, Save, Star, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";

type MediaItem = {
  url: string;
  type: "image" | "video";
  path?: string;
};

const firebaseConfig = {
  apiKey: "AIzaSyBpQKCAwE-8Td3ZuaDqE3nvNwRGDGY8vdk",
  authDomain: "sayittome-app.firebaseapp.com",
  projectId: "sayittome-app",
  storageBucket: "sayittome-app.firebasestorage.app",
  messagingSenderId: "676263895580",
  appId: "1:676263895580:web:2c7ffa7827c2a4799f35d9",
};

const app = getApps().length ? getApps()[0] : initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const storage = getStorage(app);

const provincias = [
  "Buenos Aires", "CABA", "Catamarca", "Chaco", "Chubut", "CÃ³rdoba",
  "Corrientes", "Entre RÃ­os", "Formosa", "Jujuy", "La Pampa", "La Rioja",
  "Mendoza", "Misiones", "NeuquÃ©n", "RÃ­o Negro", "Salta", "San Juan",
  "San Luis", "Santa Cruz", "Santa Fe", "Santiago del Estero",
  "Tierra del Fuego", "TucumÃ¡n"
];

export default function ModernEditProfilePage() {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement | null>(null);

  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [username, setUsername] = useState("");
  const [bio, setBio] = useState("");
  const [provincia, setProvincia] = useState("");
  const [intereses, setIntereses] = useState("");
  const [media, setMedia] = useState<MediaItem[]>([]);
  const [principalIndex, setPrincipalIndex] = useState(0);
  const [fotoPortada, setFotoPortada] = useState("");
  const [videoPortada, setVideoPortada] = useState("");
  const [uploading, setUploading] = useState(false);
  const [uploadText, setUploadText] = useState("");
  const avatarInputRef = useRef<HTMLInputElement | null>(null);
  const coverInputRef = useRef<HTMLInputElement | null>(null);
  const coverVideoInputRef = useRef<HTMLInputElement | null>(null);

  const fotoPrincipal = useMemo(() => {
    const firstImage = media.find((m) => m.type === "image");
    return media[principalIndex]?.type === "image" ? media[principalIndex].url : firstImage?.url || "";
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
      setIntereses(Array.isArray(data.intereses) ? data.intereses.join(", ") : String(data.intereses || ""));

      const fotos = Array.isArray(data.fotos) ? data.fotos.map((url: string) => ({ url, type: "image" as const })) : [];
      const videos = Array.isArray(data.videos) ? data.videos.map((url: string) => ({ url, type: "video" as const })) : [];
      const loaded = [...fotos, ...videos];

      if (loaded.length === 0 && data.fotoPrincipal) {
        loaded.push({ url: String(data.fotoPrincipal), type: "image" });
      }

      setMedia(loaded.slice(0, 100));
      setPrincipalIndex(0);
      setFotoPortada(String(data.fotoPortada || data.coverPhoto || data.portada || ""));
      setVideoPortada(String(data.videoPortada || data.coverVideo || ""));
      setLoading(false);
    });
  }, []);

  async function uploadSingleFile(
    file: File,
    folder: "avatar" | "cover" | "cover-video",
  ): Promise<string> {
    if (!user) return "";

    const ext = file.name.split(".").pop() || "file";
    const path = `usuarios/${user.uid}/perfil/${folder}/${Date.now()}_${Math.random().toString(36).slice(2)}.${ext}`;
    const storageRef = ref(storage, path);

    return new Promise<string>((resolve, reject) => {
      const task = uploadBytesResumable(storageRef, file, { contentType: file.type });
      task.on("state_changed", undefined, reject, async () => {
        const url = await getDownloadURL(task.snapshot.ref);
        resolve(url);
      });
    });
  }

  async function uploadFiles(files: FileList | null) {
    if (!user || !files?.length) return;

    const selected = Array.from(files).filter((f) => f.type.startsWith("image/") || f.type.startsWith("video/"));
    const freeSlots = Math.max(0, 100 - media.length);
    const batch = selected.slice(0, freeSlots);

    if (!batch.length) return;

    setUploading(true);

    const uploaded: MediaItem[] = [];

    for (let i = 0; i < batch.length; i++) {
      const file = batch[i];
      setUploadText(`Subiendo ${i + 1}/${batch.length}...`);

      const ext = file.name.split(".").pop() || "file";
      const kind = file.type.startsWith("video/") ? "video" : "image";
      const path = `usuarios/${user.uid}/perfil/${Date.now()}_${Math.random().toString(36).slice(2)}.${ext}`;
      const storageRef = ref(storage, path);

      await new Promise<void>((resolve, reject) => {
        const task = uploadBytesResumable(storageRef, file, { contentType: file.type });
        task.on("state_changed", undefined, reject, async () => {
          const url = await getDownloadURL(task.snapshot.ref);
          uploaded.push({ url, type: kind, path });
          resolve();
        });
      });
    }

    setMedia((prev) => [...prev, ...uploaded].slice(0, 100));
    setUploading(false);
    setUploadText("");
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

    const fotos = media.filter((m) => m.type === "image").map((m) => m.url);
    const videos = media.filter((m) => m.type === "video").map((m) => m.url);
    const interesesArray = intereses.split(",").map((x) => x.trim()).filter(Boolean);

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
      { merge: true }
    );

    setSaving(false);
    router.push("/settings");
  }

  if (loading) {
    return <main className="min-h-screen bg-black text-white p-8 text-3xl font-black">Cargando...</main>;
  }

  if (!user) {
    return <main className="min-h-screen bg-black text-white p-8 text-3xl font-black">No estÃ¡s logueado.</main>;
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
            {saving ? "Guardando..." : "Guardar"}
          </button>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-[360px_1fr] gap-10">
          <div>
            <div className="w-64 h-64 rounded-[44px] border-4 border-violet-400/80 bg-zinc-950 overflow-hidden shadow-[0_0_55px_rgba(139,92,246,.35)] flex items-center justify-center">
              {fotoPrincipal ? (
                <img src={fotoPrincipal} className="w-full h-full object-cover" />
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
                <Camera size={18} /> Foto de perfil
              </button>
              <button
                type="button"
                onClick={() => coverInputRef.current?.click()}
                className="h-14 rounded-full border border-violet-400 font-black flex items-center justify-center gap-2"
              >
                <ImagePlus size={18} /> Foto de portada
              </button>
              <button
                type="button"
                onClick={() => coverVideoInputRef.current?.click()}
                className="h-14 rounded-full border border-white/20 font-black flex items-center justify-center gap-2"
              >
                <Film size={18} /> Video de portada
              </button>
              <button
                type="button"
                onClick={() => inputRef.current?.click()}
                className="h-14 rounded-full border border-white/15 font-black flex items-center justify-center gap-2"
              >
                <ImagePlus size={18} /> Galería fotos/videos
              </button>
            </div>

            <input
              ref={avatarInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={async (e) => {
                const file = e.target.files?.[0];
                if (!file) return;
                setUploading(true);
                const url = await uploadSingleFile(file, "avatar");
                if (url) {
                  const imageItem = { url, type: "image" as const };
                  setMedia((prev) => [imageItem, ...prev].slice(0, 100));
                  setPrincipalIndex(0);
                }
                setUploading(false);
                e.target.value = "";
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
                const url = await uploadSingleFile(file, "cover");
                if (url) setFotoPortada(url);
                setUploading(false);
                e.target.value = "";
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
                const url = await uploadSingleFile(file, "cover-video");
                if (url) setVideoPortada(url);
                setUploading(false);
                e.target.value = "";
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
              <p className="mt-3 text-sm font-bold text-violet-300">Portada cargada</p>
            ) : null}
            {videoPortada ? (
              <p className="text-sm font-bold text-violet-300">Video de portada cargado</p>
            ) : null}

            <p className="mt-4 text-white/55 text-lg">
              {media.length}/100 archivos. Fotos y videos permitidos.
            </p>

            {uploading && <p className="mt-3 text-violet-300 font-bold">{uploadText}</p>}
          </div>

          <div className="space-y-8">
            <label className="block">
              <span className="text-4xl font-black">Username</span>
              <input
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="Tu username"
                className="mt-4 w-full rounded-[28px] bg-zinc-950 border border-white/10 px-7 py-6 text-3xl font-black outline-none focus:border-violet-400"
              />
            </label>

            <label className="block">
              <span className="text-4xl font-black">Biografía</span>
              <textarea
                value={bio}
                onChange={(e) => setBio(e.target.value)}
                placeholder="EscribÃ­ algo..."
                className="mt-4 w-full min-h-44 rounded-[28px] bg-zinc-950 border border-white/10 px-7 py-6 text-2xl outline-none focus:border-violet-400 resize-none"
              />
            </label>

            <label className="block">
              <span className="text-4xl font-black">Provincia</span>
              <select
                value={provincia}
                onChange={(e) => setProvincia(e.target.value)}
                className="mt-4 w-full rounded-[28px] bg-zinc-950 border border-white/10 px-7 py-6 text-2xl outline-none focus:border-violet-400"
              >
                <option value="">Seleccionar</option>
                {provincias.map((p) => <option key={p} value={p}>{p}</option>)}
              </select>
            </label>

            <label className="block">
              <span className="text-4xl font-black">Intereses</span>
              <input
                value={intereses}
                onChange={(e) => setIntereses(e.target.value)}
                placeholder="música, gym, series..."
                className="mt-4 w-full rounded-[28px] bg-zinc-950 border border-white/10 px-7 py-6 text-2xl outline-none focus:border-violet-400"
              />
            </label>
          </div>
        </div>

        <div className="mt-14">
          <h2 className="text-5xl font-black mb-6">Mosaico de fotos y videos</h2>

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

