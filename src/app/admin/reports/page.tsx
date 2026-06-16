"use client";

import { collection, limit, onSnapshot, orderBy, query, updateDoc, doc, serverTimestamp } from "firebase/firestore";
import { useEffect, useState } from "react";

import AdminShell from "@/components/admin/AdminShell";
import { auth, db } from "@/lib/firebase";
import { isAdminEmail } from "@/lib/admin/isAdmin";
import { useT } from "@/contexts/LocaleContext";

type ReportRow = {
  id: string;
  tipo?: string;
  motivo?: string;
  detalle?: string;
  links?: string;
  evidenceUrl?: string;
  targetUsername?: string;
  targetUid?: string;
  storyId?: string;
  reporterEmail?: string;
  estado?: string;
};

export default function AdminReportsPage() {
  const t = useT();
  const [reports, setReports] = useState<ReportRow[]>([]);
  const [busyId, setBusyId] = useState("");

  useEffect(() => {
    if (!isAdminEmail(auth.currentUser?.email)) return;

    const q = query(collection(db, "reportes"), orderBy("createdAt", "desc"), limit(120));
    const unsub = onSnapshot(q, (snap) => {
      setReports(snap.docs.map((row) => ({ id: row.id, ...(row.data() as Omit<ReportRow, "id">) })));
    });

    return () => unsub();
  }, []);

  async function setStatus(id: string, estado: string) {
    await updateDoc(doc(db, "reportes", id), {
      estado,
      reviewedAt: serverTimestamp(),
      reviewedBy: auth.currentUser?.email || "",
    });
  }

  async function runAdminAction(report: ReportRow, action: string) {
    if (!report.targetUid || busyId) return;

    setBusyId(report.id);
    try {
      const res = await fetch("/api/admin/action", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action,
          uid: report.targetUid,
          adminEmail: auth.currentUser?.email || "",
          note: report.detalle || "",
        }),
      });

      const json = await res.json();
      if (!res.ok || !json?.ok) {
        throw new Error(String(json?.error || "action_failed"));
      }

      await setStatus(report.id, action === "ban_perm" ? "bloqueado" : "revisado");
    } catch (error) {
      console.error(error);
      alert("No se pudo aplicar la acción.");
    } finally {
      setBusyId("");
    }
  }

  return (
    <AdminShell title="Reportes">
      <div className="space-y-3">
        {reports.map((report) => (
          <div key={report.id} className="rounded-2xl border border-white/10 p-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="font-black text-xl">{report.motivo || report.tipo}</p>
                <p className="mt-1 text-sm font-bold text-white/55">
                  @{report.targetUsername || "-"} · {report.estado || "pendiente"}
                </p>
              </div>
              {report.evidenceUrl ? (
                <a
                  href={report.evidenceUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="overflow-hidden rounded-xl border border-white/10"
                >
                  <img
                    src={report.evidenceUrl}
                    alt={t("admin_report_evidence")}
                    className="h-24 w-24 object-cover"
                  />
                </a>
              ) : null}
            </div>

            <p className="mt-3 whitespace-pre-wrap text-white/75 font-semibold leading-relaxed">
              {report.detalle || "-"}
            </p>

            {report.links ? (
              <div className="mt-3 rounded-xl border border-white/10 bg-black/30 px-4 py-3">
                <p className="text-[10px] font-black uppercase tracking-[0.18em] text-white/40">
                  {t("admin_report_links")}
                </p>
                <p className="mt-2 whitespace-pre-wrap break-all text-sm font-semibold text-sky-200/90">
                  {report.links}
                </p>
              </div>
            ) : null}

            <div className="mt-4 flex flex-wrap gap-2">
              <button
                type="button"
                disabled={busyId === report.id || !report.targetUid}
                onClick={() => void runAdminAction(report, "tag_roleplay")}
                className="rounded-xl bg-amber-500/20 px-4 py-2 font-black text-sm text-amber-100 disabled:opacity-40"
              >
                {t("admin_report_tag_roleplay")}
              </button>
              <button
                type="button"
                disabled={busyId === report.id || !report.targetUid}
                onClick={() => void runAdminAction(report, "ban_perm")}
                className="rounded-xl bg-red-500/20 px-4 py-2 font-black text-sm text-red-200 disabled:opacity-40"
              >
                {t("admin_report_block_user")}
              </button>
              <button
                type="button"
                onClick={() => void setStatus(report.id, "revisado")}
                className="rounded-xl bg-green-500/20 px-4 py-2 font-black text-sm"
              >
                Revisado
              </button>
              <button
                type="button"
                onClick={() => void setStatus(report.id, "descartado")}
                className="rounded-xl bg-white/10 px-4 py-2 font-black text-sm"
              >
                Descartar
              </button>
            </div>
          </div>
        ))}
      </div>
    </AdminShell>
  );
}
