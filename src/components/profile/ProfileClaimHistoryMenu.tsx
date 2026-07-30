"use client";

import { FileText, MoreHorizontal, X } from "lucide-react";
import { onAuthStateChanged, type User } from "firebase/auth";
import { useEffect, useState } from "react";

import { useLocale, useT } from "@/contexts/LocaleContext";
import { useOverlayBackClose } from "@/hooks/useOverlayBackClose";
import { auth } from "@/lib/firebase";
import { parseReportCreatedAtMs } from "@/lib/admin/reportSort";

type ClaimHistoryRow = {
  id: string;
  message: string;
  status: string;
  createdAt: string;
  adminReply: string;
  adminRepliedAt: string;
};

type Props = {
  className?: string;
};

function resolveCurrentUser(): Promise<User | null> {
  if (auth.currentUser) return Promise.resolve(auth.currentUser);
  return new Promise((resolve) => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      unsubscribe();
      resolve(user);
    });
  });
}

export default function ProfileClaimHistoryMenu({ className = "" }: Props) {
  const t = useT();
  const { locale } = useLocale();
  const [menuOpen, setMenuOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [claims, setClaims] = useState<ClaimHistoryRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);

  useOverlayBackClose(
    historyOpen,
    () => setHistoryOpen(false),
    "sayittome-claim-history-open",
    "sayittome:close-claim-history",
  );

  useEffect(() => {
    if (!historyOpen) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, [historyOpen]);

  const localeTag =
    locale === "es" ? "es-AR" : locale === "en" ? "en-US" : locale === "it" ? "it-IT" : "de-DE";

  function formatDate(value: unknown) {
    const ms = parseReportCreatedAtMs(value);
    if (!ms) return "";
    return new Intl.DateTimeFormat(localeTag, {
      dateStyle: "medium",
      timeStyle: "short",
    }).format(new Date(ms));
  }

  function statusLabel(status: string) {
    if (status === "respondido") return t("claim_history_status_replied");
    if (status === "revisado") return t("claim_history_status_reviewed");
    if (status === "descartado") return t("claim_history_status_dismissed");
    return t("claim_history_status_pending");
  }

  async function openHistory() {
    setMenuOpen(false);
    setHistoryOpen(true);
    setLoading(true);
    setError(false);

    try {
      const user = await resolveCurrentUser();
      const token = user ? await user.getIdToken() : "";
      if (!token) throw new Error("missing_auth_token");

      const response = await fetch("/api/roleplay-appeal/history", {
        headers: { Authorization: `Bearer ${token}` },
        cache: "no-store",
      });
      const payload = (await response.json()) as {
        ok?: boolean;
        claims?: ClaimHistoryRow[];
      };
      if (!response.ok || !payload.ok) throw new Error("history_failed");
      setClaims(Array.isArray(payload.claims) ? payload.claims : []);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <div className={`relative ${className}`}>
        <button
          type="button"
          onClick={() => setMenuOpen((current) => !current)}
          className="flex h-11 w-11 items-center justify-center rounded-full border border-white/15 bg-white/5 text-white/75 transition hover:bg-white/10 hover:text-white"
          aria-label={t("profile_options")}
          title={t("profile_options")}
        >
          <MoreHorizontal size={21} />
        </button>

        {menuOpen ? (
          <div className="absolute right-0 top-full z-[80] mt-2 w-64 rounded-2xl border border-white/15 bg-zinc-950 p-2 shadow-2xl">
            <button
              type="button"
              onClick={() => void openHistory()}
              className="flex w-full items-center gap-3 rounded-xl px-4 py-3 text-left text-sm font-bold text-white/85 hover:bg-white/5"
            >
              <FileText size={17} />
              {t("claim_history_menu")}
            </button>
          </div>
        ) : null}
      </div>

      {historyOpen ? (
        <div className="fixed inset-0 z-[1000000] flex items-end justify-center bg-black/85 p-3 pb-[max(1rem,env(safe-area-inset-bottom))] sm:items-center sm:p-4">
          <section className="flex max-h-[min(88dvh,760px)] w-full max-w-xl flex-col overflow-hidden rounded-[2rem] border border-white/10 bg-zinc-950 shadow-2xl">
            <header className="flex shrink-0 items-center justify-between border-b border-white/10 px-5 py-4">
              <div>
                <p className="text-lg font-black text-white">{t("claim_history_title")}</p>
                <p className="mt-1 text-xs font-semibold text-white/45">
                  {t("claim_history_intro")}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setHistoryOpen(false)}
                className="flex h-10 w-10 items-center justify-center rounded-full bg-white/10 text-white"
                aria-label={t("common_cancel")}
              >
                <X size={18} />
              </button>
            </header>

            <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-4 sm:p-5">
              {loading ? (
                <p className="py-10 text-center text-sm font-semibold text-white/45">
                  {t("common_loading")}
                </p>
              ) : error ? (
                <p className="py-10 text-center text-sm font-semibold text-red-300">
                  {t("claim_history_error")}
                </p>
              ) : claims.length === 0 ? (
                <p className="py-10 text-center text-sm font-semibold text-white/45">
                  {t("claim_history_empty")}
                </p>
              ) : (
                claims.map((claim) => {
                  const repliedDate = formatDate(claim.adminRepliedAt);
                  const createdDate = formatDate(claim.createdAt);
                  return (
                    <article
                      key={claim.id}
                      className="rounded-2xl border border-white/10 bg-white/[0.03] p-4"
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <span className="rounded-full bg-white/10 px-2.5 py-1 text-[10px] font-black uppercase tracking-wide text-white/65">
                          {statusLabel(claim.status)}
                        </span>
                        {createdDate ? (
                          <span className="text-[11px] font-semibold text-white/35">
                            {createdDate}
                          </span>
                        ) : null}
                      </div>
                      <p className="mt-3 whitespace-pre-wrap text-sm font-semibold leading-relaxed text-white/70">
                        {claim.message}
                      </p>
                      {claim.adminReply ? (
                        <div className="mt-4 rounded-xl border border-emerald-400/20 bg-emerald-500/10 p-3">
                          <p className="text-[10px] font-black uppercase tracking-[0.15em] text-emerald-200/70">
                            {t("claim_admin_reply_title")}
                          </p>
                          <p className="mt-2 whitespace-pre-wrap text-sm font-semibold leading-relaxed text-emerald-50">
                            {claim.adminReply}
                          </p>
                          {repliedDate ? (
                            <p className="mt-2 text-[11px] font-semibold text-emerald-100/50">
                              {t("claim_reply_date", { date: repliedDate })}
                            </p>
                          ) : null}
                        </div>
                      ) : null}
                    </article>
                  );
                })
              )}
            </div>
          </section>
        </div>
      ) : null}
    </>
  );
}
