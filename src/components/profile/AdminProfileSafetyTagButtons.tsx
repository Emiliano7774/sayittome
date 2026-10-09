"use client";

import { useEffect, useState } from "react";
import { ShieldAlert, TriangleAlert } from "lucide-react";

import { useAdminSession } from "@/hooks/useAdminSession";
import { postAdminAction } from "@/lib/admin/postAdminAction";
import { patchCachedFullProfileAdminTags } from "@/lib/profile/profileCache";
import { setShuffleAdminTagOverlay } from "@/lib/shuffle/shuffleAdminTagOverlay";
import { patchShuffleProfileSafetyTag } from "@/lib/shuffle/shuffleSlotsStore";

type SafetyTag = "grooming" | "potential_pedophile";
type ProfileRef = {
  uid: string;
  username?: string;
  moderationTag?: string;
  groomingTag?: boolean;
  potentialPedophileTag?: boolean;
};

type Props = {
  profile: ProfileRef;
  variant?: "classic" | "modern";
  appearance?: "profile" | "shuffle";
  onSafetyChange?: (patch: Partial<ProfileRef>) => void;
};
function safetyPatch(kind: SafetyTag, active: boolean): Partial<ProfileRef> {
  return kind === "grooming"
    ? { groomingTag: active }
    : { potentialPedophileTag: active };
}

function dispatchSafety(profile: ProfileRef, kind: SafetyTag, active: boolean) {
  const patch = safetyPatch(kind, active);
  patchShuffleProfileSafetyTag(profile.uid, kind, active);
  setShuffleAdminTagOverlay(profile.uid, patch);
  if (profile.username) patchCachedFullProfileAdminTags(profile.username, patch);
  if (typeof window !== "undefined") {
    window.dispatchEvent(
      new CustomEvent("sayittome:shuffle-profile-safety", {
        detail: { uid: profile.uid, kind, active },
      }),
    );
  }
  return patch;
}

export default function AdminProfileSafetyTagButtons({
  profile,
  variant = "classic",
  appearance = "profile",
  onSafetyChange,
}: Props) {
  const { ready, isAdmin, email } = useAdminSession();
  const [busy, setBusy] = useState<SafetyTag | "">("");
  const [flags, setFlags] = useState(() => ({
    grooming: profile.groomingTag === true || profile.moderationTag === "grooming",
    potential_pedophile:
      profile.potentialPedophileTag === true || profile.moderationTag === "potential_pedophile",
  }));

  useEffect(() => {
    setFlags({
      grooming: profile.groomingTag === true || profile.moderationTag === "grooming",
      potential_pedophile:
        profile.potentialPedophileTag === true || profile.moderationTag === "potential_pedophile",
    });
  }, [profile.groomingTag, profile.potentialPedophileTag, profile.moderationTag]);

  if (!ready || !isAdmin) return null;

  async function toggle(kind: SafetyTag) {
    if (busy) return;
    const active = flags[kind];
    const legacyActive = profile.moderationTag === kind;
    setBusy(kind);
    try {
      const action = active
        ? legacyActive && !(kind === "grooming" ? profile.groomingTag : profile.potentialPedophileTag)
          ? "clear_moderation_tag"
          : kind === "grooming"
            ? "clear_grooming_tag"
            : "clear_potential_pedophile_tag"
        : kind === "grooming"
          ? "tag_grooming"
          : "tag_potential_pedophile";
      const res = await postAdminAction(email, { action, uid: profile.uid });
      if (!res.ok) throw new Error(String(res.error || "admin_action_failed"));
      const next = !active;
      setFlags((current) => ({ ...current, [kind]: next }));

      if (active && legacyActive) {
        const patch = { ...safetyPatch(kind, false), moderationTag: "" };
        setShuffleAdminTagOverlay(profile.uid, patch);
        if (profile.username) patchCachedFullProfileAdminTags(profile.username, patch);
        window.dispatchEvent(
          new CustomEvent("sayittome:shuffle-profile-moderation", {
            detail: { uid: profile.uid, moderationTag: "" },
          }),
        );
        dispatchSafety(profile, kind, false);
        onSafetyChange?.(patch);
      } else {
        const patch = dispatchSafety(profile, kind, next);
        onSafetyChange?.(patch);
      }
    } catch (error) {
      console.error(error);
      window.alert("No se pudo actualizar la marca de seguridad.");
    } finally {
      setBusy("");
    }
  }

  const shuffle = appearance === "shuffle";
  const base = shuffle
    ? "flex h-8 w-8 items-center justify-center rounded-full border shadow-lg backdrop-blur-sm transition disabled:opacity-50"
    : "inline-flex items-center justify-center rounded-full border p-2 transition disabled:opacity-50";
  const groomingClass = flags.grooming
    ? "border-orange-300 bg-orange-500/85 text-black"
    : variant === "modern"
      ? "border-white/15 bg-black/55 text-orange-300"
      : "border-white/15 bg-[#171717]/92 text-orange-300";
  const potentialClass = flags.potential_pedophile
    ? "border-red-200 bg-[#7f1028] text-white"
    : variant === "modern"
      ? "border-white/15 bg-black/55 text-red-300"
      : "border-white/15 bg-[#171717]/92 text-red-300";

  return (
    <div
      className={shuffle ? "contents" : "pointer-events-auto flex items-center gap-1.5"}
      data-admin-safety-controls
    >
      <button
        type="button"
        onPointerDown={(event) => event.stopPropagation()}
        onClick={(event) => { event.preventDefault(); event.stopPropagation(); void toggle("grooming"); }}
        disabled={Boolean(busy)}
        className={`${base} ${groomingClass}`}
        aria-label={flags.grooming ? "Quitar marca de grooming" : "Marcar riesgo de grooming"}
        title={flags.grooming ? "Quitar grooming" : "Grooming"}
      >
        <ShieldAlert size={shuffle ? 15 : 16} strokeWidth={2.5} />
      </button>
      <button
        type="button"
        onPointerDown={(event) => event.stopPropagation()}
        onClick={(event) => { event.preventDefault(); event.stopPropagation(); void toggle("potential_pedophile"); }}
        disabled={Boolean(busy)}
        className={`${base} ${potentialClass}`}
        aria-label={flags.potential_pedophile ? "Quitar marca potencialmente pedófilo" : "Marcar potencialmente pedófilo"}
        title={flags.potential_pedophile ? "Quitar potencialmente pedófilo" : "Potencialmente pedófilo"}
      >
        <TriangleAlert size={shuffle ? 15 : 16} strokeWidth={2.5} />
      </button>
    </div>
  );
}
