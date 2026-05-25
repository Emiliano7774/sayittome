"use client";

import Link from "next/link";

type Props = {
  username?: string;
  photoURL?: string;
};

export default function ChatAvatar({ username, photoURL }: Props) {
  const href = username ? "/u/" + username : "/shuffle";

  return (
    <Link href={href}>
      <div className="relative shrink-0">
        <div className="h-14 w-14 overflow-hidden rounded-full border border-zinc-800 bg-zinc-900">
          {photoURL ? (
            <img
              src={photoURL}
              alt={username || "Usuario"}
              className="h-full w-full object-cover"
            />
          ) : (
            <div className="h-full w-full bg-gradient-to-br from-fuchsia-500 to-zinc-900" />
          )}
        </div>
      </div>
    </Link>
  );
}