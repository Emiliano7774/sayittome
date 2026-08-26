"use client";

import { useState, type SyntheticEvent } from "react";
import { RotateCcw, UserRoundX } from "lucide-react";

import { useAdminSession } from "@/hooks/useAdminSession";
import { postAdminAction } from "@/lib/admin/postAdminAction";
import { useT } from "@/contexts/LocaleContext";
import { patchShuffleProfileFakeTag } from "@/lib/shuffle/shuffleSlotsStore";

type ProfileRef = {
  uid: string;
  username: string;
  fakeProfileTag?: string;
};

type Props = {
  profile: ProfileRef;
  variant?: "classic" | "modern";
  appearance?: "profile" | "shuffle";
  className?: string;
  onTagChange?: (fakeProfileTag: string) => void;
};

export function dispatchProfileFakeTag(uid: string, fakeProfileTag: string) {
  patchShuffleProfileFakeTag(uid, fakeProfileTag);
  window.dispatchEvent(
    new CustomEvent("sayittome:shuffle-profile-fake", {
      detail: { uid, fakeProfileTag },
    }),
  );
}

export default function AdminProfileFakeButton({
  profile,
  variant = "classic",
  appearance = "profile",
  className = "",
  onTagChange,
}: Props) {
  const t = useT();
  const { ready, isAdmin, email } = useAdminSession();
  const [tag, setTag] = useState(profile.fakeProfileTag || "");
  const [busy, setBusy] = useState(false);
  const syncKey = `${profile.uid}:${profile.fakeProfileTag || ""}`;
  const [seenSyncKey, setSeenSyncKey] = useState(syncKey);
  if (syncKey !== seenSyncKey) {
    setSeenSyncKey(syncKey);
    setTag(profile.fakeProfileTag || "");
  }

  if (!ready || !isAdmin) return null;

  const isFake = tag === "fake";
  const modern = variant === "modern";
  const isShuffle = appearance === "shuffle";

  function failMessage(action: "tag_fake_profile" | "clear_fake_profile_tag") {
    return action === "tag_fake_profile"
      ? t("admin_tag_fake_profile_fail")
      : t("admin_clear_fake_profile_tag_fail");
  }

  async function runAction(action: "tag_fake_profile" | "clear_fake_profile_tag") {
    if (!profile.uid || busy) return;

    setBusy(true);
    try {
      const json = await postAdminAction(email, {
        action,
        uid: profile.uid,
        note:
          action === "tag_fake_profile"
            ? isShuffle
              ? "Marcado como perfil falso desde Shuffle."
              : "Marcado como perfil falso desde el perfil público."
            : undefined,
      });

      if (!json?.ok) {
        alert(failMessage(action));
        return;
      }

      const nextTag = action === "tag_fake_profile" ? "fake" : "";
      setTag(nextTag);
      dispatchProfileFakeTag(profile.uid, nextTag);
      onTagChange?.(nextTag);
    } catch {
      alert(failMessage(action));
    } finally {
      setBusy(false);
    }
  }

  function stopBubble(event: SyntheticEvent) {
    event.preventDefault();
    event.stopPropagation();
  }

  function toggleShuffleTag() {
    void runAction(isFake ? "clear_fake_profile_tag" : "tag_fake_profile");
  }

  const shuffleShellClass = [
    "inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full border backdrop-blur-sm transition active:scale-95 disabled:opacity-50",
    isFake
      ? "border-rose-400/45 bg-rose-500/15 text-rose-300 shadow-[0_0_14px_rgba(244,63,94,0.22)]"
      : modern
        ? "border-amber-400/35 bg-black/65 text-amber-100"
        : "border-amber-400/35 bg-amber-500/15 text-amber-100",
    className,
  ].join(" ");

  const profileShellClass = [
    "inline-flex h-8 w-8 items-center justify-center rounded-full border backdrop-blur-sm transition active:scale-95 disabled:opacity-50",
    modern
      ? "border-fuchsia-400/30 bg-black/65 text-fuchsia-200"
      : "border-amber-400/35 bg-black/60 text-amber-100",
    className,
  ].join(" ");

  if (isShuffle) {
    return (
      <div
        className="pointer-events-auto shrink-0"
        onClick={stopBubble}
        onPointerDown={stopBubble}
      >
        <button
          type="button"
          disabled={busy}
          onClick={toggleShuffleTag}
          className={shuffleShellClass}
          title={
            isFake ? t("admin_undo_clear_fake_profile_tag") : t("admin_report_tag_fake_profile")
          }
          aria-label={
            isFake ? t("admin_undo_clear_fake_profile_tag") : t("admin_report_tag_fake_profile")
          }
          aria-pressed={isFake}
        >
          <UserRoundX size={15} strokeWidth={2.2} />
        </button>
      </div>
    );
  }

  if (isFake) {
    return (
      <button
        type="button"
        disabled={busy}
        onClick={() => void runAction("clear_fake_profile_tag")}
        className={profileShellClass}
        title={t("admin_undo_clear_fake_profile_tag")}
        aria-label={t("admin_undo_clear_fake_profile_tag")}
      >
        <RotateCcw size={14} strokeWidth={2.2} />
      </button>
    );
  }

  return (
    <button
      type="button"
      disabled={busy}
      onClick={() => void runAction("tag_fake_profile")}
      className={profileShellClass}
      title={t("admin_report_tag_fake_profile")}
      aria-label={t("admin_report_tag_fake_profile")}
    >
      <UserRoundX size={14} strokeWidth={2.2} />
    </button>
  );
}
