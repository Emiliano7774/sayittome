"use client";

import { collection, limit, onSnapshot, orderBy, query, updateDoc, doc, serverTimestamp } from "firebase/firestore";
import { useEffect, useState } from "react";

import AdminShell from "@/components/admin/AdminShell";
import { auth, db } from "@/lib/firebase";
import { isAdminEmail } from "@/lib/admin/isAdmin";

type ReportRow = {
  id: string;
  tipo?: string;
  motivo?: string;
  detalle?: string;
  targetUsername?: string;
  estado?: string;
};

export default function AdminReportsPage() {
  const [reports, setReports] = useState<ReportRow[]>([]);

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

  return (
    <AdminShell title="Reportes">
      <div className="space-y-3">
        {reports.map((report) => (
          <div key={report.id} className="rounded-2xl border border-white/10 p-5">
            <p className="font-black text-xl">{report.motivo || report.tipo}</p>
            <p className="text-white/55 font-bold mt-1">{report.detalle || "-"}</p>
            <p className="text-white/40 text-sm font-bold mt-2">
              @{report.targetUsername || "-"} · {report.estado || "pendiente"}
            </p>
            <div className="mt-4 flex gap-2">
              <button
                type="button"
                onClick={() => setStatus(report.id, "revisado")}
                className="rounded-xl bg-green-500/20 px-4 py-2 font-black text-sm"
              >
                Revisado
              </button>
              <button
                type="button"
                onClick={() => setStatus(report.id, "descartado")}
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
