"use client";

import Link from "next/link";

type Props = {
  uid: string;
  username?: string;
  photoURL?: string;
  hasStories?: boolean;
};

export default function StoryBubble({
  uid,
  username,
  photoURL,
  hasStories,
}: Props) {
  return (
    <div className="flex shrink-0 flex-col items-center gap-3">
      <Link
        href={"/stories/" + uid}
        className={
          hasStories
            ? "rounded-full bg-gradient-to-br from-fuchsia-500 via-violet-500 to-fuchsia-900 p-[3px]"
            : "rounded-full border border-zinc-800 p-[3px]"
        }
      >
        <div className="rounded-full bg-black p-[3px]">
          <div
            className="h-20 w-20 rounded-full bg-zinc-900 bg-cover bg-center"
            style={{
              backgroundImage: photoURL
                ? "url(" + photoURL + ")"
                : "linear-gradient(135deg,#fafafa,#52525b)",
            }}
          />
        </div>
      </Link>

      <p className="max-w-[90px] truncate text-xs font-bold text-zinc-400">
        @{username || "usuario"}
      </p>
    </div>
  );
}
