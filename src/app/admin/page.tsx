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

import { auth, db } from "@/lib/firebase";

import { useEffect, useMemo, useState } from "react";

type ReportData = {
  id?: string;
  tipo?: string;
  motivo?: string;
  detalle?: string;
  targetUid?: string;
  targetUsername?: string;
  reporterUid?: string;
  reporterEmail?: string;
  estado?: string;
  createdAt?: any;
  reviewedAt?: any;
  reviewedBy?: string;
};

function formatDate(value: any) {
  try {
    if (!value) return "Ahora";

    if (typeof value.toDate === "function") {
      return value.toDate().toLocaleString();
    }

    return "Ahora";
  } catch {
    return "Ahora";
  }
}

export default function AdminPage() {
  const [reports, setReports] = useState<ReportData[]>([]);
  const [updatingId, setUpdatingId] = useState("");

  const currentEmail = auth.currentUser?.email?.toLowerCase() || "";
  const isAdmin = currentEmail === "emilianomaturano@gmail.com";

  useEffect(() => {
    if (!isAdmin) return;

    const q = query(
      collection(db, "reportes"),
      orderBy("createdAt", "desc"),
      limit(100)
    );

    const unsub = onSnapshot(q, (snapshot) => {
      const docs: ReportData[] = [];

      snapshot.forEach((docu) => {
        docs.push({
          id: docu.id,
          ...(docu.data() as any),
        });
      });

      setReports(docs);
    });

    return () => unsub();
  }, [isAdmin]);

  const pendingCount = useMemo(() => {
    return reports.filter((r) => (r.estado || "pendiente") === "pendiente")
      .length;
  }, [reports]);

  const reviewedCount = useMemo(() => {
    return reports.filter((r) => r.estado === "revisado").length;
  }, [reports]);

  const discardedCount = useMemo(() => {
    return reports.filter((r) => r.estado === "descartado").length;
  }, [reports]);

  const updateReportStatus = async (
    reportId: string | undefined,
    estado: "pendiente" | "revisado" | "descartado"
  ) => {
    if (!reportId) return;

    try {
      setUpdatingId(reportId);

      await updateDoc(doc(db, "reportes", reportId), {
        estado,
        reviewedAt: serverTimestamp(),
        reviewedBy: currentEmail,
      });
    } catch (e) {
      console.error(e);
      alert("No se pudo actualizar el reporte.");
    }

    setUpdatingId("");
  };

  if (!isAdmin) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-black px-6 text-white">
        <div className="rounded-[2rem] border border-red-500/20 bg-zinc-950 p-8 text-center">
          <p className="text-xs uppercase tracking-[0.4em] text-red-300">
            SAYITTOME
          </p>

          <h1 className="mt-4 text-4xl font-black">Acceso denegado</h1>

          <p className="mt-4 text-zinc-500">
            Esta Ã¡rea es solo para administraciÃ³n.
          </p>

          <Link
            href="/shuffle"
            className="mt-6 inline-flex rounded-full bg-white px-6 py-4 text-sm font-black text-black"
          >
            Volver
          </Link>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-black px-4 py-8 text-white">
      <section className="mx-auto max-w-7xl">
        <div className="mb-8 flex items-center justify-between">
          <div>
            <p className="text-xs uppercase tracking-[0.4em] text-fuchsia-300">
              SAYITTOME ADMIN
            </p>

            <h1 className="mt-3 text-5xl font-black">Panel administrador</h1>
          </div>

          <div className="flex flex-wrap gap-3">
            <Link
              href="/admin/stories"
              className="rounded-full border border-fuchsia-400/20 bg-fuchsia-500/10 px-6 py-4 text-sm font-black text-fuchsia-200"
            >
              Historias
            </Link>

            <Link
              href="/admin/chats"
              className="rounded-full border border-white/10 bg-zinc-950 px-6 py-4 text-sm font-black"
            >
              Chats
            </Link>

            <Link
              href="/shuffle"
              className="rounded-full border border-white/10 bg-zinc-950 px-6 py-4 text-sm font-black"
            >
              Volver
            </Link>
          </div>
        </div>

        <div className="mb-8 grid grid-cols-1 gap-4 md:grid-cols-5">
          <div className="rounded-[2rem] border border-white/10 bg-zinc-950 p-6">
            <p className="text-xs uppercase tracking-[0.35em] text-zinc-500">
              Reportes
            </p>

            <p className="mt-3 text-5xl font-black">{reports.length}</p>
          </div>

          <div className="rounded-[2rem] border border-red-500/20 bg-red-500/10 p-6">
            <p className="text-xs uppercase tracking-[0.35em] text-red-300">
              Pendientes
            </p>

            <p className="mt-3 text-5xl font-black text-red-200">
              {pendingCount}
            </p>
          </div>

          <div className="rounded-[2rem] border border-emerald-500/20 bg-emerald-500/10 p-6">
            <p className="text-xs uppercase tracking-[0.35em] text-emerald-300">
              Revisados
            </p>

            <p className="mt-3 text-5xl font-black text-emerald-200">
              {reviewedCount}
            </p>
          </div>

          <div className="rounded-[2rem] border border-zinc-500/20 bg-zinc-500/10 p-6">
            <p className="text-xs uppercase tracking-[0.35em] text-zinc-300">
              Descartados
            </p>

            <p className="mt-3 text-5xl font-black text-zinc-200">
              {discardedCount}
            </p>
          </div>

          <div className="rounded-[2rem] border border-fuchsia-500/20 bg-fuchsia-500/10 p-6">
            <p className="text-xs uppercase tracking-[0.35em] text-fuchsia-300">
              Admin
            </p>

            <p className="mt-3 break-all text-lg font-black">{currentEmail}</p>
          </div>
        </div>

        <div className="rounded-[2.5rem] border border-white/10 bg-zinc-950 p-5">
          <div className="mb-5 flex items-center justify-between">
            <div>
              <p className="text-xs uppercase tracking-[0.35em] text-fuchsia-300">
                ModeraciÃ³n
              </p>

              <h2 className="mt-2 text-3xl font-black">Reportes recientes</h2>
            </div>
          </div>

          <div className="space-y-4">
            {reports.map((report) => {
              const estado = report.estado || "pendiente";
              const disabled = updatingId === report.id;

              return (
                <div
                  key={report.id}
                  className={
                    estado === "pendiente"
                      ? "rounded-[2rem] border border-red-400/20 bg-red-500/10 p-5"
                      : estado === "revisado"
                        ? "rounded-[2rem] border border-emerald-400/20 bg-emerald-500/10 p-5"
                        : "rounded-[2rem] border border-white/10 bg-black/60 p-5"
                  }
                >
                  <div className="flex flex-wrap items-start justify-between gap-4">
                    <div>
                      <div className="flex flex-wrap items-center gap-3">
                        <div className="rounded-full bg-fuchsia-500/15 px-4 py-2 text-xs font-black uppercase tracking-[0.25em] text-fuchsia-200">
                          {report.tipo || "reporte"}
                        </div>

                        <div className="rounded-full bg-red-500/15 px-4 py-2 text-xs font-black uppercase tracking-[0.25em] text-red-200">
                          {report.motivo || "sin motivo"}
                        </div>

                        <div className="rounded-full border border-white/10 bg-zinc-900 px-4 py-2 text-xs font-black uppercase tracking-[0.25em] text-zinc-300">
                          {estado}
                        </div>
                      </div>

                      <h3 className="mt-4 text-2xl font-black">
                        @{report.targetUsername || "usuario"}
                      </h3>

                      <p className="mt-3 max-w-3xl text-sm leading-7 text-zinc-400">
                        {report.detalle || "Sin detalle adicional."}
                      </p>

                      <div className="mt-4 flex flex-wrap gap-6 text-xs font-bold text-zinc-500">
                        <p>Reporter: {report.reporterEmail || "anÃ³nimo"}</p>
                        <p>Creado: {formatDate(report.createdAt)}</p>
                        {report.reviewedAt && (
                          <p>
                            Revisado: {formatDate(report.reviewedAt)} por{" "}
                            {report.reviewedBy || "admin"}
                          </p>
                        )}
                      </div>
                    </div>

                    <div className="flex flex-col gap-3">
                      <Link
                        href={
                          "/u/" +
                          (report.targetUsername || "").toLowerCase().trim()
                        }
                        className="rounded-full bg-white px-5 py-3 text-center text-sm font-black text-black transition hover:scale-[1.02]"
                      >
                        Ver perfil
                      </Link>

                      <button
                        type="button"
                        disabled={disabled}
                        onClick={() => updateReportStatus(report.id, "revisado")}
                        className="rounded-full border border-emerald-400/30 bg-emerald-500/10 px-5 py-3 text-sm font-black text-emerald-200 disabled:opacity-50"
                      >
                        Marcar revisado
                      </button>

                      <button
                        type="button"
                        disabled={disabled}
                        onClick={() =>
                          updateReportStatus(report.id, "descartado")
                        }
                        className="rounded-full border border-zinc-400/30 bg-zinc-500/10 px-5 py-3 text-sm font-black text-zinc-200 disabled:opacity-50"
                      >
                        Descartar
                      </button>

                      {estado !== "pendiente" && (
                        <button
                          type="button"
                          disabled={disabled}
                          onClick={() =>
                            updateReportStatus(report.id, "pendiente")
                          }
                          className="rounded-full border border-red-400/30 bg-red-500/10 px-5 py-3 text-sm font-black text-red-200 disabled:opacity-50"
                        >
                          Reabrir
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}

            {reports.length === 0 && (
              <div className="rounded-[2rem] border border-white/10 bg-black/50 p-10 text-center">
                <p className="text-zinc-500">No hay reportes todavÃ­a.</p>
              </div>
            )}
          </div>
        </div>
      </section>
    </main>
  );
}
