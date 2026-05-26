"use client";

import React from "react";

type Props = {
  username: string;
  bio?: string;
  fotoPrincipal?: string;
  likes?: number;
  conversaciones?: number;
  seguidores?: number;
  historias?: number;
  onPhotoClick?: () => void;
};

export default function MobileProfileHero({
  username,
  bio,
  fotoPrincipal,
  likes,
  conversaciones,
  seguidores,
  historias,
  onPhotoClick,
}: Props) {
  return (
    <div className="relative w-full h-[92vh] overflow-hidden bg-black">

      <img
        src={fotoPrincipal || "/placeholder-profile.png"}
        alt={username}
        onClick={onPhotoClick}
        className="
          absolute
          inset-0
          w-full
          h-full
          object-cover
          cursor-pointer
        "
      />

      <div
        className="
          absolute
          inset-0
          bg-gradient-to-b
          from-black/20
          via-black/20
          to-black/85
        "
      />

      <div
        className="
          absolute
          bottom-40
          left-0
          right-0
          px-6
          text-center
        "
      >
        <h1
          className="
            text-white
            text-5xl
            font-black
            tracking-tight
            drop-shadow-xl
          "
        >
          {username}
        </h1>

        {bio && (
          <p
            className="
              text-white/90
              text-lg
              mt-3
              max-w-xl
              mx-auto
            "
          >
            {bio}
          </p>
        )}
      </div>

      <div
        className="
          absolute
          bottom-10
          left-1/2
          -translate-x-1/2
          flex
          gap-4
        "
      >
        <StatBubble
          color="bg-pink-500"
          label="me gusta"
          value={likes}
        />

        <StatBubble
          color="bg-green-500"
          label="conv."
          value={conversaciones}
        />

        <StatBubble
          color="bg-violet-500"
          label="seguidores"
          value={seguidores}
        />

        <StatBubble
          color="bg-sky-500"
          label="historias"
          value={historias}
        />
      </div>
    </div>
  );
}

function StatBubble({
  color,
  value,
  label,
}: {
  color: string;
  value?: number;
  label: string;
}) {
  return (
    <div className="flex flex-col items-center">
      <div
        className={`
          ${color}
          w-16
          h-16
          rounded-full
          flex
          items-center
          justify-center
          shadow-2xl
        `}
      />

      <div className="text-white font-bold mt-2">
        {value ?? 0}
      </div>

      <div className="text-white/70 text-xs">
        {label}
      </div>
    </div>
  );
}
