import { writeFileSync } from "fs";
import { join } from "path";

const root = "c:/Users/emibe/sayittome-web";

const content = `"use client";

import { memo } from "react";
import Link from "next/link";

import ModernIdentityCard from "@/components/modern/ModernIdentityCard";
import { useStoryStatus } from "@/hooks/useStoryStatus";
import type { ShuffleProfile } from "@/lib/shuffle/types";

function ModernShuffleCard({ profile }: { profile: ShuffleProfile }) {
  const story = useStoryStatus(profile.uid, profile.username);
  const href = story.hasActive && story.storyPath ? story.storyPath : \`/u/\${encodeURIComponent(profile.username)}\`;

  return (
    <Link
      href={href}
      className="group relative block transition duration-300 hover:-translate-y-1 contain-[layout_paint_style]"
    >
      <div className="relative shadow-[0_0_50px_rgba(104,76,255,0.12)] transition duration-300 group-hover:shadow-[0_0_70px_rgba(104,76,255,0.22)]">
        <ModernIdentityCard
          variant="shuffle"
          username={profile.username}
          bio={profile.bio || "Perfil SayItToMe"}
          avatarUrl={profile.photo}
          coverPhoto={profile.coverPhoto}
          videoPortada={profile.coverVideo}
          blurMedia={profile.blurPhoto}
          showBrand
          showOnline={profile.showOnline}
        />

        {profile.showOnline ? (
          <span className="absolute right-3 top-3 inline-flex items-center gap-1.5 rounded-full border border-green-500/25 bg-black/60 px-3 py-1 text-[11px] font-black text-green-300 backdrop-blur-sm">
            <span className="h-2 w-2 rounded-full bg-green-400 shadow-[0_0_8px_rgba(74,222,128,.9)]" />
            En línea
          </span>
        ) : null}

        {story.hasActive ? (
          <span
            className={[
              "absolute left-3 top-3 rounded-full px-2.5 py-1 text-[10px] font-black backdrop-blur-sm",
              story.hasUnseen
                ? "bg-violet-500/30 text-violet-100"
                : "bg-zinc-700/50 text-zinc-300",
            ].join(" ")}
          >
            Historia
          </span>
        ) : null}
      </div>
    </Link>
  );
}

export default memo(ModernShuffleCard, (a, b) => a.profile.uid === b.profile.uid && a.profile.username === b.profile.username);
`;

writeFileSync(join(root, "src/components/modern/ModernShuffleCard.tsx"), Buffer.from(content, "utf8"));
writeFileSync(join(root, "src/components/navigation/ModernBottomNav.tsx"), Buffer.from(`"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Circle, MessageSquare, Rocket, Shuffle, User } from "lucide-react";

const ITEMS = [
  { href: "/", icon: Circle, label: "Inicio", home: true },
  { href: "/chats", icon: MessageSquare, label: "Chats" },
  { href: "/shuffle", icon: Shuffle, label: "Shuffle", shuffle: true },
  { href: "/stories/new", icon: Rocket, label: "Publicar" },
  { href: "/settings", icon: User, label: "Perfil" },
] as const;

export default function ModernBottomNav() {
  const pathname = usePathname();
  const onHome = pathname === "/";
  const onShuffle = pathname === "/shuffle" || pathname.startsWith("/shuffle/");

  function dispatchShuffle() {
    window.dispatchEvent(new CustomEvent("sayittome:shuffle"));
  }

  return (
    <nav
      className="modern-bottom-nav fixed inset-x-0 bottom-0 z-[9999] border-t border-white/[0.06] bg-[#0a0a0a]/95 backdrop-blur-md"
      aria-label="Navegacion principal"
    >
      <div className="mx-auto flex h-[62px] max-w-lg items-center justify-around px-2 pb-[max(8px,env(safe-area-inset-bottom))] pt-1">
        {ITEMS.map((item) => {
          const Icon = item.icon;
          const isHome = "home" in item && item.home;
          const isShuffle = "shuffle" in item && item.shuffle;

          const active =
            pathname === item.href ||
            (item.href === "/shuffle" && pathname.startsWith("/shuffle")) ||
            (item.href !== "/shuffle" && item.href !== "/" && pathname.startsWith(\`\${item.href}/\`));

          if (isShuffle && onShuffle) {
            return (
              <button
                key={item.href}
                type="button"
                onClick={dispatchShuffle}
                className="relative flex h-12 w-12 flex-col items-center justify-center"
                aria-label="Cambiar perfiles"
              >
                <Icon size={26} className="text-white" strokeWidth={2.2} />
                <span className="absolute -bottom-0.5 h-[3px] w-8 rounded-full bg-white shadow-[0_0_10px_rgba(255,255,255,.5)]" />
              </button>
            );
          }

          if (isShuffle && onHome) {
            return (
              <Link
                key={item.href}
                href={item.href}
                className="relative flex h-12 w-12 flex-col items-center justify-center"
                aria-label={item.label}
              >
                <Icon size={26} className="text-white/45" strokeWidth={2.2} />
                <span className="absolute -bottom-0.5 h-[3px] w-8 rounded-full bg-white/90" />
              </Link>
            );
          }

          return (
            <Link
              key={item.href}
              href={item.href}
              className="relative flex h-12 w-12 flex-col items-center justify-center transition active:scale-95"
              aria-label={item.label}
            >
              <Icon
                size={isShuffle ? 26 : 24}
                strokeWidth={2.2}
                className={
                  active && isHome
                    ? "text-violet-400 drop-shadow-[0_0_14px_rgba(167,139,250,.9)]"
                    : active
                      ? "text-white"
                      : "text-white/40"
                }
              />
              {active && !isHome && !isShuffle ? (
                <span className="absolute -bottom-0.5 h-[3px] w-7 rounded-full bg-white/90" />
              ) : null}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
`, "utf8"));

console.log("written shuffle card + bottom nav utf8");
