"use client";

import { doc, getDoc, updateDoc } from "firebase/firestore";
import { useEffect, useState } from "react";

import { useT } from "@/contexts/LocaleContext";
import { db } from "@/lib/firebase";

type Props = {
  uid: string;
  className?: string;
};

export default function AdminClaimReplyBanner({ uid, className = "" }: Props) {
  const t = useT();
  const [reply, setReply] = useState("");
  const [repliedAt, setRepliedAt] = useState("");

  useEffect(() => {
    if (!uid) return;
    let cancelled = false;

    void getDoc(doc(db, "usuarios", uid)).then((snap) => {
      if (cancelled || !snap.exists()) return;
      const data = snap.data() as Record<string, unknown>;
      const text = String(data.lastAdminClaimReply || "").trim();
      if (!text) {
        setReply("");
        return;
      }
      setReply(text);
      setRepliedAt(String(data.lastAdminClaimReplyAt || ""));
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

  if (!reply) return null;

  return (
    <section
      className={`rounded-2xl border border-emerald-400/25 bg-emerald-500/10 p-4 ${className}`}
      data-admin-claim-reply="1"
    >
      <p className="text-[10px] font-black uppercase tracking-[0.18em] text-emerald-200/75">
        {t("claim_admin_reply_title")}
      </p>
      <p className="mt-2 whitespace-pre-wrap text-sm font-semibold leading-relaxed text-emerald-50">
        {reply}
      </p>
      {repliedAt ? (
        <p className="mt-2 text-xs font-semibold text-emerald-100/50">
          {new Date(repliedAt).toLocaleString()}
        </p>
      ) : null}
    </section>
  );
}
