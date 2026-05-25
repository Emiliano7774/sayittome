"use client";

import { collection, getDocs, limit, query, where } from "firebase/firestore";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { db } from "@/lib/firebase";

type Profile = {
  username: string;
  bio: string;
  photo: string;
  online: boolean;
  hasStory: boolean;
};

function PlatinumAvatar() {
  return (
    <svg viewBox="0 0 64 64" className="h-[58px] w-[58px] fill-[#f1f1f1]">
      <circle cx="32" cy="22" r="10" />
      <path d="M14 54c2.8-12 10.2-18 18-18s15.2 6 18 18H14z" />
    </svg>
  );
}

export default function ShufflePage() {
  const router = useRouter();
  const search = useSearchParams();

  const [profiles, setProfiles] = useState<Profile[]>([]);

  useEffect(() => {
    async function load() {
      const q = query(
        collection(db, "usuarios"),
        where("perfilCompleto", "==", true),
        limit(80)
      );

      const snap = await getDocs(q);

      const list = snap.docs.map((doc) => {
        const data = doc.data() as any;

        return {
          username: data.username || data.usernameLower || doc.id,
          bio: data.bio || "Sin descripcion.",
          photo: data.fotoPrincipal || data.photoURL || data.fotos?.[0] || "",
          online: true,
          hasStory: Boolean(data.hasStory || data.historiasActivas),
        };
      });

      setProfiles(list);
    }

    load();
  }, [search]);

  const visibleProfiles = useMemo(() => {
    return [...profiles]
      .sort(() => Math.random() - 0.5)
      .slice(0, 50);
  }, [profiles, search]);

  return (
    <main className="min-h-screen overflow-x-hidden bg-black pb-[150px] text-white">
      <section className="w-full bg-black">
        <div className="border-b border-white/[0.04] px-[clamp(18px,4vw,60px)] py-6">
          <div className="flex h-[76px] items-center rounded-[8px] bg-[#242424] px-8">
            <svg viewBox="0 0 24 24" className="h-12 w-12 stroke-[#8a8a91]" fill="none" strokeWidth="2.4">
              <circle cx="11" cy="11" r="7" />
              <path d="M16 16l5 5" />
            </svg>
          </div>
        </div>

        <div className="flex items-center justify-between border-b border-white/[0.04] px-[clamp(18px,4vw,60px)] py-7">
          <div className="flex items-center gap-7">
            <div className="flex h-[72px] w-[72px] items-center justify-center rounded-full border border-white/[0.08]">
              <svg viewBox="0 0 24 24" className="h-11 w-11 stroke-white" fill="none" strokeWidth="2.2" strokeLinecap="round">
                <path d="M4 7h16" />
                <path d="M7 12h10" />
                <path d="M10 17h4" />
              </svg>
            </div>

            <p className="text-[34px] font-black tracking-[-0.05em]">Filtro</p>
          </div>

          <span className="text-[58px] text-white/80">›</span>
        </div>

        <div className="flex items-center justify-between border-b border-white/[0.04] px-[clamp(18px,4vw,60px)] py-5">
          <p className="text-[22px] font-black text-[#6d6d73]">Cambiar resultado</p>
          <p className="text-[22px] font-black text-[#6d6d73]">{visibleProfiles.length} personas</p>
        </div>

        <div>
          {visibleProfiles.map((profile) => (
            <div key={profile.username} className="border-b border-white/[0.04]">
              <div className="flex items-center gap-[clamp(24px,4vw,54px)] px-[clamp(18px,4vw,60px)] py-8">
                <button
                  type="button"
                  onClick={() => {
                    if (profile.hasStory) {
                      router.push(`/stories/${profile.username}`);
                    } else {
                      router.push(`/u/${profile.username}`);
                    }
                  }}
                  className={[
                    "relative flex h-[112px] w-[112px] shrink-0 items-center justify-center rounded-full bg-[#202020]",
                    profile.hasStory ? "ring-4 ring-[#b45cff]" : "",
                  ].join(" ")}
                >
                  {profile.photo ? (
                    <img src={profile.photo} alt={profile.username} className="h-full w-full rounded-full object-cover" />
                  ) : (
                    <PlatinumAvatar />
                  )}

                  {profile.online ? (
                    <span className="absolute bottom-1 right-1 h-8 w-8 rounded-full border-[5px] border-black bg-lime-400 shadow-[0_0_18px_rgba(163,255,64,.9)]" />
                  ) : null}
                </button>

                <button
                  type="button"
                  onClick={() => router.push(`/u/${profile.username}/chat`)}
                  className="min-w-0 flex-1 text-left"
                >
                  <h2 className="truncate text-[clamp(28px,4vw,42px)] font-black leading-tight tracking-[-0.06em]">
                    {profile.username}
                  </h2>

                  <p className="mt-2 line-clamp-2 text-[clamp(20px,3vw,30px)] font-semibold leading-tight text-[#6c6c73]">
                    {profile.bio}
                  </p>
                </button>
              </div>
            </div>
          ))}
        </div>
      </section>
    </main>
  );
}
