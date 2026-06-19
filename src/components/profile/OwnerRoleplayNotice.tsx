"use client";

import ProfileModerationTag from "@/components/profile/ProfileModerationTag";

type Props = {
  tag?: string;
  className?: string;
};

/** Owner view: yellow roleplay badge below username (appeal flag lives on hero, top-left). */
export default function OwnerRoleplayNotice({ tag, className = "" }: Props) {
  if (tag !== "roleplay") return null;

  return (
    <div className={className} data-owner-roleplay-notice>
      <ProfileModerationTag tag={tag} compact />
    </div>
  );
}
