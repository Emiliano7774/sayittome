"use client";

import ProfileModerationTag from "@/components/profile/ProfileModerationTag";
import RoleplayAppealFlagButton from "@/components/profile/RoleplayAppealFlagButton";

type Props = {
  uid: string;
  username: string;
  tag?: string;
  className?: string;
};

/** Visible on the profile owner's view — same roleplay label visitors see, plus appeal. */
export default function OwnerRoleplayNotice({ uid, username, tag, className = "" }: Props) {
  if (tag !== "roleplay" || !uid) return null;

  return (
    <div
      className={[
        "flex w-full max-w-full flex-wrap items-center gap-3 rounded-2xl border border-amber-400/25 bg-amber-500/10 px-4 py-3",
        className,
      ].join(" ")}
      data-owner-roleplay-notice
    >
      <ProfileModerationTag tag={tag} />
      <RoleplayAppealFlagButton uid={uid} username={username} />
    </div>
  );
}
