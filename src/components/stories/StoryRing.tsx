"use client";

type Props = {
  /** true = violeta (no vistas), false = gris (vistas) */
  active?: boolean;
  children: React.ReactNode;
};

export default function StoryRing({ active, children }: Props) {
  return (
    <div
      className={[
        "rounded-full p-[3px] transition",
        active
          ? "bg-gradient-to-br from-violet-400 via-fuchsia-500 to-violet-700"
          : "bg-zinc-600",
      ].join(" ")}
    >
      <div className="rounded-full bg-black p-[2px]">{children}</div>
    </div>
  );
}
