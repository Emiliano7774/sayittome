"use client";

import AdminProfileFakeButton from "@/components/profile/AdminProfileFakeButton";
import AdminProfileRoleplayButton from "@/components/profile/AdminProfileRoleplayButton";
import AdminProfileSafetyTagButtons from "@/components/profile/AdminProfileSafetyTagButtons";
import AdminProfileBlurPhotosButton from "@/components/profile/AdminProfileBlurPhotosButton";
import type { ShuffleProfile } from "@/lib/shuffle/types";

export default function ShuffleAdminControlsInternal({
  profile,
  variant,
}: {
  profile: ShuffleProfile;
  variant: "classic" | "modern";
}) {
  return (
    <>
      <AdminProfileRoleplayButton profile={profile} variant={variant} appearance="shuffle" />
      <AdminProfileFakeButton profile={profile} variant={variant} appearance="shuffle" />
      <AdminProfileSafetyTagButtons profile={profile} variant={variant} appearance="shuffle" />
      <AdminProfileBlurPhotosButton profile={profile} variant={variant} appearance="shuffle" />
    </>
  );
}
