"use client";

import ProfileModerationTag from "@/components/profile/ProfileModerationTag";

type Props = {
  moderationTag?: string;
  fakeProfileTag?: string;
  groomingTag?: boolean;
  potentialPedophileTag?: boolean;
  compact?: boolean;
  className?: string;
};

export default function ProfileModerationBadges({
  moderationTag,
  fakeProfileTag,
  groomingTag,
  potentialPedophileTag,
  compact = true,
  className = "",
}: Props) {
  const legacy = String(moderationTag || "").trim();
  const tags = [
    legacy === "roleplay" ? "roleplay" : "",
    fakeProfileTag === "fake" ? "fake" : "",
    groomingTag || legacy === "grooming" ? "grooming" : "",
    potentialPedophileTag || legacy === "potential_pedophile" ? "potential_pedophile" : "",
  ].filter(Boolean);

  if (tags.length === 0) return null;

  return (
    <div
      className={[
        "grid max-w-full grid-flow-col grid-rows-2 auto-cols-[minmax(0,1fr)] items-start gap-1",
        className,
      ].join(" ")}
    >
      {tags.map((tag) => (
        <ProfileModerationTag
          key={tag}
          tag={tag}
          compact={compact}
          className="min-w-0 max-w-full"
        />
      ))}
    </div>
  );
}
