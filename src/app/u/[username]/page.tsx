"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import {
CheckCircle2,
Copy,
Heart,
Image as ImageIcon,
MessageCircle,
Play,
Users,
X,
ChevronLeft,
ChevronRight,
} from "lucide-react";

import {
collection,
getDocs,
limit,
query,
where,
} from "firebase/firestore";

import { db } from "@/lib/firebase";

type MediaItem = {
url: string;
type: "image" | "video";
};

type ProfileData = {
uid?: string;
username?: string;
nombre?: string;
bio?: string;
descripcion?: string;

provincia?: string;
mostrarProvincia?: boolean;

mostrarLikes?: boolean;
mostrarConversaciones?: boolean;
mostrarSeguidores?: boolean;

fotos?: string[];
videos?: string[];

fotoPrincipal?: string;

likesCount?: number;
conversacionesCount?: number;
seguidoresCount?: number;

createdAt?: any;
};

function formatCreatedAt(value: any) {
const date = value?.toDate?.();

if (!date) return "";

return date.toLocaleDateString("es-AR", {
day: "2-digit",
month: "long",
year: "numeric",
});
}

export default function PublicProfilePage() {
const params = useParams();

const username =
typeof params?.username === "string"
? params.username
: "";

const [loading, setLoading] = useState(true);

const [profile, setProfile] =
useState<ProfileData | null>(null);

const [selectedIndex, setSelectedIndex] =
useState<number | null>(null);

const [copied, setCopied] =
useState(false);

useEffect(() => {
async function load() {
setLoading(true);

  const usernameLower =
    decodeURIComponent(username).toLowerCase();

  const q = query(
    collection(db, "usuarios"),
    where("usernameLower", "==", usernameLower),
    limit(1)
  );

  const snap = await getDocs(q);

  if (snap.empty) {
    setProfile(null);
    setLoading(false);
    return;
  }

  const docSnap = snap.docs[0];

  setProfile({
    uid: docSnap.id,
    ...(docSnap.data() as ProfileData),
  });

  setLoading(false);
}

if (username) {
  load();
}

}, [username]);

const media = useMemo<MediaItem[]>(() => {
const fotos = Array.isArray(profile?.fotos)
? profile!.fotos!.map((url) => ({
url,
type: "image" as const,
}))
: [];

const videos = Array.isArray(profile?.videos)
  ? profile!.videos!.map((url) => ({
      url,
      type: "video" as const,
    }))
  : [];

const merged = [...fotos, ...videos];

if (
  merged.length === 0 &&
  profile?.fotoPrincipal
) {
  merged.push({
    url: profile.fotoPrincipal,
    type: "image",
  });
}

return merged;

}, [profile]);

const fotoPrincipal =
profile?.fotoPrincipal ||
media[0]?.url ||
"";

const selected =
selectedIndex === null
? null
: media[selectedIndex] || null;

const displayName =
profile?.username ||
profile?.nombre ||
username;

const bioText =
profile?.bio ||
profile?.descripcion ||
"";

const createdAtLabel =
formatCreatedAt(profile?.createdAt);

function openMainPhoto() {
if (!media.length) return;

const index = Math.max(
  0,
  media.findIndex(
    (item) => item.url === fotoPrincipal
  )
);

setSelectedIndex(index);

}

function previousMedia() {
if (
selectedIndex === null ||
media.length <= 1
)
return;

setSelectedIndex(
  selectedIndex <= 0
    ? media.length - 1
    : selectedIndex - 1
);

}

function nextMedia() {
if (
selectedIndex === null ||
media.length <= 1
)
return;

setSelectedIndex(
  selectedIndex >= media.length - 1
    ? 0
    : selectedIndex + 1
);

}

async function copyVerifiedLink() {
await navigator.clipboard.writeText(
window.location.href
);

setCopied(true);

setTimeout(() => {
  setCopied(false);
}, 1800);

}

if (loading) {
return ( <main className="min-h-screen bg-black text-white flex items-center justify-center"> <p className="text-3xl font-black">
Cargando perfil... </p> </main>
);
}

if (!profile) {
return ( <main className="min-h-screen bg-black text-white flex items-center justify-center"> <p className="text-3xl font-black">
Perfil no encontrado. </p> </main>
);
}

return ( <main className="min-h-screen bg-black text-white pb-28"> <section className="relative min-h-[58vh] overflow-hidden">
{fotoPrincipal ? ( <button
         type="button"
         onClick={openMainPhoto}
         className="absolute inset-0 w-full h-full"
       > <img
           src={fotoPrincipal}
           alt={displayName}
           className="w-full h-full object-cover opacity-70"
         /> </button>
) : ( <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_0%,rgba(139,92,246,.34),transparent_42%)]" />
)}

    <div className="absolute inset-0 bg-gradient-to-t from-black via-black/75 to-black/35" />

    <div className="relative z-10 max-w-[1500px] mx-auto px-6 sm:px-10 lg:px-16 pt-24 pb-12">
      <button
        onClick={copyVerifiedLink}
        className="inline-flex items-center gap-3 rounded-full bg-black/60 border border-violet-400/50 px-5 py-3 font-black shadow-[0_0_40px_rgba(139,92,246,.35)]"
      >
        <CheckCircle2
          size={22}
          className="text-violet-300"
        />

        {copied
          ? "Link copiado"
          : "Copiar link verificado"}

        <Copy size={18} />
      </button>

      <h1 className="mt-8 text-6xl sm:text-8xl font-black tracking-tight">
        {displayName}
      </h1>

      {profile.mostrarProvincia !== false &&
        profile.provincia && (
          <p className="mt-5 text-2xl text-white/65 font-bold">
            {profile.provincia}
          </p>
        )}

      <div className="mt-10 flex flex-col lg:flex-row lg:items-end lg:justify-between gap-8">
        <div className="max-w-4xl">
          <p className="text-2xl sm:text-3xl text-white/88 leading-snug">
            {bioText}
          </p>
        </div>

        {createdAtLabel && (
          <div className="text-white/38 text-lg italic lg:text-right whitespace-nowrap">
            Perfil creado el{" "}
            {createdAtLabel}
          </div>
        )}
      </div>
    </div>
  </section>

  <section className="max-w-[1500px] mx-auto px-6 sm:px-10 lg:px-16 py-12">
    <div className="grid grid-cols-2 md:grid-cols-3 gap-6 mb-14">
      {profile.mostrarLikes !== false && (
        <div className="rounded-[28px] bg-zinc-950 border border-white/10 p-6 text-center">
          <div className="mx-auto w-20 h-20 rounded-full bg-pink-500 flex items-center justify-center">
            <Heart size={34} fill="white" />
          </div>

          <p className="mt-4 text-4xl font-black">
            {profile.likesCount || 0}
          </p>

          <p className="text-white/55 font-bold">
            me gusta
          </p>
        </div>
      )}

      {profile.mostrarConversaciones !== false && (
        <div className="rounded-[28px] bg-zinc-950 border border-white/10 p-6 text-center">
          <div className="mx-auto w-20 h-20 rounded-full bg-green-500 flex items-center justify-center">
            <MessageCircle size={34} />
          </div>

          <p className="mt-4 text-4xl font-black">
            {profile.conversacionesCount || 0}
          </p>

          <p className="text-white/55 font-bold">
            conv.
          </p>
        </div>
      )}

      {profile.mostrarSeguidores !== false && (
        <div className="rounded-[28px] bg-zinc-950 border border-white/10 p-6 text-center">
          <div className="mx-auto w-20 h-20 rounded-full bg-violet-500 flex items-center justify-center">
            <Users size={34} />
          </div>

          <p className="mt-4 text-4xl font-black">
            {profile.seguidoresCount || 0}
          </p>

          <p className="text-white/55 font-bold">
            seguidores
          </p>
        </div>
      )}
    </div>

    <div className="flex items-end justify-between mb-6">
      <div>
        <p className="text-white/40 text-sm font-black uppercase tracking-wide">
          Galería
        </p>

        <h2 className="text-5xl font-black">
          Fotos y videos
        </h2>
      </div>

      <p className="text-white/40 font-bold">
        {media.length} archivo
        {media.length === 1 ? "" : "s"}
      </p>
    </div>

    {media.length === 0 ? (
      <div className="min-h-[260px] rounded-[34px] border border-dashed border-white/15 flex items-center justify-center text-white/35 text-2xl font-black">
        Sin fotos todavía
      </div>
    ) : (
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 2xl:grid-cols-7 gap-4">
        {media.map((item, index) => (
          <button
            key={`${item.url}-${index}`}
            onClick={() =>
              setSelectedIndex(index)
            }
            className="relative aspect-square rounded-[24px] overflow-hidden bg-zinc-950 border border-white/10"
          >
            {item.type === "image" ? (
              <img
                src={item.url}
                alt=""
                className="w-full h-full object-cover"
              />
            ) : (
              <video
                src={item.url}
                className="w-full h-full object-cover"
                muted
              />
            )}

            <div className="absolute top-3 left-3 rounded-full bg-black/65 px-3 py-2 flex items-center gap-2 text-sm font-black">
              {item.type === "image" ? (
                <ImageIcon size={16} />
              ) : (
                <Play
                  size={16}
                  fill="white"
                />
              )}

              {index + 1}
            </div>
          </button>
        ))}
      </div>
    )}
  </section>

  {selected && (
    <div className="fixed inset-0 z-50 bg-black/95 flex items-center justify-center p-5">
      <button
        onClick={() =>
          setSelectedIndex(null)
        }
        className="absolute top-6 right-6 w-14 h-14 rounded-full bg-white/10 flex items-center justify-center"
      >
        <X size={30} />
      </button>

      {media.length > 1 && (
        <>
          <button
            onClick={previousMedia}
            className="absolute left-6 top-1/2 -translate-y-1/2 w-14 h-14 rounded-full bg-white/10 flex items-center justify-center"
          >
            <ChevronLeft size={34} />
          </button>

          <button
            onClick={nextMedia}
            className="absolute right-6 top-1/2 -translate-y-1/2 w-14 h-14 rounded-full bg-white/10 flex items-center justify-center"
          >
            <ChevronRight size={34} />
          </button>
        </>
      )}

      {selected.type === "image" ? (
        <img
          src={selected.url}
          className="max-w-full max-h-full object-contain rounded-[24px]"
        />
      ) : (
        <video
          src={selected.url}
          className="max-w-full max-h-full object-contain rounded-[24px]"
          controls
          autoPlay
        />
      )}
    </div>
  )}
</main>

);
}

