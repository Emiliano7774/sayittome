import { writeFileSync } from "fs";
import { join } from "path";

const root = "c:/Users/emibe/sayittome-web";

const content = `"use client";

import SensitiveBlurOverlay from "@/components/moderation/SensitiveBlurOverlay";

export type ModernIdentityCardProps = {
  username: string;
  bio?: string;
  avatarUrl?: string;
  coverPhoto?: string;
  videoPortada?: string;
  blurMedia?: boolean;
  /** landing = home hero, shuffle = grid card, profile = public profile hero */
  variant?: "landing" | "shuffle" | "profile";
  showBrand?: boolean;
  showOnline?: boolean;
  className?: string;
  /** Outer purple glow halo (home landing) */
  glow?: boolean;
  /** Profile only: render avatar as interactive element */
  avatarSlot?: React.ReactNode;
  subtitle?: string;
  children?: React.ReactNode;
};

function resolveCoverImage(coverPhoto?: string, avatarUrl?: string) {
  return coverPhoto || avatarUrl || "";
}

function CoverArea({
  videoPortada,
  coverPhoto,
  avatarUrl,
  blurMedia,
  variant,
}: {
  videoPortada?: string;
  coverPhoto?: string;
  avatarUrl?: string;
  blurMedia?: boolean;
  variant: "landing" | "shuffle" | "profile";
}) {
  const coverImage = resolveCoverImage(coverPhoto, avatarUrl);
  const blurClass = blurMedia ? "blur-2xl scale-110" : "";
  const heightClass =
    variant === "landing"
      ? "h-72 md:h-80"
      : variant === "profile"
        ? "h-[360px] md:h-[400px]"
        : "min-h-[180px] flex-[1.55]";

  if (videoPortada) {
    return (
      <div className={["relative overflow-hidden", heightClass].join(" ")}>
        <video
          src={videoPortada}
          className={["absolute inset-0 h-full w-full object-cover", blurClass].join(" ")}
          autoPlay
          muted
          loop
          playsInline
        />
        {blurMedia ? <SensitiveBlurOverlay label="Portada moderada" /> : null}
      </div>
    );
  }

  if (coverImage && variant !== "landing") {
    return (
      <div className={["relative overflow-hidden", heightClass].join(" ")}>
        <img
          src={coverImage}
          alt=""
          className={["absolute inset-0 h-full w-full object-cover", blurClass].join(" ")}
          loading="lazy"
          decoding="async"
        />
        {blurMedia ? <SensitiveBlurOverlay label="Contenido moderado" /> : null}
      </div>
    );
  }

  return (
    <div
      className={[
        heightClass,
        "bg-gradient-to-br from-violet-600/80 via-[#1a0a2e] to-black",
      ].join(" ")}
    />
  );
}

function DefaultAvatar({
  avatarUrl,
  variant,
}: {
  avatarUrl?: string;
  variant: "landing" | "shuffle" | "profile";
}) {
  const sizeClass =
    variant === "shuffle" ? "h-14 w-14 border-2" : "h-28 w-28 border-4";

  return (
    <div
      className={[
        "shrink-0 overflow-hidden rounded-full border-black bg-gradient-to-br from-white to-zinc-500 shadow-2xl",
        sizeClass,
      ].join(" ")}
    >
      {avatarUrl ? (
        <img src={avatarUrl} alt="" className="h-full w-full object-cover" />
      ) : null}
    </div>
  );
}

export default function ModernIdentityCard({
  username,
  bio,
  avatarUrl,
  coverPhoto,
  videoPortada,
  blurMedia = false,
  variant = "landing",
  showBrand = false,
  showOnline = false,
  className = "",
  glow = false,
  avatarSlot,
  subtitle,
  children,
}: ModernIdentityCardProps) {
  const handle = username.startsWith("@") ? username : \`@\${username}\`;

  const cardInner = (
    <div
      className={[
        "relative overflow-hidden bg-[#0a0a0a]",
        variant === "landing"
          ? "rounded-[2rem] border border-violet-500/20 shadow-[0_0_90px_rgba(104,76,255,0.22)]"
          : variant === "profile"
            ? "rounded-[32px] border border-violet-500/10 shadow-[0_0_90px_rgba(104,76,255,0.18)]"
            : "h-full rounded-[28px] border border-violet-500/10",
        className,
      ].join(" ")}
    >
      {variant === "shuffle" ? (
        <div className="flex aspect-[3/4] flex-col">
          <CoverArea
            videoPortada={videoPortada}
            coverPhoto={coverPhoto}
            avatarUrl={avatarUrl}
            blurMedia={blurMedia}
            variant={variant}
          />

          <div className="relative shrink-0 bg-black px-4 pb-4 pt-0">
            <div className="absolute -top-7 left-4">
              {avatarSlot || <DefaultAvatar avatarUrl={avatarUrl} variant={variant} />}
            </div>

            <div className="flex items-end gap-3 pt-9">
              <div className="w-14 shrink-0" aria-hidden="true" />
              <div className="min-w-0 flex-1">
                {showBrand ? (
                  <p className="text-[10px] font-black tracking-[0.2em] text-violet-300/80">
                    SAYITTOME
                  </p>
                ) : null}
                <p className="truncate text-xl font-black">{handle}</p>
                <p className="line-clamp-1 text-sm font-bold text-white/55">
                  {bio || "Perfil SayItToMe"}
                </p>
              </div>
              {showOnline ? (
                <span className="mb-1 h-2.5 w-2.5 shrink-0 rounded-full bg-green-500 shadow-[0_0_12px_rgba(34,197,94,.8)]" />
              ) : null}
            </div>
          </div>
        </div>
      ) : variant === "profile" ? (
        <>
          <div className="pointer-events-none absolute inset-x-0 top-0 z-10 h-24 bg-gradient-to-b from-violet-600/20 to-transparent" />
          <CoverArea
            videoPortada={videoPortada}
            coverPhoto={coverPhoto}
            avatarUrl={avatarUrl}
            blurMedia={blurMedia}
            variant={variant}
          />
          <div className="relative bg-black px-5 pb-5 pt-0">
            <div className="-mt-14 mb-4 flex items-end gap-4">
              {avatarSlot || <DefaultAvatar avatarUrl={avatarUrl} variant={variant} />}
              <div className="min-w-0 flex-1 pb-1">
                {showBrand ? (
                  <p className="text-[10px] font-black tracking-[0.22em] text-violet-300/85">
                    SAYITTOME
                  </p>
                ) : null}
                <h1 className="truncate text-3xl font-black">{handle}</h1>
                {subtitle ? (
                  <p className="text-sm font-bold text-white/45">{subtitle}</p>
                ) : null}
              </div>
            </div>
            {children}
          </div>
        </>
      ) : (
        <>
          <CoverArea
            videoPortada={videoPortada}
            coverPhoto={coverPhoto}
            avatarUrl={avatarUrl}
            blurMedia={blurMedia}
            variant={variant}
          />
          <div className="relative -mt-14 px-6 pb-7">
            {avatarSlot || <DefaultAvatar avatarUrl={avatarUrl} variant={variant} />}
            <p className="mt-5 text-2xl font-black">{handle}</p>
            <p className="mt-2 text-sm font-bold leading-6 text-white/45">
              {bio || "Perfil SayItToMe"}
            </p>
            {children}
          </div>
        </>
      )}
    </div>
  );

  if (!glow) return cardInner;

  return (
    <div className="relative mx-auto w-full max-w-sm">
      <div className="absolute -inset-6 rounded-[2.5rem] bg-violet-500/20 blur-3xl" />
      <div className="relative">{cardInner}</div>
    </div>
  );
}
`;

writeFileSync(join(root, "src/components/modern/ModernIdentityCard.tsx"), Buffer.from(content, "utf8"));
console.log("written ModernIdentityCard.tsx utf8", content.length);
