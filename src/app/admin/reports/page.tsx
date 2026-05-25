"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import {
  collection,
  limit,
  onSnapshot,
  orderBy,
  query,
} from "firebase/firestore";

import { auth, db } from "@/lib/firebase";

const ADMIN_EMAIL = "emilianomaturano@gmail.com";

type ReportData = {
  id: string;
  tipo?: string;
  motivo?: string;
  detalle?: string;
  reporterUid?: string;
  targetUid?: string;
  chatId?: string;
  storyId?: string;
  estado?: string;
};

export default function AdminReportsPage() {
  const [allowed, setAllowed] = useState(false);
  const [reports, setReports] = useState<ReportData[]>([]);

  useEffect(() => {
    const email = auth.currentUser?.email || "";
    setAllowed(email.toLowerCase() === ADMIN_EMAIL.toLowerCase());
  }, []);

  useEffect(() => {
    if (!allowed) return;

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
  }, [allowed]);

  if (!allowed) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-black text-white">
        Acceso denegado.
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-black px-4 py-8 text-white">
      <section className="mx-auto max-w-6xl">
        <div className="mb-8 flex items-center justify-between">
          <div>
            <p className="text-xs uppercase tracking-[0.4em] text-red-300">
              ADMIN
            </p>

            <h1 className="mt-2 text-5xl font-black">Reportes</h1>
          </div>

          <Link
            href="/admin"
            className="rounded-full border border-white/10 bg-zinc-950 px-5 py-3 text-sm font-black"
          >
            Volver
          </Link>
        </div>

        <div className="space-y-4">
          {reports.map((report) => (
            <div
              key={report.id}
              className="rounded-[2rem] border border-red-400/20 bg-red-500/10 p-5"
            >
              <p className="text-xs font-black uppercase tracking-[0.25em] text-red-300">
                {report.estado || "pendiente"} Â· {report.tipo || "reporte"}
              </p>

              <h2 className="mt-2 text-xl font-black">
                {report.motivo || "Sin motivo"}
              </h2>

              <p className="mt-3 text-sm leading-7 text-zinc-300">
                {report.detalle || "Sin detalle adicional."}
              </p>

              <div className="mt-4 grid gap-2 text-xs text-zinc-500">
                <p>Reporter: {report.reporterUid || "-"}</p>
                <p>Target: {report.targetUid || "-"}</p>
                <p>Chat: {report.chatId || "-"}</p>
                <p>Story: {report.storyId || "-"}</p>
              </div>
            </div>
          ))}

          {reports.length === 0 && (
            <div className="rounded-[2rem] border border-dashed border-white/10 p-10 text-center text-zinc-500">
              No hay reportes todavÃ­a.
            </div>
          )}
        </div>
      </section>
    </main>
  );
}
