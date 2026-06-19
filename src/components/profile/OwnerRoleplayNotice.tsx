"use client";

import ProfileModerationTag from "@/components/profile/ProfileModerationTag";
import RoleplayAppealFlagButton from "@/components/profile/RoleplayAppealFlagButton";

type Props = {
  uid: string;
  username: string;
  tag?: string;
  className?: string;
};

/** Owner view: yellow roleplay badge only (no outer panel), plus compact appeal control. */
export default function OwnerRoleplayNotice({ uid, username, tag, className = "" }: Props) {
  if (tag !== "roleplay" || !uid) return null;

  return (
    <div
      className={["flex flex-wrap items-center gap-2.5", className].join(" ")}
      data-owner-roleplay-notice
    >
      <ProfileModerationTag tag={tag} compact />
      <RoleplayAppealFlagButton uid={uid} username={username} compact />
    </div>
  );
}
