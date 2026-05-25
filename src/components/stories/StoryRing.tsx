"use client";

type Props = {
  active?: boolean;
  children: React.ReactNode;
};

export default function StoryRing({
  active,
  children,
}: Props) {
  return (
    <div
      className={[
        "rounded-full p-[4px] transition",
        active
          ? "bg-gradient-to-br from-violet-400 via-fuchsia-500 to-violet-700"
          : "bg-transparent",
      ].join(" ")}
    >
      <div className="rounded-full bg-black p-[3px]">
        {children}
      </div>
    </div>
  );
}
