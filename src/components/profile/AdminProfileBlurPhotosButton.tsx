"use client";

import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { EyeOff, X } from "lucide-react";

import SensitiveBlurOverlay from "@/components/moderation/SensitiveBlurOverlay";
import { useAdminSession } from "@/hooks/useAdminSession";
import { postAdminAction } from "@/lib/admin/postAdminAction";
import {
  collectProfilePhotoUrls,
  readMediaBlurFlags,
} from "@/lib/profile/profilePhotoUrls";
import { patchShuffleProfileBlurFlags } from "@/lib/shuffle/shuffleSlotsStore";
import { useT } from "@/contexts/LocaleContext";

type ProfileRef = {
  uid: string;
  username: string;
  photo?: string;
  fotos?: string[];
};

type Props = {
  profile: ProfileRef;
  variant?: "classic" | "modern";
  appearance?: "profile" | "shuffle";
  className?: string;
};

export function dispatchProfileBlurFlags(uid: string, mediaBlurFlags: Record<string, boolean>) {
  patchShuffleProfileBlurFlags(uid, mediaBlurFlags);
  window.dispatchEvent(
    new CustomEvent("sayittome:shuffle-profile-blur", {
      detail: { uid, mediaBlurFlags },
    }),
  );
}

export default function AdminProfileBlurPhotosButton({
  profile,
  variant = "classic",
  appearance = "profile",
  className = "",
}: Props) {
  const t = useT();
  const { ready, isAdmin, email } = useAdminSession();
  const [open, setOpen] = useState(false);
  const [busyUrl, setBusyUrl] = useState("");
  const [loading, setLoading] = useState(false);
  const [flags, setFlags] = useState<Record<string, boolean>>({});
  const [photos, setPhotos] = useState<string[]>([]);
  const [mounted, setMounted] = useState(false);

  const modern = variant === "modern";

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!open) return;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;

    let cancelled = false;

    async function loadProfilePhotos() {
      setLoading(true);
      try {
        const res = await fetch(`/api/profile/${encodeURIComponent(profile.username)}?ts=${Date.now()}`, {
          cache: "no-store",
        });
        const json = await res.json();
        if (cancelled) return;

        const loadedProfile = (json?.profile || {}) as Record<string, unknown>;
        setFlags(readMediaBlurFlags(loadedProfile));
        setPhotos(collectProfilePhotoUrls(loadedProfile));
      } catch {
        if (!cancelled) {
          setFlags({});
          setPhotos(
            collectProfilePhotoUrls({
              photo: profile.photo,
              fotos: profile.fotos,
            }),
          );
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void loadProfilePhotos();

    return () => {
      cancelled = true;
    };
  }, [open, profile.photo, profile.fotos, profile.username]);

  const blurredCount = useMemo(
    () => photos.filter((url) => flags[url] === true).length,
    [flags, photos],
  );

  if (!ready || !isAdmin) return null;

  async function toggleBlur(url: string) {
    if (!profile.uid || busyUrl) return;

    const nextBlurred = flags[url] !== true;
    setBusyUrl(url);

    try {
      const json = await postAdminAction(email, {
        action: "toggle_media_blur",
        uid: profile.uid,
        mediaUrl: url,
        blurred: nextBlurred,
      });

      if (!json?.ok) {
        alert(t("admin_blur_photos_fail"));
        return;
      }

      const nextFlags = { ...flags };
      if (nextBlurred) nextFlags[url] = true;
      else delete nextFlags[url];

      setFlags(nextFlags);
      dispatchProfileBlurFlags(profile.uid, nextFlags);
    } finally {
      setBusyUrl("");
    }
  }

  const shellClass = [
    "inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full border backdrop-blur-sm transition active:scale-95 disabled:opacity-50",
    modern
      ? "border-violet-400/35 bg-black/65 text-violet-200"
      : "border-violet-400/35 bg-violet-500/15 text-violet-100",
    className,
  ].join(" ");

  const modal =
    open && mounted ? (
      <div
        className="fixed inset-0 z-[20000] flex items-end justify-center bg-[#050505] p-4 sm:items-center"
        onClick={() => setOpen(false)}
      >
        <div
          className="max-h-[85vh] w-full max-w-lg overflow-hidden rounded-3xl border border-white/10 bg-[#101010] shadow-2xl"
          onClick={(event) => event.stopPropagation()}
        >
          <div className="flex items-center justify-between border-b border-white/10 bg-[#101010] px-4 py-3">
            <div className="min-w-0 pr-3">
              <p className="truncate text-base font-black text-white">
                @{profile.username}
              </p>
              <p className="text-xs font-semibold text-white/45">
                {t("admin_blur_photos_subtitle")}
              </p>
            </div>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-white/10 bg-[#171717] text-white/70"
              aria-label="Cerrar"
            >
              <X size={18} />
            </button>
          </div>

          <div className="max-h-[65vh] overflow-y-auto bg-[#101010] p-4">
            {loading ? (
              <p className="py-10 text-center text-sm font-bold text-white/35">
                {t("common_loading")}
              </p>
            ) : photos.length === 0 ? (
              <p className="py-10 text-center text-sm font-bold text-white/35">
                {t("admin_blur_photos_empty")}
              </p>
            ) : (
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                {photos.map((url) => {
                  const blurred = flags[url] === true;
                  const busy = busyUrl === url;

                  return (
                    <button
                      key={url}
                      type="button"
                      disabled={busy}
                      onClick={() => void toggleBlur(url)}
                      className={[
                        "relative aspect-square overflow-hidden rounded-2xl border transition",
                        blurred
                          ? "border-orange-400/50 ring-2 ring-orange-400/35"
                          : "border-white/10 hover:border-violet-400/35",
                        busy ? "opacity-60" : "",
                      ].join(" ")}
                      title={blurred ? t("admin_blur_photos_unblur") : t("admin_blur_photos_blur")}
                    >
                      <img
                        src={url}
                        alt=""
                        className={[
                          "h-full w-full object-cover",
                          blurred ? "scale-110 blur-2xl" : "",
                        ].join(" ")}
                      />
                      {blurred ? (
                        <SensitiveBlurOverlay
                          label={t("admin_blur_photos_blurred")}
                          mediaKey={url}
                        />
                      ) : null}
                      <span
                        className={[
                          "absolute left-2 top-2 rounded-full px-2 py-0.5 text-[10px] font-black uppercase tracking-wide",
                          blurred
                            ? "bg-orange-500/85 text-black"
                            : "bg-black/55 text-white/80",
                        ].join(" ")}
                      >
                        {blurred ? t("admin_blur_photos_blurred") : t("admin_blur_photos_visible")}
                      </span>
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          <div className="border-t border-white/10 bg-[#101010] px-4 py-3 text-xs font-semibold text-white/45">
            {t("admin_blur_photos_count", {
              count: String(blurredCount),
              total: String(photos.length),
            })}
          </div>
        </div>
      </div>
    ) : null;

  return (
    <>
      <button
        type="button"
        className={shellClass}
        title={t("admin_blur_photos_open")}
        aria-label={t("admin_blur_photos_open")}
        onClick={(event) => {
          event.preventDefault();
          event.stopPropagation();
          setOpen(true);
        }}
      >
        <EyeOff size={15} strokeWidth={2.2} />
      </button>

      {modal ? createPortal(modal, document.body) : null}
    </>
  );
}
