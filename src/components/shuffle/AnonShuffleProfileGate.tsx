"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

import { useT } from "@/contexts/LocaleContext";
import {
  ANON_PROFILE_GATE_EVENT,
  openProfileAnonChat,
  type AnonProfileGateDetail,
} from "@/lib/shuffle/shuffleVisitorNavigation";

export default function AnonShuffleProfileGate() {
  const t = useT();
  const router = useRouter();
  const [detail, setDetail] = useState<AnonProfileGateDetail | null>(null);

  useEffect(() => {
    const onGate = (event: Event) => {
      const next = (event as CustomEvent<AnonProfileGateDetail>).detail;
      setDetail({
        allowChat: next?.allowChat === true && Boolean(next?.username),
        username: String(next?.username || ""),
      });
    };
    window.addEventListener(ANON_PROFILE_GATE_EVENT, onGate);
    return () => window.removeEventListener(ANON_PROFILE_GATE_EVENT, onGate);
  }, []);

  if (!detail) return null;

  return (
    <div
      className="fixed inset-0 z-[80] flex items-end justify-center bg-black/70 p-4 sm:items-center"
      role="presentation"
      onClick={() => setDetail(null)}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="anon-profile-gate-title"
        data-anon-profile-gate="1"
        className="w-full max-w-md rounded-3xl border border-white/10 bg-[#111] p-6 text-white shadow-2xl"
        onClick={(event) => event.stopPropagation()}
      >
        <h2 id="anon-profile-gate-title" className="text-2xl font-black">
          {t("profile_gate_title")}
        </h2>
        <p className="mt-3 text-sm leading-6 text-white/70">{t("profile_gate_body")}</p>
        <div className="mt-6 space-y-3">
          {detail.allowChat ? (
            <button
              type="button"
              className="flex h-12 w-full items-center justify-center rounded-full bg-[#7b5cff] text-sm font-black"
              onClick={() => {
                const username = detail.username;
                setDetail(null);
                openProfileAnonChat(router, username);
              }}
            >
              {t("shuffle_visitor_talk")}
            </button>
          ) : null}
          <Link
            href="/register"
            className="flex h-12 w-full items-center justify-center rounded-full bg-white text-sm font-black text-black"
            onClick={() => setDetail(null)}
          >
            {t("profile_gate_register")}
          </Link>
          <Link
            href="/login"
            className="flex h-12 w-full items-center justify-center rounded-full border border-white/15 text-sm font-semibold"
            onClick={() => setDetail(null)}
          >
            {t("profile_gate_login")}
          </Link>
          <button
            type="button"
            className="flex h-12 w-full items-center justify-center text-sm text-white/55"
            onClick={() => setDetail(null)}
          >
            {t("profile_gate_back_shuffle")}
          </button>
        </div>
      </div>
    </div>
  );
}
