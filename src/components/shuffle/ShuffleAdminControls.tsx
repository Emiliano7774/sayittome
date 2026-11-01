"use client";

import dynamic from "next/dynamic";

import { useAdminSession } from "@/hooks/useAdminSession";
import type { ShuffleProfile } from "@/lib/shuffle/types";

// Admin moderation code is not needed by regular users. Keep it out of the
// initial Shuffle card graph and load it only after auth confirms an admin.
const AdminButtons = dynamic(() => import("./ShuffleAdminControlsInternal"), {
  ssr: false,
  loading: () => null,
});

export default function ShuffleAdminControls({
  profile,
  variant,
}: {
  profile: ShuffleProfile;
  variant: "classic" | "modern";
}) {
  const { ready, isAdmin } = useAdminSession();
  if (!ready || !isAdmin) return null;
  return <AdminButtons profile={profile} variant={variant} />;
}
