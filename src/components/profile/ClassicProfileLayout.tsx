"use client";

import Link from "next/link";
import {
  Heart,
  MessageSquare,
  UserPlus,
  BookOpen,
  X,
  MoreHorizontal,
  Pencil,
  Camera,
} from "lucide-react";

export type ClassicProfileData = {
  username: string;
  bio: string;
  photo: string;
  photos?: string[];
  registeredAt?: string;
  conversations?: number;
  likes?: number;
  followers?: number;
  stories?: number;
};

function StatBubble({
  color,
  glow,
  icon,
  value,
  label,
}: {
  color: string;
  glow: string;
  icon: React.ReactNode;
  value: number;
  label: string;
}) {
  return (
    <div className="flex min-w-0 flex-col items-center">
      <div
        className={[
          "flex h-[clamp(84px,9vw,132px)] w-[clamp(84px,9vw,132px)] items-center justify-center rounded-full text-white",
          color,
          glow,
        ].join(" ")}
      >
        {icon}
      </div>

      <div className="mt-3 text-[clamp(22px,2.3vw,32px)] font-black leading-none text-white">
        {value}
      </div>

      <div className="mt-2 text-center text-[clamp(16px,1.8vw,25px)] font-black leading-[1.05] text-[#777780]">
        {label}
      </div>
    </div>
  );
}

export default function ClassicProfileLayout({
  profile,
  ownProfile = false,
}: {
  profile: ClassicProfileData;
  ownProfile?: boolean;
}) {
  const photo = profile.photo || "";

  return (
    <main className="min-h-screen overflow-x-hidden bg-black text-white">
      <section className="relative min-h-screen w-full bg-black pb-[120px]">
        <div
          className="relative h-[62vh] min-h-[470px] w-full overflow-hidden bg-[#050505] bg-cover bg-center"
          style={photo ? { backgroundImage: `url(${photo})` } : undefined}
        >
          {!photo ? (
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,#171717_0%,#050505_48%,#000_100%)]" />
          ) : null}

          <div className="absolute inset-0 bg-black/10" />
          <div className="absolute inset-x-0 bottom-0 h-[62%] bg-gradient-to-t from-black via-black/90 to-transparent" />

          <Link
            href={ownProfile ? "/shuffle" : "/shuffle"}
            className="absolute left-[clamp(18px,3vw,38px)] top-[clamp(18px,3vw,34px)] z-20 flex h-[clamp(58px,6vw,78px)] w-[clamp(58px,6vw,78px)] items-center justify-center rounded-full border-[3px] border-white bg-black/25 text-white backdrop-blur-md"
          >
            <X size={42} strokeWidth={2.7} />
          </Link>

          <div className="absolute right-[clamp(18px,3vw,38px)] top-[clamp(18px,3vw,34px)] z-20 flex items-center gap-4">
            {ownProfile ? (
              <Link
                href="/settings/edit"
                className="flex h-[clamp(58px,6vw,78px)] items-center justify-center gap-3 rounded-full border-[3px] border-white bg-black/25 px-8 text-[clamp(18px,2vw,27px)] font-black text-white backdrop-blur-md"
              >
                <Pencil size={26} />
                Editar
              </Link>
            ) : (
              <button className="h-[clamp(58px,6vw,78px)] rounded-full border-[3px] border-white bg-black/25 px-8 text-[clamp(18px,2vw,27px)] font-black text-white backdrop-blur-md">
                Seguir
              </button>
            )}

            <button className="flex h-[clamp(58px,6vw,78px)] w-[clamp(58px,6vw,78px)] items-center justify-center rounded-full border-[3px] border-white bg-black/25 text-white backdrop-blur-md">
              <MoreHorizontal size={38} strokeWidth={3} />
            </button>
          </div>

          {ownProfile && !photo ? (
            <button className="absolute left-1/2 top-1/2 z-20 flex -translate-x-1/2 -translate-y-1/2 items-center gap-3 rounded-full bg-white/10 px-6 py-4 text-sm font-black text-white/80 backdrop-blur-md">
              <Camera size={22} />
              Agregar foto
            </button>
          ) : null}

          <div className="absolute bottom-[clamp(34px,6vw,78px)] left-[clamp(24px,8vw,120px)] z-20">
            <h1 className="max-w-[88vw] truncate text-[clamp(52px,8vw,86px)] font-black leading-none tracking-[-0.065em] text-white drop-shadow-2xl">
              {profile.username}
            </h1>

            <div className="mt-4 text-[clamp(24px,3vw,34px)] font-black leading-none text-white/95 drop-shadow-xl">
              Ultima vez hace 8 dias
            </div>
          </div>
        </div>

        <section className="relative z-20 bg-black px-[clamp(18px,6vw,110px)] pb-10 pt-10">
          <div className="mx-auto grid max-w-[980px] grid-cols-4 gap-[clamp(16px,5vw,74px)]">
            <StatBubble
              color="bg-[#ef2f9f]"
              glow="shadow-[0_0_46px_rgba(255,0,174,0.45)]"
              value={profile.likes || 0}
              label="me gusta"
              icon={<Heart size={54} fill="white" />}
            />

            <StatBubble
              color="bg-[#69d96f]"
              glow="shadow-[0_0_46px_rgba(84,255,105,0.42)]"
              value={profile.conversations || 0}
              label="conv."
              icon={<MessageSquare size={52} fill="white" />}
            />

            <StatBubble
              color="bg-[#8f3fd3]"
              glow="shadow-[0_0_46px_rgba(174,73,255,0.42)]"
              value={profile.followers || 0}
              label="seguidores"
              icon={<UserPlus size={55} />}
            />

            <StatBubble
              color="bg-[#5fb2df]"
              glow="shadow-[0_0_46px_rgba(76,210,255,0.38)]"
              value={profile.stories || 0}
              label="historias"
              icon={<BookOpen size={56} />}
            />
          </div>

          <div className="mt-12 border-t border-white/[0.07] pt-9">
            <div className="flex items-end justify-between gap-6">
              <div className="max-w-[62%]">
                <div className="text-[clamp(28px,4vw,40px)] font-black leading-tight tracking-[-0.035em] text-white">
                  {profile.bio || "Sin bio todavia."}
                </div>
              </div>

              <div className="pb-1 text-right">
                <div className="text-[12px] font-black uppercase tracking-[0.34em] text-white/35">
                  Miembro desde
                </div>

                <div className="mt-2 text-[clamp(12px,1.2vw,16px)] font-black uppercase tracking-[0.14em] text-white/55">
                  {profile.registeredAt || "sin fecha"}
                </div>
              </div>
            </div>
          </div>
        </section>
      </section>
    </main>
  );
}
