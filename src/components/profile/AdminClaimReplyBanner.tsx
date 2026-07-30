"use client";

import { X } from "lucide-react";
import { doc, getDoc, updateDoc } from "firebase/firestore";
import { useEffect, useState } from "react";

import { useLocale, useT } from "@/contexts/LocaleContext";
import { auth, db } from "@/lib/firebase";
import { parseReportCreatedAtMs } from "@/lib/admin/reportSort";

type Props = {
  uid: string;
  className?: string;
};

export default function AdminClaimReplyBanner({ uid, className = "" }: Props) {
  const t = useT();
  const { locale } = useLocale();
  const [reply, setReply] = useState("");
  const [repliedAtMs, setRepliedAtMs] = useState(0);
  const [dismissing, setDismissing] = useState(false);

  useEffect(() => {
    if (!uid) return;
    let cancelled = false;

    void getDoc(doc(db, "usuarios", uid)).then((snap) => {
      if (cancelled || !snap.exists()) return;
      const data = snap.data() as Record<string, unknown>;
      const text = String(data.lastAdminClaimReply || "").trim();
      const replyAt = parseReportCreatedAtMs(data.lastAdminClaimReplyAt);
      const dismissedAt = parseReportCreatedAtMs(data.lastAdminClaimReplyDismissedAt);
      if (!text || (replyAt > 0 && dismissedAt === replyAt)) {
        setReply("");
        return;
      }
      setReply(text);
      setRepliedAtMs(replyAt);
      if (data.lastAdminClaimReplyRead !== true) {
        void updateDoc(doc(db, "usuarios", uid), {
          lastAdminClaimReplyRead: true,
        }).catch(() => undefined);
      }
    });

    return () => {
      cancelled = true;
    };
  }, [uid]);

  async function dismiss() {
    if (dismissing) return;
    const previousReply = reply;
    setReply("");
    setDismissing(true);
    try {
      const token = await auth.currentUser?.getIdToken();
      if (!token) throw new Error("missing_auth_token");
      const response = await fetch("/api/roleplay-appeal/history", {
        method: "PATCH",
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!response.ok) throw new Error("dismiss_failed");
    } catch {
      setReply(previousReply);
    } finally {
      setDismissing(false);
    }
  }

  if (!reply) return null;

  const localeTag =
    locale === "es" ? "es-AR" : locale === "en" ? "en-US" : locale === "it" ? "it-IT" : "de-DE";
  const repliedAtLabel = repliedAtMs
    ? new Intl.DateTimeFormat(localeTag, {
        dateStyle: "medium",
        timeStyle: "short",
      }).format(new Date(repliedAtMs))
    : "";

  return (
    <section
      className={`relative rounded-2xl border border-emerald-400/25 bg-emerald-500/10 p-4 pr-12 ${className}`}
      data-admin-claim-reply="1"
    >
      <button
        type="button"
        onClick={() => void dismiss()}
        disabled={dismissing}
        className="absolute right-3 top-3 flex h-8 w-8 items-center justify-center rounded-full text-emerald-100/55 transition hover:bg-white/10 hover:text-white disabled:opacity-40"
        aria-label={t("claim_reply_dismiss")}
        title={t("claim_reply_dismiss")}
      >
        <X size={16} />
      </button>
      <p className="text-[10px] font-black uppercase tracking-[0.18em] text-emerald-200/75">
        {t("claim_admin_reply_title")}
      </p>
      <p className="mt-2 whitespace-pre-wrap text-sm font-semibold leading-relaxed text-emerald-50">
        {reply}
      </p>
      {repliedAtLabel ? (
        <p className="mt-2 text-xs font-semibold text-emerald-100/50">
          {t("claim_reply_date", { date: repliedAtLabel })}
        </p>
      ) : null}
    </section>
  );
}
