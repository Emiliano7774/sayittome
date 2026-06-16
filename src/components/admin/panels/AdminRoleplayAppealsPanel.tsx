"use client";

import Link from "next/link";
import {
  collection,
  doc,
  limit,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  updateDoc,
} from "firebase/firestore";
import { useEffect, useMemo, useState } from "react";

import { auth, db } from "@/lib/firebase";
import { isAdminEmail } from "@/lib/admin/isAdmin";
import { sortReportsNewestFirst, parseReportCreatedAtMs } from "@/lib/admin/reportSort";
import { useT } from "@/contexts/LocaleContext";

type AppealRow = {
  id: string;
  uid?: string;
  username?: string;
  reporterEmail?: string;
  mensaje?: string;
  evidenceUrl?: string;
  estado?: string;
  createdAt?: unknown;
};

export default function AdminRoleplayAppealsPanel() {
  const t = useT();
  const [appeals, setAppeals] = useState<AppealRow[]>([]);

  useEffect(() => {
    if (!isAdminEmail(auth.currentUser?.email)) return;

    const q = query(collection(db, "reclamos_perfil_rol"), orderBy("createdAt", "desc"), limit(200));
    const unsub = onSnapshot(q, (snap) => {
      setAppeals(
        snap.docs.map((row) => ({
          id: row.id,
          ...(row.data() as Omit<AppealRow, "id">),
        })),
      );
    });

    return () => unsub();
  }, []);

  const visibleAppeals = useMemo(() => sortReportsNewestFirst(appeals), [appeals]);

  const pendingCount = useMemo(
    () =>
      visibleAppeals.filter((appeal) => (appeal.estado || "pendiente") === "pendiente").length,
    [visibleAppeals],
  );

  async function setStatus(id: string, estado: string) {
    await updateDoc(doc(db, "reclamos_perfil_rol", id), {
      estado,
      reviewedAt: serverTimestamp(),
      reviewedBy: auth.currentUser?.email || "",
    });
  }

  if (visibleAppeals.length === 0) {
    return <p className="text-white/40 font-bold">{t("admin_appeal_empty")}</p>;
  }

  return (
    <div className="space-y-4">
      {pendingCount > 0 ? (
        <p className="text-sm font-black text-sky-100/80">
          {t("admin_appeal_pending_count", { count: String(pendingCount) })}
        </p>
      ) : null}

      <div className="space-y-3">
        {visibleAppeals.map((appeal) => {
          const username = String(appeal.username || "");
          const profileHref = username ? `/u/${encodeURIComponent(username)}` : undefined;
          const createdLabel = parseReportCreatedAtMs(appeal.createdAt)
            ? new Date(parseReportCreatedAtMs(appeal.createdAt)).toLocaleString("es-AR")
            : "";

          return (
            <div key={appeal.id} className="rounded-2xl border border-white/10 p-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="font-black text-xl">{t("admin_appeal_title")}</p>
                  <p className="mt-1 text-sm font-bold text-white/55">
                    {username ? `@${username}` : appeal.uid || "-"} · {appeal.estado || "pendiente"}
                  </p>
                  {createdLabel ? (
                    <p className="mt-1 text-xs font-semibold text-white/35">{createdLabel}</p>
                  ) : null}
                </div>
                {profileHref ? (
                  <Link
                    href={profileHref}
                    className="rounded-xl border border-sky-400/30 bg-sky-500/15 px-4 py-2 text-sm font-black text-sky-100"
                  >
                    {t("admin_appeal_open_profile")}
                  </Link>
                ) : null}
              </div>

              <div className="mt-3 space-y-1 text-sm font-semibold text-white/60">
                {appeal.reporterEmail ? (
                  <p>
                    <span className="font-black uppercase tracking-[0.12em] text-white/35">
                      {t("admin_appeal_reporter")}:{" "}
                    </span>
                    <span className="text-white/75">{appeal.reporterEmail}</span>
                  </p>
                ) : null}
                {appeal.uid ? (
                  <p>
                    <span className="font-black uppercase tracking-[0.12em] text-white/35">UID: </span>
                    <span className="text-white/75">{appeal.uid}</span>
                  </p>
                ) : null}
              </div>

              <p className="mt-3 whitespace-pre-wrap font-semibold leading-relaxed text-white/75">
                {appeal.mensaje || "-"}
              </p>

              {appeal.evidenceUrl ? (
                <a
                  href={appeal.evidenceUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="mt-3 block max-w-md overflow-hidden rounded-xl border border-white/10"
                >
                  <img
                    src={appeal.evidenceUrl}
                    alt={t("admin_appeal_photo")}
                    className="max-h-80 w-full object-cover"
                  />
                </a>
              ) : null}

              <div className="mt-4 flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => void setStatus(appeal.id, "revisado")}
                  className="rounded-xl bg-green-500/20 px-4 py-2 text-sm font-black"
                >
                  {t("admin_appeal_mark_reviewed")}
                </button>
                <button
                  type="button"
                  onClick={() => void setStatus(appeal.id, "descartado")}
                  className="rounded-xl bg-white/10 px-4 py-2 text-sm font-black"
                >
                  {t("admin_appeal_dismiss")}
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
